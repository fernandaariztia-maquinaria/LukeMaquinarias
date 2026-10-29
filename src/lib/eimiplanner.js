/**
 * Cliente de integración para los servicios API de EIMIPLANNER v2.0
 * Documentación oficial: Guía API Services EIMIPLANNER (2026)
 */

const DEFAULT_BASE_URL = "https://ewsgoin43g.execute-api.us-east-1.amazonaws.com/EITSKMngrBeta";
const DEFAULT_COMPANY_ID = "EI";
const DEFAULT_USER = "admin";
const DEFAULT_PASSWORD = "dayf1974";

// Cache en memoria para token de sesión EIMIPLANNER
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Obtiene el token Bearer autenticado desde EIMIPLANNER
 */
export async function getEimiplannerToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && tokenExpiresAt > now + 60000) {
    return cachedToken;
  }

  const baseUrl = process.env.EIMIPLANNER_BASE_URL || DEFAULT_BASE_URL;
  const companyId = process.env.EIMIPLANNER_COMPANY_ID || DEFAULT_COMPANY_ID;
  const user = process.env.EIMIPLANNER_USER || DEFAULT_USER;
  const password = process.env.EIMIPLANNER_PASSWORD || DEFAULT_PASSWORD;

  const authUrl = `${baseUrl}/authenticator/signin?companyId=${encodeURIComponent(companyId)}`;
  const credentials = Buffer.from(`${user}:${password}`).toString("base64");

  const res = await fetch(authUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`[EIMIPLANNER] Error al autenticar (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  if (!data?.token) {
    throw new Error("[EIMIPLANNER] Respuesta de autenticación sin token");
  }

  cachedToken = data.token;
  // El token dura 40 horas según JWT exp, ponemos 24h de seguridad
  tokenExpiresAt = now + 24 * 60 * 60 * 1000;
  return cachedToken;
}

/**
 * Función genérica para consultar endpoints autenticados de marketplace
 */
async function eimiplannerFetch(endpoint) {
  const baseUrl = process.env.EIMIPLANNER_BASE_URL || DEFAULT_BASE_URL;
  const token = await getEimiplannerToken();

  const url = `${baseUrl}/marketplace${endpoint}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (res.status === 401 || res.status === 403) {
    // Reintentar una vez con token fresco
    const freshToken = await getEimiplannerToken(true);
    const retryRes = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${freshToken}`,
        "Content-Type": "application/json",
      },
    });
    if (!retryRes.ok) {
      const errText = await retryRes.text();
      throw new Error(`[EIMIPLANNER] Error en ${endpoint} (${retryRes.status}): ${errText}`);
    }
    return retryRes.json();
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[EIMIPLANNER] Error en ${endpoint} (${res.status}): ${errText}`);
  }

  return res.json();
}

/**
 * Obtiene el listado de proyectos
 */
export async function getProyectos(closed = 0, paused = 0) {
  return eimiplannerFetch(`/getProyectos?closed=${closed}&paused=${paused}`);
}

/**
 * Obtiene los datos del proyecto específico EIMI00418 (Spence)
 */
export async function getProyectoSpence() {
  const res = await getProyectos(0, 0);
  const proyectos = res.datos || [];
  const spence = proyectos.find(
    (p) =>
      p.id_obra === "EIMI00418" ||
      p.idproject === "418" ||
      (p.project_name && p.project_name.toLowerCase().includes("spence"))
  );
  return spence || null;
}

/**
 * Obtiene el Lookahead paginado
 */
export async function getLookahead(projectId = "418", numPage = 1) {
  return eimiplannerFetch(`/getLookahead?projectId=${projectId}&numPage=${numPage}`);
}

/**
 * Obtiene todo el Lookahead consolidando todas sus páginas
 */
export async function getAllLookahead(projectId = "418", numPages = 2) {
  const promises = [];
  for (let i = 1; i <= numPages; i++) {
    promises.push(getLookahead(projectId, i));
  }
  const results = await Promise.all(promises);
  let allTasks = [];
  results.forEach((r) => {
    if (r?.datos && Array.isArray(r.datos)) {
      allTasks = allTasks.concat(r.datos);
    }
  });
  return allTasks;
}

/**
 * Obtiene la matriz de Requisitos
 */
export async function getRequisitos(
  projectId = "418",
  dateStart = "01/01/2026",
  dateFinish = "31/12/2026"
) {
  return eimiplannerFetch(
    `/getRequisitos?projectId=${projectId}&dateStart=${dateStart}&dateFinish=${dateFinish}`
  );
}

/**
 * Obtiene el Log de Requisitos (Restricciones registradas)
 */
export async function getLogRequisitos(
  projectId = "418",
  dateStart = "01/01/2026",
  dateFinish = "31/12/2026"
) {
  return eimiplannerFetch(
    `/getLogRequisitos?projectId=${projectId}&dateStart=${dateStart}&dateFinish=${dateFinish}`
  );
}

/**
 * Obtiene los Indicadores de Productividad
 */
export async function getProductivityIndicators(projectId = "418") {
  return eimiplannerFetch(`/getProductivityIndicators?projectId=${projectId}`);
}

/**
 * Obtiene el catálogo de especialidades
 */
export async function getEspecialidades() {
  return eimiplannerFetch("/getEspecialidades");
}

/**
 * Obtiene los datos de la Curva S
 */
