import fs from "fs";
import path from "path";
import { enviarMensajeWhatsApp, guardarMensajeChat } from "../services/messageService.js";
import { generarReportePDF } from "../../pdf-generator.js";
import { formatFechaHoraChile } from "../../timeUtils.js";
import { formatEquipoLabel } from "../../equipoLabel.js";
import { extraerCargaCombustible, registrarCargaCombustible } from "../services/combustibleService.js";
import { evaluarFallaTexto, registrarFallaEquipo } from "../services/fallaService.js";
import { compilarYSubirPDF } from "../services/cierreAutomaticoService.js";
import { convertirPalabrasANumeros } from "../../gemini.js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "evidencias-montaje";

export async function handleCierreFlow(ctx, res) {
  const { supabase, personal, phoneClean, jid, audio, geminiKey } = ctx;
  const sesion = ctx.sesion;
  const resultado = ctx.resultadoIA || {};
  const tipoSeguimiento = ctx.tipoSeguimiento || "estandar";
  const reporteActual = ctx.reporteActual;
  const mensajeRaw = (ctx.message || resultado.detalles_texto || "").trim();

  const esVehiculo = tipoSeguimiento === "vehiculo";
  const nombreLectura = esVehiculo ? "odómetro (kilometraje) final" : "horómetro final";
  const unidadLectura = esVehiculo ? "km" : "hrs";
  const lecturaInicio = esVehiculo
    ? Number(reporteActual?.km_inicial || 0)
    : Number(reporteActual?.horometro_inicio || 0);

  // Intentar extraer lectura final numérica del resultado de Gemini o del mensaje
  let lecturaFinal = esVehiculo
    ? (resultado.km_final ?? reporteActual?.km_final)
    : (resultado.horometro_final ?? reporteActual?.horometro_final);

  if (lecturaFinal === null || lecturaFinal === undefined) {
    const cleanNum = convertirPalabrasANumeros(mensajeRaw).replace(/,/g, ".");
    const matchNum = cleanNum.match(/(?:horometro(?:\s+final)?|odometro(?:\s+final)?|kilometraje(?:\s+final)?|final)\s*(?:de|en|:)?\s*(\d[\d.]*)/i) ||
      cleanNum.match(/\b(\d{1,7}(?:\.\d+)?)\b/);
    if (matchNum) {
      const val = parseFloat(matchNum[1]);
      if (!Number.isNaN(val)) lecturaFinal = val;
    }
  }

  // Analizar datos de combustible en el mensaje
  const cargaInfo = extraerCargaCombustible(mensajeRaw);
  // Analizar condición de falla en el mensaje
  const fallaInfo = evaluarFallaTexto(mensajeRaw);

  const estadoEsperaActual = sesion.estado_espera;

  // ============================================================
  // PASO 1: VALIDACIÓN Y SOLICITUD DE HORÓMETRO / ODÓMETRO FINAL
  // ============================================================
  const enPasoLectura =
    !estadoEsperaActual ||
    estadoEsperaActual === "SESION_ABIERTA_INTERMEDIA" ||
    estadoEsperaActual === "ESPERANDO_CHECKOUT_AUDIO" ||
    estadoEsperaActual === "ESPERANDO_CHECKOUT_HOROMETRO";

  if (enPasoLectura && (lecturaFinal === null || lecturaFinal === undefined)) {
    await supabase
      .schema("maquinaria")
      .from("sesiones_whatsapp")
      .update({ estado_espera: "ESPERANDO_CHECKOUT_HOROMETRO", updated_at: new Date().toISOString() })
      .eq("id", sesion.id);

    const msgPedirLectura =
      `🏁 *Término de Jornada Iniciado*\n\n` +
      `Hola *${personal.nombre_completo}*, para consolidar tu turno y generar el *Reporte Diario en PDF*, por favor indícanos por *texto o nota de voz*:\n\n` +
      `1️⃣ *${nombreLectura}* _(ej: ${esVehiculo ? "84.500 km" : "2.310 hrs"})_`;

    await guardarMensajeChat(supabase, phoneClean, "model", msgPedirLectura, "texto", sesion.reporte_activo_id);
    await enviarMensajeWhatsApp(jid, phoneClean, msgPedirLectura, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "ESPERANDO_CHECKOUT_HOROMETRO" });
  }

  // Guardar lectura final registrada en el reporte
  if (lecturaFinal !== null && lecturaFinal !== undefined) {
    const updLectura = esVehiculo ? { km_final: lecturaFinal } : { horometro_final: lecturaFinal };
    await supabase
      .schema("maquinaria")
      .from("reportes_diarios")
      .update(updLectura)
      .eq("id", reporteActual.id);
  }

  // ============================================================
  // PASO 2: VALIDACIÓN DE COMBUSTIBLE AL CIERRE (Requerimiento 2.1)
  // ============================================================
  // Si estamos en espera de combustible o aún no se ha informado si hubo carga
  const enPasoCombustible = estadoEsperaActual === "ESPERANDO_CHECKOUT_COMBUSTIBLE";

  if (enPasoCombustible || (enPasoLectura && !cargaInfo.respondio)) {
    if (enPasoCombustible) {
      if (cargaInfo.tieneCarga) {
        await registrarCargaCombustible(supabase, {
          reporteId: reporteActual.id,
          personalId: personal.id,
          litros: cargaInfo.litros,
          horaTexto: cargaInfo.horaTexto,
          horaIso: cargaInfo.horaIso,
          servicentro: "Terreno / Faena",
          observacion: "(Carga informada al término de jornada)"
        });
      } else if (cargaInfo.sinCarga) {
        // Verificar si hubo cargas previas registradas
        const { data: vPrev } = await supabase
          .schema("maquinaria")
          .from("vouchers_combustible")
          .select("id")
          .eq("id_reporte_diario", reporteActual.id);

        if (!vPrev || vPrev.length === 0) {
          await supabase
            .schema("maquinaria")
            .from("reportes_diarios")
            .update({ petroleo_litros: 0 })
            .eq("id", reporteActual.id);

          await supabase
            .schema("maquinaria")
            .from("eventos_jornada")
            .insert({
              reporte_id: reporteActual.id,
              estado_hito: "Trabajando",
              hora_evento: new Date().toISOString(),
              nota_transcripcion: "⛽ Sin abastecimiento de combustible en la jornada."
            });
        }
      } else {
        // No se entendió la respuesta de combustible
        const msgReintentoComb =
          `⚠️ *Información de Combustible Requerida*\n\n` +
          `Por favor, indícanos si cargaste combustible durante la jornada:\n` +
          `• Si cargaste, indica los *litros y hora* (ej: _"50 litros a las 14:00"_).\n` +
          `• Si no hubo cargas, responde *_"Sin carga"_* o *_"No"_*.`;

        await guardarMensajeChat(supabase, phoneClean, "model", msgReintentoComb, "texto", sesion.reporte_activo_id);
        await enviarMensajeWhatsApp(jid, phoneClean, msgReintentoComb, !!audio, geminiKey);
        return res.status(200).json({ success: true, action: "REINTENTO_CHECKOUT_COMBUSTIBLE" });
      }
    } else {
      // Venimos del paso de lectura y no declaró combustible en el mismo mensaje -> Solicitarlo
      await supabase
        .schema("maquinaria")
        .from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CHECKOUT_COMBUSTIBLE", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const msgPedirCombustible =
        `⛽ *Registro de Combustible al Cierre*\n\n` +
        `¿El equipo recibió alguna carga de combustible durante la jornada que no haya sido registrada previamente?\n\n` +
        `• Si cargó combustible, indica la *hora y litros* (ej: _"50 litros a las 14:00"_).\n` +
        `• Si no hubo cargas o ya están registradas, responde *_"Sin carga"_* o *_"No"_*.`;

      await guardarMensajeChat(supabase, phoneClean, "model", msgPedirCombustible, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgPedirCombustible, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_CHECKOUT_COMBUSTIBLE" });
    }
  } else if (cargaInfo.tieneCarga) {
    // Si declaró combustible en el mismo mensaje inicial
    await registrarCargaCombustible(supabase, {
      reporteId: reporteActual.id,
      personalId: personal.id,
      litros: cargaInfo.litros,
      horaTexto: cargaInfo.horaTexto,
      horaIso: cargaInfo.horaIso,
      servicentro: "Terreno / Faena",
      observacion: "(Carga informada al término de jornada)"
    });
  }

  // ============================================================
  // PASO 3: REGISTRO DE FALLAS DEL EQUIPO AL CIERRE (Requerimiento 2.2)
  // ============================================================
  const enPasoFalla = estadoEsperaActual === "ESPERANDO_CHECKOUT_FALLA";
  const enPasoFallaDetalle = estadoEsperaActual === "ESPERANDO_CHECKOUT_FALLA_DETALLE";

  let fallaConfirmada = false;
  let motivoFallaCierre = null;

  if (enPasoFallaDetalle) {
    // El operador está enviando la descripción de la falla
    motivoFallaCierre = mensajeRaw || "Falla técnica reportada por el operador al término de jornada";
    fallaConfirmada = true;
    await registrarFallaEquipo(supabase, {
      equipoId: reporteActual.equipo_id,
      reporteId: reporteActual.id,
      personalId: personal.id,
      motivoFalla: motivoFallaCierre,
      supervisorId: reporteActual.supervisor_id,
      geminiKey
    });
  } else if (enPasoFalla || !fallaInfo.respondio) {
    if (enPasoFalla) {
      if (fallaInfo.presentaFalla) {
        if (fallaInfo.descripcion) {
          motivoFallaCierre = fallaInfo.descripcion;
          fallaConfirmada = true;
          await registrarFallaEquipo(supabase, {
            equipoId: reporteActual.equipo_id,
            reporteId: reporteActual.id,
            personalId: personal.id,
            motivoFalla: motivoFallaCierre,
            supervisorId: reporteActual.supervisor_id,
            geminiKey
          });
        } else {
          // Dijo solo "Sí" -> Pedir descripción obligatoria
          await supabase
            .schema("maquinaria")
            .from("sesiones_whatsapp")
            .update({ estado_espera: "ESPERANDO_CHECKOUT_FALLA_DETALLE", updated_at: new Date().toISOString() })
            .eq("id", sesion.id);

          const msgPedirDetalleFalla =
            `⚠️ *Descripción Detallada de la Falla Requerida*\n\n` +
            `Por favor, describe en un mensaje de texto o audio la falla o anomalía detectada en el equipo para registrarla en su hoja de vida y alertar a mantención y supervisión.`;

          await guardarMensajeChat(supabase, phoneClean, "model", msgPedirDetalleFalla, "texto", sesion.reporte_activo_id);
          await enviarMensajeWhatsApp(jid, phoneClean, msgPedirDetalleFalla, !!audio, geminiKey);
          return res.status(200).json({ success: true, action: "ESPERANDO_CHECKOUT_FALLA_DETALLE" });
        }
      } else {
        // Respondió No / Sin fallas
        await supabase
          .schema("maquinaria")
          .from("eventos_jornada")
          .insert({
            reporte_id: reporteActual.id,
            estado_hito: "Disponible",
            hora_evento: new Date().toISOString(),
            nota_transcripcion: "✅ Equipo finaliza la jornada operativo y sin fallas reportadas."
          });
      }
    } else {
      // Venimos del paso anterior y no declaró estado de fallas -> Preguntar
      await supabase
        .schema("maquinaria")
        .from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CHECKOUT_FALLA", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const msgPreguntaFalla =
        `🛠️ *Condición Operacional del Equipo*\n\n` +
        `¿El equipo presenta alguna falla o anomalía al finalizar la jornada?\n\n` +
        `• Responde *Sí* o *No*.`;

      await guardarMensajeChat(supabase, phoneClean, "model", msgPreguntaFalla, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgPreguntaFalla, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_CHECKOUT_FALLA" });
    }
  } else if (fallaInfo.presentaFalla) {
    // Si declaró falla en el mensaje combinado inicial
    motivoFallaCierre = fallaInfo.descripcion || "Falla técnica reportada al cierre";
    fallaConfirmada = true;
    await registrarFallaEquipo(supabase, {
      equipoId: reporteActual.equipo_id,
      reporteId: reporteActual.id,
      personalId: personal.id,
      motivoFalla: motivoFallaCierre,
      supervisorId: reporteActual.supervisor_id,
      geminiKey
    });
  } else {
    // Negación en mensaje inicial
    await supabase
      .schema("maquinaria")
      .from("eventos_jornada")
      .insert({
        reporte_id: reporteActual.id,
        estado_hito: "Disponible",
        hora_evento: new Date().toISOString(),
        nota_transcripcion: "✅ Equipo finaliza la jornada operativo y sin fallas reportadas."
      });
  }

  // ============================================================
  // PASO 4: VALIDACIÓN DE INCONSISTENCIAS Y REPORTE OBSERVADO (Requerimiento 2.3)
  // ============================================================
  const diffLectura = Number(lecturaFinal) - Number(lecturaInicio);

  // Consultar eventos para ver si declaró actividad operacional
  const { data: eventosPrevios } = await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .select("estado_hito, nota_transcripcion")
    .eq("reporte_id", reporteActual.id);

  const declaroActividad = (eventosPrevios || []).some(
    (e) =>
      e.estado_hito === "Trabajando" ||
      (e.nota_transcripcion && /trabajando|piping|estructuras|montaje|operativo/i.test(e.nota_transcripcion))
  );

  let esObservado = false;
  let motivoObservacion = null;

  if (declaroActividad && diffLectura === 0) {
    esObservado = true;
    motivoObservacion = "Actividad declarada con 0 horas de avance de horómetro";
  } else if (diffLectura < 0) {
    esObservado = true;
    motivoObservacion = `Horómetro final (${lecturaFinal}) menor al inicial (${lecturaInicio})`;
  }

  // Determinar estado final del reporte y del equipo
  let estadoFinalReporte = "Disponible";
  if (fallaConfirmada) {
    estadoFinalReporte = "Detenido por Falla";
  } else if (esObservado) {
    estadoFinalReporte = "Observado";
  }

  // Actualizar reporte_diario
  const { data: repPrevData } = await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .select("observaciones")
    .eq("id", reporteActual.id)
    .maybeSingle();

  const obsPrev = repPrevData?.observaciones ? `${repPrevData.observaciones} | ` : "";
  let obsFinal = `${obsPrev}[Cierre]: ${mensajeRaw || "Término de jornada"}`;
  if (esObservado) {
    obsFinal += ` | [ALERTA INCONSISTENCIA]: ${motivoObservacion}. Reporte identificado como OBSERVADO para auditoría.`;
  }

  await supabase
    .schema("maquinaria")
    .from("reportes_diarios")
    .update({
      estado_final: estadoFinalReporte,
      observaciones: obsFinal,
    })
    .eq("id", reporteActual.id);

  // Registrar evento de inconsistencia si aplica
  if (esObservado) {
    await supabase
      .schema("maquinaria")
      .from("eventos_jornada")
      .insert({
        reporte_id: reporteActual.id,
        estado_hito: "Observado",
        hora_evento: new Date().toISOString(),
        nota_transcripcion: `⚠️ Alerta de Inconsistencia: ${motivoObservacion}. Reporte identificado como OBSERVADO para revisión.`
      });
  }

  // Registrar evento final de cierre
  const labelEstadoCierre = fallaConfirmada
    ? "Detenido por Falla"
    : esObservado
    ? "Observado"
    : "Disponible";

  await supabase
    .schema("maquinaria")
    .from("eventos_jornada")
    .insert({
      reporte_id: reporteActual.id,
      estado_hito: labelEstadoCierre,
      hora_evento: new Date().toISOString(),
      nota_transcripcion: `Término de jornada: ${mensajeRaw} | ${nombreLectura}: ${lecturaFinal} ${unidadLectura} | Condición final: ${labelEstadoCierre}`
    });

  // Actualizar equipo
  await supabase
    .schema("maquinaria")
    .from("equipos")
    .update({
      estado_actual: fallaConfirmada ? "Detenido por Falla" : "Disponible",
      ...(esVehiculo ? { ultimo_odometro: lecturaFinal } : { ultimo_horometro: lecturaFinal }),
    })
    .eq("id", reporteActual.equipo_id);

  // Responder de inmediato al webhook de WhatsApp
  res.status(200).json({ success: true, action: "CHECKOUT_PROCESANDO" });

  // ============================================================
  // PASO 5: COMPILACIÓN DEL PDF, SUBIDA A STORAGE Y NOTIFICACIÓN
  // ============================================================
  (async () => {
    try {
      // Eliminar sesión activa de WhatsApp
      await supabase
        .schema("maquinaria")
        .from("sesiones_whatsapp")
        .delete()
        .eq("id", sesion.id);

      // Generar y subir PDF
      const pdfUrl = await compilarYSubirPDF(supabase, reporteActual.id, personal);
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";

      // Obtener total de combustible
      const { data: repFinal } = await supabase
        .schema("maquinaria")
        .from("reportes_diarios")
        .select("petroleo_litros")
        .eq("id", reporteActual.id)
        .single();

      const totalLitros = repFinal?.petroleo_litros || 0;
      const combustibleStr = totalLitros > 0 ? `${totalLitros} L` : "Sin carga";

      // Construir mensaje final de WhatsApp limpio y sin duplicados
      const bannerObs = esObservado
        ? `⚠️ *Estado:* REPORTADO CON OBSERVACIONES\n_(Motivo: ${motivoObservacion})_\n\n`
        : "";

      const msgFinal =
        `✅ *Reporte Diario de Jornada Consolidado*\n\n` +
        bannerObs +
        `📊 *${esVehiculo ? "Odómetro" : "Horómetro"}:* ${lecturaInicio} → ${lecturaFinal} ${unidadLectura}\n` +
        `⏱ *Horas trabajadas:* ${Math.max(0, diffLectura).toFixed(1)} ${unidadLectura}\n` +
        `⛽ *Combustible:* ${combustibleStr}\n` +
        `🛠️ *Condición final:* ${fallaConfirmada ? `Detenido por Falla (${motivoFallaCierre})` : "Operativo y sin fallas"}\n\n` +
        `📄 *Descarga tu reporte en PDF aquí:*\n` +
        `👉 ${baseUrl}${pdfUrl}\n\n` +
        `¡Buen descanso, ${personal.nombre_completo}! 👷‍♂️`;

      await guardarMensajeChat(supabase, phoneClean, "model", msgFinal, "texto", reporteActual.id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgFinal, !!audio, geminiKey);
      console.log(`[cierreHandler] ✅ Jornada cerrada exitosamente para ${personal.nombre_completo} (${reporteActual.id})`);
    } catch (errAsync) {
      console.error("[cierreHandler] Error en compilación de PDF o notificación:", errAsync.message);
    }
  })().catch((e) => {
    console.error("[cierreHandler] Error crítico en tarea asíncrona:", e.message);
  });
}
