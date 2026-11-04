import { sincronizarTelemetria } from "../../../lib/skynav";

/**
 * Endpoint de sincronización diaria automática
 * Diseñado para ser llamado por Vercel Cron, GitHub Actions, curl o tareas programadas.
 * 
 * Por defecto sincroniza la información del día de ayer.
 */
export default async function handler(req, res) {
  // Verificación de método
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  // Verificación de seguridad opcional (si se envía x-admin-secret o Bearer token)
  const authHeader = req.headers["authorization"] || req.headers["x-admin-secret"];
  const expectedSecret = process.env.ADMIN_SECRET || process.env.CRON_SECRET;

  if (expectedSecret && authHeader) {
    const token = authHeader.replace("Bearer ", "").trim();
    if (token !== expectedSecret) {
      return res.status(401).json({ error: "No autorizado" });
    }
  }

  try {
    // Sincronizar el día de ayer
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const fechaAyer = ayer.toISOString().slice(0, 10);

    const { desde = fechaAyer, hasta = fechaAyer } = req.query || req.body || {};

    console.log(`[CRON Telemetria] Iniciando sincronización para ${desde} a ${hasta}...`);

    const resultado = await sincronizarTelemetria({
      desde,
      hasta,
      iniciadoPor: "CRON_4AM",
    });

    return res.status(200).json({
      success: true,
      mensaje: `Sincronización automática de ${desde} a ${hasta} completada.`,
      resultado,
    });
  } catch (err) {
    console.error("[CRON Telemetria] Error:", err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
}