export async function getCurvaS() {
  return eimiplannerFetch("/getSCurve");
}

/**
 * Obtiene las actividades operativas del Lookahead (Tipo A y SA) agrupadas por disciplina normalizada
 */
export async function getLookaheadActivitiesByDiscipline(projectId = "418") {
  const tasks = await getAllLookahead(projectId);
  const byDiscipline = {};

  tasks.forEach((t) => {
    if (t.type_task === "T") return; // Omitir títulos / agrupadores
    const rawEsp = (t.especialidad || "Otros").trim();
    if (!byDiscipline[rawEsp]) byDiscipline[rawEsp] = [];

    byDiscipline[rawEsp].push({
      idtask: t.idtask,
      codigo: t.group || null,
      nombre: (t.activity_name || "").trim(),
      tipo: t.type_task,
      unid: t.unid || null,
      hh: t.hh_efectiva || null,
      dotacion: t.dotacion || null,
      duracion: t.duracion || null,
      inicio: t["3wl_start"] || null,
      fin: t["3wl_finish"] || null,
      responsable: t.responsable || null,
    });
  });

  return byDiscipline;
}

/**
 * Sincroniza las actividades de EIMIPLANNER (Spence 418) con la tabla `tareas_programadas` de Supabase
 * garantizando que la Sala POD y las Disciplinas muestren exactamente las actividades del EIMIPLANNER.
 */
export async function syncEimiplannerActivities(supabase, projectId = "418") {
  if (!supabase) throw new Error("Cliente Supabase requerido para la sincronización.");

  // 1. Obtener especialidades en Supabase (schema maquinaria)
  const { data: especialidadesDb, error: errEsp } = await supabase
    .from("especialidades")
    .select("id, nombre_oficial");

  if (errEsp) throw new Error(`Error al leer especialidades: ${errEsp.message}`);

  const norm = (str) =>
    (str || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const espMap = new Map();
  especialidadesDb.forEach((e) => {
    espMap.set(norm(e.nombre_oficial), e.id);
  });

  // Mapeo de disciplinas EIMIPLANNER -> Nombre de Especialidad en BD
  const equivalencias = {
    piping: "piping",
    estructura: "estructuras",
    estructuras: "estructuras",
    civil: "obras civiles",
    "obras civiles": "obras civiles",
    enfierradura: "obras civiles",
    electrica: "electricidad",
    electricidad: "electricidad",
    instrumentacion: "instrumentacion",
    "mov. de tierra": "movimiento de tierras",
    "movimiento de tierras": "movimiento de tierras",
    mecanica: "estructuras",
    aislacion: "aislacion",
    aislación: "aislacion",
    aislamiento: "aislacion",
    andamios: "andamios",
    andamio: "andamios",
  };

  // 2. Traer tareas del Lookahead desde la API de EIMIPLANNER
  const tasks = await getAllLookahead(projectId);
  const dedupe = new Map();

  tasks.forEach((t) => {
    if (t.type_task === "T") return; // Omitir títulos
    const rawEspNorm = norm(t.especialidad);
    const targetEspNorm = equivalencias[rawEspNorm];
    if (!targetEspNorm) return;

    const espId = espMap.get(targetEspNorm);
    if (!espId) return;

    const nombre = (t.activity_name || "").trim();
    if (!nombre) return;

    const key = `${espId}::${nombre.toLowerCase()}`;
    if (!dedupe.has(key)) {
      dedupe.set(key, {
        especialidad_id: espId,
        nombre,
        codigo: t.group || null,
        descripcion: `[EIMIPLANNER ${t.idtask}] ${t.type_task === "SA" ? "Subactividad" : "Actividad"}${t.group ? " · WBS: " + t.group : ""}${t.unid ? " · " + t.unid : ""}`,
        activa: true,
        es_libre: false,
      });
    }
  });

  // 3. Obtener tareas ya existentes para no duplicar ni alterar foreign keys
  const { data: tareasExistentes } = await supabase
    .from("tareas_programadas")
    .select("id, especialidad_id, nombre");

  const existMap = new Map();
  (tareasExistentes || []).forEach((te) => {
    existMap.set(`${te.especialidad_id}::${(te.nombre || "").trim().toLowerCase()}`, te.id);
  });

  const toInsert = [];
  const toUpdate = [];

  for (const [key, item] of dedupe.entries()) {
    const existingId = existMap.get(key);
    if (existingId) {
      toUpdate.push({ id: existingId, ...item });
    } else {
      toInsert.push(item);
    }
  }

  // 4. Ejecutar inserts en lotes
  let totalInsertadas = 0;
  let totalActualizadas = 0;

  if (toInsert.length > 0) {
    const BATCH_SIZE = 100;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: errIns } = await supabase.from("tareas_programadas").insert(batch);
      if (errIns) {
        console.error("[EIMIPLANNER SYNC] Error insert batch:", errIns.message);
      } else {
        totalInsertadas += batch.length;
      }
    }
  }

  // 5. Ejecutar updates si aplica
  if (toUpdate.length > 0) {
    for (const item of toUpdate) {
      await supabase
        .from("tareas_programadas")
        .update({
          codigo: item.codigo,
          descripcion: item.descripcion,
          activa: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      totalActualizadas++;
    }
  }

  return {
    success: true,
    projectId,
    totalProcesadas: dedupe.size,
    totalInsertadas,
    totalActualizadas,
  };
}
