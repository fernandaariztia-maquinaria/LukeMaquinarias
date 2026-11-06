/**
 * Servicio de Cierre Automático de Jornada por límite de 12 horas (Requerimiento 2.4)
 */

import fs from "fs";
import path from "path";
import { formatFechaHoraChile } from "../../timeUtils.js";
import { enviarMensajeWhatsApp, guardarMensajeChat } from "./messageService.js";
import { generarReportePDF } from "../../pdf-generator.js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "evidencias-montaje";

export async function compilarYSubirPDF(supabase, reporteId, personal) {
  const { data: reporteCompleto } = await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .select("*")
    .eq("id", reporteId)
    .single();

  const { data: equipo } = await supabase
    .schema("maquinaria")
    .from("equipos")
    .select("*")
    .eq("id", reporteCompleto.equipo_id)
    .single();

  let supervisor = null;
  if (reporteCompleto.supervisor_id) {
    const { data: supData } = await supabase
      .schema("maquinaria")
      .from("personal")
      .select("nombre_completo")
      .eq("id", reporteCompleto.supervisor_id)
      .maybeSingle();
    supervisor = supData;
  }

  if (!supervisor && reporteCompleto.equipo_id && reporteCompleto.fecha) {
    const { data: bloqueSup } = await supabase
      .schema("maquinaria")
      .from("planificacion_bloques_pod")
      .select("supervisor_id, supervisor:supervisor_id(nombre_completo)")
      .eq("equipo_id", reporteCompleto.equipo_id)
      .eq("fecha", reporteCompleto.fecha)
      .not("supervisor_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bloqueSup?.supervisor) {
      supervisor = bloqueSup.supervisor;
    }
  }

  const { data: eventosRaw } = await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .select("*, especialidades(nombre_oficial)")
    .eq("reporte_id", reporteId)
    .order("hora_evento", { ascending: true });

  const eventos = (eventosRaw || []).map((e) => ({
    ...e,
    especialidad_nombre: e.especialidades?.nombre_oficial,
  }));

  const { data: evidencias } = await supabase
    .schema("maquinaria")
    .from("evidencias")
    .select("*")
    .eq("reporte_id", reporteId);

  const pdfUrl = await generarReportePDF({
    reporte: reporteCompleto,
    equipo,
    operador: personal,
    supervisor,
    eventos,
    evidencias: evidencias || [],
  });

  // Respaldo en Supabase Storage
  try {
    const localFilePath = path.join(process.cwd(), "public", pdfUrl);
    if (fs.existsSync(localFilePath)) {
      const fileBuffer = fs.readFileSync(localFilePath);
      const fechaPdf = new Date(reporteCompleto.fecha);
      const anioPdf = fechaPdf.getFullYear();
      const mesPdf = String(fechaPdf.getMonth() + 1).padStart(2, "0");
      const storagePath = `reportes/${anioPdf}/${mesPdf}/${reporteCompleto.id}.pdf`;

      await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fileBuffer, {
          contentType: "application/pdf",
          upsert: true,
        });
      console.log(`[cierreAutomatico] 📄 PDF respaldado en Storage: ${storagePath}`);
    }
  } catch (storageErr) {
    console.error("[cierreAutomatico] Error subiendo PDF a Storage:", storageErr.message);
  }

  // Guardar url final en reporte
  await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .update({ pdf_url: pdfUrl })
    .eq("id", reporteId);

  return pdfUrl;
}

