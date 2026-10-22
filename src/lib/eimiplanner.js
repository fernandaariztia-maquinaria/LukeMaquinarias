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
