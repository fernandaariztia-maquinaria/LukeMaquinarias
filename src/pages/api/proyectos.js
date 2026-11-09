import { createAdminClient } from "../../lib/supabase-server";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    const { search, page, limit, ids } = req.query;

    let query = supabase
      .from("proyectos")
      .select("*", { count: "exact" });

    if (ids && ids.trim() !== "") {
      query = query.in("id", ids.split(",").map(x => x.trim()).filter(Boolean));
    }

    // Filtrar por búsqueda si se provee
    if (search && search.trim() !== "") {
      const searchTerms = `%${search.trim()}%`;
      query = query.or(`nombre_proyecto.ilike.${searchTerms},codigo_cc.ilike.${searchTerms},ubicacion.ilike.${searchTerms}`);
    }

    if (page || limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 15;
      const from = (pageNum - 1) * limitNum;
      const to = pageNum * limitNum - 1;

      const { data, error, count } = await query
        .order("nombre_proyecto")
        .range(from, to);

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data, count, page: pageNum, limit: limitNum });
    } else {
      // Retornar lista completa (compatibilidad)
      const { data, error, count } = await query
        .order("nombre_proyecto");

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data, count });
    }
  }

  if (req.method === "POST") {
    const { nombre_proyecto, codigo_cc, ubicacion } = req.body;
    if (!nombre_proyecto || !codigo_cc) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos" });
    }

  const { data, error } = await supabase
      .from("proyectos")
      .insert({ nombre_proyecto, codigo_cc, ubicacion })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(201).json({ success: true, data });
  }

  if (req.method === "PATCH") {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Falta id" });

    const { data, error } = await supabase
      .from("proyectos")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "Falta id del proyecto" });

    const { error } = await supabase
      .from("proyectos")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: "Proyecto eliminado exitosamente" });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ success: false, message: "Método no permitido" });
}
