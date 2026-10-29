import { createAdminClient } from "../../../lib/supabase-server.js";
import { getAllLookahead, getProyectoSpence } from "../../../lib/eimiplanner.js";

// Cache simple en memoria para el lookahead completo de EimiPlanner (5 minutos)
let cachedLookahead = null;
let cachedTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

const equivalenciasEsp = {
  piping: "piping",
  estructura: "estructuras",
  estructuras: "estructuras",
  civil: "obras civiles",
  cívil: "obras civiles",
  "obras civiles": "obras civiles",
  enfierradura: "obras civiles",
  electrica: "electricidad",
  eléctrica: "electricidad",
  electricidad: "electricidad",
  instrumentacion: "instrumentacion",
  instrumentación: "instrumentacion",
  "mov. de tierra": "movimiento de tierras",
  "movimiento de tierras": "movimiento de tierras",
  mecanica: "estructuras",
  mecánica: "estructuras",
  izaje: "izaje especial",
  mantenimiento: "mantenimiento",
  aislacion: "aislacion",
  aislación: "aislacion",
  aislamiento: "aislacion",
  andamios: "andamios",
  andamio: "andamios",
};

const norm = (str) =>
  (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * GET /api/pod/actividades
 * Query params:
 * - especialidad_id: UUID de la especialidad en Supabase
 * - search: texto libre para buscar por nombre, WBS, área o partida
 * - refresh: "true" para invalidar la cache en memoria
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const { especialidad_id, search, refresh } = req.query;
  const now = Date.now();

  try {
    // 1. Obtener catálogo de especialidades desde Supabase
    const { data: especialidadesDb, error: errEsp } = await supabase
      .from("especialidades")
      .select("id, nombre_oficial, color")
      .order("nombre_oficial");

    if (errEsp) throw errEsp;

    const espMapById = new Map();
    const espMapByNormName = new Map();
    (especialidadesDb || []).forEach((e) => {
      espMapById.set(e.id, e);
      espMapByNormName.set(norm(e.nombre_oficial), e);
    });

    // 2. Cargar Lookahead desde EimiPlanner con cache
    const forceRefresh = refresh === "true";
    if (forceRefresh || !cachedLookahead || now - cachedTimestamp > CACHE_TTL) {
      try {
        const project = await getProyectoSpence();
        const numPages = project?.num_pages || 2;
        const tasks = await getAllLookahead(project?.idproject || "418", numPages);
        cachedLookahead = tasks || [];
        cachedTimestamp = now;
      } catch (errApi) {
        console.error("[api/pod/actividades] Error consultando API Eimiplanner:", errApi.message);
        if (!cachedLookahead) cachedLookahead = [];
      }
    }

    // 3. Mapear y filtrar tareas operativas (type_task !== 'T')
    let lista = (cachedLookahead || [])
      .filter((t) => t.type_task !== "T" && t.activity_name)
      .map((t) => {
        const rawNorm = norm(t.especialidad);
        const mappedNameNorm = equivalenciasEsp[rawNorm] || rawNorm;
        const matchedEsp = espMapByNormName.get(mappedNameNorm) || null;

        return {
          id: String(t.idtask),
          idtask: String(t.idtask),
          nombre: (t.activity_name || "").trim(),
          codigo: t.group || null,
          area: t.area ? t.area.trim() : null,
          subarea: t.subarea ? t.subarea.trim() : null,
          item_itemizado: t.item_itemizado ? t.item_itemizado.trim() : null,
          descripcion_partida: t.descripcion_partida ? t.descripcion_partida.trim() : null,
          especialidad_raw: t.especialidad || null,
          especialidad_id: matchedEsp?.id || null,
          especialidades: matchedEsp || {
            id: null,
            nombre_oficial: t.especialidad || "General",
            color: "#6b7280",
          },
          tipo: t.type_task || "A",
          unid: t.unid || null,
          fechas: t["3wl_start"] && t["3wl_finish"] ? `${t["3wl_start"]} → ${t["3wl_finish"]}` : null,
          duracion: t.duracion || null,
          hh: t.hh_pom || null,
        };
      });

    // 4. Filtrar por especialidad si se especificó
    if (especialidad_id) {
      lista = lista.filter((t) => t.especialidad_id === especialidad_id);
    }

    // 5. Filtrar por búsqueda de texto
    if (search && search.trim() !== "") {
      const q = norm(search);
      lista = lista.filter((t) => {
        return (
          norm(t.nombre).includes(q) ||
          norm(t.codigo).includes(q) ||
          norm(t.idtask).includes(q) ||
          norm(t.area).includes(q) ||
          norm(t.subarea).includes(q) ||
          norm(t.item_itemizado).includes(q) ||
          norm(t.descripcion_partida).includes(q)
        );
      });
    }

    return res.status(200).json({
      success: true,
      total: lista.length,
      data: lista,
      cachedAt: new Date(cachedTimestamp).toISOString(),
    });
  } catch (err) {
    console.error("[api/pod/actividades] Error general:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
