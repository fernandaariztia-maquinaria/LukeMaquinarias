import { createAdminClient } from "../../../lib/supabase-server";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Crea una fila en `actividades` a partir de una tarea de catálogo/EIMIPLANNER o una descripción libre manual.
async function crearActividad(supabase, {
  fecha,
  proyecto_id,
  especialidad_id,
  tarea_programada_id,
  descripcion,
  cantidad_planificada,
  unidad,
  origen_actividad = "eimiplanner",
  motivo_manual = null,
  actividad_especifica = null,
}) {
  const isUuid = tarea_programada_id && UUID_REGEX.test(String(tarea_programada_id));
  const isManual = origen_actividad === "manual";

  // Si no es UUID (ej. es el idtask de EIMIPLANNER), guardamos la descripción detallada
  const descFinal = isManual
    ? (motivo_manual ? `${descripcion} [Motivo: ${motivo_manual}]` : descripcion)
    : (actividad_especifica || descripcion || (tarea_programada_id ? `EIMIPLANNER Task #${tarea_programada_id}` : null));

  const { data, error } = await supabase
    .from("actividades")
    .insert({
      fecha,
      proyecto_id: proyecto_id || null,
      especialidad_id: especialidad_id || null,
      tarea_programada_id: isUuid ? tarea_programada_id : null,
      descripcion: descFinal || null,
      programada: !isManual,
      cantidad_planificada: cantidad_planificada || null,
      unidad: unidad || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[crearActividad] Error insertando en actividades:", error.message);
    throw error;
  }
  return data.id;
}

// Genera el texto legible y detallado para `actividad_especifica`
async function resolverTextoActividad(supabase, {
  tarea_programada_id,
  descripcion,
  actividad_especifica,
  origen_actividad,
  motivo_manual,
}) {
  if (actividad_especifica && actividad_especifica.trim() !== "") {
    return actividad_especifica.trim();
  }

  if (origen_actividad === "manual") {
    return `[MANUAL] ${descripcion || "Sin descripción"}${motivo_manual ? " · Motivo: " + motivo_manual : ""}`;
  }

  if (tarea_programada_id) {
    const isUuid = UUID_REGEX.test(String(tarea_programada_id));
    if (isUuid) {
      const { data } = await supabase
        .from("tareas_programadas")
        .select("nombre, codigo, descripcion")
        .eq("id", tarea_programada_id)
        .maybeSingle();
      if (data) {
        return `${data.codigo ? `[${data.codigo}] ` : ""}${data.nombre}${data.descripcion ? " · " + data.descripcion : ""}`;
      }
    }
    return descripcion || `[EIMIPLANNER] Task #${tarea_programada_id}`;
  }

  return descripcion || null;
}

export default async function handler(req, res) {
  const supabase = createAdminClient();

  // GET /api/pod/bloques?fecha=YYYY-MM-DD
  if (req.method === "GET") {
    const { fecha, proyecto_id } = req.query;
    const hoy = fecha || new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

    let query = supabase
      .from("planificacion_bloques_pod")
      .select(`
        id, fecha, hora_inicio, hora_fin, actividad_especifica,
        actividades ( id, tarea_programada_id, descripcion, programada, cantidad_planificada, unidad ),
        equipos ( id, codigo_interno, descripcion_equipo, plataforma_estado, plataforma_detalle, plataforma_especialidad_id, proyecto_actual_id ),
        especialidades ( id, nombre_oficial ),
        supervisor:personal!planificacion_bloques_pod_supervisor_id_fkey ( id, nombre_completo, whatsapp )
      `)
      .eq("fecha", hoy)
      .order("hora_inicio");

    // Filtrar por proyecto si se especifica
    if (proyecto_id) {
      query = query.eq("equipos.proyecto_actual_id", proyecto_id);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ success: false, error: error.message });
    // Si filtramos por proyecto, excluir bloques donde el equipo no pertenece al proyecto
    const filteredData = proyecto_id
      ? (data || []).filter(b => b.equipos?.proyecto_actual_id === proyecto_id)
      : (data || []);
    return res.status(200).json({ success: true, data: filteredData });
  }

  // POST /api/pod/bloques — crear bloque
  if (req.method === "POST") {
    const {
      fecha, equipo_id, hora_inicio, hora_fin, especialidad_id, supervisor_id,
      tarea_programada_id, descripcion, cantidad_planificada, unidad,
      origen_actividad = "eimiplanner", motivo_manual = null, actividad_especifica: actEspCliente = null
    } = req.body;

    if (!fecha || !equipo_id || !hora_inicio || !hora_fin || !especialidad_id || !supervisor_id) {
      return res.status(400).json({ success: false, error: "Faltan campos requeridos." });
    }

    let actividad_id = null;
    let actividad_especifica = null;
    if (tarea_programada_id || descripcion || actEspCliente) {
      const { data: equipo } = await supabase.from("equipos").select("proyecto_actual_id").eq("id", equipo_id).maybeSingle();
      
      actividad_especifica = await resolverTextoActividad(supabase, {
        tarea_programada_id, descripcion, actividad_especifica: actEspCliente, origen_actividad, motivo_manual
      });

      actividad_id = await crearActividad(supabase, {
        fecha,
        proyecto_id: equipo?.proyecto_actual_id,
        especialidad_id,
        tarea_programada_id,
        descripcion,
        cantidad_planificada,
        unidad,
        origen_actividad,
        motivo_manual,
        actividad_especifica,
      });
    }

    const { data, error } = await supabase
      .from("planificacion_bloques_pod")
      .insert({ fecha, equipo_id, hora_inicio, hora_fin, especialidad_id, supervisor_id, actividad_especifica, actividad_id })
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(201).json({ success: true, data });
  }

  // PATCH /api/pod/bloques — editar bloque
  if (req.method === "PATCH") {
    const {
      id, hora_inicio, hora_fin, especialidad_id, supervisor_id,
      tarea_programada_id, descripcion, cantidad_planificada, unidad,
      origen_actividad = "eimiplanner", motivo_manual = null, actividad_especifica: actEspCliente = null
    } = req.body;
    if (!id) return res.status(400).json({ success: false, error: "Falta id del bloque." });

    const updates = {};
    if (hora_inicio)      updates.hora_inicio = hora_inicio;
    if (hora_fin)         updates.hora_fin = hora_fin;
    if (especialidad_id)  updates.especialidad_id = especialidad_id;
    if (supervisor_id)    updates.supervisor_id = supervisor_id;

    if (tarea_programada_id !== undefined || descripcion !== undefined || actEspCliente !== undefined) {
      if (!tarea_programada_id && !descripcion && !actEspCliente) {
        updates.actividad_id = null;
        updates.actividad_especifica = null;
      } else {
        const { data: bloqueActual } = await supabase
          .from("planificacion_bloques_pod")
          .select("fecha, equipo_id, especialidad_id, equipos(proyecto_actual_id)")
          .eq("id", id)
          .maybeSingle();

        const actTexto = await resolverTextoActividad(supabase, {
          tarea_programada_id, descripcion, actividad_especifica: actEspCliente, origen_actividad, motivo_manual
        });

        updates.actividad_especifica = actTexto;
        updates.actividad_id = await crearActividad(supabase, {
          fecha: bloqueActual?.fecha,
          proyecto_id: bloqueActual?.equipos?.proyecto_actual_id,
          especialidad_id: especialidad_id || bloqueActual?.especialidad_id,
          tarea_programada_id,
          descripcion,
          cantidad_planificada,
          unidad,
          origen_actividad,
          motivo_manual,
          actividad_especifica: actTexto,
        });
      }
    }

    const { data, error } = await supabase
      .from("planificacion_bloques_pod")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, data });
  }

  // DELETE /api/pod/bloques?id=UUID
  if (req.method === "DELETE") {
    const { id } = req.query;
    if (!id) return res.status(400).json({ success: false, error: "Falta id." });

    const { error } = await supabase
      .from("planificacion_bloques_pod")
      .delete()
      .eq("id", id);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ success: false, error: "Método no permitido." });
}
