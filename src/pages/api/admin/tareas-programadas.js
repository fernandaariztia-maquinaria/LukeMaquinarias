import { createAdminClient } from "../../../lib/supabase-server";
import { syncEimiplannerActivities } from "../../../lib/eimiplanner";

/**
 * /api/admin/tareas-programadas
 * GET  ?especialidad_id=UUID  → lista tareas activas (todas si sin param)
 * GET  ?sync_eimiplanner=true → sincroniza tareas desde el Lookahead de EIMIPLANNER (Spence 418)
 * GET  ?incluir_inactivas=1   → incluye inactivas
 * POST ?action=sync_eimiplanner body: { projectId? } → sincroniza con EIMIPLANNER
 * POST { nombre, especialidad_id?, ... }  → crear tarea
 * POST ?bulk=true  body: { tareas: [...] } → carga masiva (CSV parseado)
 * PATCH { id, ...campos }     → editar tarea
 * DELETE ?id=UUID             → desactivar (soft-delete)
 */
export default async function handler(req, res) {
  const supabase = createAdminClient();

  // ── GET ──────────────────────────────────────────────────
  if (req.method === "GET") {
    const { especialidad_id, incluir_inactivas, sync_eimiplanner, projectId } = req.query;

    if (sync_eimiplanner === "true") {
      try {
        const syncRes = await syncEimiplannerActivities(supabase, projectId || "418");
        return res.status(200).json({ success: true, sync: syncRes });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    let query = supabase
      .from("tareas_programadas")
      .select("*, especialidades(id, nombre_oficial, color)")
      .order("codigo", { ascending: true })
      .order("nombre", { ascending: true });

    if (especialidad_id) query = query.eq("especialidad_id", especialidad_id);
    if (!incluir_inactivas) query = query.eq("activa", true);

    let { data, error } = await query;
    if (error) return res.status(500).json({ success: false, error: error.message });

    // Si la especialidad no tiene tareas registradas aún, sincronizar automáticamente con EIMIPLANNER
    if (especialidad_id && (!data || data.length === 0)) {
      try {
        await syncEimiplannerActivities(supabase, projectId || "418");
        const recheck = await supabase
          .from("tareas_programadas")
          .select("*, especialidades(id, nombre_oficial, color)")
          .eq("especialidad_id", especialidad_id)
          .eq("activa", true)
          .order("codigo", { ascending: true })
          .order("nombre", { ascending: true });
        if (recheck.data && recheck.data.length > 0) {
          data = recheck.data;
        }
      } catch (e) {
        console.warn("[tareas-programadas] Auto-sync EIMIPLANNER omitido:", e.message);
      }
    }

    return res.status(200).json({ success: true, data });
  }

  // ── POST ─────────────────────────────────────────────────
  if (req.method === "POST") {
    const { bulk, action } = req.query;

    // --- Sincronizar con EIMIPLANNER ---
    if (action === "sync_eimiplanner" || req.body?.action === "sync_eimiplanner") {
      try {
        const targetProj = req.body?.projectId || req.query.projectId || "418";
        const syncRes = await syncEimiplannerActivities(supabase, targetProj);
        return res.status(200).json({ success: true, sync: syncRes });
      } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
      }
    }

    // --- Carga masiva ---
    if (bulk === "true") {
      const { tareas } = req.body;
      if (!Array.isArray(tareas) || tareas.length === 0)
        return res.status(400).json({ success: false, error: "Se requiere un array 'tareas' no vacio." });

      const { data: especialidades } = await supabase.from("especialidades").select("id, nombre_oficial");
      const espMap = new Map((especialidades || []).map(e => [e.nombre_oficial.toLowerCase().trim(), e.id]));

      const rows = [];
      const errores = [];

      for (let i = 0; i < tareas.length; i++) {
        const t = tareas[i];
        if (!t.nombre?.trim()) { errores.push(`Fila ${i + 1}: 'nombre' requerido.`); continue; }

        let espId = t.especialidad_id;
        if (!espId && t.especialidad) {
          espId = espMap.get(t.especialidad.toLowerCase().trim());
          if (!espId) { errores.push(`Fila ${i + 1}: especialidad '${t.especialidad}' no encontrada.`); continue; }
        }

        rows.push({
          especialidad_id: espId || null,
          nombre: t.nombre.trim(),
          descripcion: t.descripcion?.trim() || null,
          codigo: t.codigo?.trim() || null,
          orden: parseInt(t.orden) || 0,
          activa: true,
          es_libre: false,
        });
      }

      if (rows.length === 0)
        return res.status(400).json({ success: false, error: "Sin filas validas.", detalles: errores });

      const { data, error } = await supabase.from("tareas_programadas").insert(rows).select();
      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(201).json({ success: true, insertadas: data.length, errores_omitidos: errores });
    }

    // --- Crear tarea individual ---
    const { nombre, especialidad_id, descripcion, codigo, orden } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ success: false, error: "'nombre' requerido." });

    const { data, error } = await supabase
      .from("tareas_programadas")
      .insert({ nombre: nombre.trim(), especialidad_id: especialidad_id || null, descripcion, codigo, orden: orden ?? 0 })
      .select().single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(201).json({ success: true, data });
  }

  // ── PATCH ────────────────────────────────────────────────
  if (req.method === "PATCH") {
    const { id, ...campos } = req.body;
    if (!id) return res.status(400).json({ success: false, error: "'id' requerido." });

    const permitidos = ["nombre", "descripcion", "codigo", "orden", "activa", "especialidad_id"];
    const update = { updated_at: new Date().toISOString() };
    for (const k of permitidos) { if (k in campos) update[k] = campos[k]; }

    const { data, error } = await supabase.from("tareas_programadas").update(update).eq("id", id).select().single();
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // ── DELETE ───────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "Query param 'id' requerido." });

    const { error } = await supabase.from("tareas_programadas")
      .update({ activa: false, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ success: false, error: "Metodo no permitido." });
}
