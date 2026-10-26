import { enviarMensajeWhatsApp } from "./messageService";
import { formatEquipoLabel } from "../../equipoLabel";
import { resolverActividadesSupervisor } from "../../gemini";

const ANCLAS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

async function obtenerPendientes(supabase, telefonoSupervisor) {
  const { data } = await supabase
    .from("estados_consulta_bot")
    .select(`
      *,
      planificacion_bloques_pod(
        id, especialidad_id,
        equipos(codigo_interno, patente),
        equipo_id
      ),
      eventos_jornada(
        reporte_id,
        reportes_diarios(personal!reportes_diarios_operador_id_fkey(nombre_completo))
      )
    `)
    .eq("telefono_supervisor", telefonoSupervisor)
    .eq("estado_pregunta", "Pendiente_Actividad")
    .order("created_at", { ascending: true });
  return data || [];
}

function equipoLabelDePendiente(p) {
  return formatEquipoLabel(p.planificacion_bloques_pod?.equipos) || "equipo";
}

function operadorNombreDePendiente(p) {
  return p.eventos_jornada?.reportes_diarios?.personal?.nombre_completo || null;
}

function bloqueListaTareas(tareas) {
  return (tareas || [])
    .map((t, i) => `${NUMEROS[i] || `${i + 1}.`} ${t.nombre}`)
    .join("  ");
}

export async function enviarConsolidadoPendientes(supabase, telefonoSupervisor, geminiKey) {
  const pendientes = await obtenerPendientes(supabase, telefonoSupervisor);
  if (pendientes.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";

  let msg;
  if (pendientes.length === 1) {
    const p = pendientes[0];
    const equipoLabel = equipoLabelDePendiente(p);
    const operadorNombre = operadorNombreDePendiente(p);
    const encabezado = operadorNombre 
      ? `🚜 *¡Equipo Disponible en Sala POD!*\n*${equipoLabel}* ya está listo con el operador *${operadorNombre}*.` 
      : `🚜 *¡Equipo Disponible en Sala POD!*\n*${equipoLabel}* ya está listo para tu especialidad.`;
    const tareas = p.tareas_enviadas || [];
    const webLink = `${baseUrl}/supervisor/actividades?bloque_id=${p.planificacion_id}`;

    msg = tareas.length > 0
      ? `${encabezado}\n\n¿Qué actividad ejecutarás con este recurso?\n\n${bloqueListaTareas(tareas)}\n0️⃣ Otra actividad (describe libremente)\n\n📲 *Gestionar en la Web (EIMIPLANNER 3WL):*\n👉 ${webLink}\n\n_Puedes responder con el número de tu tarea por WhatsApp o ingresar al enlace web._`
      : `${encabezado}\n\n📲 *Asignar Tareas en la Web (EIMIPLANNER 3WL):*\n👉 ${webLink}\n\n_O responde este mensaje indicando la actividad específica._`;
  } else {
    const bloques = pendientes.map((p, i) => {
      const ancla = ANCLAS[i] || `(${i + 1})`;
      const equipoLabel = equipoLabelDePendiente(p);
      const operadorNombre = operadorNombreDePendiente(p);
      const tareas = p.tareas_enviadas || [];
      const listaTareas = tareas.length > 0 ? `\n${bloqueListaTareas(tareas)}  0️⃣ Otra` : "";
      const webLink = `${baseUrl}/supervisor/actividades?bloque_id=${p.planificacion_id}`;
      return `${ancla} *${equipoLabel}*${operadorNombre ? ` — operador *${operadorNombre}*` : ""}${listaTareas}\n   👉 Web: ${webLink}`;
    }).join("\n\n");

    const ejemplo = pendientes.slice(0, 2).map(p => `${equipoLabelDePendiente(p)}: 1`).join(", ");

    msg = `🚜 *¡Equipos Solicitados Disponibles!* 📋 Tienes ${pendientes.length} recursos listos:\n\n${bloques}\n\nPuedes abrir los enlaces para gestionar cada equipo o responder todo junto por WhatsApp (ej: "${ejemplo}").`;
  }

  await enviarMensajeWhatsApp(null, telefonoSupervisor, msg, false, geminiKey);
}

export async function crearConsultaPendiente(supabase, { telefonoSupervisor, planificacionId, especialidadId, eventoOperadorId, geminiKey }) {
  const { data: tareasDb } = await supabase
    .from("tareas_programadas")
    .select("id, nombre, codigo")
    .eq("especialidad_id", especialidadId)
    .eq("activa", true)
    .eq("es_libre", false)
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true })
    .limit(8);

  const tareas = tareasDb || [];
  const tareasEnviadas = tareas.map((t, i) => ({ orden: i + 1, id: t.id, nombre: t.nombre }));

  await supabase.from("estados_consulta_bot").upsert({
    telefono_supervisor: telefonoSupervisor,
    planificacion_id: planificacionId,
    evento_operador_id: eventoOperadorId,
    estado_pregunta: "Pendiente_Actividad",
    tareas_enviadas: tareasEnviadas,
    esperando_libre: false,
    esperando_confirmacion: false,
    respuesta_interpretada: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "planificacion_id" });

  await enviarConsolidadoPendientes(supabase, telefonoSupervisor, geminiKey);

  return { tareasEnviadas };
}

