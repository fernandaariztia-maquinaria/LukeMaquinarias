import { createAdminClient } from "../../../lib/supabase-server";
import { crearConsultaPendiente } from "../../../lib/bot/services/podConsultaService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const { 
    equipoId, 
    operadorId, 
    valorLectura, 
    latitud, 
    longitud, 
    pautaConfirmada, 
    destinoRuta, 
    combustibleNivel, 
    capacidadEstanque,
    estadoEquipo
  } = req.body;

  if (!equipoId || !operadorId || valorLectura === undefined) {
    return res.status(400).json({ success: false, message: "Parámetros insuficientes (equipoId, operadorId y valorLectura son requeridos)" });
  }

  try {
    // 1. Obtener datos del operador para su WhatsApp
    const { data: operador, error: errorOp } = await supabase
      .from("personal")
      .select("id, nombre_completo, whatsapp, proyecto_actual_id")
      .eq("id", operadorId)
      .maybeSingle();

    if (errorOp || !operador) {
      return res.status(404).json({ success: false, message: "Operador no encontrado" });
    }

    if (!operador.whatsapp) {
      return res.status(400).json({ success: false, message: "El operador no tiene configurado un número de WhatsApp" });
    }

    const phoneClean = operador.whatsapp.replace(/[^0-9]/g, "");

    // 2. Obtener tipo de seguimiento del equipo
    const { data: equipo, error: errorEq } = await supabase
      .from("equipos")
      .select("id, codigo_interno, descripcion_equipo, tipo_seguimiento, seguimiento_completo, proyecto_actual_id, proyectos(nombre_proyecto)")
      .eq("id", equipoId)
      .maybeSingle();

    if (errorEq || !equipo) {
      return res.status(404).json({ success: false, message: "Equipo no encontrado" });
    }

    // Validar proyectos cruzados
    if (operador.proyecto_actual_id && equipo.proyecto_actual_id && operador.proyecto_actual_id !== equipo.proyecto_actual_id) {
      let obraPersonalNombre = "Sin asignar";
      const { data: opObra } = await supabase
        .from("proyectos")
        .select("nombre_proyecto")
        .eq("id", operador.proyecto_actual_id)
        .maybeSingle();
      if (opObra) obraPersonalNombre = opObra.nombre_proyecto;

      const obraEquipoNombre = equipo.proyectos ? equipo.proyectos.nombre_proyecto : "Sin asignar";

      return res.status(400).json({
        success: false,
        message: `No puedes iniciar jornada en el equipo ${equipo.descripcion_equipo} (${equipo.codigo_interno}) porque pertenece al proyecto "${obraEquipoNombre}", y tú estás asignado al proyecto "${obraPersonalNombre}". Por favor, solicita a tu supervisor actualizar tu asignación.`
      });
    }

    const esVehiculo = equipo.tipo_seguimiento === "vehiculo";
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

    // 2.5 Verificar si el operador ya tiene una jornada activa en otro equipo hoy
    const { data: reporteActivoOtro } = await supabase
      .from("reportes_diarios")
      .select("id, equipo_id, equipos(codigo_interno, descripcion_equipo)")
      .eq("operador_id", operadorId)
      .eq("fecha", hoy)
      .is("horometro_final", null)
      .is("km_final", null)
      .neq("equipo_id", equipoId)
      .maybeSingle();

    if (reporteActivoOtro) {
      return res.status(400).json({
        success: false,
        message: `Ya tienes una jornada activa en el equipo ${reporteActivoOtro.equipos?.descripcion_equipo || ""} (${reporteActivoOtro.equipos?.codigo_interno || ""}). Por favor, cierra esa jornada primero en WhatsApp diciendo: "Cierre de jornada, horómetro final XXXX"`
      });
    }

    // 3. Crear o actualizar reporte diario
    const { data: reporteExistente } = await supabase
      .from("reportes_diarios")
      .select("id")
      .eq("equipo_id", equipoId)
      .eq("operador_id", operadorId)
      .eq("fecha", hoy)
      .maybeSingle();

    let reporteId;
    const requiereSeguimiento = equipo.seguimiento_completo !== false;
    const updateData = {};
    if (requiereSeguimiento) {
      if (esVehiculo) {
        updateData.km_inicial = valorLectura;
        updateData.horometro_inicio = 0;
        if (destinoRuta) {
          updateData.destino_ruta = destinoRuta;
        }
      } else {
        updateData.horometro_inicio = valorLectura;
      }
    } else {
      updateData.horometro_inicio = 0;
    }

    if (combustibleNivel !== undefined && combustibleNivel !== null) {
      updateData.combustible_inicio_porcentaje = combustibleNivel;
      updateData.combustible_nivel_porcentaje = combustibleNivel;
    }

    if (reporteExistente) {
      reporteId = reporteExistente.id;
      const { error: errUpdate } = await supabase
        .from("reportes_diarios")
        .update(updateData)
        .eq("id", reporteId);

      if (errUpdate) throw errUpdate;
    } else {
      const { data: nuevoReporte, error: errInsert } = await supabase
        .from("reportes_diarios")
        .insert({
          equipo_id: equipoId,
          operador_id: operadorId,
          fecha: hoy,
          ...updateData
        })
        .select()
        .single();

      if (errInsert) throw errInsert;
      reporteId = nuevoReporte.id;
    }

    // 4. Actualizar estado y ubicación en la tabla equipos
    const eqUpdate = {
      latitud_actual: latitud || null,
      longitud_actual: longitud || null,
      ultima_ubicacion_fecha: new Date().toISOString()
    };

    if (pautaConfirmada) {
      eqUpdate.pauta_preventiva_activa = null;
    }

    if (capacidadEstanque !== undefined && capacidadEstanque !== null) {
      eqUpdate.capacidad_estanque_litros = capacidadEstanque;
    }

    if (combustibleNivel !== undefined && combustibleNivel !== null) {
      eqUpdate.combustible_nivel_porcentaje = combustibleNivel;
    }

    if (esVehiculo) {
      eqUpdate.ultimo_odometro = valorLectura;
    } else {
      eqUpdate.ultimo_horometro = valorLectura;
    }

    if (estadoEquipo) {
      eqUpdate.estado_actual = estadoEquipo;
    }

    const { error: errEqUpdate } = await supabase
      .from("equipos")
      .update(eqUpdate)
      .eq("id", equipoId);

    if (errEqUpdate) throw errEqUpdate;

    // 5. Crear o actualizar sesión de WhatsApp
    const { error: errSesion } = await supabase
      .from("sesiones_whatsapp")
      .upsert({
        whatsapp_remitente: phoneClean,
        reporte_activo_id: reporteId,
        estado_espera: "SESION_ABIERTA_INTERMEDIA",
        updated_at: new Date().toISOString()
      }, { onConflict: "whatsapp_remitente" });

    if (errSesion) throw errSesion;

    // 6. Insertar evento de check-in en la línea de tiempo (eventos_jornada)
    const notaUbicacion = latitud && longitud 
      ? `Lat ${latitud.toFixed(5)}, Lng ${longitud.toFixed(5)}` 
      : "Sin GPS";
    const hitoInicial = estadoEquipo || "Disponible";

    const { data: eventoCreado, error: errHito } = await supabase
      .from("eventos_jornada")
      .insert({
        reporte_id: reporteId,
        estado_hito: hitoInicial,
        hora_evento: new Date().toISOString(),
        nota_transcripcion: `📍 Check-in Web [${hitoInicial}]: ${esVehiculo ? "Odómetro" : "Horómetro"} inicial de ${valorLectura.toLocaleString("es-CL")} ${esVehiculo ? "km" : "hrs"} registrado. Ubicación: ${notaUbicacion}.`
      })
      .select()
      .single();

    if (errHito) throw errHito;

    // 7. Alerta proactiva al supervisor si el equipo fue planificado en la Sala POD hoy
    try {
      const { data: bloqueHoy } = await supabase
        .from("planificacion_bloques_pod")
        .select(`
          id, especialidad_id,
          supervisor:personal!planificacion_bloques_pod_supervisor_id_fkey(id, nombre_completo, whatsapp)
        `)
        .eq("equipo_id", equipoId)
        .eq("fecha", hoy)
        .order("hora_inicio", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (bloqueHoy?.supervisor?.whatsapp) {
        await crearConsultaPendiente(supabase, {
          telefonoSupervisor: bloqueHoy.supervisor.whatsapp,
          planificacionId: bloqueHoy.id,
          especialidadId: bloqueHoy.especialidad_id,
          eventoOperadorId: eventoCreado?.id || null,
          geminiKey: process.env.GEMINI_API_KEY,
        });
      }
    } catch (errPodAlert) {
      console.warn("[checkin-web] Alerta supervisor POD omitida:", errPodAlert.message);
    }

    return res.status(200).json({ success: true, reporteId });

  } catch (err) {
    console.error("Error en API checkin-web:", err.message || err);
    return res.status(500).json({ success: false, message: "Error interno del servidor", error: err.message });
  }
}
