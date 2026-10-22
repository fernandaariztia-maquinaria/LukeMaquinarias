import {
  getProyectoSpence,
  getAllLookahead,
  getLookahead,
  getLogRequisitos,
  getRequisitos,
  getProductivityIndicators,
  getEspecialidades,
} from "../../../lib/eimiplanner";

// Cache simple en memoria para evitar llamadas redundantes a AWS
let cacheData = {
  timestamp: 0,
  project: null,
  lookahead: null,
  logRequisitos: null,
  requisitos: null,
  productividad: null,
  especialidades: null,
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutos

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  const { section = "summary", refresh = "false", page = "1" } = req.query;
  const forceRefresh = refresh === "true";
  const now = Date.now();

  try {
    // Si se requiere refrescar o la cache expiró
    const cacheValida = !forceRefresh && now - cacheData.timestamp < CACHE_TTL;

    if (!cacheValida || !cacheData.project) {
      console.log("[api/eimiplanner] Consultando datos frescos de EIMIPLANNER para EIMI00418...");
      const project = await getProyectoSpence();
      const numPages = project?.num_pages || 2;

      // Cargar en paralelo los servicios esenciales
      const [lookahead, logRequisitos, requisitos, productividad, especialidades] =
        await Promise.all([
          getAllLookahead(project?.idproject || "418", numPages).catch((err) => {
            console.error("[api/eimiplanner] Error cargando lookahead:", err.message);
            return [];
          }),
          getLogRequisitos(project?.idproject || "418").then((r) => r.datos || []).catch((err) => {
            console.error("[api/eimiplanner] Error cargando log requisitos:", err.message);
            return [];
          }),
          getRequisitos(project?.idproject || "418").then((r) => r.datos || []).catch((err) => {
            console.error("[api/eimiplanner] Error cargando requisitos:", err.message);
            return [];
          }),
          getProductivityIndicators(project?.idproject || "418").then((r) => r.datos || []).catch((err) => {
            console.error("[api/eimiplanner] Error cargando productividad:", err.message);
            return [];
          }),
          getEspecialidades().then((r) => r.datos || []).catch(() => []),
        ]);

      cacheData = {
        timestamp: now,
        project,
        lookahead,
        logRequisitos,
        requisitos,
        productividad,
        especialidades,
      };
    }

    const {
      project,
      lookahead,
      logRequisitos,
      requisitos,
      productividad,
      especialidades,
    } = cacheData;

    // Métricas clave consolidadas
    const totalTareas = lookahead?.length || 0;
    const totalRestricciones = logRequisitos?.length || 0;
    const restriccionesAbiertas = (logRequisitos || []).filter(
      (r) => (r.estado || "").toUpperCase() === "ABIERTA"
    ).length;
    const restriccionesCerradas = (logRequisitos || []).filter(
      (r) => (r.estado || "").toUpperCase() === "CERRADA"
    ).length;
    const restriccionesResueltas = (logRequisitos || []).filter(
      (r) => (r.estado || "").toUpperCase() === "RESUELTA"
    ).length;
    const restriccionesPrioridad1 = (logRequisitos || []).filter(
      (r) => String(r.prioridad) === "1"
    ).length;

    // Responder según la sección solicitada
    if (section === "lookahead") {
      return res.status(200).json({
        success: true,
        project,
        total: totalTareas,
        datos: lookahead,
        cachedAt: new Date(cacheData.timestamp).toISOString(),
      });
    }

    if (section === "restricciones") {
      return res.status(200).json({
        success: true,
        project,
        total: totalRestricciones,
        resumen: {
          abiertas: restriccionesAbiertas,
          cerradas: restriccionesCerradas,
          resueltas: restriccionesResueltas,
          criticas: restriccionesPrioridad1,
        },
        datos: logRequisitos,
        cachedAt: new Date(cacheData.timestamp).toISOString(),
      });
    }

    if (section === "requisitos") {
      return res.status(200).json({
        success: true,
        project,
        total: requisitos?.length || 0,
        datos: requisitos,
        cachedAt: new Date(cacheData.timestamp).toISOString(),
      });
    }

    if (section === "productividad") {
      return res.status(200).json({
        success: true,
        project,
        total: productividad?.length || 0,
        datos: productividad,
        cachedAt: new Date(cacheData.timestamp).toISOString(),
      });
    }

    // Default: resumen general completo
    return res.status(200).json({
      success: true,
      project,
      metricas: {
        totalTareas,
        totalRestricciones,
        restriccionesAbiertas,
        restriccionesCerradas,
        restriccionesResueltas,
        restriccionesPrioridad1,
        supervisoresRegistrados: productividad?.length || 0,
        especialidadesActivas: especialidades?.length || 0,
      },
      lookaheadSample: (lookahead || []).slice(0, 150),
      lookaheadTotal: totalTareas,
      logRequisitos: logRequisitos || [],
      productividad: productividad || [],
      especialidades: especialidades || [],
      cachedAt: new Date(cacheData.timestamp).toISOString(),
    });
  } catch (err) {
    console.error("[api/eimiplanner] Error general:", err.message, err.stack);
    return res.status(500).json({
      success: false,
      message: "Error al consultar servicios de EIMIPLANNER",
      error: err.message,
    });
  }
}
