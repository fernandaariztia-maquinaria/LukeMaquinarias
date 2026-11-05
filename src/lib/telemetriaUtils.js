/**
 * Utilidades centralizadas para Telemetría: Formateo de patentes y clasificación de flota.
 */

export function normalizarPatente(raw) {
  if (!raw) return "";
  return String(raw).replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Formatea una patente chilena agregándole el guión estándar sin modificar la base de datos:
 * - 4 letras + 2 números: PGXT19 -> PGXT-19
 * - 2 letras + 4 números: HY9014 o HY-9014 -> HY-90-14
 * - Formatos con guión preexistente: preservados
 */
export function formatearPatente(raw) {
  if (!raw) return "";
  const clean = String(raw).trim().toUpperCase();
  if (clean === "N/A" || clean === "S/P" || clean === "SIN REGISTRO") return clean;

  const noDash = clean.replace(/[^A-Z0-9]/g, "");

  // Formato moderno chileno (4 letras + 2 dígitos): PGXT19 -> PGXT-19
  if (/^[A-Z]{4}\d{2}$/.test(noDash)) {
    return `${noDash.slice(0, 4)}-${noDash.slice(4)}`;
  }

  // Formato antiguo chileno (2 letras + 4 dígitos): HY9014 -> HY-90-14
  if (/^[A-Z]{2}\d{4}$/.test(noDash)) {
    if (/^[A-Z]{2}-\d{2}-\d{2}$/.test(clean)) return clean;
    return `${noDash.slice(0, 2)}-${noDash.slice(2, 4)}-${noDash.slice(4)}`;
  }

  // Si ya tiene guión en formato estándar (ej. GRHQ-0007 o CTAP-0214)
  if (clean.includes("-")) return clean;

  return clean;
}

/**
 * Clasifica cualquier objeto de equipo o viaje en una categoría estándar para filtros:
 * 'camionetas' | 'gruas' | 'camiones' | 'maquinaria' | 'buses' | 'otros'
 */
export function clasificarTipoEquipo(obj) {
  if (!obj) return "otros";
  const tipo = String(obj.tipo || obj.subtipo_skynav || "").toUpperCase();
  const cat = String(obj.categoria || obj.tipo_skynav || "").toUpperCase();
  const desc = String(obj.descripcion_equipo || obj.descripcion || "").toUpperCase();
  const all = `${tipo} ${cat} ${desc}`;

  if (all.includes("CAMIONETA")) return "camionetas";
  if (
    all.includes("GRUA") ||
    all.includes("GRÚA") ||
    all.includes("PLUMA") ||
    all.includes("HORQUILLA")
  ) {
    return "gruas";
  }
  if (
    all.includes("CAMION") ||
    all.includes("CAMIÓN") ||
    all.includes("TRACTO") ||
    all.includes("TOLVA") ||
    all.includes("ALJIBE")
  ) {
    return "camiones";
  }
  if (
    all.includes("EXCAVADOR") ||
    all.includes("RETROEXCAVADORA") ||
    all.includes("CARGADOR") ||
    all.includes("BULLDOZER") ||
    all.includes("MANIPULADOR") ||
    all.includes("PESADA") ||
    all.includes("SEMIPESADA")
  ) {
    return "maquinaria";
  }
  if (
    all.includes("BUS") ||
    all.includes("MINIBUS") ||
    all.includes("FURGON") ||
    all.includes("FURGÓN")
  ) {
    return "buses";
  }
  return "otros";
}

export const TIPOS_EQUIPO_FILTROS = [
  { key: "todos", label: "Todos los Tipos" },
  { key: "camionetas", label: "Camionetas" },
  { key: "camiones", label: "Camiones" },
  { key: "gruas", label: "Grúas / Plumas" },
  { key: "maquinaria", label: "Maquinaria Pesada" },
  { key: "buses", label: "Buses / Minibuses" },
  { key: "otros", label: "Otros Equipos" },
];
