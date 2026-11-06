/**
 * Servicio de procesamiento y almacenamiento de cargas de combustible (Requerimiento 2.1)
 */

import { formatFechaHoraChile } from "../../timeUtils.js";
import { convertirPalabrasANumeros } from "../../gemini.js";

/**
 * Extrae datos de carga de combustible desde un texto (litros y hora).
 */
export function extraerCargaCombustible(texto = "") {
  if (!texto) return { respondio: false, tieneCarga: false, sinCarga: false, litros: null, horaTexto: null };

  const textoConNum = convertirPalabrasANumeros(String(texto));
  const lower = textoConNum.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // Negación explícita de carga
  const niegaCarga =
    /\b(sin\s+carga|sin\s+combustible|sin\s+petroleo|no\s+cargue|no\s+se\s+cargo|no\s+hubo|ninguna|cero\s+litros?|0\s*litros?|0\s*lts?|0\s*l\b|combustible\s+0|carga\s+0|petroleo\s+0)\b/.test(lower) ||
    lower === "no" ||
    lower === "0" ||
    lower === "sin carga";

  if (niegaCarga) {
    return {
      respondio: true,
      tieneCarga: false,
      sinCarga: true,
      litros: 0,
      horaTexto: null,
      horaIso: new Date().toISOString()
    };
  }

  // Detección de litros
  let litros = null;
  const matchLitros =
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:litros|lts|l\b)/) ||
    lower.match(/(?:cargue|cargamos|cargaron|carga|combustible|petroleo)\s*(?:de|:)?\s*(\d+(?:[.,]\d+)?)(?!\s*%)/) ||
    lower.match(/(\d+(?:[.,]\d+)?)\s*(?:de combustible|de petroleo)/);

  if (matchLitros) {
    litros = parseFloat(matchLitros[1].replace(",", "."));
  }

  // Si solo ingresó un número en contexto de combustible (ej: "80")
  if (litros === null) {
    const soloNum = lower.match(/^(\d+(?:[.,]\d+)?)$/);
    if (soloNum) {
      litros = parseFloat(soloNum[1].replace(",", "."));
    }
  }

  // Detección de hora de la carga (ej: "a las 11:30", "14:00", "a las 10 de la mañana")
  let horaTexto = null;
  const matchHora =
    lower.match(/(?:a\s+las?|hora:?)\s*(\d{1,2}(?::\d{2})?(?:\s*(?:am|pm|de la mañana|de la tarde|de la noche))?)/) ||
    lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (matchHora) {
    horaTexto = matchHora[0].trim();
  }

  if (litros !== null && litros > 0) {
    return {
      respondio: true,
      tieneCarga: true,
      sinCarga: false,
      litros,
      horaTexto: horaTexto || new Date().toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit" }),
      horaIso: new Date().toISOString()
    };
  }

  return {
    respondio: false,
    tieneCarga: false,
    sinCarga: false,
    litros: null,
    horaTexto: null,
    horaIso: null
  };
}

/**
 * Registra una carga de combustible en vouchers_combustible, actualiza el acumulado en reportes_diarios y crea un evento en eventos_jornada.
 */
export async function registrarCargaCombustible(supabase, {
  reporteId,
  personalId,
  litros,
  horaTexto,
  horaIso,
  servicentro = "Terreno / Faena",
  observacion = ""
}) {
  const hoyChile = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const fechaIso = horaIso || new Date().toISOString();

  // 1. Evitar duplicados recientes (misma cantidad de litros dentro de los últimos 15 minutos en el mismo reporte)
  const { data: recientes } = await supabase
    .schema("maquinaria")
    .from("vouchers_combustible")
    .select("id, litros_cargados, created_at")
    .eq("id_reporte_diario", reporteId)
    .eq("litros_cargados", litros)
    .order("created_at", { ascending: false })
    .limit(1);

  if (recientes && recientes.length > 0) {
    const diffMin = (Date.now() - new Date(recientes[0].created_at).getTime()) / (1000 * 60);
    if (diffMin < 15) {
      console.log(`[combustibleService] ⚠️ Carga de ${litros} L ya registrada hace ${diffMin.toFixed(1)} min. Omitiendo duplicado.`);
      return { duplicado: true, voucher: recientes[0] };
    }
  }

  // 2. Insertar voucher independiente
  const { data: voucher, error: errVoucher } = await supabase
    .schema("maquinaria")
    .from("vouchers_combustible")
    .insert({
      id_reporte_diario: reporteId,
      id_personal: personalId,
      litros_cargados: litros,
      servicentro,
      fecha_carga: hoyChile,
      created_at: fechaIso
    })
    .select()
    .single();

  if (errVoucher) {
    console.error("[combustibleService] Error insertando voucher:", errVoucher.message);
  }

  // 3. Calcular suma total de litros para este reporte
  const { data: todosVouchers } = await supabase
    .schema("maquinaria")
    .from("vouchers_combustible")
    .select("litros_cargados")
    .eq("id_reporte_diario", reporteId);

  const totalLitrosAcumulado = (todosVouchers || []).reduce(
    (acc, v) => acc + Number(v.litros_cargados || 0),
    0
  );

  // 4. Actualizar total en reportes_diarios
  await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .update({ petroleo_litros: totalLitrosAcumulado })
    .eq("id", reporteId);

  // 5. Registrar evento en eventos_jornada
  const horaDesc = horaTexto ? ` a las ${horaTexto}` : "";
  await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .insert({
      reporte_id: reporteId,
      estado_hito: "Trabajando",
      hora_evento: fechaIso,
      nota_transcripcion: `⛽ Carga de combustible registrada: ${litros} L${horaDesc}. Total acumulado turno: ${totalLitrosAcumulado} L.${observacion ? ` ${observacion}` : ""}`
    });

  return {
    duplicado: false,
    voucher,
    totalLitrosAcumulado
  };
}
