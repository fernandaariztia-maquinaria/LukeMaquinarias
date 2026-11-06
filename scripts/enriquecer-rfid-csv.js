/**
 * Script complementario para enriquecer conductores RFID en telemetria_viajes
 * a partir de las transmisiones del CSV oficial donde el dispositivo registró tarjeta conductor.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { createClient } = require("@supabase/supabase-js");

// Cargar variables de entorno
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("ERROR: Variables de Supabase no encontradas");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

function normalizarIdentificador(str) {
  if (!str) return "";
  return String(str).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

async function enriquecerConductores() {
  const rutaCsv = path.resolve(__dirname, "../telemetria_csv/datos_historicos_01-11-2026_05-11-2026.csv");
  if (!fs.existsSync(rutaCsv)) {
    console.error("Archivo CSV no encontrado:", rutaCsv);
    return;
  }

  console.log("[ENRIQUECER] Analizando eventos de chofer RFID en el CSV...");
  const fileStream = fs.createReadStream(rutaCsv, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  // Mapa de patentes con sus conductores detectados
  // patente -> Map(fecha -> Set({ rut, nombre }))
  const conductoresPorPatenteFecha = new Map();

  let lineCount = 0;
  for await (const line of rl) {
    lineCount++;
    if (lineCount === 1) continue;

    const parts = line.split(",");
    const patRaw = parts[3]?.trim();
    const rut = parts[4]?.trim();
    const nombre = parts[5]?.trim();
    const fechaHoraRaw = parts[6]?.trim();

    if (patRaw && (rut || nombre) && fechaHoraRaw) {
      const patNorm = normalizarIdentificador(patRaw);
      const match = fechaHoraRaw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
      if (match) {
        const [, dd, mm, yyyy] = match;
        const fechaISO = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
        const key = `${patNorm}_${fechaISO}`;
        if (!conductoresPorPatenteFecha.has(key)) {
          conductoresPorPatenteFecha.set(key, { rut, nombre });
        }
      }
    }
  }

  console.log(`[ENRIQUECER] Detectadas ${conductoresPorPatenteFecha.size} combinaciones vehículo-fecha con chofer RFID.`);

  // Consultar viajes sin conductor entre 2026-11-01 y 2026-11-05
  const { data: viajesSinChofer, error } = await supabase
    .schema("maquinaria")
    .from("telemetria_viajes")
    .select("id, patente, fecha, nombre_conductor, rut_conductor")
    .gte("fecha", "2026-11-01")
    .lte("fecha", "2026-11-05")
    .is("nombre_conductor", null);

  if (error) {
    console.error("Error al consultar viajes:", error);
    return;
  }

  console.log(`[ENRIQUECER] Total viajes sin conductor en el rango: ${viajesSinChofer.length}`);

  let actualizados = 0;
  for (const v of viajesSinChofer) {
    const patNorm = normalizarIdentificador(v.patente);
    const key = `${patNorm}_${v.fecha}`;
    const chofer = conductoresPorPatenteFecha.get(key);
    if (chofer && chofer.nombre) {
      const { error: updErr } = await supabase
        .schema("maquinaria")
        .from("telemetria_viajes")
        .update({
          rut_conductor: chofer.rut || null,
          nombre_conductor: chofer.nombre,
          updated_at: new Date().toISOString(),
        })
        .eq("id", v.id);

      if (!updErr) {
        actualizados++;
      }
    }
  }

  console.log(`[ENRIQUECER] ¡Completado! Se enriquecieron ${actualizados} viajes con su conductor RFID.`);
}

enriquecerConductores().catch(console.error);

