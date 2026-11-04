import { enviarMensajeWhatsApp } from "./messageService";
import { formatEquipoLabel } from "../../equipoLabel";
import { resolverActividadesSupervisor, extraerMetricasActividadSupervisor, convertirPalabrasANumeros } from "../../gemini";

const ANCLAS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

async function obtenerPendientes(supabase, telefonoSupervisor) {
  const { data } = await supabase
    .from("estados_consulta_bot")
    .select(`
      *,
      planificacion_bloques_pod(
        id, fecha, especialidad_id,
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

  const rows = data || [];
  const hoyChile = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const vig = [];
  const expiradosIds = [];

  for (const r of rows) {
    const fechaBloque = r.planificacion_bloques_pod?.fecha;
    const createdAtMs = r.created_at ? new Date(r.created_at).getTime() : 0;
    const horasAntiguedad = createdAtMs ? (Date.now() - createdAtMs) / (1000 * 60 * 60) : 999;
    if ((fechaBloque && fechaBloque < hoyChile) || horasAntiguedad > 14) {
      expiradosIds.push(r.id);
    } else {
      vig.push(r);
    }
  }

  if (expiradosIds.length > 0) {
    await supabase
      .from("estados_consulta_bot")
      .update({ estado_pregunta: "Procesado", updated_at: new Date().toISOString() })
      .in("id", expiradosIds);
  }

  return vig;
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

async function aplicarActividadInicial(supabase, consultaPendiente, { actividadFinal, tareaProgramadaId }, geminiKey) {
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
      descripcion: actividadFinal,
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
    .update({
      esperando_libre: false,
      esperando_confirmacion: false,
      respuesta_interpretada: {
        etapa: "ESPERANDO_METRICAS",
        actividad_final: actividadFinal,
        tarea_id: tareaProgramadaId || null,
        actividad_id: actividadId,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.id);

  return actividadId;
}

function parseMetricasFallback(texto) {
  const clean = convertirPalabrasANumeros(texto || "").replace(/,/g, ".");
  const mHor = clean.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|horas?|hor[oó]metro)/i) || clean.match(/hor[oó]metro\s*(?:de|:)?\s*(\d+(?:\.\d+)?)/i);
  const mIz = clean.match(/(\d+)\s*(?:izajes?|maniobras?|movimientos?|movs?)/i) || clean.match(/(?:izajes?|movimientos?)\s*(?:de|:)?\s*(\d+)/i);
  const mCant = clean.match(/(\d+(?:\.\d+)?)\s*(m3|m2|ml|metros?|m|toneladas?|ton|t|kg|unidades?|un|spools?|pulgadas?)/i);

  let cantidad = mCant ? parseFloat(mCant[1]) : null;
  let unidad = mCant ? mCant[2] : null;
  let horometro = mHor ? parseFloat(mHor[1]) : null;
  let izajes = mIz ? parseInt(mIz[1], 10) : null;

  if (cantidad === null && horometro === null && izajes === null) {
    const nums = (clean.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length >= 1) cantidad = nums[0];
    if (nums.length >= 2) horometro = nums[1];
    if (nums.length >= 3) izajes = Math.round(nums[2]);
  }

  return {
    cantidad_ejecutada: cantidad,
    unidad: unidad,
    horometro_horas: horometro,
    izajes_movimientos: izajes,
  };
}

async function aplicarMetricasFinales(supabase, consultaPendiente, respuestaTexto) {
  const interp = consultaPendiente.respuesta_interpretada || {};
  const actividadBase = interp.actividad_final || "Labor en faena";
  const actividadId = interp.actividad_id || null;

  let metricas = {};
  try {
    metricas = await extraerMetricasActividadSupervisor(respuestaTexto, actividadBase);
  } catch (err) {
    console.warn("[podConsultaService] Fallback regex para métricas:", err.message);
    metricas = parseMetricasFallback(respuestaTexto);
  }

  const fb = parseMetricasFallback(respuestaTexto);
  const cantidad = metricas.cantidad_ejecutada ?? fb.cantidad_ejecutada ?? null;
  const unidad = metricas.unidad || fb.unidad || null;
  const horometro = metricas.horometro_horas ?? fb.horometro_horas ?? null;
  const izajes = metricas.izajes_movimientos ?? fb.izajes_movimientos ?? null;

  const partesDetalle = [];
  if (cantidad !== null) partesDetalle.push(`Cant: ${cantidad}${unidad ? ` ${unidad}` : ""}`);
  if (horometro !== null) partesDetalle.push(`Horómetro: ${horometro} hrs`);
  if (izajes !== null) partesDetalle.push(`Izajes/Mov: ${izajes}`);
  const sufijoMetricas = partesDetalle.length > 0 ? ` (${partesDetalle.join(" · ")})` : ` (${respuestaTexto})`;
  const descripcionCompleta = `${actividadBase}${sufijoMetricas}`;

  if (actividadId) {
    const updateAct = {
      descripcion: descripcionCompleta,
      cantidad_ejecutada: cantidad,
      unidad: unidad,
    };
    // Intentar primero con columnas extendidas (horometro_horas, izajes)
    const { error: errExt } = await supabase
      .from("actividades")
      .update({
        ...updateAct,
        ...(horometro !== null ? { horometro_horas: horometro } : {}),
        ...(izajes !== null ? { izajes: izajes } : {}),
      })
      .eq("id", actividadId);

    if (errExt) {
      await supabase.from("actividades").update(updateAct).eq("id", actividadId);
    }
  }

  await supabase
    .from("planificacion_bloques_pod")
    .update({
      actividad_especifica: descripcionCompleta,
      actividad_respondida_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.planificacion_id);

  if (consultaPendiente.evento_operador_id) {
    await supabase
      .from("eventos_jornada")
      .update({ nota_transcripcion: `Actividad confirmada por supervisor: ${descripcionCompleta}` })
      .eq("id", consultaPendiente.evento_operador_id);
  }

  await supabase
    .from("estados_consulta_bot")
    .update({
      estado_pregunta: "Procesado",
      esperando_libre: false,
      esperando_confirmacion: false,
      respuesta_interpretada: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.id);

  return { actividadBase, cantidad, unidad, horometro, izajes, respuestaTexto };
}

function extraerNumeroOpcion(texto) {
  const clean = convertirPalabrasANumeros(texto || "").trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  const m = clean.match(/(?:^|\b)(?:opci[oó]n|tarea|la|el|n[uú]mero|#)?\s*(\d+)\s*[.️⃣)]?$/i);
  if (m) return parseInt(m[1], 10);
  return NaN;
}

function esAfirmacion(texto) {
  return /^\s*(si|sí|confirmo|correcto|ok|dale|de acuerdo)\s*[.!]?\s*$/i.test(texto);
}

function esNegacion(texto) {
  return /^\s*(no|incorrecto|est(a|á) mal|mal|corr[ií]geme)\s*[.!]?\s*$/i.test(texto);
}

function esConsultaConversacionalSupervisor(texto = "") {
  const clean = String(texto || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!clean) return false;
  if (clean.includes("?")) return true;
  if (/^(hola|buenos dias|buenas tardes|buenas noches|ayuda|menu|jaime)\b/.test(clean)) return true;
  if (/\b(que tareas tengo|que equipos tengo|que tengo hoy|que tengo manana|que mas te puedo|que puedes hacer|mi planificacion|mis bloques|estado de equipos|quien esta trabajando)\b/.test(clean)) {
    return true;
  }
  return false;
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

  // Si el supervisor hace una consulta general al asistente (ej. "Hola que tareas tengo hoy", "Que mas te puedo preguntar?"),
  // delegar al flujo administrativo (jAIme) en vez de tomarlo como nombre de tarea o métrica.
  if (esConsultaConversacionalSupervisor(respuestaTexto)) {
    return { manejado: false };
  }

  const enMetricas = pendientes.filter(p => p.respuesta_interpretada?.etapa === "ESPERANDO_METRICAS");

  // Caso 0: el supervisor ya seleccionó la tarea y ahora está enviando cantidades realizadas, horómetro e izajes/movimientos
  if (enMetricas.length > 0) {
    const resList = [];
    for (const p of enMetricas) {
      const resMet = await aplicarMetricasFinales(supabase, p, respuestaTexto);
      resList.push(resMet);
    }
    const r0 = resList[0];
    const msgResumen = [
      `¡Excelente! Hemos registrado el avance y métricas para este bloque:`,
      ``,
      `📌 *Tarea:* ${r0.actividadBase}`,
      `📏 *Cantidad realizada:* ${r0.cantidad !== null ? `${r0.cantidad}${r0.unidad ? ` ${r0.unidad}` : ""}` : "No especificada"}`,
      `⏱️ *Horómetro / Horas:* ${r0.horometro !== null ? `${r0.horometro} hrs` : "No especificado"}`,
      `🏗️ *Izajes / Movimientos:* ${r0.izajes !== null ? r0.izajes : "No especificado"}`,
      ``,
      `Muchas gracias. 💪`,
    ].join("\n");

    await enviarMensajeWhatsApp(jid, phoneClean, msgResumen, !!audio, geminiKey);
    return { manejado: true, action: "METRICAS_SUPERVISOR_REGISTRADAS" };
  }

  const enConfirmacion = pendientes.filter(p => p.esperando_confirmacion);

  // Caso A: el supervisor está respondiendo a un "¿confirmas?" de una ronda anterior
  if (enConfirmacion.length > 0) {
    if (esAfirmacion(respuestaTexto)) {
      const nombres = [];
      for (const p of enConfirmacion) {
        const interp = p.respuesta_interpretada;
        if (!interp) continue;
        const actividadFinal = interp.tarea_nombre || interp.texto_libre;
        nombres.push(actividadFinal);
        await aplicarActividadInicial(supabase, p, { actividadFinal, tareaProgramadaId: interp.tarea_id || null }, geminiKey);
      }
      await enviarMensajeWhatsApp(
        jid,
        phoneClean,
        `✅ *Tarea(s) confirmada(s):*\n_"${nombres.join(", ")}"_\n\n📊 Ahora por favor indícame (en texto o audio) las métricas realizadas asociadas a la tarea:\n1️⃣ *Cantidad realizada* (ej: 15 m, 4 ton, 3 un)\n2️⃣ *Horómetro / Horas* destinadas (ej: 4 hrs)\n3️⃣ *Cantidad de izajes o movimientos* (ej: 6 izajes)\n\n_Ejemplo: "15 metros, 4 horas de horómetro y 6 izajes"_`,
        !!audio,
        geminiKey
      );
      return { manejado: true, action: "CONFIRMACION_APLICADA_ESPERANDO_METRICAS" };
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

  // Caso B: exactamente 1 pregunta abierta -> parseo directo, pasa a pedir cantidades, horómetro e izajes/movimientos
  if (pendientes.length === 1) {
    const p = pendientes[0];
    const tareasEnviadas = p.tareas_enviadas || [];
    let actividadFinal = respuestaTexto;
    let tareaProgramadaId = null;

    if (p.esperando_libre) {
      actividadFinal = `[NO PROGRAMADA] ${respuestaTexto}`;
    } else {
      const numero = extraerNumeroOpcion(respuestaTexto);
      if (!isNaN(numero)) {
        if (numero === 0) {
          await supabase.from("estados_consulta_bot")
            .update({ esperando_libre: true, updated_at: new Date().toISOString() })
            .eq("id", p.id);
          await enviarMensajeWhatsApp(jid, phoneClean, `✏️ Describe brevemente la actividad que ejecutarás hoy:`, !!audio, geminiKey);
          return { manejado: true, action: "ESPERANDO_ACTIVIDAD_LIBRE" };
        } else if (tareasEnviadas.length > 0) {
          const tareaElegida = tareasEnviadas.find(t => Number(t.orden) === numero);
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

    await aplicarActividadInicial(supabase, p, { actividadFinal, tareaProgramadaId }, geminiKey);
    await enviarMensajeWhatsApp(
      jid,
      phoneClean,
      `✅ *Tarea registrada para este bloque:*\n_"${actividadFinal}"_\n\n📊 Para completar el registro, por favor indícame (en texto o audio):\n1️⃣ *Cantidades realizadas* asociadas a la tarea (ej: 15 m, 4 ton, 3 un)\n2️⃣ *Horómetro / Horas* destinadas a la tarea (ej: 4 hrs)\n3️⃣ *Cantidad de izajes o movimientos* realizados (ej: 6 izajes)\n\n_Ejemplo: "15 metros, 4 horas de horómetro y 6 izajes"_`,
      !!audio,
      geminiKey
    );
    return { manejado: true, action: "RESPUESTA_SUPERVISOR_ESPERANDO_METRICAS" };
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
