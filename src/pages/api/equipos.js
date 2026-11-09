import { createAdminClient } from "../../lib/supabase-server";
import { registrarCambioUbicacion } from "../../lib/historialUbicacionesHelper";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    const { search, page, limit, proyecto_id } = req.query;

    let query = supabase
      .from("equipos")
      .select("*, proyectos(nombre_proyecto, codigo_cc)", { count: "exact" });

    if (proyecto_id && proyecto_id !== "null" && proyecto_id !== "undefined") {
      query = query.eq("proyecto_actual_id", proyecto_id);
    }

    // Filtrar por búsqueda si se provee
    if (search && search.trim() !== "") {
      const searchTerms = `%${search.trim()}%`;
      query = query.or(`codigo_interno.ilike.${searchTerms},descripcion_equipo.ilike.${searchTerms},marca.ilike.${searchTerms},modelo.ilike.${searchTerms},patente.ilike.${searchTerms},categoria.ilike.${searchTerms},tipo.ilike.${searchTerms}`);
    }

    // Obtener reportes activos de hoy para asociar el operador en la respuesta
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" }); // YYYY-MM-DD
    const ahoraStr = new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Santiago" }); // HH:MM:SS

    const [{ data: reportesHoy }, { data: bloquesHoy }] = await Promise.all([
      supabase
        .from("reportes_diarios")
        .select(`
          *,
          operador:personal!reportes_diarios_operador_id_fkey(id, nombre_completo, foto_url, whatsapp),
          supervisor:personal!reportes_diarios_supervisor_id_fkey(id, nombre_completo, foto_url, whatsapp),
          rigger:personal!reportes_diarios_rigger_id_fkey(id, nombre_completo, foto_url, whatsapp)
        `)
        .eq("fecha", hoy),
      supabase
        .from("planificacion_bloques_pod")
        .select(`
          id, equipo_id, fecha, hora_inicio, hora_fin, actividad_especifica,
          especialidades ( id, nombre_oficial ),
          supervisor:personal!planificacion_bloques_pod_supervisor_id_fkey ( id, nombre_completo, foto_url, whatsapp ),
          operador_confirmador:personal!planificacion_bloques_pod_operador_confirmador_id_fkey ( id, nombre_completo, foto_url, whatsapp )
        `)
        .eq("fecha", hoy)
        .order("hora_inicio")
    ]);

    const reportesMap = new Map();
    if (reportesHoy && reportesHoy.length > 0) {
      for (const r of reportesHoy) {
        if (r.horometro_final === null && r.km_final === null) {
          reportesMap.set(r.equipo_id, r);
        }
      }
    }

    const podPorEquipo = new Map();
    if (bloquesHoy && bloquesHoy.length > 0) {
      for (const bloque of bloquesHoy) {
        if (!podPorEquipo.has(bloque.equipo_id)) {
          podPorEquipo.set(bloque.equipo_id, []);
        }
        podPorEquipo.get(bloque.equipo_id).push(bloque);
      }
    }

    const cmpHora = (t) => (t && t.length === 5 ? `${t}:00` : (t || "00:00:00"));

    const resolverPodActual = (bloques) => {
      if (!bloques || bloques.length === 0) return null;
      
      // 1. En curso ahora
      const enCurso = bloques.find(b => {
        const hIni = cmpHora(b.hora_inicio);
        const hFin = cmpHora(b.hora_fin);
        return ahoraStr >= hIni && ahoraStr <= hFin;
      });
      if (enCurso) {
        return { ...enCurso, estado_bloque: "EN_CURSO" };
      }

      // 2. Próximo en el día
      const proximo = bloques.find(b => cmpHora(b.hora_inicio) > ahoraStr);
      if (proximo) {
        return { ...proximo, estado_bloque: "PROXIMO" };
      }

      // 3. Finalizado (último del día)
      const ultimo = bloques[bloques.length - 1];
      return { ...ultimo, estado_bloque: "FINALIZADO" };
    };

    const mergeEquiposExtra = (list) => {
      if (!list) return [];
      return list.map(eq => {
        const bloques = podPorEquipo.get(eq.id) || [];
        return {
          ...eq,
          reporte_hoy: reportesMap.get(eq.id) || null,
          pod_actual: resolverPodActual(bloques),
          pod_bloques: bloques,
        };
      });
    };

    if (page || limit) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 15;
      const from = (pageNum - 1) * limitNum;
      const to = pageNum * limitNum - 1;

      const { data, error, count } = await query
        .order("codigo_interno")
        .range(from, to);

      if (error) return res.status(500).json({ success: false, error: error.message });
      const dataEnriquecida = mergeEquiposExtra(data);
      return res.status(200).json({ success: true, data: dataEnriquecida, count, page: pageNum, limit: limitNum });
    } else {
      // Retornar lista completa (compatibilidad)
      const { data, error, count } = await query
        .order("codigo_interno");

      if (error) return res.status(500).json({ success: false, error: error.message });
      const dataEnriquecida = mergeEquiposExtra(data);
      return res.status(200).json({ success: true, data: dataEnriquecida, count });
    }
  }

  if (req.method === "POST") {
    // Crear nuevo equipo
    const { 
      codigo_interno, 
      descripcion_equipo, 
      proveedor, 
      proyecto_actual_id, 
      pauta_preventiva_activa, 
      seguimiento_completo,
      clasificacion_comercial,
      arriendo_cliente,
      arriendo_fecha_inicio,
      arriendo_fecha_fin,
      capacidad_estanque_litros
    } = req.body;

    if (!codigo_interno || !descripcion_equipo) {
      return res.status(400).json({ success: false, message: "Faltan campos requeridos" });
    }

    const cleanProyectoId = proyecto_actual_id === "" ? null : proyecto_actual_id;

    const { data, error } = await supabase
      .from("equipos")
      .insert({
        codigo_interno,
        descripcion_equipo,
        proveedor: proveedor || "EIMISA",
        proyecto_actual_id: cleanProyectoId,
        pauta_preventiva_activa,
        seguimiento_completo: seguimiento_completo !== undefined ? seguimiento_completo : true,
        clasificacion_comercial: clasificacion_comercial || "OPERATIVO - EN USO",
        arriendo_cliente: arriendo_cliente || null,
        arriendo_fecha_inicio: arriendo_fecha_inicio || null,
        arriendo_fecha_fin: arriendo_fecha_fin || null,
        capacidad_estanque_litros: capacidad_estanque_litros ? parseInt(capacidad_estanque_litros) : null
      })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Registrar asignación inicial en historial si viene con proyecto
    if (data && cleanProyectoId) {
      try {
        let proyNom = "Obra Asignada";
        let proyCc = "";
        const { data: pFound } = await supabase.schema("maquinaria").from("proyectos").select("nombre_proyecto, codigo_cc").eq("id", cleanProyectoId).maybeSingle();
        if (pFound) {
          proyNom = pFound.nombre_proyecto;
          proyCc = pFound.codigo_cc || "";
        }
        await registrarCambioUbicacion(supabase, {
          equipo_id: data.id,
          proyecto_id: cleanProyectoId,
          proyecto_nombre: proyNom,
          proyecto_cc: proyCc,
          fecha_inicio: req.body.fecha_inicio_asignacion || new Date().toISOString().slice(0, 10),
          fecha_fin_estimada: req.body.fecha_fin_estimada || null,
          motivo_traslado: "Asignación inicial al registrar equipo",
        });
      } catch (e) {
        console.warn("[POST /api/equipos] Advertencia al registrar historial inicial:", e.message);
      }
    }

    return res.status(201).json({ success: true, data });
  }

  if (req.method === "PATCH") {
    // Actualizar equipo (pauta, estado, proyecto, capacidad estanque)
    const { id, historial_traslado, ...updates } = req.body;
    if (!id) return res.status(400).json({ success: false, message: "Falta id" });

    if (updates.hasOwnProperty("proyecto_actual_id") && updates.proyecto_actual_id === "") {
      updates.proyecto_actual_id = null;
    }

    if (updates.hasOwnProperty("capacidad_estanque_litros")) {
      updates.capacidad_estanque_litros = updates.capacidad_estanque_litros ? parseInt(updates.capacidad_estanque_litros) : null;
    }

    const { data, error } = await supabase
      .from("equipos")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });

    // Si viene registro explícito de traslado / cambio de obra en el payload
    if (historial_traslado) {
      try {
        await registrarCambioUbicacion(supabase, {
          equipo_id: id,
          ...historial_traslado,
        });
      } catch (e) {
        console.warn("[PATCH /api/equipos] Advertencia al registrar historial de traslado:", e.message);
      }
    }

    return res.status(200).json({ success: true, data });
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, message: "Falta id del equipo" });

    const { error } = await supabase
      .from("equipos")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: "Equipo eliminado exitosamente" });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH", "DELETE"]);
  return res.status(405).json({ success: false, message: "Método no permitido" });
}
