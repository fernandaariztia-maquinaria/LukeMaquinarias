import { enviarMensajeWhatsApp, guardarMensajeChat, cargarHistorialGemini } from "../services/messageService";
import { procesarAudioOperador, procesarAudioVehiculo, procesarTextoVehiculo, procesarMensajeConContexto } from "../../gemini";

export async function handleCheckinFlow(ctx, res) {
  const { supabase, personal, phoneClean, jid, message, audio, geminiKey } = ctx;
  const sesion = ctx.sesion;

  // Obtener tipo_seguimiento del equipo desde el reporte activo
  const { data: reporteCheckin } = await supabase
    .from("reportes_diarios")
    .select("*, equipos(*)")
    .eq("id", sesion.reporte_activo_id)
    .maybeSingle();

  const tipoSeguimiento = reporteCheckin?.equipos?.tipo_seguimiento || 'estandar';
  const seguimientoCompleto = reporteCheckin?.equipos?.seguimiento_completo !== false;
  const nombreEquipo = reporteCheckin?.equipos?.descripcion_equipo || "el equipo";
  const codigoEquipo = reporteCheckin?.equipos?.codigo_interno || "";

  // Aceptar audio O texto — si no viene ninguno, recordar
  const tieneEntrada = !!audio || !!(message && message.trim().length > 1);
  if (!tieneEntrada) {
    const ejemploTexto = tipoSeguimiento === 'vehiculo'
      ? `_"Odómetro 84.320, voy al sector norte"_`
      : `_"Horómetro 2300, equipo operativo"_`;
    await enviarMensajeWhatsApp(jid, phoneClean,
      `⏳ *${personal.nombre_completo}*, tu check-in para *${nombreEquipo}* (${codigoEquipo}) está pendiente.\n\n💬 Envía un *audio* o *texto* para registrarlo.\nEjemplo: ${ejemploTexto}`,
      !!audio,
      geminiKey
    );
    return res.status(200).json({ success: true, action: "ESPERANDO_ENTRADA" });
  }

  let resultado;

  // ── FLUJO VEHÍCULO (camioneta, furgón, minibús) ──────────────────
  if (tipoSeguimiento === 'vehiculo') {
    console.log("[checkinHandler] 🚗 Procesando check-in VEHÍCULO");

    if (audio) {
      resultado = await procesarAudioVehiculo(
        audio.data, audio.mimeType,
        {
          estado_sesion: "CHECKIN",
          km_inicio: null,
          pauta_del_dia: reporteCheckin?.equipos?.pauta_preventiva_activa,
          codigo_equipo: reporteCheckin?.equipos?.codigo_interno,
          descripcion_equipo: reporteCheckin?.equipos?.descripcion_equipo
        }
      );
    } else {
      resultado = await procesarTextoVehiculo(
        message.trim(),
        {
          estado_sesion: "CHECKIN",
          km_inicio: null,
          pauta_del_dia: reporteCheckin?.equipos?.pauta_preventiva_activa,
          codigo_equipo: reporteCheckin?.equipos?.codigo_interno,
          descripcion_equipo: reporteCheckin?.equipos?.descripcion_equipo
        }
      );
    }

    console.log("[checkinHandler] Gemini vehiculo checkin:", JSON.stringify(resultado));

    const kmInicial = resultado.km_inicial || reporteCheckin?.km_inicial || null;
    const destinoRuta = resultado.destino_ruta || reporteCheckin?.destino_ruta || null;
    const confirmacionBot = resultado.mensaje_conversacional_bot
      || `✅ *Vehículo registrado.*${kmInicial ? `\n🔢 Odómetro inicial: *${kmInicial.toLocaleString("es-CL")} km*` : ""}${destinoRuta ? `\n📍 Destino: *${destinoRuta}*` : ""}\n\nEnvía un audio o texto al finalizar para registrar el odómetro final.`;

    const tipoEntrada = audio ? "audio" : "texto";
    const userMsgContenido = audio ? "Audio check-in vehículo." : message.trim();
    const msgUsuario = await guardarMensajeChat(supabase, phoneClean, "user", userMsgContenido, tipoEntrada, sesion.reporte_activo_id);

    if (audio && resultado.detalles_texto && msgUsuario?.id) {
      await supabase
        .from("mensajes_chat")
        .update({ contenido: resultado.detalles_texto })
        .eq("id", msgUsuario.id);
    }

    // Guardar valores acumulados en la base de datos
    const updateCheckinVeh = { km_inicial: kmInicial, destino_ruta: destinoRuta };
    if (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined) {
      updateCheckinVeh.combustible_inicio_porcentaje = resultado.combustible_nivel_porcentaje;
      updateCheckinVeh.combustible_nivel_porcentaje = resultado.combustible_nivel_porcentaje;
    }
    await supabase.from("reportes_diarios")
      .update(updateCheckinVeh)
      .eq("id", sesion.reporte_activo_id);

    const eqUpdateVeh = {};
    if (kmInicial) eqUpdateVeh.ultimo_odometro = kmInicial;
    if (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined) {
      eqUpdateVeh.combustible_nivel_porcentaje = resultado.combustible_nivel_porcentaje;
    }
    if (reporteCheckin?.equipos?.pauta_preventiva_activa && resultado.pauta_confirmada !== false) {
      eqUpdateVeh.pauta_preventiva_activa = null;
    }
    if (reporteCheckin?.equipos?.capacidad_estanque_litros === null && resultado.capacidad_estanque_litros) {
      eqUpdateVeh.capacidad_estanque_litros = resultado.capacidad_estanque_litros;
    }
    if (Object.keys(eqUpdateVeh).length > 0) {
      await supabase.from("equipos")
        .update(eqUpdateVeh)
        .eq("id", reporteCheckin.equipo_id);
    }

    // Validar pauta de seguridad si existe
    if (reporteCheckin?.equipos?.pauta_preventiva_activa && resultado.pauta_confirmada === false) {
      const confirmacionPauta = resultado.mensaje_conversacional_bot
        || `⚠️ *Atención*: Para registrar el inicio de su turno, debe confirmar primero si realizó la pauta de seguridad de hoy:\n\n_"${reporteCheckin.equipos.pauta_preventiva_activa}"_\n\nPor favor confirme que la realizó por texto o audio.`;

      await guardarMensajeChat(supabase, phoneClean, "model", confirmacionPauta, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, confirmacionPauta, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_CONFIRMACION_PAUTA" });
    }

    await supabase.from("eventos_jornada").insert({
      reporte_id: sesion.reporte_activo_id,
      estado_hito: "Disponible",
      hora_evento: new Date().toISOString(),
      nota_transcripcion: `CHECK-IN VEHÍCULO [${tipoEntrada}]: ${resultado.detalles_texto || "Inicio de uso"} | Odómetro: ${kmInicial} | Destino: ${destinoRuta}`,
    });

    await supabase.from("sesiones_whatsapp")
      .update({ estado_espera: "SESION_ABIERTA_INTERMEDIA", updated_at: new Date().toISOString() })
      .eq("id", sesion.id);

    let msgFinalVeh = confirmacionBot;

    await enviarMensajeWhatsApp(jid, phoneClean, msgFinalVeh, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "CHECKIN_VEHICULO_REGISTRADO" });
  }

  // ── FLUJO ESTÁNDAR y CAMIÓN (horómetro, acepta audio O texto) ───
  const { data: especialidades } = await supabase.from("especialidades").select("*");
  const tipoEntradaLog = audio ? "audio" : "texto";
  const transcripcionEntrada = audio
    ? (tipoSeguimiento === 'camion' ? `Audio check-in: horómetro inicial del camión.` : `Audio check-in: horómetro inicial del operador.`)
    : message.trim();

  const msgUsuario = await guardarMensajeChat(supabase, phoneClean, "user", transcripcionEntrada, tipoEntradaLog, sesion.reporte_activo_id);
  const historial = await cargarHistorialGemini(supabase, phoneClean, 10, sesion.reporte_activo_id);

  const contextoCheckin = {
    estado_sesion: "CHECKIN",
    seguimiento_completo: seguimientoCompleto,
    tipo_seguimiento: tipoSeguimiento,
    pauta_del_dia: reporteCheckin?.equipos?.pauta_preventiva_activa,
    codigo_equipo: reporteCheckin?.equipos?.codigo_interno,
    descripcion_equipo: reporteCheckin?.equipos?.descripcion_equipo
  };

  if (audio) {
    if (historial.length > 0) {
      const historialConAudio = [
        ...historial.slice(0, -1),
        {
          role: "user",
          parts: [
            { text: transcripcionEntrada },
            { inlineData: { mimeType: audio.mimeType || "audio/ogg", data: audio.data } }
          ]
        }
      ];
      resultado = await procesarMensajeConContexto(historialConAudio, especialidades || [], contextoCheckin);
    } else {
      resultado = await procesarAudioOperador(audio.data, audio.mimeType, especialidades || [], contextoCheckin);
    }
  } else {
    const historialConTexto = [
      ...historial.slice(0, -1),
      { role: "user", parts: [{ text: transcripcionEntrada }] }
    ];
    resultado = await procesarMensajeConContexto(
      historialConTexto.length > 0 ? historialConTexto : [{ role: "user", parts: [{ text: transcripcionEntrada }] }],
      especialidades || [],
      contextoCheckin
    );
  }

  console.log(`[checkinHandler] Gemini checkin [${tipoEntradaLog}]:`, JSON.stringify(resultado));

  // Actualizar chat log con la transcripción real si es audio
  if (audio && resultado.detalles_texto && msgUsuario?.id) {
    await supabase
      .from("mensajes_chat")
      .update({ contenido: resultado.detalles_texto })
      .eq("id", msgUsuario.id);
  }

  // Guardar el horómetro inicial acumulado
  const horometroInicio = resultado.horometro_inicial || reporteCheckin?.horometro_inicio || 0;
  const updateCheckinStandard = { horometro_inicio: horometroInicio };
  if (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined) {
    updateCheckinStandard.combustible_inicio_porcentaje = resultado.combustible_nivel_porcentaje;
    updateCheckinStandard.combustible_nivel_porcentaje = resultado.combustible_nivel_porcentaje;
  }
  if (resultado.combustible_inicio_valor !== null && resultado.combustible_inicio_valor !== undefined) {
    updateCheckinStandard.combustible_inicio_valor = resultado.combustible_inicio_valor;
  }
  if (resultado.combustible_inicio_unidad) {
    updateCheckinStandard.combustible_inicio_unidad = resultado.combustible_inicio_unidad;
  }
  if (resultado.labores_descripcion) {
    updateCheckinStandard.labores_resumen = resultado.labores_descripcion;
  }
  await supabase.from("reportes_diarios")
    .update(updateCheckinStandard)
    .eq("id", sesion.reporte_activo_id);

  const eqUpdateStandard = {};
  if (horometroInicio) eqUpdateStandard.ultimo_horometro = horometroInicio;
  if (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined) {
    eqUpdateStandard.combustible_nivel_porcentaje = resultado.combustible_nivel_porcentaje;
  }
  if (reporteCheckin?.equipos?.pauta_preventiva_activa && resultado.pauta_confirmada !== false) {
    eqUpdateStandard.pauta_preventiva_activa = null;
  }
  if (reporteCheckin?.equipos?.capacidad_estanque_litros === null && resultado.capacidad_estanque_litros) {
    eqUpdateStandard.capacidad_estanque_litros = resultado.capacidad_estanque_litros;
  }
  if (Object.keys(eqUpdateStandard).length > 0) {
    await supabase.from("equipos")
      .update(eqUpdateStandard)
      .eq("id", reporteCheckin.equipo_id);
  }

  // Validar pauta de seguridad si existe
  if (reporteCheckin?.equipos?.pauta_preventiva_activa && resultado.pauta_confirmada === false) {
    const confirmacionBotEst = resultado.mensaje_conversacional_bot
      || `⚠️ *Atención*: Para iniciar su turno, debe confirmar si ha cumplido con la pauta de seguridad de hoy:\n\n_"${reporteCheckin.equipos.pauta_preventiva_activa}"_\n\nPor favor, confirme que la realizó por texto o audio.`;

    await guardarMensajeChat(supabase, phoneClean, "model", confirmacionBotEst, "texto", sesion.reporte_activo_id);
    await enviarMensajeWhatsApp(jid, phoneClean, confirmacionBotEst, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "ESPERANDO_CONFIRMACION_PAUTA" });
  }

  let msgFinalEst = resultado.mensaje_conversacional_bot
    || `✅ *Check-in registrado.*\n⏱ Horómetro inicial: *${horometroInicio.toLocaleString("es-CL")} hrs*\n\nDurante la jornada envía audios o mensajes cuando cambies de actividad.\nAl cerrar di: *"Cierre de jornada, horómetro final XXXX"*`;

  await guardarMensajeChat(supabase, phoneClean, "model", msgFinalEst, "texto", sesion.reporte_activo_id);

  // Aseguramos que guarde el horómetro correcto
  await supabase.from("reportes_diarios")
    .update(updateCheckinStandard)
    .eq("id", sesion.reporte_activo_id);

  const estadoInicialDinamico = (resultado.tipo_evento && resultado.tipo_evento !== "CHECKIN")
    ? resultado.tipo_evento : "Disponible";

  await supabase.from("eventos_jornada").insert({
    reporte_id: sesion.reporte_activo_id,
    estado_hito: estadoInicialDinamico,
    especialidad_id: resultado.especialidad_id || null,
    hora_evento: new Date().toISOString(),
    nota_transcripcion: `CHECK-IN [${tipoEntradaLog}]: ${resultado.detalles_texto || transcripcionEntrada}`,
  });

  await supabase.from("sesiones_whatsapp")
    .update({ estado_espera: "SESION_ABIERTA_INTERMEDIA", updated_at: new Date().toISOString() })
    .eq("id", sesion.id);

  await enviarMensajeWhatsApp(jid, phoneClean, msgFinalEst, !!audio, geminiKey);
  return res.status(200).json({ success: true, action: "CHECKIN_REGISTRADO" });
}
