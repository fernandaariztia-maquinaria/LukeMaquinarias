/**
 * Script de ingestión de alto rendimiento para CSVs masivos de GPS (hasta millones de filas).
 * Procesa en streaming sin saturar la memoria y realiza inserciones en lotes optimizados.
 *
 * Uso:
 *   node scripts/importar-gps-csv.js
 *   node scripts/importar-gps-csv.js --archivo=telemetria_csv/mi_archivo.csv
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

// Cargar variables de entorno desde .env.local
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
 * Mapea columnas por similitud de nombres comunes
 */
function detectarIndicesColumnas(encabezados) {
  const mapa = {
    patente: -1,
    fecha_hora: -1,
    fecha: -1,
    hora: -1,
    latitud: -1,
    longitud: -1,
    velocidad: -1,
    rumbo: -1,
    estado: -1,
    ignicion: -1,
    odometro: -1,
    lugar: -1,
  };

  encabezados.forEach((h, idx) => {
    const norm = normalizarTexto(h).replace(/[^a-z0-9]/g, "");
    if (norm.includes("patente") || norm.includes("placa") || norm.includes("unidad") || norm.includes("vehiculo") || norm === "nombre") {
      if (mapa.patente === -1) mapa.patente = idx;
    }
    if (norm.includes("fechahora") || norm.includes("timestamp") || norm.includes("datetime")) {
      mapa.fecha_hora = idx;
    } else if (norm.includes("fecha") || norm.includes("date")) {
      mapa.fecha = idx;
    } else if (norm.includes("hora") || norm.includes("time")) {
      mapa.hora = idx;
    }

    if (norm.includes("latitud") || norm.includes("latitude") || norm === "lat") {
      mapa.latitud = idx;
    }
    if (norm.includes("longitud") || norm.includes("longitude") || norm === "lng" || norm === "lon") {
      mapa.longitud = idx;
    }
    if (norm.includes("velocidad") || norm.includes("speed") || norm === "vel") {
      mapa.velocidad = idx;
    }
    if (norm.includes("rumbo") || norm.includes("heading") || norm.includes("course") || norm.includes("orientacion")) {
      mapa.rumbo = idx;
    }
    if (norm.includes("evento") || norm.includes("estado") || norm.includes("status")) {
      mapa.estado = idx;
    }
    if (norm.includes("ignicion") || norm.includes("motor") || norm.includes("encendido")) {
      mapa.ignicion = idx;
    }
    if (norm.includes("odometro") || norm.includes("km") || norm.includes("kilometraje")) {
      mapa.odometro = idx;
    }
    if (norm.includes("lugar") || norm.includes("geocerca") || norm.includes("direccion") || norm.includes("ubicacion")) {
      mapa.lugar = idx;
    }
  });

  return mapa;
}

/**
 * Parsea fechas en distintos formatos comunes
 */
