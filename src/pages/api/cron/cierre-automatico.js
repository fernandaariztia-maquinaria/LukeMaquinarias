/**
 * Endpoint Cron: Cierre automático de jornadas que superen las 12 horas (Requerimiento 2.4)
 * Ejecuta cada hora o según programación.
 */

import { createAdminClient } from "../../../lib/supabase-server";
import { ejecutarCierreAutomatico12Horas } from "../../../lib/bot/services/cierreAutomaticoService";
import { horasTranscurridas } from "../../../lib/timeUtils";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "GET") {
    res.setHeader("Allow", ["POST", "GET"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  // Opcional: Validar token secreto si está configurado
  const authHeader = req.headers["authorization"];
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Si no coincide y no es invocación local/admin
    if (process.env.NODE_ENV === "production" && req.query.secret !== cronSecret) {
      return res.status(401).json({ success: false, message: "No autorizado" });
    }
  }

  const supabase = createAdminClient();
  const geminiKey = process.env.GEMINI_API_KEY;

  try {
    // Buscar sesiones activas
    const { data: sesiones, error: errSesiones } = await supabase
      .schema("maquinaria")
      .from("sesiones_whatsapp")
      .select("*, reportes_diarios(*, personal(*))");

    if (errSesiones) {
      console.error("[cron/cierre-automatico] Error buscando sesiones:", errSesiones.message);
      return res.status(500).json({ success: false, error: errSesiones.message });
    }

    const cerrados = [];

    for (const sesion of sesiones || []) {
      const reporte = sesion.reportes_diarios;
      if (!reporte || !reporte.created_at) continue;

      const horas = horasTranscurridas(reporte.created_at);
      if (horas >= 12) {
        console.log(`[cron/cierre-automatico] Reporte ${reporte.id} tiene ${horas.toFixed(1)} horas. Cerrando automáticamente...`);
        const personal = reporte.personal;
        const phoneClean = sesion.whatsapp_remitente;
        const jid = `${phoneClean}@s.whatsapp.net`;

        if (personal) {
          await ejecutarCierreAutomatico12Horas(
            supabase,
            sesion,
            reporte,
            personal,
            jid,
            phoneClean,
            geminiKey
          );
          cerrados.push({
            reporte_id: reporte.id,
            operador: personal.nombre_completo,
            horas_turno: horas.toFixed(1)
          });
        } else {
          await supabase.schema("maquinaria").from("sesiones_whatsapp").delete().eq("id", sesion.id);
        }
      }
    }

    return res.status(200).json({
      success: true,
      mensaje: `Cierre automático completado. ${cerrados.length} jornadas cerradas.`,
      cerrados
    });
  } catch (err) {
    console.error("[cron/cierre-automatico] Error general:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}

