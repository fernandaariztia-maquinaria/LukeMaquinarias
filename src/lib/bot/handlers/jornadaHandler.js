import { enviarMensajeWhatsApp, guardarMensajeChat, cargarHistorialGemini, notificarSupervisor } from "../services/messageService";
import { uploadImagenStorage } from "../services/storageService";
import { handleCierreFlow } from "./cierreHandler";
import { 
  analizarIntencionHistorica, 
  analizarImagenEvidencia, 
  procesarAudioOperador, 
  procesarAudioVehiculo, 
  procesarTextoVehiculo, 
  procesarMensajeConContexto
} from "../../gemini";
import { formatEquipoLabel } from "../../equipoLabel";
import { crearConsultaPendiente } from "../services/podConsultaService";

export async function handleJornadaFlow(ctx, res) {
  const { supabase, personal, phoneClean, jid, message, audio, image, location, geminiKey } = ctx;
  const sesion = ctx.sesion;

  // ================================================================
  // 1. PROCESAR GEOLOCALIZACIÓN (GPS) SI VIENE EN EL BODY
  // ================================================================
  if (location && sesion && sesion.reporte_activo_id) {
    const { latitude, longitude } = location;

    const { data: reporte } = await supabase
      .from("reportes_diarios")
      .select("equipo_id, equipos(codigo_interno, descripcion_equipo, patente)")
      .eq("id", sesion.reporte_activo_id)
      .maybeSingle();

    if (reporte?.equipo_id) {
      const { error: errEq } = await supabase
        .from("equipos")
        .update({
          latitud_actual: latitude,
          longitud_actual: longitude,
          ultima_ubicacion_fecha: new Date().toISOString()
        })
        .eq("id", reporte.equipo_id);

      if (errEq) {
        console.error("[jornadaHandler] Error actualizando coordenadas del equipo:", errEq.message);
      } else {
        console.log(`[jornadaHandler] Coordenadas del equipo ${reporte.equipos?.codigo_interno} actualizadas: ${latitude}, ${longitude}`);
      }

      await supabase
        .from("eventos_jornada")
        .insert({
          reporte_id: sesion.reporte_activo_id,
          estado_hito: "Disponible",
          hora_evento: new Date().toISOString(),
          nota_transcripcion: `📍 Actualización de ubicación GPS: Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`
        });

      await enviarMensajeWhatsApp(jid, phoneClean,
        `📍 *Ubicación Registrada*\n\nCoordenadas de *${reporte.equipos?.descripcion_equipo || "Equipo"}* (${formatEquipoLabel(reporte.equipos)}) actualizadas con éxito.\n(Lat: ${latitude.toFixed(5)}, Lng: ${longitude.toFixed(5)})`,
        !!audio,
        geminiKey
      );
    }

    return res.status(200).json({ success: true, action: "UBICACION_REGISTRADA" });
  }

  // ================================================================
  // 2. CASO SIN SESIÓN → INICIAR CHECK-IN O CONSULTA HISTÓRICA
  // ================================================================
  if (!sesion) {
    const msgUpper = (message || "").trim().toUpperCase();

    // Si NO es un comando de inicio (REPORTE:), evaluar intenciones históricas
    if (!msgUpper.startsWith("REPORTE:")) {
      const entradaParaAnalizar = audio || (message || "Audio entrante");
      const intencion = await analizarIntencionHistorica(entradaParaAnalizar);

      if (intencion.es_consulta_pdf && intencion.fecha_solicitada) {
        const { data: reporteHisto } = await supabase
          .from("reportes_diarios")
          .select("pdf_url, fecha")
          .eq("operador_id", personal.id)
          .eq("fecha", intencion.fecha_solicitada)
          .maybeSingle();

        if (reporteHisto?.pdf_url) {
          const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";
          await enviarMensajeWhatsApp(jid, phoneClean, 
            `📄 *Reporte Histórico Encontrado*\n\nHola ${personal.nombre_completo}, aquí tienes el PDF de tu jornada del día *${intencion.fecha_solicitada}*:\n👉 ${baseUrl}${reporteHisto.pdf_url}`,
            !!audio,
            geminiKey
          );
        } else {
          await enviarMensajeWhatsApp(jid, phoneClean, 
            `🤷‍♂️ No encontré ningún reporte registrado para ti en la fecha *${intencion.fecha_solicitada}*. Verifica el día e intenta nuevamente.`,
            !!audio,
            geminiKey
          );
        }
        return res.status(200).json({ success: true, action: "CONSULTA_HISTORICA_PROCESADA" });
      }

      await enviarMensajeWhatsApp(jid, phoneClean,
        `👋 Hola *${personal.nombre_completo}*.\n\nPara iniciar tu jornada, escanea el código QR del equipo o escribe:\n\n*REPORTE:CODIGO_EQUIPO*\n\nEjemplo: REPORTE:EIMI00387`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true });
    }

    const codigoEquipo = msgUpper.replace("REPORTE:", "").trim();

    // Buscar equipo: código interno exacto -> patente exacta -> partes compuestas -> sufijo de patente
    let equipo = null;
    let equiposAmbiguos = null;

    // 1. Coincidencia exacta por codigo_interno
    const { data: porCodigo } = await supabase
      .from("equipos")
      .select("*, proyectos(*)")
      .ilike("codigo_interno", codigoEquipo)
      .maybeSingle();
    equipo = porCodigo;

    // 2. Coincidencia exacta por patente
    if (!equipo) {
      const { data: porPatente } = await supabase
        .from("equipos")
        .select("*, proyectos(*)")
        .ilike("patente", codigoEquipo)
        .maybeSingle();
      equipo = porPatente;
    }

    // 3. Si viene con formato compuesto (ej: "RTEX-0006 - LPPX-47"), buscar por sus subpartes
    if (!equipo) {
      const subpartes = codigoEquipo.split(/\s*[-–—]\s{1,}|\s{1,}[-–—]\s*|\s*[/|]\s*/).map(p => p.trim()).filter(Boolean);
      for (const p of subpartes) {
        if (p.length < 2) continue;
        const { data: pEq } = await supabase
          .from("equipos")
          .select("*, proyectos(*)")
          .or(`codigo_interno.ilike.${p},patente.ilike.${p}`)
          .maybeSingle();
        if (pEq) {
          equipo = pEq;
          break;
        }
      }
    }

    // 4. Búsqueda por contención (cuando en la BD dice "RTEX-0007 - LPPX-46" y el operador ingresa "RTEX-0007" o "LPPX-46")
    if (!equipo) {
      const { data: porContencion } = await supabase
        .from("equipos")
        .select("*, proyectos(*)")
        .or(`codigo_interno.ilike.%${codigoEquipo}%,patente.ilike.%${codigoEquipo}%`);

      if (porContencion && porContencion.length === 1) {
        equipo = porContencion[0];
      } else if (porContencion && porContencion.length > 1) {
        equiposAmbiguos = porContencion;
      }
    }

    // 5. Sufijo de patente (2 a 4 caracteres)
    if (!equipo && !equiposAmbiguos && codigoEquipo.length >= 2 && codigoEquipo.length <= 4) {
      const { data: porSufijo } = await supabase
        .from("equipos")
        .select("*, proyectos(*)")
        .ilike("patente", `%${codigoEquipo}`);
      if (porSufijo && porSufijo.length === 1) {
        equipo = porSufijo[0];
      } else if (porSufijo && porSufijo.length > 1) {
        equiposAmbiguos = porSufijo;
      }
    }

    if (equiposAmbiguos) {
      const listado = equiposAmbiguos.map(e => `• ${formatEquipoLabel(e)} — ${e.descripcion_equipo}`).join("\n");
      await enviarMensajeWhatsApp(jid, phoneClean,
        `🤔 Encontré más de un equipo con esa patente:\n\n${listado}\n\nPor favor responde con el *código interno* completo del que corresponde.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, action: "PATENTE_AMBIGUA" });
    }

    if (!equipo) {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `❌ No encontré el equipo *${codigoEquipo}*.\nVerifica el código o la patente e intenta nuevamente.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true });
    }

    if (equipo.seguimiento_completo === false) {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `ℹ️ Estimado(a) *${personal.nombre_completo}*.\n\nEl equipo *${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)}) no requiere asignación de operador ni seguimiento de jornada.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, message: "Equipo sin seguimiento completo" });
    }

    if (personal.proyecto_actual_id !== equipo.proyecto_actual_id) {
      let obraPersonalNombre = "Sin asignar";
      if (personal.proyecto_actual_id) {
        const { data: opObra } = await supabase
          .from("proyectos")
          .select("nombre_proyecto")
          .eq("id", personal.proyecto_actual_id)
          .maybeSingle();
        if (opObra) obraPersonalNombre = opObra.nombre_proyecto;
      }
      const obraEquipoNombre = equipo.proyectos ? equipo.proyectos.nombre_proyecto : "Sin asignar";

      await enviarMensajeWhatsApp(jid, phoneClean,
        `❌ *Proyecto No Coincide*\n\nHola *${personal.nombre_completo}*, no puedes registrar tu jornada en el equipo *${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)}) porque pertenece al proyecto *"${obraEquipoNombre}"*, y tú estás asignado al proyecto *"${obraPersonalNombre}"*.\n\nPor favor, contacta a tu supervisor para regularizar tu asignación.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, message: "Proyecto no coincide" });
    }

    // Verificar si ya hay reporte hoy
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
    const { data: reporteExistente } = await supabase
      .from("reportes_diarios")
      .select("id, horometro_inicio, km_inicial")
      .eq("equipo_id", equipo.id)
      .eq("operador_id", personal.id)
      .eq("fecha", hoy)
      .maybeSingle();

    if (reporteExistente) {
      const { data: sesionExistente } = await supabase
        .from("sesiones_whatsapp")
        .select("id, estado_espera")
        .eq("whatsapp_remitente", phoneClean)
        .maybeSingle();

      if (sesionExistente?.estado_espera === "ESPERANDO_CHECKIN_AUDIO") {
        const { data: eqData } = await supabase
          .from("equipos")
          .select("descripcion_equipo, codigo_interno, tipo_seguimiento")
          .eq("id", equipo.id)
          .maybeSingle();
        const esVehiculo = eqData?.tipo_seguimiento === 'vehiculo';
        const ejemploAudio = esVehiculo
          ? `_"Odómetro 84.320, voy al sector norte"_`
          : `_"Horómetro inicial dos mil trescientos, equipo operativo"_`;
        await enviarMensajeWhatsApp(jid, phoneClean,
          `⏳ *${personal.nombre_completo}*, tienes un check-in pendiente para *${eqData?.descripcion_equipo || equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)}).\n\n🎤 Aún no he recibido tu audio de inicio. Por favor envíalo ahora.\nEjemplo: ${ejemploAudio}`,
          !!audio,
          geminiKey
        );
        return res.status(200).json({ success: true, action: "RECORDATORIO_AUDIO_CHECKIN" });
      }

      await supabase.from("sesiones_whatsapp").upsert({
        whatsapp_remitente: phoneClean,
        reporte_activo_id: reporteExistente.id,
        estado_espera: "SESION_ABIERTA_INTERMEDIA",
        updated_at: new Date().toISOString(),
      });

      const lecturaReg = reporteExistente.horometro_inicio || reporteExistente.km_inicial || 0;
      if (lecturaReg > 0) {
        const sufijoMedida = equipo.tipo_seguimiento === 'vehiculo' ? 'km' : 'hrs';
        await enviarMensajeWhatsApp(jid, phoneClean,
          `👷‍♂️ *¡Jornada Activa!* 🚜\n\nHola *${personal.nombre_completo}*, confirmamos el inicio de tu jornada en *${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)}) con un valor inicial de *${lecturaReg.toLocaleString("es-CL")} ${sufijoMedida}*.\n\nDurante el día, puedes registrar tus hitos (ej. "En colación", "Trabajando", "Detenido por falla") enviando audios de voz o textos.`,
          !!audio,
          geminiKey
        );
        return res.status(200).json({ success: true, action: "SESION_INICIADA_WEB" });
      }

      await enviarMensajeWhatsApp(jid, phoneClean,
        `✅ *${personal.nombre_completo}*, ya tienes un reporte abierto para *${equipo.descripcion_equipo}* hoy.\nPuedes continuar enviando audios de actualización o envía el cierre de jornada.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, action: "SESION_REABIERTA" });
    }

    const { data: nuevoReporte, error: errReporte } = await supabase
      .from("reportes_diarios")
      .insert({
        equipo_id: equipo.id,
        operador_id: personal.id,
        fecha: hoy,
        horometro_inicio: 0,
      })
      .select()
      .single();

    if (errReporte) {
      console.error("[jornadaHandler] Error creando reporte:", errReporte.message);
      await enviarMensajeWhatsApp(jid, phoneClean, `❌ Error creando el reporte. Intenta nuevamente.`, !!audio, geminiKey);
      return res.status(500).json({ success: false });
    }

    await supabase.from("sesiones_whatsapp").insert({
      whatsapp_remitente: phoneClean,
      reporte_activo_id: nuevoReporte.id,
      estado_espera: "ESPERANDO_CHECKIN_AUDIO",
      updated_at: new Date().toISOString(),
    });

    let mensajePauta = "";
    if (equipo.pauta_preventiva_activa) {
      mensajePauta = `\n\n📋 *Instrucción del Jefe de Área para hoy:*\n_${equipo.pauta_preventiva_activa}_`;
    }

    const tipoSeguimientoEquipo = equipo.tipo_seguimiento || 'estandar';
    let mensajeInstruccion;
    if (tipoSeguimientoEquipo === 'vehiculo') {
      mensajeInstruccion = `🚗 *${personal.nombre_completo}*, vehículo registrado:\n*${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)})${equipo.proyectos ? `\n📍 Proyecto: ${equipo.proyectos.nombre_proyecto}` : ""}${mensajePauta}\n\n💬 Indica el *kilometraje (odómetro)* y tu destino por *audio o texto*.\n_Ejemplo: "Odómetro 84.320, voy al sector norte"_`;
    } else if (tipoSeguimientoEquipo === 'camion') {
      mensajeInstruccion = `🚛 *${personal.nombre_completo}*, inicio de turno para:\n*${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)})${equipo.proyectos ? `\n📍 Proyecto: ${equipo.proyectos.nombre_proyecto}` : ""}${mensajePauta}\n\n💬 Indica tu *horómetro inicial* y el estado del camión por *audio o texto*.\n_Ejemplo: "Horómetro 15.200, camión operativo"_`;
    } else {
      mensajeInstruccion = `🚜 *${personal.nombre_completo}*, tu inicio de turno para:\n*${equipo.descripcion_equipo}* (${formatEquipoLabel(equipo)})${equipo.proyectos ? `\n📍 Proyecto: ${equipo.proyectos.nombre_proyecto}` : ""}${mensajePauta}\n\n💬 Indica tu *horómetro inicial* y el estado del equipo por *audio o texto*.\n_Ejemplo: "Horómetro 2.300, equipo operativo, trabajando con Piping"_`;
    }

    await enviarMensajeWhatsApp(jid, phoneClean, mensajeInstruccion, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "SESION_CREADA" });
  }

  // ================================================================
  // 3. CASO CON SESIÓN INTERMEDIA (Hitos ordinarios y solicitudes de Cierre)
  // ================================================================
  const msgUpperC = (message || "").trim().toUpperCase();

  // Guard: Evitar pisar la sesión con un código escaneado diferente
  if (msgUpperC.startsWith("REPORTE:")) {
    const codigoScan = msgUpperC.replace("REPORTE:", "").trim();
    const { data: reporteActivo } = await supabase
      .from("reportes_diarios")
      .select("*, equipos(descripcion_equipo, codigo_interno, patente)")
      .eq("id", sesion.reporte_activo_id)
      .maybeSingle();
    const equipoActivo = reporteActivo?.equipos;

    const patenteActiva = (equipoActivo?.patente || "").toUpperCase();
    const codigoActivo = (equipoActivo?.codigo_interno || "").toUpperCase();

    // Subpartes del código escaneado (ej: si viene "RTEX-0007 - LPPX-46")
    const subpartesScan = codigoScan.split(/\s*[-–—]\s{1,}|\s{1,}[-–—]\s*|\s*[/|]\s*/).map(p => p.trim()).filter(Boolean);

    const esMismoEquipo = equipoActivo && (
      codigoActivo === codigoScan ||
      codigoActivo.includes(codigoScan) ||
      codigoScan.includes(codigoActivo) ||
      (patenteActiva && (
        patenteActiva === codigoScan ||
        patenteActiva.endsWith(codigoScan) ||
        codigoScan.includes(patenteActiva)
      )) ||
      subpartesScan.some(p => p === codigoActivo || (patenteActiva && p === patenteActiva))
    );

    if (esMismoEquipo) {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `👷‍♂️ *¡Jornada Activa!* 🚜\n\nHola *${personal.nombre_completo}*, confirmamos que tu jornada para *${equipoActivo.descripcion_equipo}* (${formatEquipoLabel(equipoActivo)}) se encuentra activa y registrada con éxito.\n\nDurante el día, puedes registrar tus hitos (ej. "En colación", "Trabajando", "Detenido por falla") enviando audios de voz o textos.`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, action: "SESION_YA_ACTIVA_MISMO_EQUIPO" });
    } else {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `⚠️ *${personal.nombre_completo}*, ya tienes una jornada activa para:\n*${equipoActivo?.descripcion_equipo || "equipo"}* (${equipoActivo ? formatEquipoLabel(equipoActivo) : ""})\n\nPara cambiar de equipo, primero cierra tu jornada actual diciendo:\n_"Cierre de jornada, horómetro final XXXX"_`,
        !!audio,
        geminiKey
      );
      return res.status(200).json({ success: true, action: "SESION_YA_ACTIVA_OTRO_EQUIPO" });
    }
  }

  // --- Manejo de IMAGEN (Evidencia) ---
  if (image && !audio) {
    const { data: equipoData } = await supabase
      .from("equipos")
      .select("descripcion_equipo, codigo_interno")
      .eq("id", sesion.reportes_diarios?.equipo_id)
      .maybeSingle();

    const storagePath = await uploadImagenStorage(supabase, image.data, image.mimeType);

    let analisis = "Imagen registrada como evidencia del operador. No se pudo generar el análisis automático en este momento.";
    let esCritico = false;

    try {
      const resIA = await analizarImagenEvidencia(
        image.data,
        image.mimeType,
        equipoData?.descripcion_equipo,
        message
      );
      if (resIA) {
        analisis = resIA.analisis || analisis;
        esCritico = !!resIA.esCritico;
      }
    } catch (errIA) {
      console.error("[jornadaHandler] Error al analizar imagen con Gemini Vision:", errIA.message, errIA.stack);
    }

    await supabase.from("evidencias").insert({
      reporte_id: sesion.reporte_activo_id,
      local_storage_path: storagePath || "upload-error",
      descripcion_analisis_ia: analisis,
    });

    if (esCritico) {
      await supabase.from("eventos_jornada").insert({
        reporte_id: sesion.reporte_activo_id,
        estado_hito: "Detenido por Falla",
        hora_evento: new Date().toISOString(),
        nota_transcripcion: `FALLA DETECTADA POR IA: ${analisis.slice(0, 200)}`,
      });

      const { data: reporte } = await supabase
        .from("reportes_diarios")
        .select("supervisor_id, equipos(codigo_interno, descripcion_equipo, patente)")
        .eq("id", sesion.reporte_activo_id)
        .maybeSingle();

      if (reporte?.supervisor_id) {
        await notificarSupervisor(
          supabase,
          reporte.supervisor_id,
          `🔴 Equipo ${formatEquipoLabel(reporte.equipos)} - ${reporte.equipos?.descripcion_equipo}\nOperador: ${personal.nombre_completo}\n\nAnálisis IA: ${analisis}`
        );
      }

      await enviarMensajeWhatsApp(jid, phoneClean,
        `🚨 *ALERTA CRÍTICA DETECTADA*\n\nAnálisis IA:\n_${analisis}_\n\nSe ha notificado automáticamente a tu supervisor. Equipo marcado como *Detenido por Falla*.`,
        false,
        geminiKey
      );
    } else {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `📷 Evidencia registrada.\n\n🔍 *Análisis IA:*\n_${analisis}_`,
        false,
        geminiKey
      );
    }

    return res.status(200).json({ success: true, action: "EVIDENCIA_REGISTRADA" });
  }

  // --- Manejo de AUDIO y TEXTO ---
  if (!audio && !message) {
    return res.status(200).json({ success: true });
  }

  const { data: especialidades } = await supabase.from("especialidades").select("*");
  const { data: reporteActual } = await supabase
    .from("reportes_diarios")
    .select("equipo_id, horometro_inicio, km_inicial, horometro_final, km_final, petroleo_litros, horometro_carga_combustible, combustible_final_porcentaje, supervisor_id, created_at, equipos(id, codigo_interno, descripcion_equipo, pauta_preventiva_activa, seguimiento_completo, tipo_seguimiento, usa_plataforma, patente)")
    .eq("id", sesion.reporte_activo_id)
    .maybeSingle();

  const seguimientoCompleto = reporteActual?.equipos?.seguimiento_completo !== false;
  const tipoSeguimiento = reporteActual?.equipos?.tipo_seguimiento || 'estandar';

  const contenidoUsuario = audio ? "Audio de terreno del operador" : (message || "");
  const tipoMsgC = audio ? "audio" : "texto";

  const msgUsuarioC = await guardarMensajeChat(supabase, phoneClean, "user", contenidoUsuario, tipoMsgC, sesion.reporte_activo_id);
  const historialC = await cargarHistorialGemini(supabase, phoneClean, 10, sesion.reporte_activo_id);

  let resultado;
  const estadoSesionEnv = sesion.estado_espera === "ESPERANDO_CHECKOUT_AUDIO" ? "CIERRE" : "INTERMEDIO";

  if (tipoSeguimiento === 'vehiculo') {
    if (audio) {
      resultado = await procesarAudioVehiculo(
        audio.data, audio.mimeType,
        {
          estado_sesion: estadoSesionEnv,
          km_inicio: reporteActual?.km_inicial,
          codigo_equipo: reporteActual?.equipos?.codigo_interno,
          descripcion_equipo: reporteActual?.equipos?.descripcion_equipo
        }
      );
    } else {
      resultado = await procesarTextoVehiculo(
        message.trim(),
        {
          estado_sesion: estadoSesionEnv,
          km_inicio: reporteActual?.km_inicial,
          codigo_equipo: reporteActual?.equipos?.codigo_interno,
          descripcion_equipo: reporteActual?.equipos?.descripcion_equipo
        }
      );
    }
  } else {
    if (audio) {
      resultado = await procesarAudioOperador(
        audio.data, audio.mimeType, especialidades || [],
        {
          estado_sesion: estadoSesionEnv,
          horometro_inicio: reporteActual?.horometro_inicio,
          seguimiento_completo: seguimientoCompleto,
          codigo_equipo: reporteActual?.equipos?.codigo_interno,
          descripcion_equipo: reporteActual?.equipos?.descripcion_equipo
        }
      );
    } else {
      resultado = await procesarMensajeConContexto(
        historialC.length > 0 ? historialC : [{ role: "user", parts: [{ text: message.trim() }] }],
        especialidades || [],
        {
          estado_sesion: estadoSesionEnv,
          horometro_inicio: reporteActual?.horometro_inicio,
          seguimiento_completo: seguimientoCompleto,
          codigo_equipo: reporteActual?.equipos?.codigo_interno,
          descripcion_equipo: reporteActual?.equipos?.descripcion_equipo
        }
      );
    }
  }

  console.log("[jornadaHandler] Gemini hito:", JSON.stringify(resultado));

  // Guardrail por software para combustible
  if (resultado) {
    const textoEntrante = (message || resultado.detalles_texto || "").toLowerCase();
    const tieneCombustible = textoEntrante.includes("combustible") || textoEntrante.includes("petroleo") || textoEntrante.includes("petróleo") || textoEntrante.includes("carga");
    const tieneFallaReal = textoEntrante.includes("pana") || textoEntrante.includes("roto") || textoEntrante.includes("averia") || textoEntrante.includes("falla mecanica") || textoEntrante.includes("falla eléctrica") || textoEntrante.includes("daño") || textoEntrante.includes("fuga") || textoEntrante.includes("malo") || textoEntrante.includes("desperfecto") || textoEntrante.includes("pinchado");
    
    if (tieneCombustible && !tieneFallaReal) {
      if (resultado.es_falla_critica) {
        console.log("[jornadaHandler] 🛡️ Guardrail: Desactivando es_falla_critica de Gemini (combustible).");
        resultado.es_falla_critica = false;
      }
      if (resultado.tipo_evento === "Detenido por Falla") {
        const esCierreJornada = sesion.estado_espera === "ESPERANDO_CHECKOUT_AUDIO" || resultado.horometro_final != null || resultado.km_final != null;
        console.log(`[jornadaHandler] 🛡️ Guardrail: Cambiando tipo_evento a ${esCierreJornada ? "CIERRE" : "Disponible"}.`);
        resultado.tipo_evento = esCierreJornada ? "CIERRE" : "Disponible";
      }
      if (resultado.petroleo_litros === null || resultado.petroleo_litros === undefined) {
        resultado.petroleo_litros = 0;
      }
      if (resultado.mensaje_conversacional_bot && (resultado.mensaje_conversacional_bot.includes("falla") || resultado.mensaje_conversacional_bot.includes("pana") || resultado.mensaje_conversacional_bot.includes("operativo nuevamente"))) {
        resultado.mensaje_conversacional_bot = null;
      }
      // Corregir lectura asignada por error a final en lugar de combustible
      const esCierreExplicit = sesion.estado_espera?.startsWith("ESPERANDO_CHECKOUT_") || resultado.tipo_evento === "CIERRE";
      if (!esCierreExplicit) {
        if (resultado.horometro_final && !resultado.horometro_carga_combustible) {
          resultado.horometro_carga_combustible = resultado.horometro_final;
        }
        if (resultado.km_final && !resultado.km_carga_combustible) {
          resultado.km_carga_combustible = resultado.km_final;
        }
        resultado.horometro_final = null;
        resultado.km_final = null;
      }
    }
  }

  if (audio && resultado.detalles_texto && msgUsuarioC?.id) {
    await supabase
      .from("mensajes_chat")
      .update({ contenido: resultado.detalles_texto })
      .eq("id", msgUsuarioC.id);
  }

  // ¿Es cierre de jornada?
  const intentoCierre =
    resultado.tipo_evento === "CIERRE" ||
    resultado.horometro_final != null ||
    resultado.km_final != null;

  if (intentoCierre) {
    const esVehiculo = tipoSeguimiento === 'vehiculo';
    const lecturaFinal = esVehiculo ? resultado.km_final : resultado.horometro_final;

    if (lecturaFinal == null && sesion.estado_espera !== "ESPERANDO_CHECKOUT_AUDIO") {
      await supabase.from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CHECKOUT_AUDIO", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const ejemploCierre = esVehiculo
        ? `_"Cierre, kilometraje final ochenta y cuatro mil quinientos, sin carga de combustible"_`
        : `_"Cierre, horómetro final dos mil trescientos diez, sin combustible"_`;

      let msgPedirLectura = `🏁 *Entendido, cierre de jornada solicitado.*\n\nPara consolidar tu reporte, por favor indica por *audio o texto* el **${esVehiculo ? 'odómetro (kilometraje) final' : 'horómetro final'}** y si realizaste carga de combustible.\n\n_Ejemplo: ${ejemploCierre}_`;

      if (resultado.mensaje_conversacional_bot && (
        resultado.mensaje_conversacional_bot.toLowerCase().includes("horómetro") ||
        resultado.mensaje_conversacional_bot.toLowerCase().includes("horometro") ||
        resultado.mensaje_conversacional_bot.toLowerCase().includes("odómetro") ||
        resultado.mensaje_conversacional_bot.toLowerCase().includes("odometro") ||
        resultado.mensaje_conversacional_bot.toLowerCase().includes("kilometraje") ||
        resultado.mensaje_conversacional_bot.toLowerCase().includes("combustible")
      )) {
        msgPedirLectura = resultado.mensaje_conversacional_bot;
      }

      await guardarMensajeChat(supabase, phoneClean, "model", msgPedirLectura, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgPedirLectura, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_LECTURA_FINAL" });
    }
  }

  // Si ya tenemos el horómetro final o estamos en checkout confirmado, llamamos a cierreHandler
  if (intentoCierre || sesion.estado_espera === "ESPERANDO_CHECKOUT_AUDIO" || sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA" || sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA_DETALLE" || sesion.estado_espera === "ESPERANDO_CONFIRMACION_TURNO_LARGO") {
    const contextCierre = {
      ...ctx,
      resultadoIA: resultado,
      tipoSeguimiento,
      reporteActual
    };
    return await handleCierreFlow(contextCierre, res);
  }

  // === HITO INTERMEDIO ===
  const estadoHito = resultado.tipo_evento === "CHECKIN" ? "Disponible" : resultado.tipo_evento || "Trabajando";

  let hitoInsertado = false;

  if (estadoHito === "Trabajando" && resultado.especialidad_id) {
    const nowSantiago = new Date().toLocaleTimeString("sv-SE", { timeZone: "America/Santiago" });
    const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

    // Buscar si hay bloque de planificación para esta hora
    const { data: bloque } = await supabase
      .from("planificacion_bloques_pod")
      .select("*, supervisor:supervisor_id(id, nombre_completo, whatsapp)")
      .eq("equipo_id", reporteActual.equipo_id)
      .eq("fecha", hoy)
      .lte("hora_inicio", nowSantiago)
      .gte("hora_fin", nowSantiago)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (bloque) {
      if (bloque.actividad_id) {
        // Escenario 1: Actividad ya asignada en planificación (bloque.actividad_id)
        await supabase.from("eventos_jornada").insert({
          reporte_id: sesion.reporte_activo_id,
          estado_hito: estadoHito,
          especialidad_id: resultado.especialidad_id,
          actividad_id: bloque.actividad_id,
          hora_evento: new Date().toISOString(),
          nota_transcripcion: `Actividad planificada: ${bloque.actividad_especifica}`,
          ...(resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined && {
            combustible_nivel_momento: resultado.combustible_nivel_porcentaje
          })
        });

        resultado.mensaje_conversacional_bot = `🟢 *Estado Registrado: Trabajando en ${resultado.especialidad_detectada || "montaje"}*\n\n📋 *Actividad Planificada:* ${bloque.actividad_especifica}`;
        hitoInsertado = true;
      } else if (bloque.supervisor?.whatsapp) {
        // Escenario 2: Actividad vacía → preguntar al supervisor con lista de tareas programadas
        const { data: nuevoEvento } = await supabase
          .from("eventos_jornada")
          .insert({
            reporte_id: sesion.reporte_activo_id,
            estado_hito: estadoHito,
            especialidad_id: resultado.especialidad_id,
            hora_evento: new Date().toISOString(),
            nota_transcripcion: "Esperando confirmación de actividad por supervisor...",
            ...(resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined && {
              combustible_nivel_momento: resultado.combustible_nivel_porcentaje
            })
          })
          .select()
          .single();

        if (nuevoEvento) {
          const { tareasEnviadas } = await crearConsultaPendiente(supabase, {
            telefonoSupervisor: bloque.supervisor.whatsapp,
            planificacionId: bloque.id,
            especialidadId: bloque.especialidad_id,
            eventoOperadorId: nuevoEvento.id,
            geminiKey,
          });

          resultado.mensaje_conversacional_bot =
            `🟢 *Estado Registrado: Trabajando en ${resultado.especialidad_detectada || "montaje"}*\n\n` +
            `💬 Solicitando confirmación de actividad a tu supervisor *${bloque.supervisor.nombre_completo}*` +
            (tareasEnviadas.length > 0 ? ` con ${tareasEnviadas.length} opciones de tarea.` : ".");
          hitoInsertado = true;
        }
      }
    }
  }

  if (!hitoInsertado) {
    await supabase.from("eventos_jornada").insert({
      reporte_id: sesion.reporte_activo_id,
      estado_hito: estadoHito,
      especialidad_id: resultado.especialidad_id || null,
      hora_evento: new Date().toISOString(),
      nota_transcripcion: resultado.detalles_texto || "",
      ...(resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined && {
        combustible_nivel_momento: resultado.combustible_nivel_porcentaje
      })
    });
  }

  // Actualizar combustible si se mencionó
  if (resultado.petroleo_litros || resultado.horometro_carga_combustible || (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined)) {
    await supabase
      .from("reportes_diarios")
      .update({
        ...(resultado.petroleo_litros && { petroleo_litros: resultado.petroleo_litros }),
        ...(resultado.horometro_carga_combustible && {
          horometro_carga_combustible: resultado.horometro_carga_combustible,
        }),
        ...(resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined && {
          combustible_nivel_porcentaje: resultado.combustible_nivel_porcentaje
        })
      })
      .eq("id", sesion.reporte_activo_id);

    const eqUpdateHito = {};
    if (resultado.horometro_carga_combustible) {
      eqUpdateHito.ultimo_horometro = resultado.horometro_carga_combustible;
    }
    if (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined) {
      eqUpdateHito.combustible_nivel_porcentaje = resultado.combustible_nivel_porcentaje;
    }
    if (Object.keys(eqUpdateHito).length > 0) {
      await supabase.from("equipos")
        .update(eqUpdateHito)
        .eq("id", reporteActual.equipo_id);
    }
  }

  // Lógica de alertas de combustible crítico por autonomía
  const nivelCombustible = resultado.combustible_nivel_porcentaje;
  if (nivelCombustible !== null && nivelCombustible !== undefined) {
    if (tipoSeguimiento !== 'vehiculo' && nivelCombustible <= 25) {
      if (reporteActual?.supervisor_id) {
        await notificarSupervisor(
          supabase,
          reporteActual.supervisor_id,
          `⚠️ *ALERTA DE SUMINISTRO*:\nEl equipo crítico *${reporteActual.equipos ? formatEquipoLabel(reporteActual.equipos) : '—'}* reporta un nivel de combustible del *${nivelCombustible}%*. Requiere reabastecimiento en frente de trabajo. 📍 Coordenadas listas.`
        );
      }
    } else if (tipoSeguimiento === 'vehiculo' && nivelCombustible <= 50) {
      await enviarMensajeWhatsApp(jid, phoneClean,
        `💡 *Recordatorio de Turno*: Detectamos que el estanque de la camioneta va en *${nivelCombustible}%*. Recuerda pasar por el patio de combustibles central o servicentro autorizado antes de entregar el vehículo al relevo. ¡Gracias!`,
        !!audio,
        geminiKey
      );
    }
  }

  const iconosEstado = {
    Trabajando: "🟢",
    Disponible: "🔵",
    "En Colacion": "🟡",
    "Detenido por Falla": "🔴",
  };

  const tagEspecialidad = resultado.especialidad_detectada ? ` — *${resultado.especialidad_detectada}*` : "";
  const confirmacion = resultado.mensaje_conversacional_bot
    || `${iconosEstado[estadoHito] || "⚪"} *Estado Actualizado: ${estadoHito}*${tagEspecialidad}\n\n📝 _"${resultado.detalles_texto || "Hito registrado con éxito."}"_`;

  await guardarMensajeChat(supabase, phoneClean, "model", confirmacion, "texto", sesion.reporte_activo_id);
  await enviarMensajeWhatsApp(jid, phoneClean, confirmacion, !!audio, geminiKey);

  // Alerta si es falla
  if (estadoHito === "Detenido por Falla" || resultado.es_falla_critica) {
    const { data: rpt } = await supabase
      .from("reportes_diarios")
      .select("supervisor_id, equipos(codigo_interno, patente)")
      .eq("id", sesion.reporte_activo_id)
      .maybeSingle();

    if (rpt?.supervisor_id) {
      await notificarSupervisor(
        supabase,
        rpt.supervisor_id,
        `🔴 Alerta de Terreno - Equipo ${formatEquipoLabel(rpt.equipos)}\nOperador: ${personal.nombre_completo}\n\nReportó: ${resultado.detalles_texto || "Falla técnica"}`
      );
    }
  }

  return res.status(200).json({ success: true, action: "HITO_REGISTRADO" });
}