function parsearFechaHora(fechaVal, horaVal) {
  if (!fechaVal) return null;
  let str = String(fechaVal).trim();
  if (horaVal) {
    str += " " + String(horaVal).trim();
  }

  // Si viene en formato dd-MM-yyyy o dd/MM/yyyy HH:mm:ss
  const match = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (match) {
    const [, dd, mm, yyyy, hh, mi, ss] = match;
    const dStr = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${(hh || "00").padStart(2, "0")}:${(mi || "00").padStart(2, "0")}:${(ss || "00").padStart(2, "0")}-03:00`;
    return new Date(dStr).toISOString();
  }

  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    return d.toISOString();
  }
  return null;
}

async function procesarArchivoCsv(rutaArchivo, mapaFlota) {
  console.log(`\n======================================================`);
  console.log(`[CSV INGEST] Procesando archivo: ${path.basename(rutaArchivo)}`);
  console.log(`======================================================`);

  const fileStream = fs.createReadStream(rutaArchivo);
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
  const BATCH_SIZE = 500;
  const inicioTiempo = Date.now();

  for await (const line of rl) {
    totalLineas++;
    if (!line.trim()) continue;

    if (totalLineas === 1) {
      delimitador = detectarDelimitador(line);
      const headers = line.split(delimitador).map((h) => h.replace(/['"]+/g, "").trim());
      colIndices = detectarIndicesColumnas(headers);
      console.log(`[CSV] Delimitador detectado: "${delimitador}"`);
      console.log(`[CSV] Mapeo de columnas:`, colIndices);

      if (colIndices.patente === -1 || (colIndices.latitud === -1 && colIndices.longitud === -1)) {
        console.error(`[ERROR] No se encontraron columnas obligatorias (Patente y Coordenadas).`);
        return;
      }
      continue;
    }

    // Parsear fila respetando posibles comillas
    const cols = line.split(delimitador).map((c) => c.replace(/^["']|["']$/g, "").trim());
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
    const eq = mapaFlota.get(patNorm);

    const vel = colIndices.velocidad !== -1 ? Number(cols[colIndices.velocidad]?.replace(",", ".")) || 0 : 0;
    const rumbo = colIndices.rumbo !== -1 ? Number(cols[colIndices.rumbo]?.replace(",", ".")) || 0 : 0;
    const estadoRaw = colIndices.estado !== -1 ? cols[colIndices.estado] : (vel > 2 ? "Viaje" : "Detenido");
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
      estado: estadoRaw || "Viaje",
      odometro: odo,
      lugar: lugar,
    });

    if (lote.length >= BATCH_SIZE) {
      try {
        const { error } = await supabase
          .schema("maquinaria")
          .from("telemetria_posiciones")
          .upsert(lote, {
            onConflict: "patente,fecha_hora,latitud,longitud",
            ignoreDuplicates: true,
          });

        if (error) {
          errores += lote.length;
          console.error(`[CSV BATCH ERROR]:`, error.message);
        } else {
          insertados += lote.length;
        }
      } catch (e) {
        errores += lote.length;
      }

      if (totalLineas % 10000 === 0) {
        const segs = Math.round((Date.now() - inicioTiempo) / 1000) || 1;
        const velProm = Math.round(insertados / segs);
        console.log(`[CSV PROGRESO] ${totalLineas.toLocaleString("es-CL")} filas leídas | ${insertados.toLocaleString("es-CL")} puntos guardados (${velProm} pts/seg)`);
      }

      lote = [];
    }
  }

  // Guardar remanente
  if (lote.length > 0) {
    const { error } = await supabase
      .schema("maquinaria")
      .from("telemetria_posiciones")
      .upsert(lote, {
        onConflict: "patente,fecha_hora,latitud,longitud",
        ignoreDuplicates: true,
      });

    if (!error) insertados += lote.length;
  }

  const duracionTotal = Math.round((Date.now() - inicioTiempo) / 1000);
  console.log(`\n======================================================`);
  console.log(`[CSV FINALIZADO] ${path.basename(rutaArchivo)}`);
  console.log(`  - Total líneas leídas: ${totalLineas.toLocaleString("es-CL")}`);
  console.log(`  - Puntos GPS guardados: ${insertados.toLocaleString("es-CL")}`);
  console.log(`  - Errores / Omitidos: ${errores.toLocaleString("es-CL")}`);
  console.log(`  - Tiempo total: ${duracionTotal} segundos`);
  console.log(`======================================================\n`);
}

async function main() {
  console.log("[INICIO] Cargando flota de maquinaria para matching...");
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
  console.log(`[FLOTA] ${mapaFlota.size} identificadores listos para mapeo.`);

  // Detectar archivos en carpeta telemetria_csv o data_gps
  const carpetas = [
    path.resolve(__dirname, "../telemetria_csv"),
    path.resolve(__dirname, "../data_gps"),
  ];

  let archivosEncontrados = [];
  for (const c of carpetas) {
    if (fs.existsSync(c)) {
      const files = fs.readdirSync(c)
        .filter((f) => f.toLowerCase().endsWith(".csv"))
        .map((f) => path.join(c, f));
      archivosEncontrados.push(...files);
    }
  }

  if (archivosEncontrados.length === 0) {
    console.log(`[AVISO] No se encontraron archivos .csv en telemetria_csv/ ni en data_gps/.`);
    console.log(`Sube tus archivos a: C:\\Github\\Equipos\\telemetria_csv\\ y vuelve a ejecutar.`);
    process.exit(0);
  }

  console.log(`[ARCHIVOS] Se encontraron ${archivosEncontrados.length} archivo(s) CSV para procesar.`);
  for (const archivo of archivosEncontrados) {
    await procesarArchivoCsv(archivo, mapaFlota);
  }
}

main().catch(console.error);
