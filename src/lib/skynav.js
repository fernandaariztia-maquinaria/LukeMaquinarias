import { createAdminClient } from "./supabase-server";

const DEFAULT_BASE_URL = "https://api.skynav.cl";
const DEFAULT_RESUMEN_PATH = "modulo_generico/external/echeverria/resumen";

/**
 * Normaliza patentes o códigos (remueve guiones, espacios y convierte a mayúsculas)
 * Ej: "BVWV-14" -> "BVWV14", "rcwt-22 " -> "RCWT22"
 */
export function normalizarIdentificador(str) {
  if (!str) return "";
  return String(str).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Formatea un Date o string ISO a formato dd-MM-yyyy (esperado por SKYNAV)
 */
export function formatearFechaSkynav(fecha) {
  if (!fecha) return "";
  if (typeof fecha === "string" && /^\d{2}-\d{2}-\d{4}$/.test(fecha)) {
    return fecha;
  }
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const anio = d.getFullYear();
  return `${dia}-${mes}-${anio}`;
}

/**
 * Convierte formato dd-MM-yyyy a ISO YYYY-MM-DD para almacenamiento en base de datos
 */
export function skynavFechaAISO(fechaStr) {
  if (!fechaStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return fechaStr;
  const partes = fechaStr.split("-");
  if (partes.length === 3) {
    const [dd, mm, yyyy] = partes;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return fechaStr;
}

/**
 * Divide un rango de fechas en bloques de máximo 30 días para no exceder la limitación de la API de SKYNAV
 */
export function dividirEnBloques30Dias(fechaDesdeStr, fechaHastaStr) {
  const d1 = new Date(fechaDesdeStr);
  const d2 = new Date(fechaHastaStr);
  const bloques = [];

  let inicio = new Date(d1);
  while (inicio <= d2) {
    let fin = new Date(inicio);
    fin.setDate(fin.getDate() + 29); // bloque de 30 días máx
    if (fin > d2) fin = new Date(d2);

    bloques.push({
      desde: formatearFechaSkynav(inicio),
      hasta: formatearFechaSkynav(fin),
    });

    inicio = new Date(fin);
    inicio.setDate(inicio.getDate() + 1);
  }

  return bloques;
}

/**
 * Consulta la API de SKYNAV para un rango de fechas (con soporte automático para rangos > 30 días)
 */
export async function fetchSkynavResumen({ desde, hasta }) {
  const baseUrl = process.env.SKYNAV_BASE_URL || DEFAULT_BASE_URL;
  const path = process.env.SKYNAV_RESUMEN_PATH || DEFAULT_RESUMEN_PATH;
  const token = process.env.SKYNAV_API_TOKEN;

  if (!token) {
    throw new Error("[SKYNAV] Variable SKYNAV_API_TOKEN no configurada en .env.local");
  }

  // Si se pasan fechas en ISO, convertir a dd-MM-yyyy
  const desdeTxt = formatearFechaSkynav(desde);
  const hastaTxt = formatearFechaSkynav(hasta);

  // Calcular diferencia en días
  const fDesde = new Date(skynavFechaAISO(desdeTxt));
  const fHasta = new Date(skynavFechaAISO(hastaTxt));
  const diffDias = Math.round((fHasta - fDesde) / (1000 * 60 * 60 * 24));

  if (diffDias > 30) {
    const bloques = dividirEnBloques30Dias(fDesde, fHasta);
    const resultadosTotales = [];
    for (const b of bloques) {
      const parte = await fetchBloqueSimple(baseUrl, path, token, b.desde, b.hasta);
      resultadosTotales.push(...parte);
    }
    return resultadosTotales;
  }

  return await fetchBloqueSimple(baseUrl, path, token, desdeTxt, hastaTxt);
}

async function fetchBloqueSimple(baseUrl, path, token, desdeStr, hastaStr) {
  const url = `${baseUrl}/${path}?desde=${encodeURIComponent(desdeStr)}&hasta=${encodeURIComponent(hastaStr)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    // Timeout de 60 segundos
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[SKYNAV] Error HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("[SKYNAV] La respuesta de la API no es una lista de registros");
  }

  return data;
}

/**
 * Agrupa los eventos granulares de SKYNAV por (unidad, fecha) para generar los resúmenes diarios
 */
export function procesarEventosSkynav(registrosCrudos) {
  const mapaDiario = new Map();

  for (const r of registrosCrudos) {
    const rawId = (r.Patente || r.Nombre || "").trim();
    if (!rawId) continue;

    const fechaISO = skynavFechaAISO(r.Fecha);
    if (!fechaISO) continue;

    const clave = `${normalizarIdentificador(rawId)}_${fechaISO}`;

    if (!mapaDiario.has(clave)) {
      mapaDiario.set(clave, {
        identificador_skynav: rawId,
        patente: r.Patente ? r.Patente.trim() : null,
        nombre_skynav: r.Nombre ? r.Nombre.trim() : null,
        tipo_skynav: r.Tipo || null,
        subtipo_skynav: r.Subtipo || null,
        fecha: fechaISO,
        km_recorridos: 0,
        horas_motor: 0,
        horas_ralenti: 0,
        horas_viaje: 0,
        horas_trabajando: 0,
        combustible_litros: 0,
        litros_can: 0,
        litros_gps: 0,
        combustible_origen: r["Origen Combustible"] || null,
        origen_combustible: null,
        origen_km: "GPS",
        latitud_ultima: null,
        longitud_ultima: null,
        lugar_ultimo: null,
        geocerca_ultima: null,
        eventos_exceso_velocidad: 0,
        conductores: new Set(),
        total_eventos: 0,
        ultimo_fin_hora: "00:00:00",
      });
    }

    const item = mapaDiario.get(clave);
    item.total_eventos += 1;

    const distKm = Number(r["Distancia (km)"]) || 0;
    const durMin = Number(r["Tiempo (min)"]) || 0;
    const litCan = Number(r["Litros CAN"]) || 0;
    const litGps = Number(r["Litros GPS"]) || 0;
    const comb = Number(r.Combustible) || (litCan > 0 ? litCan : litGps);

    item.km_recorridos += distKm;
    item.combustible_litros += comb;
    item.litros_can += litCan;
    item.litros_gps += litGps;

    const orig = (r["Origen Combustible"] || "").toUpperCase();
    if (orig === "CAN" || litCan > 0) {
      item.origen_combustible = "CAN";
      item.origen_km = "CAN";
      item.combustible_origen = "CAN";
    } else if (orig === "GPS" && item.origen_combustible !== "CAN") {
      item.origen_combustible = "GPS";
      item.combustible_origen = "GPS";
    }

    const ev = (r.Evento || "").trim().toLowerCase();
    const durHoras = durMin / 60;

    if (ev === "viaje") {
      item.horas_viaje += durHoras;
      item.horas_motor += durHoras;
    } else if (ev === "ralentí" || ev === "ralenti") {
      item.horas_ralenti += durHoras;
      item.horas_motor += durHoras;
    } else if (ev === "trabajando") {
      item.horas_trabajando += durHoras;
      item.horas_motor += durHoras;
    } else if (ev === "encendido" || ev === "exceso de velocidad") {
      item.horas_motor += durHoras;
    }

    if (ev === "exceso de velocidad") {
      item.eventos_exceso_velocidad += 1;
    }

    if (r["Nombre Conductor"]) {
      item.conductores.add(r["Nombre Conductor"].trim());
    }

    // Actualizar última posición del día con base en la hora de fin
    const finHora = r.Fin || "00:00:00";
    if (finHora >= item.ultimo_fin_hora) {
      item.ultimo_fin_hora = finHora;
      if (r["Latitud Fin"] && r["Longitud Fin"]) {
        item.latitud_ultima = Number(r["Latitud Fin"]);
        item.longitud_ultima = Number(r["Longitud Fin"]);
        item.lugar_ultimo = r["Lugar Fin"] || r["Geocerca Fin"] || item.lugar_ultimo;
        item.geocerca_ultima = r["Geocerca Fin"] || item.geocerca_ultima;
      } else if (r["Latitud Inicio"] && r["Longitud Inicio"]) {
        item.latitud_ultima = Number(r["Latitud Inicio"]);
        item.longitud_ultima = Number(r["Longitud Inicio"]);
        item.lugar_ultimo = r["Lugar Inicio"] || r["Geocerca Inicio"] || item.lugar_ultimo;
        item.geocerca_ultima = r["Geocerca Inicio"] || item.geocerca_ultima;
      }
    }
  }

  // Formatear salida redondeando decimales y convirtiendo Set a Array
  return Array.from(mapaDiario.values()).map((u) => ({
    ...u,
    km_recorridos: Math.round(u.km_recorridos * 100) / 100,
    horas_motor: Math.round(u.horas_motor * 100) / 100,
    horas_ralenti: Math.round(u.horas_ralenti * 100) / 100,
    horas_viaje: Math.round(u.horas_viaje * 100) / 100,
    horas_trabajando: Math.round(u.horas_trabajando * 100) / 100,
    combustible_litros: Math.round(u.combustible_litros * 100) / 100,
    litros_can: Math.round(u.litros_can * 100) / 100,
    litros_gps: Math.round(u.litros_gps * 100) / 100,
    origen_combustible: u.origen_combustible || (u.litros_can > 0 ? "CAN" : (u.litros_gps > 0 ? "GPS" : "GPS")),
    combustible_origen: u.origen_combustible || (u.litros_can > 0 ? "CAN" : (u.litros_gps > 0 ? "GPS" : "GPS")),
    origen_km: u.origen_km || (u.litros_can > 0 ? "CAN" : "GPS"),
    conductores: Array.from(u.conductores),
  }));
}

/**
 * Realiza la sincronización completa desde SKYNAV hacia Supabase (esquema maquinaria)
 */
export async function sincronizarTelemetria({ desde, hasta, iniciadoPor = "MANUAL" }) {
  const inicioTiempo = Date.now();
  const supabase = createAdminClient();

  // 1. Obtener todos los equipos registrados en Supabase para mapeo
  const { data: equipos, error: errEquipos } = await supabase
    .schema("maquinaria")
    .from("equipos")
    .select("id, codigo_interno, patente, descripcion_equipo, tipo, categoria");

  if (errEquipos) {
    throw new Error(`[SKYNAV] Error consultando equipos en Supabase: ${errEquipos.message}`);
  }

  // Índices en memoria para matching ultrarrápido
  const mapaPorPatente = new Map();
  const mapaPorCodigo = new Map();

  for (const eq of equipos || []) {
    if (eq.patente) {
      mapaPorPatente.set(normalizarIdentificador(eq.patente), eq);
    }
    if (eq.codigo_interno) {
      mapaPorCodigo.set(normalizarIdentificador(eq.codigo_interno), eq);
    }
  }

  // 2. Consultar API SKYNAV
  const rawList = await fetchSkynavResumen({ desde, hasta });
  const resumenes = procesarEventosSkynav(rawList);

  let mapeadas = 0;
  let sinMapear = 0;
  const equiposAActualizar = new Map();

  // 3. Asociar equipo_id a cada resumen diario
  const filasParaInsertar = resumenes.map((r) => {
    const patNorm = normalizarIdentificador(r.patente);
    const nomNorm = normalizarIdentificador(r.nombre_skynav);

    const eq =
      (patNorm ? mapaPorPatente.get(patNorm) : null) ||
      (nomNorm ? mapaPorCodigo.get(nomNorm) : null) ||
      (patNorm ? mapaPorCodigo.get(patNorm) : null) ||
      (nomNorm ? mapaPorPatente.get(nomNorm) : null);

    const equipoId = eq ? eq.id : null;

    if (equipoId) {
      mapeadas += 1;
      // Guardar última posición conocida para actualizar maquinaria.equipos
      if (r.latitud_ultima && r.longitud_ultima) {
        equiposAActualizar.set(equipoId, {
          latitud_actual: r.latitud_ultima,
          longitud_actual: r.longitud_ultima,
          ultima_ubicacion_fecha: `${r.fecha}T${r.ultimo_fin_hora || "12:00:00"}-03:00`,
          telemetria_activa: true,
          skynav_identificador: r.identificador_skynav,
        });
      }
    } else {
      sinMapear += 1;
    }

    const { ultimo_fin_hora, ...resto } = r;
    return {
      ...resto,
      equipo_id: equipoId,
      updated_at: new Date().toISOString(),
    };
  });

  // 4. Upsert en lotes de 100 registros a maquinaria.telemetria_diaria
  const BATCH_SIZE = 100;
  for (let i = 0; i < filasParaInsertar.length; i += BATCH_SIZE) {
    const lote = filasParaInsertar.slice(i, i + BATCH_SIZE);
    const { error: errUpsert } = await supabase
      .schema("maquinaria")
      .from("telemetria_diaria")
      .upsert(lote, {
        onConflict: "identificador_skynav,fecha",
      });

    if (errUpsert) {
      throw new Error(`[SKYNAV] Error al guardar lote de telemetría: ${errUpsert.message}`);
    }
  }

  // 5. Actualizar última posición de los equipos en maquinaria.equipos
  for (const [eqId, updateData] of equiposAActualizar.entries()) {
    await supabase
      .schema("maquinaria")
      .from("equipos")
      .update(updateData)
      .eq("id", eqId);
  }

  const duracionMs = Date.now() - inicioTiempo;

  // 6. Registrar en auditoría de sincronizaciones
  const fDesdeISO = skynavFechaAISO(formatearFechaSkynav(desde));
  const fHastaISO = skynavFechaAISO(formatearFechaSkynav(hasta));

  await supabase
    .schema("maquinaria")
    .from("telemetria_sincronizaciones")
    .insert({
      fecha_desde: fDesdeISO,
      fecha_hasta: fHastaISO,
      registros_crudos: rawList.length,
      unidades_procesadas: resumenes.length,
      unidades_mapeadas: mapeadas,
      unidades_sin_mapear: sinMapear,
      estado: "EXITO",
      iniciado_por: iniciadoPor,
      duracion_ms: duracionMs,
    });

  return {
    success: true,
    rango: { desde: fDesdeISO, hasta: fHastaISO },
    registros_crudos: rawList.length,
    unidades_procesadas: resumenes.length,
    unidades_mapeadas: mapeadas,
    unidades_sin_mapear: sinMapear,
    equipos_gps_actualizados: equiposAActualizar.size,
    duracion_ms: duracionMs,
  };
}

