import { enviarMensajeWhatsApp } from "./messageService";
import { formatEquipoLabel } from "../../equipoLabel";
import { resolverActividadesSupervisor, extraerMetricasActividadSupervisor, convertirPalabrasANumeros } from "../../gemini";

const ANCLAS = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧"];
const NUMEROS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣"];

// Unidades por defecto según especialidad/disciplina (basado en formulario de Producción)
const UNIDAD_POR_DISCIPLINA = {
  "movimiento de tierra": "m3",
  "oocc": "m3",
  "aislacion": "m2",
  "andamios": "Kg",
  "estructura": "Ton",
  "carga/descarga": "Ton",
  "piping": "ml",
  "electrico": "ml",
  "mecanica": "Ton",
  "caldereria": "Ton",
};

function inferirUnidadPorTexto(texto = "", especialidadNombre = "") {
  const combined = `${texto} ${especialidadNombre}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const [key, unit] of Object.entries(UNIDAD_POR_DISCIPLINA)) {
    if (combined.includes(key)) return unit;
  }
  return "Ton";
}

async function obtenerPendientes(supabase, telefonoSupervisor) {
  const { data } = await supabase
    .from("estados_consulta_bot")
    .select(`
      *,
      planificacion_bloques_pod(
        id, fecha, especialidad_id, actividad_especifica,
        equipos(id, codigo_interno, patente, descripcion_equipo, proyecto_actual_id),
        especialidades(id, nombre_oficial),
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
    .map((t, i) => `${NUMEROS[i] || `${i + 1}.`} ${t.codigo ? `[${t.codigo}] ` : ""}${t.nombre}`)
    .join("\n");
}

export async function enviarConsolidadoPendientes(supabase, telefonoSupervisor, geminiKey, jid = null) {
  const pendientes = await obtenerPendientes(supabase, telefonoSupervisor);
  if (pendientes.length === 0) return;

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";

  let msg;
  if (pendientes.length === 1) {
    const p = pendientes[0];
    const equipoLabel = equipoLabelDePendiente(p);
    const operadorNombre = operadorNombreDePendiente(p);
    const espNombre = p.planificacion_bloques_pod?.especialidades?.nombre_oficial || "General";
    const unidadSugerida = inferirUnidadPorTexto("", espNombre);
    const encabezado = operadorNombre 
      ? `🚜 *¡Equipo en Operación — Registro de Producción!*\n*${equipoLabel}* está activo con el operador *${operadorNombre}* (${espNombre}).` 
      : `🚜 *¡Registro de Actividades y Producción (${espNombre})!*\nEquipo: *${equipoLabel}*`;
    const tareas = p.tareas_enviadas || [];
    const webLink = `${baseUrl}/supervisor/actividades?bloque_id=${p.planificacion_id}`;

    msg = tareas.length > 0
      ? [
          encabezado,
          ``,
          `📋 *Por favor registra TODA tu actividad posible para este equipo.*`,
          `Selecciona una tarea programada (3WL) o describe la labor indicando:`,
          `• *Id 3WL / Actividad*`,
          `• *Cantidad ejecutada* (${unidadSugerida}, m3, m2, Kg, Ton, ml, un)`,
          `• *Izajes / Movimientos realizados*`,
          `• *Horómetro (hrs)*`,
          ``,
          `*Tareas 3WL disponibles:*`,
          bloqueListaTareas(tareas),
          `0️⃣ Otra actividad / Carga-Descarga / Fuera de programa`,
          ``,
          `💡 _Puedes responder con el número (ej: "1") o enviar la línea completa (ej: "1, Id 3WL ${tareas[0]?.codigo || "ACT-01"}, 25 ${unidadSugerida}, 5 izajes, 3.5 hrs"). Podrás agregar todas las líneas que necesites._`,
          ``,
          `📲 *Formulario Web de Producción (+ Agregar línea):*`,
          `👉 ${webLink}`,
        ].join("\n")
      : [
          encabezado,
          ``,
          `📋 *Por favor registra TODA tu actividad posible para este equipo indicando:*`,
          `• *Id 3WL / Actividad* (Carga/Descarga, OOCC, Estructura, Piping, Mecánica, Calderería, Eléctrico, Movimiento de Tierra, Aislación, Andamios)`,
          `• *Cantidad ejecutada* (${unidadSugerida}, m3, m2, Kg, Ton, ml, un)`,
          `• *Izajes / Movimientos realizados*`,
          `• *Horómetro (hrs)*`,
          ``,
          `💡 _Ejemplo: "Movimiento de tierra 3WL MT-01, 40 m3, 8 movimientos, 4 hrs"_`,
          ``,
          `📲 *Formulario Web de Producción (+ Agregar línea):*`,
          `👉 ${webLink}`,
        ].join("\n");
  } else {
    const bloques = pendientes.map((p, i) => {
      const ancla = ANCLAS[i] || `(${i + 1})`;
      const equipoLabel = equipoLabelDePendiente(p);
      const operadorNombre = operadorNombreDePendiente(p);
      const tareas = p.tareas_enviadas || [];
      const listaTareas = tareas.length > 0 ? `\n${bloqueListaTareas(tareas)}\n0️⃣ Otra actividad` : "";
      const webLink = `${baseUrl}/supervisor/actividades?bloque_id=${p.planificacion_id}`;
      return `${ancla} *${equipoLabel}*${operadorNombre ? ` — Op: *${operadorNombre}*` : ""}${listaTareas}\n   👉 Formulario Producción: ${webLink}`;
    }).join("\n\n");

    const ejemplo = pendientes.slice(0, 2).map(p => `${equipoLabelDePendiente(p)}: 1`).join(", ");

    msg = `🚜 *¡Equipos Activos — Registro de Producción!* 📋 Tienes ${pendientes.length} equipos listos para registrar sus actividades, cantidades, izajes/movimientos y horómetro:\n\n${bloques}\n\n_Puedes responder por WhatsApp (ej: "${ejemplo}") o abrir el formulario web de cada equipo._`;
  }

  await enviarMensajeWhatsApp(jid, telefonoSupervisor, msg, false, geminiKey);
}

export async function crearConsultaPendiente(supabase, { telefonoSupervisor, planificacionId, especialidadId, eventoOperadorId, geminiKey, jid = null }) {
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
  const tareasEnviadas = tareas.map((t, i) => ({
    orden: i + 1,
    id: t.id,
    codigo: t.codigo || null,
    nombre: t.nombre,
  }));

  await supabase.from("estados_consulta_bot").upsert({
    telefono_supervisor: telefonoSupervisor,
    planificacion_id: planificacionId,
    evento_operador_id: eventoOperadorId || null,
    estado_pregunta: "Pendiente_Actividad",
    tareas_enviadas: tareasEnviadas,
    esperando_libre: false,
    esperando_confirmacion: false,
    respuesta_interpretada: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "planificacion_id" });

  await enviarConsolidadoPendientes(supabase, telefonoSupervisor, geminiKey, jid);

  return { tareasEnviadas };
}

export async function iniciarRegistroProduccionSupervisor(supabase, personal, { jid, phoneClean, geminiKey }) {
  const hoyChile = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const { data: bloquesHoy } = await supabase
    .from("planificacion_bloques_pod")
    .select("id, especialidad_id, hora_inicio, hora_fin, equipos(codigo_interno, descripcion_equipo)")
    .eq("supervisor_id", personal.id)
    .eq("fecha", hoyChile)
    .order("hora_inicio", { ascending: true });

  if (!bloquesHoy || bloquesHoy.length === 0) {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";
    await enviarMensajeWhatsApp(
      jid,
      phoneClean,
      `📋 Hola *${personal.nombre_completo}*, no tienes bloques POD asignados para hoy (${hoyChile}), pero puedes registrar actividades directamente en el formulario web:\n👉 ${baseUrl}/supervisor/actividades?supervisor_id=${personal.id}`,
      false,
      geminiKey
    );
    return { iniciado: false };
  }

  for (const b of bloquesHoy) {
    const espId = b.especialidad_id || personal.especialidad_id || null;
    const { data: tareasDb } = espId
      ? await supabase
          .from("tareas_programadas")
          .select("id, nombre, codigo")
          .eq("especialidad_id", espId)
          .eq("activa", true)
          .eq("es_libre", false)
          .order("orden", { ascending: true })
          .limit(8)
      : { data: [] };

    const tareasEnviadas = (tareasDb || []).map((t, i) => ({
      orden: i + 1,
      id: t.id,
      codigo: t.codigo || null,
      nombre: t.nombre,
    }));

    await supabase.from("estados_consulta_bot").upsert({
      telefono_supervisor: phoneClean,
      planificacion_id: b.id,
      evento_operador_id: null,
      estado_pregunta: "Pendiente_Actividad",
      tareas_enviadas: tareasEnviadas,
      esperando_libre: false,
      esperando_confirmacion: false,
      respuesta_interpretada: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "planificacion_id" });
  }

  await enviarConsolidadoPendientes(supabase, phoneClean, geminiKey, jid);
  return { iniciado: true, bloques: bloquesHoy.length };
}

export function parseMetricasFallback(texto, especialidadNombre = "") {
  const raw = String(texto || "");
  const clean = convertirPalabrasANumeros(raw).replace(/,/g, ".");

  // Extraer Id 3WL si viene mencionado (ej: "3WL: MT-01", "Id 3WL PIP-102", "[EXE.CONS.PI.0048.248]")
  const m3wl =
    raw.match(/(?:id\s*3wl|3wl|c[oó]digo)\s*[:=-]?\s*([A-Za-z0-9._-]{2,30})/i) ||
    raw.match(/\b([A-Z]{2,5}(?:[._-][A-Z0-9]{1,10}){1,5})\b/);
  const id3wl = m3wl ? m3wl[1] : null;

  const mHor =
    clean.match(/(\d+(?:\.\d+)?)\s*(?:hrs?|horas?|h\b|hor[oó]metro)/i) ||
    clean.match(/hor[oó]metro\s*(?:de|:|=)?\s*(\d+(?:\.\d+)?)/i);

  const mIz =
    clean.match(/(\d+)\s*(?:izajes?|maniobras?|movimientos?|movs?|ciclos?|cargas?|descargas?)/i) ||
    clean.match(/(?:izajes?|movimientos?|maniobras?)\s*(?:de|:|=)?\s*(\d+)/i);

  const mCant =
    clean.match(/(\d+(?:\.\d+)?)\s*(m3|m2|ml|metros?\s*c[uú]bicos?|metros?\s*cuadrados?|metros?\s*lineales?|metros?|m\b|toneladas?|ton|t\b|kg|kilos?|unidades?|un\b|spools?|pulgadas?)/i) ||
    clean.match(/cantidad\s*(?:de|:|=)?\s*(\d+(?:\.\d+)?)\s*(m3|m2|ml|ton|kg|un)?/i);

  let cantidad = mCant ? parseFloat(mCant[1]) : null;
  let unidadRaw = mCant && mCant[2] ? mCant[2].toLowerCase() : null;
  let unidad = null;
  if (unidadRaw) {
    if (unidadRaw.startsWith("m3") || unidadRaw.includes("cubico")) unidad = "m3";
    else if (unidadRaw.startsWith("m2") || unidadRaw.includes("cuadrado")) unidad = "m2";
    else if (unidadRaw === "ml" || unidadRaw.includes("lineal") || unidadRaw.startsWith("metro") || unidadRaw === "m") unidad = "ml";
    else if (unidadRaw.startsWith("kg") || unidadRaw.startsWith("kilo")) unidad = "Kg";
    else if (unidadRaw.startsWith("ton") || unidadRaw === "t") unidad = "Ton";
    else if (unidadRaw.startsWith("un") || unidadRaw.startsWith("spool")) unidad = "un";
    else unidad = unidadRaw;
  }

  let horometro = mHor ? parseFloat(mHor[1]) : null;
  let izajes = mIz ? parseInt(mIz[1], 10) : null;

  // Si solo envió números separados por coma/espacio (ej: "25, 4, 3.5" -> Cantidad, Izajes, Horómetro)
  if (cantidad === null && horometro === null && izajes === null) {
    const nums = (clean.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length >= 1) cantidad = nums[0];
    if (nums.length >= 2) izajes = Math.round(nums[1]);
    if (nums.length >= 3) horometro = nums[2];
  }

  if (cantidad !== null && !unidad) {
    unidad = inferirUnidadPorTexto(raw, especialidadNombre);
  }

  const tieneMetricasExplicitas = Boolean(mCant || mHor || mIz);

  return {
    id_3wl: id3wl,
    cantidad_ejecutada: cantidad,
    unidad: unidad,
    horometro_horas: horometro,
    izajes_movimientos: izajes,
    tieneMetricasExplicitas,
  };
}

async function aplicarActividadInicial(supabase, consultaPendiente, { actividadFinal, tareaProgramadaId, codigo3wl }, geminiKey) {
  const { data: bloqueInfo } = await supabase
    .from("planificacion_bloques_pod")
    .select("fecha, especialidad_id, equipo_id, supervisor_id, actividad_especifica, equipos(proyecto_actual_id), especialidades(nombre_oficial)")
    .eq("id", consultaPendiente.planificacion_id)
    .maybeSingle();

  const espNombre = bloqueInfo?.especialidades?.nombre_oficial || "General";
  const unidadDefault = inferirUnidadPorTexto(actividadFinal, espNombre);

  const baseRow = {
    fecha: bloqueInfo?.fecha,
    proyecto_id: bloqueInfo?.equipos?.proyecto_actual_id || null,
    especialidad_id: bloqueInfo?.especialidad_id || null,
    tarea_programada_id: tareaProgramadaId || null,
    descripcion: actividadFinal,
    programada: !!tareaProgramadaId,
    unidad: unidadDefault,
  };

  let nuevaActividad = null;
  const { data: extData, error: extErr } = await supabase
    .from("actividades")
    .insert({
      ...baseRow,
      equipo_id: bloqueInfo?.equipo_id || null,
      supervisor_id: bloqueInfo?.supervisor_id || null,
      bloque_id: consultaPendiente.planificacion_id,
      id_3wl: codigo3wl || null,
      categoria_disciplina: espNombre,
    })
    .select("id")
    .single();

  if (!extErr && extData) {
    nuevaActividad = extData;
  } else {
    const { data: fallbackData } = await supabase
      .from("actividades")
      .insert(baseRow)
      .select("id")
      .single();
    nuevaActividad = fallbackData;
  }

  const actividadId = nuevaActividad?.id || null;
  const prevLineas = consultaPendiente.respuesta_interpretada?.lineas_registradas || [];

  const resumenAcumulado = [...prevLineas.map(l => l.resumen), actividadFinal].join(" | ");

  await supabase
    .from("planificacion_bloques_pod")
    .update({
      actividad_especifica: resumenAcumulado,
      actividad_id: actividadId,
      actividad_respondida_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.planificacion_id);

  if (consultaPendiente.evento_operador_id && prevLineas.length === 0) {
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
        await enviarMensajeWhatsApp(
          null,
          opWa,
          `📢 *Actividad confirmada por tu supervisor:*\n\n_"${actividadFinal}"_\n\n¡Buena jornada! 💪`,
          false,
          geminiKey
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
        codigo_3wl: codigo3wl || null,
        tarea_id: tareaProgramadaId || null,
        actividad_id: actividadId,
        lineas_registradas: prevLineas,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.id);

  return { actividadId, unidadDefault, espNombre };
}

async function aplicarMetricasFinales(supabase, consultaPendiente, respuestaTexto) {
  const interp = consultaPendiente.respuesta_interpretada || {};
  const actividadBase = interp.actividad_final || "Labor en faena";
  const actividadId = interp.actividad_id || null;
  const espNombre = consultaPendiente.planificacion_bloques_pod?.especialidades?.nombre_oficial || "";

  let metricas = {};
  try {
    metricas = await extraerMetricasActividadSupervisor(respuestaTexto, actividadBase);
  } catch (err) {
    metricas = parseMetricasFallback(respuestaTexto, espNombre);
  }

  const fb = parseMetricasFallback(respuestaTexto, espNombre);
  const id3wl = interp.codigo_3wl || fb.id_3wl || null;
  const cantidad = metricas.cantidad_ejecutada ?? fb.cantidad_ejecutada ?? null;
  const unidad = metricas.unidad || fb.unidad || inferirUnidadPorTexto(actividadBase, espNombre);
  const horometro = metricas.horometro_horas ?? fb.horometro_horas ?? null;
  const izajes = metricas.izajes_movimientos ?? fb.izajes_movimientos ?? null;

  const partesDetalle = [];
  if (id3wl) partesDetalle.push(`3WL: ${id3wl}`);
  if (cantidad !== null) partesDetalle.push(`Cant: ${cantidad}${unidad ? ` ${unidad}` : ""}`);
  if (izajes !== null) partesDetalle.push(`Izajes/Mov: ${izajes}`);
  if (horometro !== null) partesDetalle.push(`Horómetro: ${horometro} hrs`);
  const sufijoMetricas = partesDetalle.length > 0 ? ` (${partesDetalle.join(" · ")})` : ` (${respuestaTexto})`;
  const descripcionCompleta = `${actividadBase}${sufijoMetricas}`;

  if (actividadId) {
    const updateAct = {
      descripcion: descripcionCompleta,
      cantidad_ejecutada: cantidad,
      unidad: unidad,
    };
    const { error: errExt } = await supabase
      .from("actividades")
      .update({
        ...updateAct,
        ...(id3wl ? { id_3wl: id3wl } : {}),
        ...(horometro !== null ? { horometro_horas: horometro } : {}),
        ...(izajes !== null ? { izajes: izajes } : {}),
      })
      .eq("id", actividadId);

    if (errExt) {
      await supabase.from("actividades").update(updateAct).eq("id", actividadId);
    }
  }

  const prevLineas = Array.isArray(interp.lineas_registradas) ? interp.lineas_registradas : [];
  const nuevaLinea = {
    actividadBase,
    id3wl,
    cantidad,
    unidad,
    horometro,
    izajes,
    resumen: descripcionCompleta,
  };
  const todasLasLineas = [...prevLineas, nuevaLinea];
  const resumenBloqueCompleto = todasLasLineas.map(l => l.resumen).join(" | ");

  await supabase
    .from("planificacion_bloques_pod")
    .update({
      actividad_especifica: resumenBloqueCompleto,
      actividad_respondida_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.planificacion_id);

  if (consultaPendiente.evento_operador_id) {
    await supabase
      .from("eventos_jornada")
      .update({ nota_transcripcion: `Producción confirmada por supervisor: ${resumenBloqueCompleto}` })
      .eq("id", consultaPendiente.evento_operador_id);
  }

  // Mantener la consulta en etapa ESPERANDO_OTRA_ACTIVIDAD para permitir "+ Agregar línea" (registrar toda la actividad posible)
  await supabase
    .from("estados_consulta_bot")
    .update({
      estado_pregunta: "Pendiente_Actividad",
      esperando_libre: false,
      esperando_confirmacion: false,
      respuesta_interpretada: {
        etapa: "ESPERANDO_OTRA_ACTIVIDAD",
        lineas_registradas: todasLasLineas,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", consultaPendiente.id);

  return { ...nuevaLinea, numLinea: todasLasLineas.length, todasLasLineas };
}

function extraerNumeroOpcion(texto) {
  const clean = convertirPalabrasANumeros(texto || "").trim();
  if (/^\d+$/.test(clean)) return parseInt(clean, 10);
  // También permite "1, 25 m3..." -> extrae el 1 inicial si va seguido de coma/espacio o si es opción corta
  const m = clean.match(/^(?:opci[oó]n|tarea|la|el|n[uú]mero|#)?\s*(\d+)\s*(?:[.️⃣),:-]|\s+|$)/i);
  if (m && Number(m[1]) <= 20) return parseInt(m[1], 10);
  return NaN;
}

function esAfirmacion(texto) {
  return /^\s*(si|sí|confirmo|correcto|ok|dale|de acuerdo)\s*[.!]?\s*$/i.test(texto);
}

function esNegacion(texto) {
  return /^\s*(no|incorrecto|est(a|á) mal|mal|corr[ií]geme)\s*[.!]?\s*$/i.test(texto);
}

function esCierreProduccion(texto = "") {
  const clean = String(texto || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^(listo|lista|no|nada mas|eso es todo|fin|terminar|finalizar|ninguna|no gracias|ok|gracias|cerrar)\s*[.!]*$/.test(clean);
}

function esConsultaConversacionalSupervisor(texto = "") {
  const clean = String(texto || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!clean) return false;
  if (clean.includes("?")) return true;
  if (/^(hola|buenos dias|buenas tardes|buenas noches|ayuda|menu|jaime)\b/.test(clean)) return true;
  if (/\b(que tareas tengo|que equipos tengo|que tengo hoy|que tengo manana|que mas te puedo|que puedes hacer|mi planificacion|mis bloques|estado de equipos|quien esta trabajando|telemetria|combustible|viajes|ubicacion|donde esta)\b/.test(clean)) {
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

  // Si el supervisor hace una consulta general al asistente, cerrar pendientes que ya tenían al menos 1 línea y delegar a jAIme
  if (esConsultaConversacionalSupervisor(respuestaTexto)) {
    const enOtra = pendientes.filter(p => p.respuesta_interpretada?.etapa === "ESPERANDO_OTRA_ACTIVIDAD");
    if (enOtra.length > 0) {
      await supabase
        .from("estados_consulta_bot")
        .update({ estado_pregunta: "Procesado", updated_at: new Date().toISOString() })
        .in("id", enOtra.map(p => p.id));
    }
    return { manejado: false };
  }

  // Caso 0A: El supervisor está en ESPERANDO_OTRA_ACTIVIDAD ("+ Agregar línea")
  const enOtraActividad = pendientes.filter(p => p.respuesta_interpretada?.etapa === "ESPERANDO_OTRA_ACTIVIDAD");
  if (enOtraActividad.length > 0) {
    const p = enOtraActividad[0];
    const lineasPrevias = p.respuesta_interpretada?.lineas_registradas || [];

    if (esCierreProduccion(respuestaTexto)) {
      await supabase
        .from("estados_consulta_bot")
        .update({
          estado_pregunta: "Procesado",
          esperando_libre: false,
          esperando_confirmacion: false,
          updated_at: new Date().toISOString(),
        })
        .in("id", enOtraActividad.map(x => x.id));

      const resumenFinal = lineasPrevias
        .map((l, idx) => `   ${idx + 1}. *${l.actividadBase}*${l.id3wl ? ` [3WL: ${l.id3wl}]` : ""} — Cant: ${l.cantidad ?? "-"} ${l.unidad || ""} · Izajes/Mov: ${l.izajes ?? "-"} · Horómetro: ${l.horometro ?? "-"} hrs`)
        .join("\n");

      await enviarMensajeWhatsApp(
        jid,
        phoneClean,
        `✅ *¡Registro de Producción Finalizado!* (${equipoLabelDePendiente(p)})\n\n📋 *Total actividades registradas (${lineasPrevias.length}):*\n${resumenFinal}\n\nMuchas gracias por tu reporte. 💪`,
        !!audio,
        geminiKey
      );
      return { manejado: true, action: "PRODUCCION_SUPERVISOR_FINALIZADA" };
    }

    // Si el supervisor dijo "Sí" / "Agregar otra", pedirle cuál es la siguiente actividad
    if (esAfirmacion(respuestaTexto) || /^\s*(agregar|otra|otra linea|mas|sumar)\s*$/i.test(respuestaTexto)) {
      const tareas = p.tareas_enviadas || [];
      const lista = tareas.length > 0 ? `\n\n*Tareas 3WL:*\n${bloqueListaTareas(tareas)}\n0️⃣ Otra actividad` : "";
      await enviarMensajeWhatsApp(
        jid,
        phoneClean,
        `➕ *Agregar nueva línea de producción (${equipoLabelDePendiente(p)}):*\nEnvía la actividad o Id 3WL junto con su *Cantidad*, *Izajes/Movimientos* y *Horómetro (hrs)*.${lista}`,
        !!audio,
        geminiKey
      );
      return { manejado: true, action: "ESPERANDO_NUEVA_LINEA_DETALLE" };
    }
    // Si escribió directamente la siguiente tarea o línea con métricas, continúa hacia el flujo de selección/registro abajo
  }

  const enMetricas = pendientes.filter(p => p.respuesta_interpretada?.etapa === "ESPERANDO_METRICAS");

  // Caso 0B: el supervisor ya seleccionó la tarea y ahora está enviando cantidades realizadas, horómetro e izajes/movimientos
  if (enMetricas.length > 0) {
    const resList = [];
    for (const p of enMetricas) {
      const resMet = await aplicarMetricasFinales(supabase, p, respuestaTexto);
      resList.push(resMet);
    }
    const r0 = resList[0];
    const msgResumen = [
      `✅ *Línea de Producción #${r0.numLinea} registrada (${equipoLabelDePendiente(enMetricas[0])}):*`,
      ``,
      `📌 *Actividad:* ${r0.actividadBase}${r0.id3wl ? ` (Id 3WL: ${r0.id3wl})` : ""}`,
      `📏 *Cantidad realizada:* ${r0.cantidad !== null ? `${r0.cantidad}${r0.unidad ? ` ${r0.unidad}` : ""}` : "No especificada"}`,
      `🏗️ *Izajes / Movimientos:* ${r0.izajes !== null ? r0.izajes : "No especificado"}`,
      `⏱️ *Horómetro:* ${r0.horometro !== null ? `${r0.horometro} hrs` : "No especificado"}`,
      ``,
      `➕ *¿Deseas agregar otra línea de actividad/producción para este equipo?*`,
      `• Envía directamente la siguiente actividad (con *Cantidad*, *Izajes/Movimientos* y *Horómetro*)`,
      `• O responde *LISTO* para finalizar el registro.`,
    ].join("\n");

    await enviarMensajeWhatsApp(jid, phoneClean, msgResumen, !!audio, geminiKey);
    return { manejado: true, action: "METRICAS_SUPERVISOR_REGISTRADAS_ESPERANDO_OTRA" };
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
        await aplicarActividadInicial(supabase, p, { actividadFinal, tareaProgramadaId: interp.tarea_id || null, codigo3wl: interp.codigo_3wl || null }, geminiKey);
      }
      await enviarMensajeWhatsApp(
        jid,
        phoneClean,
        `✅ *Tarea(s) confirmada(s):*\n_"${nombres.join(", ")}"_\n\n📊 Ahora por favor indícame (en texto o audio) la producción realizada:\n1️⃣ *Id 3WL* (opcional) y *Cantidad realizada* (m3, m2, Kg, Ton, ml, un)\n2️⃣ *Cantidad de Izajes o Movimientos* realizados\n3️⃣ *Horómetro (hrs)* destinado a la tarea\n\n_Ejemplo: "25 m3, 6 izajes y 4 hrs de horómetro"_`,
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

  // Caso B: exactamente 1 pregunta abierta (o en ESPERANDO_OTRA_ACTIVIDAD agregando nueva línea)
  if (pendientes.length === 1) {
    const p = pendientes[0];
    const tareasEnviadas = p.tareas_enviadas || [];
    const espNombre = p.planificacion_bloques_pod?.especialidades?.nombre_oficial || "General";
    let actividadFinal = respuestaTexto.trim();
    let tareaProgramadaId = null;
    let codigo3wl = null;

    if (p.esperando_libre) {
      actividadFinal = `[NO PROGRAMADA] ${respuestaTexto.trim()}`;
    } else {
      const numero = extraerNumeroOpcion(respuestaTexto);
      if (!isNaN(numero)) {
        if (numero === 0) {
          await supabase.from("estados_consulta_bot")
            .update({ esperando_libre: true, updated_at: new Date().toISOString() })
            .eq("id", p.id);
          await enviarMensajeWhatsApp(
            jid,
            phoneClean,
            `✏️ Describe la actividad ejecutada (puedes incluir de inmediato *Id 3WL*, *Cantidad*, *Izajes/Movimientos* y *Horómetro*):`,
            !!audio,
            geminiKey
          );
          return { manejado: true, action: "ESPERANDO_ACTIVIDAD_LIBRE" };
        } else if (tareasEnviadas.length > 0) {
          const tareaElegida = tareasEnviadas.find(t => Number(t.orden) === numero);
          if (tareaElegida) {
            actividadFinal = tareaElegida.nombre;
            tareaProgramadaId = tareaElegida.id || null;
            codigo3wl = tareaElegida.codigo || null;
          } else if (/^\d+$/.test(respuestaTexto.trim())) {
            await enviarMensajeWhatsApp(jid, phoneClean, `⚠️ Número inválido. Responde con un número del *1* al *${tareasEnviadas.length}*, o *0* para otra actividad.`, !!audio, geminiKey);
            return { manejado: true, action: "NUMERO_FUERA_RANGO" };
          }
        }
      }
    }

    // Verificar si el supervisor envió en el mismo mensaje la actividad + métricas (ej: "1, 25 m3, 6 izajes, 4 hrs" o "Movimiento de tierra 40 m3, 8 izajes, 3.5 hrs")
    const textoSinOpcionInicial = respuestaTexto.replace(/^\s*\d+\s*[,.:;-]\s*/, "");
    const preMetricas = parseMetricasFallback(textoSinOpcionInicial, espNombre);

    const { unidadDefault } = await aplicarActividadInicial(
      supabase,
      p,
      { actividadFinal, tareaProgramadaId, codigo3wl: codigo3wl || preMetricas.id_3wl },
      geminiKey
    );

    if (preMetricas.tieneMetricasExplicitas) {
      const { data: pActualizado } = await supabase
        .from("estados_consulta_bot")
        .select(`*, planificacion_bloques_pod(id, fecha, especialidad_id, equipos(codigo_interno, patente), especialidades(nombre_oficial))`)
        .eq("id", p.id)
        .maybeSingle();

      const r0 = await aplicarMetricasFinales(supabase, pActualizado || p, textoSinOpcionInicial);
      const msgDirecto = [
        `✅ *Línea de Producción #${r0.numLinea} registrada (${equipoLabelDePendiente(p)}):*`,
        ``,
        `📌 *Actividad:* ${r0.actividadBase}${r0.id3wl ? ` (Id 3WL: ${r0.id3wl})` : ""}`,
        `📏 *Cantidad realizada:* ${r0.cantidad !== null ? `${r0.cantidad}${r0.unidad ? ` ${r0.unidad}` : ""}` : "No especificada"}`,
        `🏗️ *Izajes / Movimientos:* ${r0.izajes !== null ? r0.izajes : "No especificado"}`,
        `⏱️ *Horómetro:* ${r0.horometro !== null ? `${r0.horometro} hrs` : "No especificado"}`,
        ``,
        `➕ *¿Deseas agregar otra línea de actividad/producción para este equipo?*`,
        `• Envía la siguiente actividad con *Cantidad*, *Izajes/Movimientos* y *Horómetro*`,
        `• O responde *LISTO* para finalizar.`,
      ].join("\n");

      await enviarMensajeWhatsApp(jid, phoneClean, msgDirecto, !!audio, geminiKey);
      return { manejado: true, action: "ACTIVIDAD_Y_METRICAS_REGISTRADAS_EN_UN_PASO" };
    }

    await enviarMensajeWhatsApp(
      jid,
      phoneClean,
      [
        `✅ *Actividad seleccionada (${equipoLabelDePendiente(p)}):*`,
        `_"${actividadFinal}"_${codigo3wl ? ` (Id 3WL: *${codigo3wl}*)` : ""}`,
        ``,
        `📊 *Por favor indica las métricas de producción de esta línea (en texto o audio):*`,
        `1️⃣ *Cantidad realizada* (ej: 25 ${unidadDefault}, m3, m2, Kg, Ton, ml, un)`,
        `2️⃣ *Izajes / Movimientos realizados* (ej: 6 izajes o movimientos)`,
        `3️⃣ *Horómetro (hrs)* destinado a la actividad (ej: 4 hrs)`,
        ``,
        `_Ejemplo: "25 ${unidadDefault}, 6 izajes y 4 hrs de horómetro"_`,
      ].join("\n"),
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
    let codigo3wl = null;
    if (r.tarea_orden != null) {
      const tarea = (p.tareas_enviadas || []).find(t => t.orden === r.tarea_orden);
      if (tarea) {
        tareaNombre = tarea.nombre;
        tareaId = tarea.id || null;
        codigo3wl = tarea.codigo || null;
      }
    }
    const textoLibre = tareaNombre ? null : (r.texto_libre || null);
    if (!tareaNombre && !textoLibre) continue;

    await supabase.from("estados_consulta_bot").update({
      esperando_confirmacion: true,
      respuesta_interpretada: { tarea_nombre: tareaNombre, tarea_id: tareaId, codigo_3wl: codigo3wl, texto_libre: textoLibre },
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
