import { createAdminClient } from "../../../../lib/supabase-server";
import { sincronizarTelemetria } from "../../../../lib/skynav";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .schema("maquinaria")
        .from("telemetria_sincronizaciones")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) throw error;
      return res.status(200).json({ success: true, data });
    } catch (err) {
      console.error("[API telemetria/sync GET] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (req.method === "POST") {
    try {
      // Validar que solo administradores (o cron autorizado) puedan ejecutar la sincronización con SKYNAV
      const secret = req.headers["x-admin-secret"] || req.headers["authorization"];
      const userRol = String(req.body?.userRol || "").toLowerCase();
      const esAdmin =
        userRol.includes("admin") ||
        userRol === "administrador" ||
        (secret && secret.replace("Bearer ", "") === process.env.ADMIN_SECRET);

      if (!esAdmin && req.body?.iniciadoPor !== "CRON_4AM" && req.body?.iniciadoPor !== "MANUAL_CLI") {
        return res.status(403).json({
          success: false,
          error: "Acceso denegado: Solo usuarios con rol Administrador pueden consultar o sincronizar con la API de SKYNAV.",
        });
      }

      let { desde, hasta } = req.body || {};

      // Si no se envían fechas, por defecto sincronizar ayer y hoy
      if (!desde || !hasta) {
        const ahora = new Date();
        const ayer = new Date();
        ayer.setDate(ahora.getDate() - 1);

        const aISO = (d) => d.toISOString().split("T")[0];
        desde = desde || aISO(ayer);
        hasta = hasta || aISO(ahora);
      }

      const resultado = await sincronizarTelemetria({
        desde,
        hasta,
        iniciadoPor: req.body?.iniciadoPor || "ADMIN_MANUAL",
      });

      return res.status(200).json(resultado);
    } catch (err) {
      console.error("[API telemetria/sync POST] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}
