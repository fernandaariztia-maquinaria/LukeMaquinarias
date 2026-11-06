/**
 * Utilidades centralizadas para Telemetría: Formateo de patentes y clasificación de flota.
 */

export function normalizarPatente(raw) {
  if (!raw) return "";
  return String(raw).replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

/**
 * Formatea una patente chilena agregándole el guión estándar sin modificar la base de datos:
 * - 4 letras + 2 números: PGXT19 -> PGXT‑19 (con guión no rompible para evitar salto de línea)
 * - 2 letras + 4 números: HY9014 o HY-9014 -> HY‑90‑14
 * - Formatos con guión preexistente: preservados
 */
export function formatearPatente(raw, useNonBreaking = true) {
  if (!raw) return "";
  const clean = String(raw).trim().toUpperCase();
  if (clean === "N/A" || clean === "S/P" || clean === "SIN REGISTRO") return clean;

  const noDash = clean.replace(/[^A-Z0-9]/g, "");
  // Guión no rompible (U+2011) previene que los navegadores corten la patente en dos líneas
  const dash = useNonBreaking ? "\u2011" : "-";

  // Formato moderno chileno (4 letras + 2 dígitos): PGXT19 -> PGXT-19
  if (/^[A-Z]{4}\d{2}$/.test(noDash)) {
    return `${noDash.slice(0, 4)}${dash}${noDash.slice(4)}`;
  }

  // Formato antiguo chileno (2 letras + 4 dígitos): HY9014 -> HY-90-14
  if (/^[A-Z]{2}\d{4}$/.test(noDash)) {
    if (/^[A-Z]{2}[-\u2011]\d{2}[-\u2011]\d{2}$/.test(clean)) {
      return clean.replace(/-/g, dash);
    }
    return `${noDash.slice(0, 2)}${dash}${noDash.slice(2, 4)}${dash}${noDash.slice(4)}`;
  }

  // Si ya tiene guión en formato estándar (ej. GRHQ-0007 o CTAP-0214)
  if (clean.includes("-") || clean.includes("\u2011")) {
    return useNonBreaking ? clean.replace(/-/g, "\u2011") : clean;
  }

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
  const desc = String(
    obj.descripcion_equipo ||
      obj.descripcion ||
      obj.nombre_skynav ||
      obj.nombre_equipo ||
      ""
  ).toUpperCase();
  const all = `${tipo} ${cat} ${desc}`;

  if (all.includes("CAMIONETA") || all.includes("PICKUP")) return "camionetas";
  if (
    all.includes("GRUA") ||
    all.includes("GRÚA") ||
    all.includes("PLUMA") ||
    all.includes("HORQUILLA") ||
    all.includes("ALZA HOMBRE") ||
    all.includes("MANLIFT") ||
    all.includes("HIDROELEVADOR")
  ) {
    return "gruas";
  }
  if (
    all.includes("CAMION") ||
    all.includes("CAMIÓN") ||
    all.includes("TRACTO") ||
    all.includes("TOLVA") ||
    all.includes("ALJIBE") ||
    all.includes("AMPLIROLL") ||
    all.includes("BATEA")
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
    all.includes("SEMIPESADA") ||
    all.includes("RODILLO") ||
    all.includes("MOTONIVELADORA") ||
    all.includes("MINICARGADOR")
  ) {
    return "maquinaria";
  }
  if (
    all.includes("BUS") ||
    all.includes("MINIBUS") ||
    all.includes("MINIBÚS") ||
    all.includes("FURGON") ||
    all.includes("FURGÓN") ||
    all.includes("VAN")
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

