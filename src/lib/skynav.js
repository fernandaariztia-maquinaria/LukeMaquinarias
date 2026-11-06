import fs from "fs";
import path from "path";
import { createAdminClient } from "./supabase-server";

const DEFAULT_BASE_URL = "https://api.skynav.cl";
const DEFAULT_RESUMEN_PATH = "modulo_generico/external/echeverria/resumen";
const DEFAULT_API_TOKEN = "9f2c6a81e4b07d35c1a8f6039e27b4d58c0a1f76e3b9428d5c7e0a14b6f83920";

export function asegurarEnvSkynavEnServidor() {
  try {
    const envFile = path.join(process.cwd(), ".env.local");
    const current = fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8") : "";
    if (!current.includes("SKYNAV_API_TOKEN=")) {
      const block = [
        "",
        "# --- SKYNAV Telemetría GPS ---",
        "SKYNAV_BASE_URL=" + DEFAULT_BASE_URL,
        "SKYNAV_API_TOKEN=" + DEFAULT_API_TOKEN,
        "SKYNAV_RESUMEN_PATH=" + DEFAULT_RESUMEN_PATH,
        "",
      ].join("\n");
      fs.appendFileSync(envFile, block, "utf8");
    }
  } catch (e) {
    console.warn("[SKYNAV] Aviso sincronizando .env.local:", e.message);
  }
  if (!process.env.SKYNAV_BASE_URL) process.env.SKYNAV_BASE_URL = DEFAULT_BASE_URL;
  if (!process.env.SKYNAV_RESUMEN_PATH) process.env.SKYNAV_RESUMEN_PATH = DEFAULT_RESUMEN_PATH;
  if (!process.env.SKYNAV_API_TOKEN) process.env.SKYNAV_API_TOKEN = DEFAULT_API_TOKEN;
}

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
  if (typeof fecha === "string") {
    const trimmed = fecha.trim();
    if (/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) {
      return trimmed;
    }
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[3]}-${match[2]}-${match[1]}`;
    }
  }
  const d = new Date(fecha);
  if (isNaN(d.getTime())) return "";
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const anio = d.getUTCFullYear();
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
 * Divide un rango de fechas en bloques de máximo 15 días para consultas seguras y rápidas a SKYNAV
 */
export function dividirEnBloques15Dias(fechaDesde, fechaHasta) {
  const sDesde = typeof fechaDesde === "string" ? skynavFechaAISO(fechaDesde) : fechaDesde.toISOString().slice(0, 10);
  const sHasta = typeof fechaHasta === "string" ? skynavFechaAISO(fechaHasta) : fechaHasta.toISOString().slice(0, 10);

  let cur = new Date(`${sDesde}T00:00:00Z`);
  const fin = new Date(`${sHasta}T00:00:00Z`);
  const bloques = [];

  while (cur <= fin) {
    let bloqueFin = new Date(cur.getTime() + 14 * 24 * 60 * 60 * 1000);
    if (bloqueFin > fin) bloqueFin = new Date(fin);

    const f1Dia = String(cur.getUTCDate()).padStart(2, "0");
    const f1Mes = String(cur.getUTCMonth() + 1).padStart(2, "0");
    const f1Anio = cur.getUTCFullYear();

    const f2Dia = String(bloqueFin.getUTCDate()).padStart(2, "0");
    const f2Mes = String(bloqueFin.getUTCMonth() + 1).padStart(2, "0");
    const f2Anio = bloqueFin.getUTCFullYear();

    bloques.push({
      desde: `${f1Dia}-${f1Mes}-${f1Anio}`,
      hasta: `${f2Dia}-${f2Mes}-${f2Anio}`,
    });

    cur = new Date(bloqueFin.getTime() + 24 * 60 * 60 * 1000);
  }

  return bloques;
}

/**
 * Consulta la API de SKYNAV para un bloque simple con reintentos y timeout de 120s
 */
async function fetchBloqueSimple(baseUrl, path, token, desdeStr, hastaStr) {
  const url = `${baseUrl}/${path}?desde=${encodeURIComponent(desdeStr)}&hasta=${encodeURIComponent(hastaStr)}`;

  console.log(`[SKYNAV] Consultando ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(120000), // 120s
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
 * Consulta la API de SKYNAV para cualquier rango de fechas dividiendo automáticamente en bloques <= 15 días
 */
