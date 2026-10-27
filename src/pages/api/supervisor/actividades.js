import { createAdminClient } from "../../../lib/supabase-server";
import { syncEimiplannerActivities } from "../../../lib/eimiplanner";

/**
 * API: /api/supervisor/actividades
 * GET: Obtiene las tareas programadas (EIMIPLANNER 3WL) filtradas por especialidad del supervisor,
 *      los datos del bloque POD y las actividades ya registradas.
 * POST: Guarda las actividades ejecutadas por el supervisor (Carga/Descarga, Especialidades, Tareas No Programadas).
 */
export default async function handler(req, res) {
  const supabase = createAdminClient();

  // ── GET ─────────────────────────────────────────────────────────────
  if (req.method === "GET") {
    const { bloque_id, equipo_id, supervisor_id, especialidad_id } = req.query;

    try {
      let bloque = null;
      let equipo = null;
      let supervisor = null;
      let targetEspecialidadId = especialidad_id;

      // 1. Si viene bloque_id, consultar información del bloque
      if (bloque_id) {
        const { data: bData } = await supabase
          .from("planificacion_bloques_pod")
          .select(`
            id, fecha, hora_inicio, hora_fin, actividad_especifica, especialidad_id,
            equipos ( id, codigo_interno, descripcion_equipo, patente, proyecto_actual_id ),
            especialidades ( id, nombre_oficial, color ),
            supervisor:personal!planificacion_bloques_pod_supervisor_id_fkey ( id, nombre_completo, whatsapp, especialidad_id, especialidades_adicionales ),
            operador:personal!planificacion_bloques_pod_operador_confirmador_id_fkey ( id, nombre_completo, whatsapp )
          `)
          .eq("id", bloque_id)
          .maybeSingle();

        if (bData) {
          bloque = bData;
          equipo = bData.equipos;
          supervisor = bData.supervisor;
          if (!targetEspecialidadId) {
            targetEspecialidadId = bData.especialidad_id || supervisor?.especialidad_id;
          }
        }
      }

      // Si no hay bloque pero viene equipo_id
      if (!equipo && equipo_id) {
        const { data: eqData } = await supabase
          .from("equipos")
          .select("id, codigo_interno, descripcion_equipo, patente, proyecto_actual_id")
          .eq("id", equipo_id)
          .maybeSingle();
        equipo = eqData;
      }

      // Si viene supervisor_id
      if (!supervisor && supervisor_id) {
        const { data: supData } = await supabase
          .from("personal")
          .select("id, nombre_completo, whatsapp, especialidad_id, especialidades_adicionales, especialidades(id, nombre_oficial)")
          .eq("id", supervisor_id)
          .maybeSingle();
        supervisor = supData;
        if (!targetEspecialidadId && supData?.especialidad_id) {
          targetEspecialidadId = supData.especialidad_id;
        }
      }

      // 2. Obtener tareas programadas de EIMIPLANNER
      let queryTareas = supabase
        .from("tareas_programadas")
        .select("id, codigo, nombre, descripcion, especialidad_id, especialidades(nombre_oficial)")
        .eq("activa", true)
        .order("codigo", { ascending: true })
        .order("nombre", { ascending: true });

      if (targetEspecialidadId) {
        queryTareas = queryTareas.eq("especialidad_id", targetEspecialidadId);
      }

      let { data: tareas, error: errTareas } = await queryTareas;

      // Si no hay tareas para la especialidad, auto-sincronizar con EIMIPLANNER
      if (!errTareas && (!tareas || tareas.length === 0)) {
        try {
          await syncEimiplannerActivities(supabase, "418");
          const recheck = await supabase
            .from("tareas_programadas")
            .select("id, codigo, nombre, descripcion, especialidad_id, especialidades(nombre_oficial)")
            .eq("activa", true)
            .order("codigo", { ascending: true })
            .order("nombre", { ascending: true });
          tareas = recheck.data || [];
        } catch (e) {
          console.warn("[supervisor/actividades] Sync EIMIPLANNER omitido:", e.message);
        }
      }

      // 3. Obtener actividades ya registradas para este bloque si existe
      let actividadesRegistradas = [];
      if (bloque_id) {
        const { data: actData } = await supabase
          .from("actividades")
          .select("*, tarea_programada:tareas_programadas(id, codigo, nombre)")
          .eq("bloque_id", bloque_id)
          .order("created_at", { ascending: true });
        actividadesRegistradas = actData || [];
      }

      const responseData = {
        bloque,
        equipo,
        supervisor,
        especialidad_id: targetEspecialidadId,
        tareas_eimi: tareas || [],
        tareas_eimiplanner: tareas || [],
        actividades_guardadas: actividadesRegistradas,
        actividades_registradas: actividadesRegistradas,
      };

      return res.status(200).json({
        success: true,
        data: responseData,
        ...responseData
      });
    } catch (err) {
      console.error("[api/supervisor/actividades] Error GET:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST ────────────────────────────────────────────────────────────
  if (req.method === "POST") {
    const {
      bloque_id,
      equipo_id,
      supervisor_id,
      fecha,
      actividades, // Array de tareas seleccionadas o creadas
    } = req.body;

    if (!Array.isArray(actividades) || actividades.length === 0) {
      return res.status(400).json({ success: false, error: "Debe enviar al menos una actividad." });
    }

    const fechaFinal = fecha || new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

    try {
      // 1. Obtener proyecto del equipo si existe
      let proyectoId = null;
      if (equipo_id) {
        const { data: eq } = await supabase
          .from("equipos")
          .select("proyecto_actual_id")
          .eq("id", equipo_id)
          .maybeSingle();
        proyectoId = eq?.proyecto_actual_id || null;
      }

      // 2. Buscar reporte diario activo para asociar evento de jornada
      let reporteId = null;
      if (equipo_id) {
        const { data: rep } = await supabase
          .from("reportes_diarios")
          .select("id")
          .eq("equipo_id", equipo_id)
          .eq("fecha", fechaFinal)
          .maybeSingle();
        reporteId = rep?.id || null;
      }

      const rowsInsert = [];

      for (const act of actividades) {
        const isProgramada = act.programada !== false;
        rowsInsert.push({
          fecha: fechaFinal,
          proyecto_id: proyectoId,
          equipo_id: equipo_id || null,
          supervisor_id: supervisor_id || null,
          bloque_id: bloque_id || null,
          especialidad_id: act.especialidad_id || null,
          tarea_programada_id: act.tarea_programada_id || null,
          id_3wl: act.id_3wl || null,
          descripcion: act.descripcion || act.nombre || "Labor en faena",
          categoria_disciplina: act.categoria_disciplina || "General",
          subactividad: act.subactividad || null,
          cantidad_ejecutada: act.cantidad_ejecutada ? parseFloat(act.cantidad_ejecutada) : null,
          unidad: act.unidad || "Ton",
          izajes: act.izajes ? parseInt(act.izajes, 10) : 0,
          horometro_horas: act.horometro_horas ? parseFloat(act.horometro_horas) : null,
          programada: isProgramada,
        });
      }

      const { data: inserted, error: errInsert } = await supabase
        .from("actividades")
        .insert(rowsInsert)
        .select();

      if (errInsert) throw errInsert;

      // 3. Si hay reporte diario, crear un hito en eventos_jornada resumiendo las actividades
      if (reporteId && inserted && inserted.length > 0) {
        const resumenTextos = inserted.map(a => 
          `[${a.categoria_disciplina || "Tarea"}${a.id_3wl ? ` 3WL:${a.id_3wl}` : ""}] ${a.descripcion} (${a.cantidad_ejecutada || 0} ${a.unidad || ""}, Horómetro: ${a.horometro_horas || 0} hrs, Izajes: ${a.izajes || 0})`
        ).join(" | ");

        await supabase.from("eventos_jornada").insert({
          reporte_id: reporteId,
          estado_hito: "Trabajando",
          especialidad_id: inserted[0].especialidad_id || null,
          actividad_id: inserted[0].id,
          hora_evento: new Date().toISOString(),
          nota_transcripcion: `📋 Tareas reportadas por supervisor: ${resumenTextos}`
        });
      }

      // 4. Si hay bloque POD, actualizar actividad_especifica con el resumen
      if (bloque_id && inserted && inserted.length > 0) {
        const resumenBloque = inserted.map(a => a.descripcion).slice(0, 3).join(", ");
        await supabase
          .from("planificacion_bloques_pod")
          .update({
            actividad_id: inserted[0].id,
            actividad_especifica: resumenBloque,
            actividad_respondida_at: new Date().toISOString()
          })
          .eq("id", bloque_id);
      }

      return res.status(201).json({
        success: true,
        message: "Actividades guardadas exitosamente",
        data: inserted,
      });

    } catch (err) {
      console.error("[api/supervisor/actividades] Error POST:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  res.setHeader("Allow", ["GET", "POST"]);
  return res.status(405).json({ success: false, error: "Método no permitido" });
}
