/**
 * Script de sincronización de telemetría SKYNAV -> Supabase (esquema maquinaria)
 * 
 * Uso:
 * 1. Diario (por defecto sincroniza ayer):
 *    node scripts/sync-telemetria-diaria.js
 * 
 * 2. Rango específico:
 *    node scripts/sync-telemetria-diaria.js --desde=2026-10-01 --hasta=2026-11-04
 */

const path = require("path");
const fs = require("fs");

// Cargar variables de entorno desde .env.local si existe
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  });
}

const { createClient } = require("@supabase/supabase-js");

const DEFAULT_BASE_URL = "https://api.skynav.cl";
const DEFAULT_RESUMEN_PATH = "modulo_generico/external/echeverria/resumen";
const DEFAULT_API_TOKEN = "9f2c6a81e4b07d35c1a8f6039e27b4d58c0a1f76e3b9428d5c7e0a14b6f83920";

function normalizarIdentificador(str) {
  if (!str) return "";
  return String(str).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function formatearFechaSkynav(fecha) {
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

function skynavFechaAISO(fechaStr) {
  if (!fechaStr) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(fechaStr)) return fechaStr;
  const partes = fechaStr.split("-");
  if (partes.length === 3) {
    const [dd, mm, yyyy] = partes;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return fechaStr;
}

function dividirEnBloques15Dias(fechaDesde, fechaHasta) {
  const d1 = new Date(fechaDesde);
  const d2 = new Date(fechaHasta);
  const bloques = [];

  let inicio = new Date(d1);
  while (inicio <= d2) {
    let fin = new Date(inicio);
    fin.setDate(fin.getDate() + 14);
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

async function fetchBloqueSimple(baseUrl, path, token, desdeStr, hastaStr) {
  const url = `${baseUrl}/${path}?desde=${encodeURIComponent(desdeStr)}&hasta=${encodeURIComponent(hastaStr)}`;
  console.log(`[SKYNAV] Consultando ${url}`);
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(180000), // 3 min por bloque
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[SKYNAV] HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("[SKYNAV] La respuesta no es un array de registros");
  }

  return data;
}

async function fetchSkynavResumen({ desde, hasta }) {
  const baseUrl = process.env.SKYNAV_BASE_URL || DEFAULT_BASE_URL;
  const path = process.env.SKYNAV_RESUMEN_PATH || DEFAULT_RESUMEN_PATH;
  const token = process.env.SKYNAV_API_TOKEN || DEFAULT_API_TOKEN;

  if (!token) {
    throw new Error("[SKYNAV] SKYNAV_API_TOKEN no configurada");
  }

  const desdeTxt = formatearFechaSkynav(desde);
  const hastaTxt = formatearFechaSkynav(hasta);

  const fDesde = new Date(skynavFechaAISO(desdeTxt));
  const fHasta = new Date(skynavFechaAISO(hastaTxt));
  const diffDias = Math.round((fHasta - fDesde) / (1000 * 60 * 60 * 24));

  if (diffDias > 15) {
    const bloques = dividirEnBloques15Dias(fDesde, fHasta);
    console.log(`[SKYNAV] Dividiendo en ${bloques.length} bloques de <= 15 días...`);
    const resultadosTotales = [];
    for (const b of bloques) {
      console.log(`[SKYNAV] Descargando bloque ${b.desde} al ${b.hasta}...`);
      const parte = await fetchBloqueSimple(baseUrl, path, token, b.desde, b.hasta);
      console.log(`  -> Obtenidos ${parte.length} eventos.`);
      resultadosTotales.push(...parte);
    }
    return resultadosTotales;
  }

  return await fetchBloqueSimple(baseUrl, path, token, desdeTxt, hastaTxt);
}

function procesarViajes(registrosCrudos, mapaPorPatente, mapaPorCodigo) {
  const mapaViajes = new Map();

  for (const r of registrosCrudos) {
    const evento = (r.Evento || "").trim();
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

async function ejecutarSincronizacion(desde, hasta, iniciadoPor = "CRON_DIARIO") {
  const inicioTiempo = Date.now();
  console.log(`[SYNC] Iniciando sincronización de ${desde} a ${hasta} por ${iniciadoPor}...`);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("[SYNC] Faltan variables de Supabase (URL o SERVICE_ROLE_KEY)");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // 1. Obtener flota
  const { data: equipos, error: errEquipos } = await supabase
    .schema("maquinaria")
    .from("equipos")
    .select("id, codigo_interno, patente");

  if (errEquipos) throw errEquipos;

  const mapaPorPatente = new Map();
  const mapaPorCodigo = new Map();
  for (const eq of equipos || []) {
    if (eq.patente) mapaPorPatente.set(normalizarIdentificador(eq.patente), eq);
    if (eq.codigo_interno) mapaPorCodigo.set(normalizarIdentificador(eq.codigo_interno), eq);
  }

  // 2. Consultar SKYNAV
  const rawList = await fetchSkynavResumen({ desde, hasta });
  console.log(`[SYNC] Total eventos crudos obtenidos: ${rawList.length}`);

  // 3. Procesar Viajes
  const viajes = procesarViajes(rawList, mapaPorPatente, mapaPorCodigo);
  console.log(`[SYNC] Total viajes individuales únicos a guardar: ${viajes.length}`);

  // 4. Guardar en lotes de 100 con upsert idempotente
  const BATCH_SIZE = 100;
  for (let i = 0; i < viajes.length; i += BATCH_SIZE) {
    const lote = viajes.slice(i, i + BATCH_SIZE);
    const { error: errUpsert } = await supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .upsert(lote, {
        onConflict: "identificador_skynav,fecha,hora_inicio,evento",
      });

    if (errUpsert) {
      throw new Error(`[SYNC] Error en upsert lote ${i}: ${errUpsert.message}`);
    }
  }

  // 5. Registrar log de sincronización
  const duracionMs = Date.now() - inicioTiempo;
  const fDesdeISO = skynavFechaAISO(formatearFechaSkynav(desde));
  const fHastaISO = skynavFechaAISO(formatearFechaSkynav(hasta));

  await supabase
    .schema("maquinaria")
    .from("telemetria_sincronizaciones")
    .insert({
      fecha_desde: fDesdeISO,
      fecha_hasta: fHastaISO,
      registros_crudos: rawList.length,
      unidades_procesadas: viajes.length,
      unidades_mapeadas: viajes.filter((v) => v.equipo_id).length,
      unidades_sin_mapear: viajes.filter((v) => !v.equipo_id).length,
      estado: "EXITO",
      iniciado_por: iniciadoPor,
      duracion_ms: duracionMs,
    });

  console.log(`[SYNC] ¡Completado exitosamente en ${Math.round(duracionMs / 1000)}s! Guardados ${viajes.length} viajes.`);
}

// Procesar argumentos de línea de comandos
async function main() {
  const args = process.argv.slice(2);
  let desde = null;
  let hasta = null;

  args.forEach((arg) => {
    if (arg.startsWith("--desde=")) desde = arg.split("=")[1].trim();
    if (arg.startsWith("--hasta=")) hasta = arg.split("=")[1].trim();
  });

  // Si no se pasaron argumentos, sincronizar por defecto el día de AYER
  if (!desde || !hasta) {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const diaAyer = ayer.toISOString().slice(0, 10);
    desde = diaAyer;
    hasta = diaAyer;
    console.log(`[SYNC CRON] Modo diario: consultando el día de ayer (${diaAyer})...`);
  }

  try {
    await ejecutarSincronizacion(desde, hasta, args.length > 0 ? "MANUAL_CLI" : "CRON_4AM");
    process.exit(0);
  } catch (err) {
    console.error("[SYNC CRON] Error fatal:", err.message);
    process.exit(1);
  }
}

main();

