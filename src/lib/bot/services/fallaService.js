/**
 * Servicio de detección y registro de fallas en equipos (Requerimiento 2.2)
 */

import { formatFechaHoraChile } from "../../timeUtils.js";
import { formatEquipoLabel } from "../../equipoLabel.js";
import { notificarSupervisor } from "./messageService.js";

/**
 * Evalúa si el texto del operador indica presencia o ausencia de fallas al cierre.
 */
export function evaluarFallaTexto(texto = "") {
  if (!texto) return { respondio: false, presentaFalla: false, descripcion: null };

  const lower = String(texto).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

  // Negación explícita de fallas
  const niegaFalla =
    /\b(sin\s+falla|sin\s+fallas|sin\s+novedad|sin\s+novedades|sin\s+pana|sin\s+panne|sin\s+problemas?|no\s+presenta|no\s+tiene|operativo|todo\s+bien|todo\s+operativo|ninguna|impeque|bien)\b/.test(lower) ||
    lower === "no" ||
    lower === "nop";

  if (niegaFalla) {
    return {
      respondio: true,
      presentaFalla: false,
      descripcion: null
    };
  }

  // Afirmación de falla
  const afirmaFalla =
    /\b(si|presenta\s+falla|tiene\s+falla|con\s+falla|hay\s+falla|pana|panne|averia|roto|averiado|fuga|desperfecto|problema\s+en|ruido\s+raro|temperatura|hidraulico|electrico)\b/.test(lower);

  if (afirmaFalla) {
    // Si respondió algo más que un simple "sí", usarlo como descripción inicial
    let descripcion = String(texto).trim();
    if (lower === "si" || lower === "sí" || lower === "si presenta" || lower === "si tiene") {
      descripcion = null; // Requiere descripción detallada
    }
    return {
      respondio: true,
      presentaFalla: true,
      descripcion
    };
  }

  return {
    respondio: false,
    presentaFalla: false,
    descripcion: null
  };
}

/**
 * Registra una falla técnica en historial_fallas_equipos, eventos_jornada y notifica a supervisión.
 */
export async function registrarFallaEquipo(supabase, {
  equipoId,
  reporteId,
  personalId,
  motivoFalla,
  supervisorId = null,
  geminiKey = null
}) {
  const ahoraIso = new Date().toISOString();
  const motivoLimpio = String(motivoFalla || "Falla técnica reportada por el operador").trim();

  // 1. Guardar en historial_fallas_equipos
  const { data: falla, error: errFalla } = await supabase
    .schema("maquinaria")
    .from("historial_fallas_equipos")
    .insert({
      equipo_id: equipoId,
      reporte_id: reporteId,
      operador_id: personalId,
      hora_inicio: ahoraIso,
      motivo_falla: motivoLimpio,
      estado: "abierta"
    })
    .select()
    .single();

  if (errFalla) {
    console.error("[fallaService] Error registrando falla en historial:", errFalla.message);
  }

  // 2. Registrar evento en eventos_jornada
  await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .insert({
      reporte_id: reporteId,
      estado_hito: "Detenido por Falla",
      hora_evento: ahoraIso,
      nota_transcripcion: `🔴 Falla detectada al cierre de jornada: ${motivoLimpio}`
    });

  // 3. Actualizar estado del equipo a Detenido por Falla
  await supabase
    .schema("maquinaria")
    .from("equipos")
    .update({ estado_actual: "Detenido por Falla" })
    .eq("id", equipoId);

  // 4. Actualizar reporte_diario con la observación
  try {
    const { data: repPrev } = await supabase
      .schema("maquinaria")
      .from("reportes_diarios")
      .select("observaciones")
      .eq("id", reporteId)
      .maybeSingle();

    const obsPrev = repPrev?.observaciones ? `${repPrev.observaciones} | ` : "";
    await supabase
      .schema("maquinaria")
      .from("reportes_diarios")
      .update({
        estado_final: "Detenido por Falla",
        observaciones: `${obsPrev}[Falla al Cierre ${formatFechaHoraChile()}]: ${motivoLimpio}`
      })
      .eq("id", reporteId);
  } catch (eRep) {
    console.warn("[fallaService] Error actualizando observaciones:", eRep.message);
  }

  // 5. Notificar al supervisor si está asignado
  if (supervisorId) {
    try {
      const { data: eq } = await supabase
        .schema("maquinaria")
        .from("equipos")
        .select("codigo_interno, patente, descripcion_equipo")
        .eq("id", equipoId)
        .maybeSingle();

      const { data: op } = await supabase
        .schema("maquinaria")
        .from("personal")
        .select("nombre_completo")
        .eq("id", personalId)
        .maybeSingle();

      const labelEq = eq ? formatEquipoLabel(eq) : "Equipo";
      const textoAlerta =
        `🚨 *ALERTA: FALLA EN EQUIPO AL CIERRE DE JORNADA* 🚨\n\n` +
        `🚜 *Equipo:* ${eq?.descripcion_equipo || "Equipo"} (${labelEq})\n` +
        `👷‍♂️ *Operador:* ${op?.nombre_completo || "Operador"}\n` +
        `⚠️ *Falla detectada:* ${motivoLimpio}\n` +
        `⏱️ *Hora:* ${formatFechaHoraChile()}\n\n` +
        `_El equipo ha sido registrado como "Detenido por Falla" en el sistema para revisión de mantención._`;

      await notificarSupervisor(supabase, supervisorId, textoAlerta, geminiKey);
    } catch (eNotif) {
      console.warn("[fallaService] Error notificando supervisor:", eNotif.message);
    }
  }

  return { falla, motivoLimpio };
}