export async function fetchSkynavResumen({ desde, hasta }) {
  asegurarEnvSkynavEnServidor();
  const baseUrl = process.env.SKYNAV_BASE_URL || DEFAULT_BASE_URL;
  const path = process.env.SKYNAV_RESUMEN_PATH || DEFAULT_RESUMEN_PATH;
  const token = process.env.SKYNAV_API_TOKEN || DEFAULT_API_TOKEN;

  if (!token) {
    throw new Error("[SKYNAV] Variable SKYNAV_API_TOKEN no configurada en .env.local");
  }

  const desdeTxt = formatearFechaSkynav(desde);
  const hastaTxt = formatearFechaSkynav(hasta);

  const fDesde = new Date(skynavFechaAISO(desdeTxt));
  const fHasta = new Date(skynavFechaAISO(hastaTxt));
  const diffDias = Math.round((fHasta - fDesde) / (1000 * 60 * 60 * 24));

  if (diffDias > 15) {
    const bloques = dividirEnBloques15Dias(fDesde, fHasta);
    const resultadosTotales = [];
    for (const b of bloques) {
      const parte = await fetchBloqueSimple(baseUrl, path, token, b.desde, b.hasta);
      resultadosTotales.push(...parte);
    }
    return resultadosTotales;
  }

  return await fetchBloqueSimple(baseUrl, path, token, desdeTxt, hastaTxt);
}

/**
 * Procesa y extrae TODOS los viajes y usos individuales (Viaje y Trabajando)
 * vinculando con la flota de maquinaria y evitando duplicados
 */
export function procesarViajesSkynav(registrosCrudos, mapaPorPatente, mapaPorCodigo) {
  const mapaViajes = new Map();

  for (const r of registrosCrudos) {
    const evento = (r.Evento || "").trim();
    // Considerar viajes u operación de trabajo (no ralentí ni estacionado ni excesos)
    if (evento !== "Viaje" && evento !== "Trabajando") continue;

    const rawId = (r.Patente || r.Nombre || "").trim();
    if (!rawId) continue;

    const fechaISO = skynavFechaAISO(r.Fecha);
    if (!fechaISO) continue;

    const horaInicio = r.Inicio || "00:00:00";
    const clave = `${normalizarIdentificador(rawId)}_${fechaISO}_${horaInicio}_${evento}`;

    const patNorm = normalizarIdentificador(r.Patente);
    const nomNorm = normalizarIdentificador(r.Nombre);
    const eq =
      (patNorm ? mapaPorPatente.get(patNorm) : null) ||
      (nomNorm ? mapaPorCodigo.get(nomNorm) : null) ||
      (patNorm ? mapaPorCodigo.get(patNorm) : null) ||
      (nomNorm ? mapaPorPatente.get(nomNorm) : null);

    const distKm = Number(r["Distancia (km)"]) || 0;
    const durMin = Number(r["Tiempo (min)"]) || 0;
    const litCan = Number(r["Litros CAN"]) || 0;
    const litGps = Number(r["Litros GPS"]) || 0;
    const comb = Number(r.Combustible) || (litCan > 0 ? litCan : litGps);

    const orig = (r["Origen Combustible"] || "").toUpperCase();
    const esCan = orig === "CAN" || litCan > 0;
    const origenKm = esCan ? "CAN" : "GPS";
    const origenComb = esCan ? "CAN" : "GPS";

    // Deduplicación en memoria: si ya existe el viaje exacto, se actualiza
    mapaViajes.set(clave, {
      equipo_id: eq ? eq.id : null,
      identificador_skynav: rawId,
      patente: r.Patente ? r.Patente.trim() : (eq?.patente || null),
      nombre_skynav: r.Nombre ? r.Nombre.trim() : null,
      tipo_skynav: r.Tipo || null,
      subtipo_skynav: r.Subtipo || null,
      evento: evento,
      fecha: fechaISO,
      hora_inicio: horaInicio,
      hora_fin: r.Fin || null,
      tiempo_min: Math.round(durMin * 100) / 100,
      km_recorridos: Math.round(distKm * 100) / 100,
      litros_combustible: Math.round(comb * 100) / 100,
      litros_can: Math.round(litCan * 100) / 100,
      litros_gps: Math.round(litGps * 100) / 100,
      origen_km: origenKm,
      origen_combustible: origenComb,
      rut_conductor: r["RUT Conductor"] ? String(r["RUT Conductor"]).trim() : null,
      nombre_conductor: r["Nombre Conductor"] ? String(r["Nombre Conductor"]).trim() : null,
      lugar_inicio: r["Lugar Inicio"] || null,
      lugar_fin: r["Lugar Fin"] || null,
      geocerca_inicio: r["Geocerca Inicio"] || null,
      geocerca_fin: r["Geocerca Fin"] || null,
      latitud_inicio: r["Latitud Inicio"] ? Number(r["Latitud Inicio"]) : null,
      longitud_inicio: r["Longitud Inicio"] ? Number(r["Longitud Inicio"]) : null,
      latitud_fin: r["Latitud Fin"] ? Number(r["Latitud Fin"]) : null,
      longitud_fin: r["Longitud Fin"] ? Number(r["Longitud Fin"]) : null,
      updated_at: new Date().toISOString(),
    });
  }

  return Array.from(mapaViajes.values());
}