export async function ejecutarCierreAutomatico12Horas(
  supabase,
  sesion,
  reporte,
  personal,
  jid,
  phoneClean,
  geminiKey
) {
  console.log(`[cierreAutomatico] ⏰ Iniciando cierre automático por cumplimiento de 12 horas para reporte ${reporte.id}...`);

  const causalCierre = "Cierre automático por cumplimiento del límite de 12 horas de jornada";
  const horaCierre = formatFechaHoraChile();

  // 1. Validar horómetro final: Si no se ingresó, marcar como no registrado / pendiente y reporte OBSERVADO
  const faltaHorometroFinal = reporte.horometro_final == null;
  const updateData = {
    estado_final: "Observado",
  };

  if (faltaHorometroFinal) {
    // Mantener horómetro inicial como referencia técnica para no dejar null en columnas obligatorias
    updateData.horometro_final = reporte.horometro_inicio;
  }

  // 2. Verificar cargas de combustible en vouchers_combustible
  const { data: vouchers } = await supabase
    .schema("maquinaria")
    .from("vouchers_combustible")
    .select("litros_cargados")
    .eq("id_reporte_diario", reporte.id);

  let totalLitros = 0;
  if (vouchers && vouchers.length > 0) {
    totalLitros = vouchers.reduce((acc, v) => acc + Number(v.litros_cargados || 0), 0);
  }
  updateData.petroleo_litros = totalLitros;

  // 3. Observaciones
  const obsPrev = reporte.observaciones ? `${reporte.observaciones} | ` : "";
  const detallePendiente = faltaHorometroFinal ? " [Horómetro final: No registrado / Pendiente]" : "";
  const combustibleDesc = totalLitros > 0 ? ` [Combustible cargado en el turno: ${totalLitros} L]` : " [Sin abastecimiento de combustible en la jornada]";
  updateData.observaciones = `${obsPrev}[ALERTA]: ${causalCierre} a las ${horaCierre}.${detallePendiente}${combustibleDesc}`;

  await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .update(updateData)
    .eq("id", reporte.id);

  // 4. Registrar eventos en eventos_jornada
  if (!vouchers || vouchers.length === 0) {
    await supabase
      .schema("maquinaria")
      .from("eventos_jornada")
      .insert({
        reporte_id: reporte.id,
        estado_hito: "Trabajando",
        hora_evento: new Date().toISOString(),
        nota_transcripcion: "⛽ Sin abastecimiento de combustible registrado durante la jornada."
      });
  }

  await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .insert({
      reporte_id: reporte.id,
      estado_hito: "Observado",
      hora_evento: new Date().toISOString(),
      nota_transcripcion: `⏰ ${causalCierre}. Efectuado a las ${horaCierre}.${detallePendiente} Reporte marcado como OBSERVADO para auditoría y revisión.`
    });

  // 5. Restablecer equipo a Disponible
  await supabase
    .schema("maquinaria")
    .from("equipos")
    .update({ estado_actual: "Disponible" })
    .eq("id", reporte.equipo_id);

  // 6. Eliminar sesión activa de WhatsApp
  if (sesion?.id) {
    await supabase
      .schema("maquinaria")
      .from("sesiones_whatsapp")
      .delete()
      .eq("id", sesion.id);
  }

  // 7. Compilar PDF y enviar notificación al operador
  try {
    const pdfUrl = await compilarYSubirPDF(supabase, reporte.id, personal);
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";

    const msgNotif =
      `⏰ *Aviso de Cierre Automático de Jornada*\n\n` +
      `Hola *${personal.nombre_completo}*, han transcurrido 12 horas desde el inicio de tu jornada laboral.\n\n` +
      `📌 *Causal:* _"${causalCierre}"_\n` +
      `⚠️ *Estado del Reporte:* OBSERVADO (información sujeta a revisión y validación).\n` +
      `${faltaHorometroFinal ? `• *Horómetro final:* No registrado por el operador (pendiente).\n` : ""}` +
      `• *Combustible:* ${totalLitros > 0 ? `${totalLitros} Litros acumulados` : "Sin abastecimiento registrado"}\n\n` +
      `📄 *Descarga tu Reporte Diario aquí:*\n` +
      `👉 ${baseUrl}${pdfUrl}\n\n` +
      `¡Buen descanso! 👷‍♂️`;

    await enviarMensajeWhatsApp(jid, phoneClean, msgNotif, false, geminiKey);
    await guardarMensajeChat(supabase, phoneClean, "model", msgNotif, "texto", reporte.id);
    console.log(`[cierreAutomatico] ✅ Cierre automático de 12 horas completado con éxito para ${personal.nombre_completo}`);
  } catch (errPdf) {
    console.error("[cierreAutomatico] Error al generar PDF o notificar cierre automático:", errPdf.message);
  }
}
