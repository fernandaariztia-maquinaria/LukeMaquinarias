import { createAdminClient } from "../../lib/supabase-server";

function formatRut(val) {
  if (!val) return "";
  const clean = val.replace(/[^0-9kK]/g, "").slice(0, 9);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  let formattedBody = "";
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formattedBody = body.charAt(i) + formattedBody;
    count++;
    if (count === 3 && i > 0) {
      formattedBody = "." + formattedBody;
      count = 0;
    }
  }
  return `${formattedBody}-${dv}`;
}

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    const { search, page, limit, proyecto_id } = req.query;

    let query = supabase
      .from("personal")
      .select("*, proyectos(nombre_proyecto, codigo_cc), especialidades(id, nombre_oficial, color)", { count: "exact" })
      .eq("activo", true);

    if (proyecto_id && proyecto_id !== "null" && proyecto_id !== "undefined") {
      query = query.eq("proyecto_actual_id", proyecto_id);
    }

    // Filtrar por búsqueda si se provee
    if (search && search.trim() !== "") {
      const searchStr = search.trim();
      const searchTerms = `%${searchStr}%`;
      const cleanSearch = searchStr.replace(/[^0-9kK]/g, "");
      let orFilter = `nombre_completo.ilike.${searchTerms},rut.ilike.${searchTerms},whatsapp.ilike.${searchTerms},rol.ilike.${searchTerms}`;
      
      if (cleanSearch.length >= 7 && cleanSearch.length <= 9) {
        const formatted = formatRut(cleanSearch);
        orFilter += `,rut.ilike.%${formatted}%`;
      }
      query = query.or(orFilter);
    }

    if (page || limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 15;
      const from = (pageNum - 1) * limitNum;
      const to = pageNum * limitNum - 1;

      const { data, error, count } = await query
        .order("nombre_completo")
        .range(from, to);

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data, count, page: pageNum, limit: limitNum });
    } else {
      // Retornar lista completa (compatibilidad)
      const { data, error, count } = await query
        .order("nombre_completo");

      if (error) return res.status(500).json({ success: false, error: error.message });
      return res.status(200).json({ success: true, data, count });
    }
  }

  if (req.method === "POST") {
    const { rut, nombre_completo, whatsapp, rol, turno_tipo, jornada_tipo, proyecto_actual_id, foto_url, especialidad_id, email } = req.body;
    if (!rut || !nombre_completo || !whatsapp || !rol) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos" });
    }

    const cleanProyectoId = proyecto_actual_id === "" ? null : proyecto_actual_id;
    const formattedRut = formatRut(rut);
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    // 1. Verificar si el RUT ya existe en la base de datos (activo o inactivo)
    const { data: existente } = await supabase
      .from("personal")
      .select("id, activo")
      .eq("rut", formattedRut)
      .maybeSingle();

    let resultado;
    if (existente) {
      // Si ya existe, lo reactivamos y actualizamos con la nueva información
      const { data: updateData, error: updateError } = await supabase
        .from("personal")
        .update({
          nombre_completo,
          whatsapp,
          rol,
          turno_tipo: turno_tipo || "14x14",
          jornada_tipo: jornada_tipo || "Dia",
          proyecto_actual_id: cleanProyectoId,
          especialidad_id: especialidad_id || null,
          foto_url: foto_url || null,
          email: cleanEmail || null,
          activo: true // Reactivar
        })
        .eq("id", existente.id)
        .select()
        .single();

      if (updateError) return res.status(500).json({ success: false, error: updateError.message });
      resultado = updateData;
    } else {
      // Si no existe, creamos el registro normalmente
      const { data: insertData, error: insertError } = await supabase
        .from("personal")
        .insert({
          rut: formattedRut,
          nombre_completo,
          whatsapp,
          rol,
          turno_tipo: turno_tipo || "14x14",
          jornada_tipo: jornada_tipo || "Dia",
          proyecto_actual_id: cleanProyectoId,
          especialidad_id: especialidad_id || null,
          foto_url: foto_url || null,
          email: cleanEmail || null,
          activo: true
        })
        .select()
        .single();

      if (insertError) return res.status(500).json({ success: false, error: insertError.message });
      resultado = insertData;
    }

    return res.status(existente ? 200 : 201).json({ success: true, data: resultado });
  }

  if (req.method === "PATCH") {
    const { id, ...updates } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Falta id" });

    if (updates.hasOwnProperty("proyecto_actual_id") && updates.proyecto_actual_id === "") {
      updates.proyecto_actual_id = null;
    }
    if (updates.hasOwnProperty("especialidad_id") && updates.especialidad_id === "") {
      updates.especialidad_id = null;
    }
    if (updates.hasOwnProperty("foto_url") && updates.foto_url === "") {
      updates.foto_url = null;
    }
    if (updates.hasOwnProperty("email")) {
      updates.email = updates.email && typeof updates.email === "string" && updates.email.trim() ? updates.email.trim().toLowerCase() : null;
    }
    if (updates.hasOwnProperty("rut") && updates.rut) {
      updates.rut = formatRut(updates.rut);
    }

    const { data, error } = await supabase
      .from("personal")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "Falta id del personal" });

    // 1. Buscar si este operador tiene algún reporte de jornada activo abierto hoy
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
    const { data: reportesActivos } = await supabase
      .from("reportes_diarios")
      .select("id, equipo_id")
      .eq("operador_id", id)
      .eq("fecha", hoy)
      .is("horometro_final", null)
      .is("km_final", null);

    if (reportesActivos && reportesActivos.length > 0) {
      for (const rpt of reportesActivos) {
        // A. Eliminar evidencias vinculadas al reporte
        await supabase
          .from("evidencias")
          .delete()
          .eq("reporte_id", rpt.id);

        // B. Eliminar eventos de jornada
        await supabase
          .from("eventos_jornada")
          .delete()
          .eq("reporte_id", rpt.id);

        // C. Eliminar sesiones de WhatsApp
        await supabase
          .from("sesiones_whatsapp")
          .delete()
          .eq("reporte_activo_id", rpt.id);

        // D. Eliminar el reporte diario
        await supabase
          .from("reportes_diarios")
          .delete()
          .eq("id", rpt.id);

        // E. Liberar el equipo asignándolo de vuelta a "Disponible"
        await supabase
          .from("equipos")
          .update({ estado_actual: "Disponible" })
          .eq("id", rpt.equipo_id);
      }
    }

    // 2. Desactivar al personal (borrado lógico)
    const { error } = await supabase
      .from("personal")
      .update({ activo: false })
      .eq("id", id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: "Personal desactivado y asignaciones activas liberadas" });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ success: false, message: "Método no permitido" });
}
