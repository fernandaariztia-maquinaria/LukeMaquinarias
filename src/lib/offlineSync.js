/**
 * Utilidad de almacenamiento offline y sincronización automática (Outbox Pattern)
 * Permite a supervisores y operadores guardar datos en faena aunque no haya señal de internet,
 * y los sincroniza automáticamente en segundo plano cuando la conectividad se restablece.
 */

const KEY_SUPERVISOR_OUTBOX = "luke_outbox_supervisor_actividades";
const KEY_OPERADOR_OUTBOX = "luke_outbox_operador_checkin";

// Helpers seguros para localStorage
function getItems(key) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("[offlineSync] Error leyendo", key, e);
    return [];
  }
}

function setItems(key, items) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (e) {
    console.error("[offlineSync] Error guardando", key, e);
  }
}

// ── BANDEJA SUPERVISOR ACTIVIDADES ─────────────────────────────

export function encolarActividadesSupervisor(payload) {
  const items = getItems(KEY_SUPERVISOR_OUTBOX);
  const nuevoItem = {
    id: `sup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fecha_creacion: new Date().toISOString(),
    payload,
    intentos: 0,
    ultimoError: null,
  };
  items.push(nuevoItem);
  setItems(KEY_SUPERVISOR_OUTBOX, items);
  return nuevoItem;
}

export function obtenerPendientesSupervisor() {
  return getItems(KEY_SUPERVISOR_OUTBOX);
}

export async function sincronizarActividadesSupervisor(onItemSync = null) {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { procesados: 0, restantes: getItems(KEY_SUPERVISOR_OUTBOX).length };
  }

  const items = getItems(KEY_SUPERVISOR_OUTBOX);
  if (items.length === 0) return { procesados: 0, restantes: 0 };

  const noEnviados = [];
  let procesados = 0;

  for (const item of items) {
    try {
      const res = await fetch("/api/supervisor/actividades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        procesados++;
        if (onItemSync) onItemSync(item, true);
      } else {
        item.intentos = (item.intentos || 0) + 1;
        item.ultimoError = json.error || "Error en el servidor";
        noEnviados.push(item);
      }
    } catch (err) {
      item.intentos = (item.intentos || 0) + 1;
      item.ultimoError = err.message || "Falla de red";
      noEnviados.push(item);
    }
  }

  setItems(KEY_SUPERVISOR_OUTBOX, noEnviados);
  return { procesados, restantes: noEnviados.length };
}

// ── BANDEJA OPERADOR CHECKIN ──────────────────────────────────

export function encolarCheckinOperador(payload) {
  const items = getItems(KEY_OPERADOR_OUTBOX);
  const nuevoItem = {
    id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    fecha_creacion: new Date().toISOString(),
    payload,
    intentos: 0,
    ultimoError: null,
  };
  items.push(nuevoItem);
  setItems(KEY_OPERADOR_OUTBOX, items);
  return nuevoItem;
}

export function obtenerPendientesOperador() {
  return getItems(KEY_OPERADOR_OUTBOX);
}

export async function sincronizarCheckinOperador(onItemSync = null) {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { procesados: 0, restantes: getItems(KEY_OPERADOR_OUTBOX).length };
  }

  const items = getItems(KEY_OPERADOR_OUTBOX);
  if (items.length === 0) return { procesados: 0, restantes: 0 };

  const noEnviados = [];
  let procesados = 0;

  for (const item of items) {
    try {
      const res = await fetch("/api/equipos/checkin-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item.payload),
      });

      const json = await res.json();
      if (res.ok && json.success) {
        procesados++;
        if (onItemSync) onItemSync(item, true);
      } else {
        item.intentos = (item.intentos || 0) + 1;
        item.ultimoError = json.message || "Error al procesar check-in";
        noEnviados.push(item);
      }
    } catch (err) {
      item.intentos = (item.intentos || 0) + 1;
      item.ultimoError = err.message || "Falla de red";
      noEnviados.push(item);
    }
  }

  setItems(KEY_OPERADOR_OUTBOX, noEnviados);
  return { procesados, restantes: noEnviados.length };
}

// ── CACHÉ COMPLEMENTARIO DE DATOS PARA LECTURA OFFLINE ────────

export function guardarCacheLocal(clave, data) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`luke_cache_${clave}`, JSON.stringify({
      timestamp: Date.now(),
      data
    }));
  } catch (e) {
    console.warn("[offlineSync] No se pudo guardar cache", clave, e);
  }
}

export function obtenerCacheLocal(clave, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`luke_cache_${clave}`);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (Date.now() - obj.timestamp > maxAgeMs) return null;
    return obj.data;
  } catch (e) {
    return null;
  }
}