async function aplicarResolucion(supabase, consultaPendiente, { actividadFinal, tareaProgramadaId }, geminiKey) {
  const { data: bloqueInfo } = await supabase
    .from("planificacion_bloques_pod")
    .select("fecha, especialidad_id, equipos(proyecto_actual_id)")
    .eq("id", consultaPendiente.planificacion_id)
    .maybeSingle();

  const { data: nuevaActividad } = await supabase
    .from("actividades")
    .insert({
      fecha: bloqueInfo?.fecha,
      proyecto_id: bloqueInfo?.equipos?.proyecto_actual_id || null,
      especialidad_id: bloqueInfo?.especialidad_id || null,
      tarea_programada_id: tareaProgramadaId,
      descripcion: tareaProgramadaId ? null : actividadFinal,
      programada: !!tareaProgramadaId,
    })
    .select("id")
    .single();

  const actividadId = nuevaActividad?.id || null;

  await supabase
    .from("planificacion_bloques_pod")
    .update({ actividad_especifica: actividadFinal, actividad_id: actividadId, actividad_respondida_at: new Date().toISOString() })
    .eq("id", consultaPendiente.planificacion_id);

  if (consultaPendiente.evento_operador_id) {
    await supabase
      .from("eventos_jornada")
      .update({ nota_transcripcion: `Actividad confirmada por supervisor: ${actividadFinal}`, actividad_id: actividadId })
      .eq("id", consultaPendiente.evento_operador_id);

    try {
      const { data: eventoInfo } = await supabase
        .from("eventos_jornada")
        .select("reporte_id, reportes_diarios(operador_id, personal!reportes_diarios_operador_id_fkey(whatsapp, nombre_completo))")
        .eq("id", consultaPendiente.evento_operador_id)
        .maybeSingle();

      const opWa = eventoInfo?.reportes_diarios?.personal?.whatsapp;
      if (opWa) {
        await enviarMensajeWhatsApp(null, opWa,
          `📢 *Actividad confirmada por tu supervisor:*\n\n_"${actividadFinal}"_\n\n¡Buena jornada! 💪`,
          false, geminiKey
        );
      }
    } catch (errNotif) {
      console.error("[podConsultaService] Error al notificar al operador:", errNotif.message);
    }
  }

  await supabase
    .from("estados_consulta_bot")
    .update({ estado_pregunta: "Procesado", esperando_confirmacion: false, respuesta_interpretada: null, updated_at: new Date().toISOString() })
    .eq("id", consultaPendiente.id);
}

function esAfirmacion(texto) {
  return /^\s*(si|sí|confirmo|correcto|ok|dale|de acuerdo)\s*[.!]?\s*$/i.test(texto);
}

function esNegacion(texto) {
  return /^\s*(no|incorrecto|est(a|á) mal|mal|corr[ií]geme)\s*[.!]?\s*$/i.test(texto);
}

