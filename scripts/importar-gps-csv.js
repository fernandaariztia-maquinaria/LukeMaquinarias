/**
 * Script de ingestión de alto rendimiento para CSVs masivos de GPS (SKYNAV histórico).
 * Procesa en streaming sin saturar la memoria, deduplica en lote y realiza
 * inserciones masivas concurrentes en la base de datos Supabase (esquema maquinaria).
 *
 * Uso:
 *   node scripts/importar-gps-csv.js
 *   node scripts/importar-gps-csv.js --archivo=telemetria_csv/datos_historicos_01-10-2026_15-10-2026.csv
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

// 1. Cargar variables de entorno desde .env.local
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("ERROR: Variables de Supabase no encontradas en .env.local");
  process.exit(1);
}

// Cliente Supabase conectado al esquema 'maquinaria' (Regla GEMINI.md)
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function normalizarTexto(txt) {
  if (!txt) return "";
  return String(txt).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

function normalizarIdentificador(str) {
  if (!str) return "";
  return String(str).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

/**
 * Parsea una línea de CSV respetando comillas dobles y comas internas
 */
function parsearLineaCSV(text, delimiter = ",") {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

/**
 * Detecta el delimitador analizando la primera línea
 */
function detectarDelimitador(linea) {
  const comas = (linea.match(/,/g) || []).length;
  const puntosYComas = (linea.match(/;/g) || []).length;
  const tabs = (linea.match(/\t/g) || []).length;
  if (puntosYComas > comas && puntosYComas > tabs) return ";";
  if (tabs > comas && tabs > puntosYComas) return "\t";
  return ",";
}

/**
 * Mapea columnas con precisión quirúrgica
 */
function detectarIndicesColumnas(encabezados) {
  const mapa = {
    patente: -1,
    codigo_interno: -1,
    fecha_hora: -1,
    fecha: -1,
    hora: -1,
    latitud: -1,
    longitud: -1,
    velocidad: -1,
    rumbo: -1,
    evento: -1,
    ignicion: -1,
    odometro: -1,
    lugar: -1,
  };

  encabezados.forEach((h, idx) => {
    const norm = normalizarTexto(h).replace(/[^a-z0-9]/g, "");

    // Patente
    if (norm === "patente" || norm === "placa") {
      mapa.patente = idx;
    } else if (mapa.patente === -1 && norm.includes("patente")) {
      mapa.patente = idx;
    }

    // Código interno (Nombre en SKYNAV ej. CTAP-0214)
    if (norm === "nombre" || norm.includes("codigointerno") || norm === "unidad") {
      mapa.codigo_interno = idx;
    }

    // Fecha / Hora
    if (norm === "fechatransmision" || norm === "fechahora" || norm === "timestamp" || norm === "datetime") {
      mapa.fecha_hora = idx;
    } else if (norm === "fecha" || norm === "date") {
      mapa.fecha = idx;
    } else if (norm === "hora" || norm === "time") {
      mapa.hora = idx;
    }

    // Coordenadas
    if (norm === "latitud" || norm === "latitude" || norm === "lat") {
      mapa.latitud = idx;
    }
    if (norm === "longitud" || norm === "longitude" || norm === "lng" || norm === "lon") {
      mapa.longitud = idx;
    }

    // Velocidad (evitar velocidadmaxima)
    if (norm === "velocidad" || norm === "speed" || norm === "vel") {
      mapa.velocidad = idx;
    }

    // Rumbo
    if (norm.includes("rumbo") || norm.includes("heading") || norm.includes("orientacion")) {
      mapa.rumbo = idx;
    }

    // Evento / Estado
    if (norm === "evento" || norm === "estado" || norm === "status") {
      mapa.evento = idx;
    }

    // Ignición
    if (norm.includes("ignicion") || norm.includes("motor") || norm.includes("encendido")) {
      mapa.ignicion = idx;
    }

    // Odómetro
    if (norm.includes("odometro") || norm.includes("kilometraje")) {
      mapa.odometro = idx;
    }

    // Lugar
    if (norm === "lugar" || norm === "geocerca" || norm.includes("direccion") || norm.includes("ubicacion")) {
      if (mapa.lugar === -1 || norm === "lugar") mapa.lugar = idx;
    }
  });

  return mapa;
}

/**
 * Parsea fechas en formato dd/MM/yyyy HH:mm:ss o ISO
 */
function parsearFechaHora(fechaVal, horaVal) {
  if (!fechaVal) return null;
  let str = String(fechaVal).trim();
  if (horaVal) {
    str += " " + String(horaVal).trim();
  }

  // Si viene en formato dd/MM/yyyy HH:mm:ss o dd-MM-yyyy HH:mm:ss
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, dd, mm, yyyy, hh, mi, ss] = match;
    const dStr = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${(hh || "00").padStart(2, "0")}:${(mi || "00").padStart(2, "0")}:${(ss || "00").padStart(2, "0")}-03:00`;
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return null;
}

/**
 * Ingesta por streaming con cola de promesas para alta concurrencia
 */
async function procesarArchivoCsv(rutaArchivo, mapaFlota) {
  const nombreBase = path.basename(rutaArchivo);
  const tamBytes = fs.statSync(rutaArchivo).size;
  const tamMB = (tamBytes / (1024 * 1024)).toFixed(1);

  console.log(`\n======================================================`);
  console.log(`[CSV INGEST] Procesando: ${nombreBase} (${tamMB} MB)`);
  console.log(`======================================================`);

  const fileStream = fs.createReadStream(rutaArchivo, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let delimitador = ",";
  let colIndices = null;
  let totalLineas = 0;
  let lote = [];
  let insertados = 0;
  let errores = 0;

  // Lotes optimizados de 1.500 registros con concurrencia máxima de 4 peticiones
  const BATCH_SIZE = 1500;
  const CONCURRENCY_MAX = 4;
  let activeWorkers = 0;
  const workerQueue = [];

  const argSaltar = process.argv.find((a) => a.startsWith("--saltar="));
  const lineasASaltar = argSaltar ? parseInt(argSaltar.split("=")[1], 10) : 0;
  if (lineasASaltar > 0) {
    console.log(`[CSV RESUME] Saltando las primeras ${lineasASaltar.toLocaleString("es-CL")} líneas para reanudar.`);
  }

  const inicioTiempo = Date.now();

  const ejecutarLote = async (batchParaSubir) => {
    // 1. Deduplicar dentro del lote para evitar violación de cardinalidad PostgreSQL
    const vistos = new Set();
    const batchDeduplicado = [];

    for (const r of batchParaSubir) {
      const key = `${r.patente}_${r.fecha_hora}_${r.latitud}_${r.longitud}`;
      if (!vistos.has(key)) {
        vistos.add(key);
        batchDeduplicado.push(r);
      }
    }

    if (batchDeduplicado.length === 0) return;

    try {
      const { error } = await supabase
        .schema("maquinaria")
        .from("telemetria_posiciones")
        .upsert(batchDeduplicado, {
          onConflict: "patente,fecha_hora,latitud,longitud",
          ignoreDuplicates: true,
        });

      if (error) {
        errores += batchDeduplicado.length;
        if (errores <= 5000) {
          console.error(`[CSV BATCH ERROR]: ${error.message}`);
        }
      } else {
        insertados += batchDeduplicado.length;
      }
    } catch (err) {
      errores += batchDeduplicado.length;
    }
  };

  const procesarLoteConConcurrencia = async (batchParaSubir) => {
    activeWorkers++;
    const p = ejecutarLote(batchParaSubir).finally(() => {
      activeWorkers--;
      const idx = workerQueue.indexOf(p);
      if (idx !== -1) workerQueue.splice(idx, 1);
      if (fileStream.isPaused() && activeWorkers < CONCURRENCY_MAX) {
        fileStream.resume();
      }
    });
    workerQueue.push(p);

    if (activeWorkers >= CONCURRENCY_MAX) {
      fileStream.pause();
    }
  };

  for await (const line of rl) {
    totalLineas++;
    if (!line.trim()) continue;

    if (totalLineas === 1) {
      const cleanLine = line.replace(/^\uFEFF/, "");
      delimitador = detectarDelimitador(cleanLine);
      const headers = parsearLineaCSV(cleanLine, delimitador);
      colIndices = detectarIndicesColumnas(headers);

      console.log(`[CSV] Delimitador: "${delimitador}"`);
      console.log(`[CSV] Columnas detectadas:`, {
        patente: `${headers[colIndices.patente]} (idx ${colIndices.patente})`,
        codigo_interno: `${headers[colIndices.codigo_interno]} (idx ${colIndices.codigo_interno})`,
        fecha_hora: `${headers[colIndices.fecha_hora]} (idx ${colIndices.fecha_hora})`,
        latitud: `${headers[colIndices.latitud]} (idx ${colIndices.latitud})`,
        longitud: `${headers[colIndices.longitud]} (idx ${colIndices.longitud})`,
        velocidad: `${headers[colIndices.velocidad]} (idx ${colIndices.velocidad})`,
        evento: `${headers[colIndices.evento]} (idx ${colIndices.evento})`,
        ignicion: `${headers[colIndices.ignicion]} (idx ${colIndices.ignicion})`,
        lugar: `${headers[colIndices.lugar]} (idx ${colIndices.lugar})`,
      });

      if (colIndices.patente === -1 || colIndices.latitud === -1 || colIndices.longitud === -1) {
        console.error(`[ERROR] Faltan columnas críticas obligatorias en el CSV.`);
        return;
      }
      continue;
    }

    if (lineasASaltar > 0 && totalLineas <= lineasASaltar) {
      if (totalLineas % 100000 === 0) {
        console.log(`[CSV SKIP] Saltando línea ${totalLineas.toLocaleString("es-CL")} de ${lineasASaltar.toLocaleString("es-CL")}...`);
      }
      continue;
    }

    const cols = parsearLineaCSV(line, delimitador);
    const rawPatente = cols[colIndices.patente];
    if (!rawPatente) continue;

    const lat = Number(cols[colIndices.latitud]?.replace(",", "."));
    const lng = Number(cols[colIndices.longitud]?.replace(",", "."));
    if (isNaN(lat) || isNaN(lng) || lat === 0 || lng === 0) continue;

    const fechaVal = colIndices.fecha_hora !== -1 ? cols[colIndices.fecha_hora] : cols[colIndices.fecha];
    const horaVal = colIndices.hora !== -1 ? cols[colIndices.hora] : null;
    const fechaHoraISO = parsearFechaHora(fechaVal, horaVal);
    if (!fechaHoraISO) continue;

    const patNorm = normalizarIdentificador(rawPatente);
    const rawCodigo = colIndices.codigo_interno !== -1 ? normalizarIdentificador(cols[colIndices.codigo_interno]) : "";
    const eq = mapaFlota.get(patNorm) || (rawCodigo ? mapaFlota.get(rawCodigo) : null);

    const vel = colIndices.velocidad !== -1 ? Number(cols[colIndices.velocidad]?.replace(",", ".")) || 0 : 0;
    const rumbo = colIndices.rumbo !== -1 ? Number(cols[colIndices.rumbo]?.replace(",", ".")) || 0 : 0;

    // Estado e Ignición
    const rawIgn = colIndices.ignicion !== -1 ? String(cols[colIndices.ignicion] || "").toLowerCase() : "";
    const esIgnicion = rawIgn.startsWith("s") || rawIgn === "true" || rawIgn === "1" || vel > 2;

    const eventoRaw = colIndices.evento !== -1 ? cols[colIndices.evento] : null;
    let estado = "Viaje";
    if (eventoRaw && eventoRaw.toLowerCase().includes("ralent")) {
      estado = "Ralentí";
    } else if (vel > 2) {
      estado = "Viaje";
    } else if (esIgnicion) {
      estado = "Ralentí";
    } else {
      estado = "Detenido";
    }

    const odo = colIndices.odometro !== -1 ? Number(cols[colIndices.odometro]?.replace(",", ".")) || null : null;
    const lugar = colIndices.lugar !== -1 ? cols[colIndices.lugar] : null;

    lote.push({
      equipo_id: eq ? eq.id : null,
      patente: patNorm,
      fecha_hora: fechaHoraISO,
      latitud: lat,
      longitud: lng,
      velocidad: vel,
      rumbo: rumbo,
      estado: estado,
      ignicion: esIgnicion,
      odometro: odo,
      lugar: lugar,
    });

    if (lote.length >= BATCH_SIZE) {
      const currentBatch = lote;
      lote = [];
      await procesarLoteConConcurrencia(currentBatch);
    }

    // Progreso cada 25.000 líneas
    if (totalLineas % 25000 === 0) {
      const segs = Math.max(1, Math.round((Date.now() - inicioTiempo) / 1000));
      const velProm = Math.round(insertados / segs);
      const totalEstimado = Math.max(totalLineas, Math.round(tamBytes / 285));
      const pct = Math.min(100, ((totalLineas / totalEstimado) * 100)).toFixed(1);
      const restantes = Math.max(0, totalEstimado - totalLineas);
      const etaMin = velProm > 0 ? (restantes / velProm / 60).toFixed(1) : "--";

      console.log(`[PROGRESO] ${totalLineas.toLocaleString("es-CL")} filas (~${pct}%) | ${insertados.toLocaleString("es-CL")} guardados (${velProm} pts/s) | ETA: ~${etaMin} min`);
    }
  }

  // Procesar remanente
  if (lote.length > 0) {
    await procesarLoteConConcurrencia(lote);
  }

  // Esperar a que todos los workers concurrentes terminen
  await Promise.all(workerQueue);

  const duracionTotal = Math.round((Date.now() - inicioTiempo) / 1000);
  console.log(`\n======================================================`);
  console.log(`[CSV FINALIZADO] ${nombreBase}`);
  console.log(`  - Total líneas leídas: ${totalLineas.toLocaleString("es-CL")}`);
  console.log(`  - Puntos GPS guardados en Supabase: ${insertados.toLocaleString("es-CL")}`);
  console.log(`  - Errores / Omitidos: ${errores.toLocaleString("es-CL")}`);
  console.log(`  - Tiempo total: ${Math.floor(duracionTotal / 60)}m ${duracionTotal % 60}s`);
  console.log(`======================================================\n`);
}

async function main() {
  console.log("[INICIO] Conectando a Supabase (esquema maquinaria)...");
  const { data: equipos, error } = await supabase
    .schema("maquinaria")
    .from("equipos")
    .select("id, codigo_interno, patente");

  if (error) {
    console.error("Error al cargar flota:", error.message);
    process.exit(1);
  }

  const mapaFlota = new Map();
  (equipos || []).forEach((eq) => {
    if (eq.patente) mapaFlota.set(normalizarIdentificador(eq.patente), eq);
    if (eq.codigo_interno) mapaFlota.set(normalizarIdentificador(eq.codigo_interno), eq);
  });
  console.log(`[FLOTA] ${mapaFlota.size} identificadores de equipos cargados para emparejar.`);

  // Detectar archivos en carpeta telemetria_csv
  const dirCsv = path.resolve(__dirname, "../telemetria_csv");
  let archivosEncontrados = [];

  // Si se pasa archivo por argumento
  const argArchivo = process.argv.find((a) => a.startsWith("--archivo="));
  if (argArchivo) {
    const p = path.resolve(argArchivo.split("=")[1]);
    if (fs.existsSync(p)) archivosEncontrados.push(p);
  } else if (fs.existsSync(dirCsv)) {
    const files = fs.readdirSync(dirCsv)
      .filter((f) => f.toLowerCase().endsWith(".csv"))
      .map((f) => path.join(dirCsv, f));
    archivosEncontrados.push(...files);
  }

  if (archivosEncontrados.length === 0) {
    console.log(`[AVISO] No se encontraron archivos .csv en telemetria_csv/.`);
    process.exit(0);
  }

  console.log(`[ARCHIVOS] Se encontraron ${archivosEncontrados.length} archivo(s) CSV para procesar.`);
  for (const archivo of archivosEncontrados) {
    await procesarArchivoCsv(archivo, mapaFlota);
  }
}

main().catch(console.error);
