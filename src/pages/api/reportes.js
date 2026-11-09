import { createAdminClient } from "../../lib/supabase-server";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    const { fecha, equipo_id, operador_id, proyecto_id, page = 1, limit = 20 } = req.query;
    const pageSize = parseInt(limit) || 20;
    const from = (parseInt(page) - 1) * pageSize;

    let query = supabase
      .from("reportes_diarios")
      .select(
        `*, 
        equipos!inner(codigo_interno, descripcion_equipo, proyecto_actual_id),
        personal!operador_id(nombre_completo)`,
        { count: "exact" }
      )
      .order("fecha", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (fecha) query = query.eq("fecha", fecha);
    if (equipo_id) query = query.eq("equipo_id", equipo_id);
    if (operador_id) query = query.eq("operador_id", operador_id);
    if (proyecto_id && proyecto_id !== "null" && proyecto_id !== "undefined") {
      if (proyecto_id.includes(",")) {
        query = query.in("equipos.proyecto_actual_id", proyecto_id.split(",").map(p => p.trim()).filter(Boolean));
      } else {
        query = query.eq("equipos.proyecto_actual_id", proyecto_id);
      }
    }

    const { data, error, count } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    return res.status(200).json({ success: true, data, total: count });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "Falta id del reporte" });

    // 1. Eliminar evidencias vinculadas al reporte
    await supabase
      .from("evidencias")
      .delete()
      .eq("reporte_id", id);

    // 2. Eliminar eventos de jornada del reporte
    await supabase
      .from("eventos_jornada")
      .delete()
      .eq("reporte_id", id);

    // 3. Eliminar sesiones de WhatsApp que tengan este reporte activo
    await supabase
      .from("sesiones_whatsapp")
      .delete()
      .eq("reporte_activo_id", id);

    // 4. Finalmente, eliminar el reporte diario
    const { error } = await supabase
      .from("reportes_diarios")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: "Reporte eliminado exitosamente" });
  }

  res.setHeader("Allow", ["GET", "DELETE"]);
  return res.status(405).json({ success: false, message: "Método no permitido" });
}