export async function resolverRespuestaSupervisor(supabase, { telefonoSupervisor, respuestaTexto, jid, phoneClean, audio, geminiKey }) {
  const pendientes = await obtenerPendientes(supabase, telefonoSupervisor);
  if (pendientes.length === 0) {
    return { manejado: false };
  }

  if (!respuestaTexto) {
    await enviarMensajeWhatsApp(jid, phoneClean, `⚠️ No logramos procesar tu respuesta. Por favor escribe tu respuesta en texto o envía un audio más claro.`, !!audio, geminiKey);
    return { manejado: true, action: "RESPUESTA_SUPERVISOR_VACIA" };
  }

  const enConfirmacion = pendientes.filter(p => p.esperando_confirmacion);

  // Caso A: el supervisor está respondiendo a un "¿confirmas?" de una ronda anterior
  if (enConfirmacion.length > 0) {
    if (esAfirmacion(respuestaTexto)) {
      for (const p of enConfirmacion) {
        const interp = p.respuesta_interpretada;
        if (!interp) continue;
        const actividadFinal = interp.tarea_nombre || interp.texto_libre;
        await aplicarResolucion(supabase, p, { actividadFinal, tareaProgramadaId: interp.tarea_id || null }, geminiKey);
      }
      await enviarMensajeWhatsApp(jid, phoneClean, `¡Excelente! Actividad(es) registrada(s). Muchas gracias.`, !!audio, geminiKey);
      return { manejado: true, action: "CONFIRMACION_APLICADA" };
    }

    if (esNegacion(respuestaTexto)) {
      await supabase
        .from("estados_consulta_bot")
        .update({ esperando_confirmacion: false, respuesta_interpretada: null, updated_at: new Date().toISOString() })
        .in("id", enConfirmacion.map(p => p.id));

      const partes = enConfirmacion.map(p => `${equipoLabelDePendiente(p)}: <número>`).join(", ");
      await enviarMensajeWhatsApp(jid, phoneClean, `Entendido, corrijamos. Por favor respóndeme así — ${partes}`, !!audio, geminiKey);
      return { manejado: true, action: "CONFIRMACION_RECHAZADA" };
    }

    const resumen = enConfirmacion.map(p => `${equipoLabelDePendiente(p)} → ${p.respuesta_interpretada?.tarea_nombre || p.respuesta_interpretada?.texto_libre}`).join("\n");
    await enviarMensajeWhatsApp(jid, phoneClean, `📋 Sigo esperando tu confirmación:\n\n${resumen}\n\nResponde *SI* o *NO*.`, !!audio, geminiKey);
    return { manejado: true, action: "CONFIRMACION_RECORDATORIO" };
  }

  // Caso B: exactamente 1 pregunta abierta -> parseo directo, sin paso de confirmación
  if (pendientes.length === 1) {
    const p = pendientes[0];
    const tareasEnviadas = p.tareas_enviadas || [];
    let actividadFinal = respuestaTexto;
    let tareaProgramadaId = null;

    if (p.esperando_libre) {
      actividadFinal = `[NO PROGRAMADA] ${respuestaTexto}`;
    } else {
      const numero = parseInt(respuestaTexto, 10);
      if (!isNaN(numero) && /^\d+$/.test(respuestaTexto.trim())) {
        if (numero === 0) {
          await supabase.from("estados_consulta_bot")
            .update({ esperando_libre: true, updated_at: new Date().toISOString() })
            .eq("id", p.id);
          await enviarMensajeWhatsApp(jid, phoneClean, `✏️ Describe brevemente la actividad que ejecutarás hoy:`, !!audio, geminiKey);
          return { manejado: true, action: "ESPERANDO_ACTIVIDAD_LIBRE" };
        } else if (tareasEnviadas.length > 0) {
          const tareaElegida = tareasEnviadas.find(t => t.orden === numero);
          if (tareaElegida) {
            actividadFinal = tareaElegida.nombre;
            tareaProgramadaId = tareaElegida.id || null;
          } else {
            await enviarMensajeWhatsApp(jid, phoneClean, `⚠️ Número inválido. Responde con un número del *1* al *${tareasEnviadas.length}*, o *0* para otra actividad.`, !!audio, geminiKey);
            return { manejado: true, action: "NUMERO_FUERA_RANGO" };
          }
        }
      }
    }

    await aplicarResolucion(supabase, p, { actividadFinal, tareaProgramadaId }, geminiKey);
    await enviarMensajeWhatsApp(jid, phoneClean, `¡Excelente! Hemos registrado la actividad para este bloque:\n\n_"${respuestaTexto}"_\n\nMuchas gracias.`, !!audio, geminiKey);
    return { manejado: true, action: "RESPUESTA_SUPERVISOR_PROCESADA" };
  }

  // Caso C: 2+ preguntas abiertas -> interpretar con Gemini y pedir confirmación antes de aplicar
  const pendientesParaGemini = pendientes.map((p, i) => ({
    ancla: ANCLAS[i] || `(${i + 1})`,
    codigo_equipo: equipoLabelDePendiente(p),
    tareas: p.tareas_enviadas || [],
    esperando_libre: p.esperando_libre,
  }));

  let respuestasGemini = [];
  try {
    const resultado = await resolverActividadesSupervisor(pendientesParaGemini, respuestaTexto);
    respuestasGemini = resultado?.respuestas || [];
  } catch (errGemini) {
    console.error("[podConsultaService] Error interpretando respuesta múltiple:", errGemini.message);
  }

  if (respuestasGemini.length === 0) {
    const partes = pendientes.map(p => `${equipoLabelDePendiente(p)}: <número>`).join(", ");
    await enviarMensajeWhatsApp(jid, phoneClean, `No logré entender a qué equipo(s) te referías. Por favor respóndeme así — ${partes}`, !!audio, geminiKey);
    return { manejado: true, action: "RESPUESTA_MULTIPLE_NO_ENTENDIDA" };
  }

  const resumenLineas = [];
  const anclasResueltas = new Set();
  for (const r of respuestasGemini) {
    const idx = ANCLAS.indexOf(r.ancla);
    const p = idx >= 0 ? pendientes[idx] : null;
    if (!p) continue;

    let tareaNombre = null;
    let tareaId = null;
    if (r.tarea_orden != null) {
      const tarea = (p.tareas_enviadas || []).find(t => t.orden === r.tarea_orden);
      if (tarea) {
        tareaNombre = tarea.nombre;
        tareaId = tarea.id || null;
      }
    }
    const textoLibre = tareaNombre ? null : (r.texto_libre || null);
    if (!tareaNombre && !textoLibre) continue;

    await supabase.from("estados_consulta_bot").update({
      esperando_confirmacion: true,
      respuesta_interpretada: { tarea_nombre: tareaNombre, tarea_id: tareaId, texto_libre: textoLibre },
      updated_at: new Date().toISOString(),
    }).eq("id", p.id);

    anclasResueltas.add(r.ancla);
    resumenLineas.push(`${r.ancla} ${equipoLabelDePendiente(p)} → ${tareaNombre || textoLibre}`);
  }

  if (resumenLineas.length === 0) {
    const partes = pendientes.map(p => `${equipoLabelDePendiente(p)}: <número>`).join(", ");
    await enviarMensajeWhatsApp(jid, phoneClean, `No logré entender a qué equipo(s) te referías. Por favor respóndeme así — ${partes}`, !!audio, geminiKey);
    return { manejado: true, action: "RESPUESTA_MULTIPLE_NO_ENTENDIDA" };
  }

  const noMencionados = pendientesParaGemini.filter(p => !anclasResueltas.has(p.ancla));
  let msgFinal = `📋 Entendí esto:\n\n${resumenLineas.join("\n")}\n\n¿Confirmas? Responde *SI* o *NO*.`;
  if (noMencionados.length > 0) {
    msgFinal += `\n\n(Aún me falta que me indiques la actividad para: ${noMencionados.map(p => p.codigo_equipo).join(", ")})`;
  }

  await enviarMensajeWhatsApp(jid, phoneClean, msgFinal, !!audio, geminiKey);
  return { manejado: true, action: "RESPUESTA_MULTIPLE_ESPERANDO_CONFIRMACION" };
}