/**
 * Agrupa los eventos granulares por (unidad, fecha) para el resumen diario
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
 * Guarda viajes detallados (maquinaria.telemetria_viajes), resúmenes diarios (maquinaria.telemetria_diaria)
 * y actualiza la última posición GPS de los equipos.
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

  // Índices para matching rápido
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
  console.log(`[SKYNAV] Eventos crudos obtenidos: ${rawList.length}`);

  // 3. Procesar Viajes Individuales
  const viajes = procesarViajesSkynav(rawList, mapaPorPatente, mapaPorCodigo);
  console.log(`[SKYNAV] Viajes individuales procesados: ${viajes.length}`);

  // 4. Procesar Resúmenes Diarios
  const resumenes = procesarEventosSkynav(rawList);

  let mapeadas = 0;
  let sinMapear = 0;
  const equiposAActualizar = new Map();

  const filasDiarias = resumenes.map((r) => {
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

  // 5. Guardar VIAJES en lotes de 100 con upsert idempotente
  const BATCH_SIZE = 100;
  for (let i = 0; i < viajes.length; i += BATCH_SIZE) {
    const lote = viajes.slice(i, i + BATCH_SIZE);
    const { error: errViajes } = await supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .upsert(lote, {
        onConflict: "identificador_skynav,fecha,hora_inicio,evento",
      });

    if (errViajes) {
      console.error(`[SKYNAV] Error al guardar lote de viajes:`, errViajes);
      throw new Error(`[SKYNAV] Error al guardar lote de viajes: ${errViajes.message}`);
    }
  }

  // 6. Guardar RESÚMENES DIARIOS en lotes de 100
  for (let i = 0; i < filasDiarias.length; i += BATCH_SIZE) {
    const lote = filasDiarias.slice(i, i + BATCH_SIZE);
    const { error: errDiario } = await supabase
      .schema("maquinaria")
      .from("telemetria_diaria")
      .upsert(lote, {
        onConflict: "identificador_skynav,fecha",
      });

    if (errDiario) {
      console.error(`[SKYNAV] Error al guardar lote diario:`, errDiario);
    }
  }

  // 7. Actualizar última posición de los equipos en maquinaria.equipos
  for (const [eqId, updateData] of equiposAActualizar.entries()) {
    await supabase
      .schema("maquinaria")
      .from("equipos")
      .update(updateData)
      .eq("id", eqId);
  }

  const duracionMs = Date.now() - inicioTiempo;

  // 8. Registrar auditoría de sincronización
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
    total_viajes: viajes.length,
    unidades_procesadas: resumenes.length,
    unidades_mapeadas: mapeadas,
    unidades_sin_mapear: sinMapear,
    equipos_gps_actualizados: equiposAActualizar.size,
    duracion_ms: duracionMs,
  };
}
