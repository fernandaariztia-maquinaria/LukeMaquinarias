import fs from "fs";
import path from "path";
import { enviarMensajeWhatsApp, guardarMensajeChat } from "../services/messageService";
import { generarReportePDF } from "../../pdf-generator";
import { procesarDeclaracionCarga } from "../../gemini";
import { horasTranscurridas } from "../../timeUtils";

const MAX_HORAS_TURNO = 20;

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "evidencias-montaje";

export async function handleCierreFlow(ctx, res) {
  const { supabase, personal, phoneClean, jid, audio, geminiKey } = ctx;
  const sesion = ctx.sesion;
  const resultado = ctx.resultadoIA;
  const tipoSeguimiento = ctx.tipoSeguimiento || "estandar";
  const reporteActual = ctx.reporteActual;

  const horometroFinal = (resultado.horometro_final !== null && resultado.horometro_final !== undefined)
    ? resultado.horometro_final
    : (reporteActual?.horometro_final || null);

  const kmFinal = (resultado.km_final !== null && resultado.km_final !== undefined)
    ? resultado.km_final
    : (reporteActual?.km_final || null);

  const petroleoLitros = (resultado.petroleo_litros !== null && resultado.petroleo_litros !== undefined && resultado.petroleo_litros !== 0)
    ? resultado.petroleo_litros
    : (reporteActual?.petroleo_litros || 0);

  const horometroCargaCombustible = resultado.horometro_carga_combustible || reporteActual?.horometro_carga_combustible || null;

  const combustibleNivelPorcentaje = (resultado.combustible_nivel_porcentaje !== null && resultado.combustible_nivel_porcentaje !== undefined)
    ? resultado.combustible_nivel_porcentaje
    : (reporteActual?.combustible_final_porcentaje || null);

  const usaPlataforma = reporteActual?.equipos?.usa_plataforma !== false;
  const esVehiculo = tipoSeguimiento === 'vehiculo';
  const lecturaFinal = esVehiculo ? kmFinal : horometroFinal;
  const lecturaInicio = esVehiculo ? (reporteActual?.km_inicial || 0) : (reporteActual?.horometro_inicio || 0);
  const nombreLectura = esVehiculo ? 'odómetro (kilometraje) final' : 'horómetro final';
  const unidadLectura = esVehiculo ? 'km' : 'hrs';

  // 1. Validar que la lectura final no sea nula ni indefinida
  if (lecturaFinal === null || lecturaFinal === undefined) {
    await supabase
      .from("sesiones_whatsapp")
      .update({ estado_espera: "ESPERANDO_CHECKOUT_AUDIO", updated_at: new Date().toISOString() })
      .eq("id", sesion.id);

    const ejemploCierre = esVehiculo
      ? `_"Kilometraje final 84.500, sin carga de combustible, observaciones: vehículo sin novedades"_`
      : `_"Horómetro final 11.005, sin carga de combustible, observaciones: equipo operativo sin novedades"_`;

    const msgError =
      `⚠️ *Datos de término de jornada requeridos*\n\n` +
      `Hola *${personal.nombre_completo}*, para cerrar tu jornada por favor envíanos por *texto o audio*:\n` +
      `1️⃣ *${nombreLectura}*\n` +
      `2️⃣ *Carga de combustible* _(litros cargados o "sin carga")_\n` +
      `3️⃣ *Observaciones* _(novedades del equipo o de la jornada)_\n\n` +
      `💡 _Ejemplo: ${ejemploCierre}_`;

    await guardarMensajeChat(supabase, phoneClean, "model", msgError, "texto", sesion.reporte_activo_id);
    await enviarMensajeWhatsApp(jid, phoneClean, msgError, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "LECTURA_FINAL_REQUERIDA" });
  }

  // 2. Validar que la lectura final no sea menor a la inicial
  if (lecturaFinal < lecturaInicio) {
    await supabase
      .from("sesiones_whatsapp")
      .update({ estado_espera: "ESPERANDO_CHECKOUT_AUDIO", updated_at: new Date().toISOString() })
      .eq("id", sesion.id);

    const msgError = `⚠️ *Lectura final inválida*\n\nEl **${nombreLectura}** indicado (*${lecturaFinal.toLocaleString("es-CL")} ${unidadLectura}*) es menor que el valor de inicio (*${lecturaInicio.toLocaleString("es-CL")} ${unidadLectura}*).\n\nPor favor, verifica el tablero e indica el valor correcto por audio o texto.`;

    await guardarMensajeChat(supabase, phoneClean, "model", msgError, "texto", sesion.reporte_activo_id);
    await enviarMensajeWhatsApp(jid, phoneClean, msgError, !!audio, geminiKey);
    return res.status(200).json({ success: true, action: "LECTURA_FINAL_INVALIDA" });
  }

  // 2b/2c. Solo se validan en la primera lectura del cierre — no en cada continuación del sub-flujo de plataforma
  const esPrimeraLecturaDelCierre = sesion.estado_espera !== "ESPERANDO_CHECKOUT_PLATAFORMA" && sesion.estado_espera !== "ESPERANDO_CHECKOUT_PLATAFORMA_DETALLE";

  // 2b. Validar que la lectura no implique un avance físicamente imposible (permitiendo hasta un turno completo de 15 hrs o 600 km en pruebas cortas)
  const horasReales = reporteActual?.created_at ? horasTranscurridas(reporteActual.created_at) : null;
  if (esPrimeraLecturaDelCierre && horasReales !== null) {
    const delta = lecturaFinal - lecturaInicio;
    const maxPlausible = esVehiculo ? Math.max(600, horasReales * 100 + 50) : Math.max(15, horasReales + 2);

    if (delta > maxPlausible) {
      await supabase
        .from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CHECKOUT_AUDIO", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const horasTexto = horasReales < 1 ? `${Math.round(horasReales * 60)} minutos` : `${horasReales.toFixed(1)} horas`;
      const msgError = `⚠️ *Lectura no coincide con el turno*\n\nIndicaste *${delta.toLocaleString("es-CL")} ${unidadLectura}* de avance en un turno de *${horasTexto}*. Revisa el valor del tablero y reenvíalo por audio o texto.`;

      await guardarMensajeChat(supabase, phoneClean, "model", msgError, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgError, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "LECTURA_IMPLAUSIBLE_TIEMPO" });
    }

    // 2c. Turno anormalmente largo (probable sesión olvidada) — requiere confirmación explícita antes de proceder
    if (horasReales > MAX_HORAS_TURNO && sesion.estado_espera !== "ESPERANDO_CONFIRMACION_TURNO_LARGO") {
      await supabase
        .from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CONFIRMACION_TURNO_LARGO", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const msgError = `⚠️ *Han pasado ${horasReales.toFixed(1)} horas desde tu check-in* — mucho más que un turno normal.\n\nSi es un error, contacta a tu supervisor. Si de verdad corresponde a esta jornada, *reenvía la misma lectura* para confirmar y cerrar de todas formas.`;

      await guardarMensajeChat(supabase, phoneClean, "model", msgError, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgError, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "TURNO_DEMASIADO_LARGO_ESPERANDO_CONFIRMACION" });
    }
  }

  let platEstado = 'Limpia';
  let platEspId = null;
  let platDetalle = null;

  if (sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA") {
    const respOp = (resultado.detalles_texto || ctx.message || "").toLowerCase();
    
    if (respOp.includes("limpia") || respOp.includes("limpio")) {
      platEstado = 'Limpia';
    } else if (respOp.includes("cargada") || respOp.includes("cargado")) {
      await supabase
        .from("sesiones_whatsapp")
        .update({ estado_espera: "ESPERANDO_CHECKOUT_PLATAFORMA_DETALLE", updated_at: new Date().toISOString() })
        .eq("id", sesion.id);

      const msgDet = `Indica la especialidad bajo la cual se retienen los materiales (ej: *Piping*, *Estructuras*) y un breve detalle de la carga (ej: *Vigas eje 4*).`;
      await guardarMensajeChat(supabase, phoneClean, "model", msgDet, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgDet, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_DETALLE_PLATAFORMA" });
    } else {
      const msgErrorPlat = `⚠️ *Respuesta no reconocida.*\n\nPor favor, indica claramente si la plataforma queda **Cargada** o **Limpia**.`;
      await guardarMensajeChat(supabase, phoneClean, "model", msgErrorPlat, "texto", sesion.reporte_activo_id);
      await enviarMensajeWhatsApp(jid, phoneClean, msgErrorPlat, !!audio, geminiKey);
      return res.status(200).json({ success: true, action: "ESPERANDO_PLATAFORMA_REINTENTO" });
    }
  } else if (sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA_DETALLE") {
    const respOp = resultado.detalles_texto || ctx.message || "";
    
    try {
      const { data: especialidades } = await supabase.from("especialidades").select("*");
      const dec = await procesarDeclaracionCarga(respOp, especialidades || []);
      
      platEstado = 'Cargada';
      platEspId = dec.especialidad_id;
      platDetalle = dec.detalle;
    } catch (errDec) {
      console.error("[cierreHandler] Error procesando declaracion carga con Gemini:", errDec.message);
      platEstado = 'Cargada';
      platDetalle = respOp.substring(0, 80);
    }
  }

  const esFalla = resultado.es_falla_critica || resultado.tipo_evento === "Detenido por Falla";
  const estadoFinalCierre = esFalla ? "Detenido por Falla" : "Disponible";

  // Actualizar reporte con datos de cierre finales
  const updateData = { estado_final: esFalla ? "Detenido por Falla" : "Disponible" };
  if (horometroFinal !== null && horometroFinal !== undefined) {
    updateData.horometro_final = horometroFinal;
    // Nota: 'horas_trabajadas' es una columna generada en Postgres (horometro_final - horometro_inicio),
    // por lo que NO se debe asignar manualmente en updateData para evitar el error 428C9.
  }
  if (kmFinal !== null && kmFinal !== undefined) {
    updateData.km_final = kmFinal;
    const diffKm = Number(kmFinal) - Number(lecturaInicio || 0);
    if (!Number.isNaN(diffKm) && diffKm >= 0) {
      updateData.km_dia = Number(diffKm.toFixed(1));
    }
  }
  if (petroleoLitros !== null && petroleoLitros !== undefined) updateData.petroleo_litros = petroleoLitros;
  if (horometroCargaCombustible) updateData.horometro_carga_combustible = horometroCargaCombustible;
  if (combustibleNivelPorcentaje !== null && combustibleNivelPorcentaje !== undefined) {
    updateData.combustible_final_porcentaje = combustibleNivelPorcentaje;
    updateData.combustible_nivel_porcentaje = combustibleNivelPorcentaje;
  }

  // Cuantificar horas de detención si el equipo cerró estando en Detenido por Falla
  let horasDetencionCierre = 0;
  if (reporteActual.equipos?.estado_actual === "Detenido por Falla") {
    const { data: ultFallaEv } = await supabase
      .from("eventos_jornada")
      .select("hora_evento, nota_transcripcion")
      .eq("reporte_id", sesion.reporte_activo_id)
      .eq("estado_hito", "Detenido por Falla")
      .order("hora_evento", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ultFallaEv?.hora_evento) {
      const inicioMs = new Date(ultFallaEv.hora_evento).getTime();
      const ahoraMs = Date.now();
      horasDetencionCierre = Math.max(0, (ahoraMs - inicioMs) / (1000 * 60 * 60));

      try {
        await supabase
          .from("historial_fallas_equipos")
          .update({
            hora_fin: new Date().toISOString(),
            horas_detencion: Number(horasDetencionCierre.toFixed(2)),
            estado: "resuelta"
          })
          .eq("equipo_id", reporteActual.equipo_id)
          .eq("estado", "abierta");
      } catch (eHisto) {}
    }
  }

  // Acumular total de horas de detención para este reporte
  let totalHorasDetencion = 0;
  try {
    const { data: repPrevData } = await supabase
      .from("reportes_diarios")
      .select("horas_detencion, observaciones")
      .eq("id", sesion.reporte_activo_id)
      .maybeSingle();

    totalHorasDetencion = Number(repPrevData?.horas_detencion || 0) + Number(horasDetencionCierre.toFixed(2));
    updateData.horas_detencion = totalHorasDetencion;
    const obsPrev = repPrevData?.observaciones ? `${repPrevData.observaciones} | ` : "";
    updateData.observaciones = `${obsPrev}[Cierre]: ${resultado.detalles_texto || ctx.message || "Término de jornada"}`;
  } catch (eRep) {
    updateData.observaciones = resultado.detalles_texto || ctx.message || "Término de jornada";
  }

  await supabase
    .from("reportes_diarios")
    .update(updateData)
    .eq("id", sesion.reporte_activo_id);

  const eqUpdate = { estado_actual: estadoFinalCierre };
  if (usaPlataforma) {
    eqUpdate.plataforma_estado = platEstado;
    eqUpdate.plataforma_especialidad_id = platEspId;
    eqUpdate.plataforma_detalle = platDetalle;
  }
  if (horometroFinal) eqUpdate.ultimo_horometro = horometroFinal;
  if (kmFinal) eqUpdate.ultimo_odometro = kmFinal;
  if (combustibleNivelPorcentaje !== null && combustibleNivelPorcentaje !== undefined) {
    eqUpdate.combustible_nivel_porcentaje = combustibleNivelPorcentaje;
  }
  await supabase.from("equipos").update(eqUpdate).eq("id", reporteActual.equipo_id);

  // Obtener observación de cierre del operador (si pasó por sub-flujo de plataforma, recuperar el mensaje previo de cierre)
  let observacionCierre = resultado.detalles_texto || ctx.message || "Cierre de jornada";
  if (sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA" || sesion.estado_espera === "ESPERANDO_CHECKOUT_PLATAFORMA_DETALLE") {
    const { data: ultimosMsgsUser } = await supabase
      .from("mensajes_chat")
      .select("contenido")
      .eq("reporte_id", sesion.reporte_activo_id)
      .eq("rol", "user")
      .order("created_at", { ascending: false })
      .limit(4);
    const msgConLectura = (ultimosMsgsUser || []).find((m) => {
      const c = String(m.contenido || "").toLowerCase();
      return c && !["limpia", "limpio", "cargada", "cargado"].includes(c.trim()) && /\d/.test(c);
    });
    if (msgConLectura?.contenido) {
      observacionCierre = msgConLectura.contenido;
    }
  }

  // Evento de cierre
  await supabase.from("eventos_jornada").insert({
    reporte_id: sesion.reporte_activo_id,
    estado_hito: estadoFinalCierre,
    hora_evento: new Date().toISOString(),
    nota_transcripcion: `Término de jornada: ${observacionCierre}${kmFinal ? ` | Odómetro: ${kmFinal} km` : ""}${horometroFinal ? ` | Horómetro: ${horometroFinal} hrs` : ""}${petroleoLitros ? ` | Combustible: ${petroleoLitros} L` : " | Sin carga combustible"}${usaPlataforma ? (platEstado === 'Cargada' ? ` | Plataforma Cargada (${platDetalle || 'sin detalle'})` : ' | Plataforma Limpia') : ''}`,
  });

  const horasDetencionTexto = totalHorasDetencion > 0 ? `\n⚠️ *Horas Detenido por Falla:* ${totalHorasDetencion.toFixed(1)} hrs` : "";

  await enviarMensajeWhatsApp(jid, phoneClean,
    `✅ *Indicación de Cierre Registrada*\n` +
    `📝 *Observaciones:* _"${observacionCierre}"_\n` +
    `⏱ *${esVehiculo ? "Odómetro Final" : "Horómetro Final"}:* ${lecturaFinal.toLocaleString("es-CL")} ${unidadLectura}\n` +
    `⛽ *Combustible:* ${petroleoLitros ? `${petroleoLitros} L` : "Sin carga"}${horasDetencionTexto}\n\n` +
    `⏳ *Consolidando tu Reporte Diario de Jornada y generando PDF...*`,
    !!audio,
    geminiKey
  );

  // Responder de inmediato al webhook para evitar timeouts
  res.status(200).json({ success: true, action: "CHECKOUT_PROCESANDO" });

  // Procesar la compilación del PDF en segundo plano (asíncronamente)
  (async () => {
    try {
      const { data: reporteCompleto } = await supabase
        .from("reportes_diarios")
        .select("*")
        .eq("id", sesion.reporte_activo_id)
        .single();

      const { data: equipo } = await supabase
        .from("equipos")
        .select("*")
        .eq("id", reporteCompleto.equipo_id)
        .single();

      let supervisor = reporteCompleto.supervisor_id
        ? (await supabase.from("personal").select("nombre_completo").eq("id", reporteCompleto.supervisor_id).maybeSingle()).data
        : null;

      if (!supervisor && reporteCompleto.equipo_id && reporteCompleto.fecha) {
        const { data: bloqueSup } = await supabase
          .from("planificacion_bloques_pod")
          .select("supervisor_id, supervisor:supervisor_id(nombre_completo)")
          .eq("equipo_id", reporteCompleto.equipo_id)
          .eq("fecha", reporteCompleto.fecha)
          .not("supervisor_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (bloqueSup?.supervisor) {
          supervisor = bloqueSup.supervisor;
        }
      }

      const { data: eventosRaw } = await supabase
        .from("eventos_jornada")
        .select("*, especialidades(nombre_oficial)")
        .eq("reporte_id", sesion.reporte_activo_id)
        .order("hora_evento", { ascending: true });

      const eventos = (eventosRaw || []).map(e => ({
        ...e,
        especialidad_nombre: e.especialidades?.nombre_oficial,
      }));

      const { data: evidencias } = await supabase
        .from("evidencias")
        .select("*")
        .eq("reporte_id", sesion.reporte_activo_id);

      const pdfUrl = await generarReportePDF({
        reporte: reporteCompleto,
        equipo,
        operador: personal,
        supervisor,
        eventos,
        evidencias: evidencias || [],
      });

      // Subir PDF a Supabase Storage para persistencia ante despliegues
      try {
        const localFilePath = path.join(process.cwd(), "public", pdfUrl);
        if (fs.existsSync(localFilePath)) {
          const fileBuffer = fs.readFileSync(localFilePath);
          const fechaPdf = new Date(reporteCompleto.fecha);
          const anioPdf = fechaPdf.getFullYear();
          const mesPdf = String(fechaPdf.getMonth() + 1).padStart(2, "0");
          const storagePath = `reportes/${anioPdf}/${mesPdf}/${reporteCompleto.id}.pdf`;

          console.log(`[cierreHandler] 📄 Subiendo PDF a Supabase Storage: ${storagePath}...`);
          const { error: uploadErr } = await supabase.storage
            .from(BUCKET)
            .upload(storagePath, fileBuffer, {
              contentType: "application/pdf",
              upsert: true
            });

          if (uploadErr) {
            console.error("[cierreHandler] Error subiendo PDF a Storage:", uploadErr.message);
          } else {
            console.log(`[cierreHandler] 📄 PDF respaldado exitosamente en Supabase Storage: ${storagePath}`);
          }
        }
      } catch (storageErr) {
        console.error("[cierreHandler] Error en respaldo de PDF a Supabase Storage:", storageErr.message);
      }

      // Guardar URL del PDF
      await supabase
        .from("reportes_diarios")
        .update({ pdf_url: pdfUrl })
        .eq("id", sesion.reporte_activo_id);

      // Cerrar sesión
      await supabase
        .from("sesiones_whatsapp")
        .delete()
        .eq("id", sesion.id);

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://equipos.lukeapp.cl";
      const horasDetFinalTxt = totalHorasDetencion > 0 ? `\n⚠️ Horas detenido por falla: ${totalHorasDetencion.toFixed(1)} hrs` : "";

      // Consultar todos los reportes / tramos del operador en el día para trazabilidad completa
      let resumenMaquinas = "";
      try {
        const { data: todosReportesHoy } = await supabase
          .from("reportes_diarios")
          .select("*, equipos(*), eventos_jornada(*)")
          .eq("operador_id", personal.id)
          .eq("fecha", reporteCompleto.fecha)
          .order("created_at", { ascending: true });

        if (todosReportesHoy && todosReportesHoy.length > 1) {
          resumenMaquinas = "\n\n📋 *Trazabilidad de tus Equipos de Hoy:*";
          let totalIzajesDia = 0;
          todosReportesHoy.forEach((r, idx) => {
            const eqNom = r.equipos?.descripcion_equipo || "Equipo";
            const eqCod = r.equipos?.codigo_interno || r.equipos?.patente || "";
            const esVeh = r.equipos?.tipo_seguimiento === 'vehiculo';
            const ini = esVeh ? r.km_inicial : r.horometro_inicio;
            const fin = esVeh ? r.km_final : r.horometro_final;
            const unid = esVeh ? 'km' : 'hrs';
            const diff = (fin != null && ini != null) ? (fin - ini) : null;
            resumenMaquinas += `\n${idx + 1}️⃣ *${eqNom}* (${eqCod}):\n   • ${esVeh ? 'Odómetro' : 'Horómetro'}: ${ini ?? '—'} ➔ ${fin ?? '—'} ${unid}${diff != null && diff >= 0 ? ` (${diff.toFixed(1)} ${unid})` : ''}`;

            (r.eventos_jornada || []).forEach(ev => {
              const m = (ev.nota_transcripcion || "").match(/(\d+)\s*izajes?/i);
              if (m) totalIzajesDia += parseInt(m[1], 10);
            });
          });
          if (totalIzajesDia > 0) {
            resumenMaquinas += `\n🏗️ *Total Izajes del Día:* ${totalIzajesDia}`;
          }
        }
      } catch (eHistoRep) {
        console.warn("[cierreHandler] Error consultando histórico diario del operador:", eHistoRep.message);
      }

      if (equipo?.tipo_seguimiento === 'vehiculo') {
        const kmFinalCalculado = kmFinal || reporteCompleto.km_final;
        const kmRecorridos = kmFinalCalculado && reporteCompleto.km_inicial ? (kmFinalCalculado - reporteCompleto.km_inicial) : null;
        const msgText = `✅ *Reporte Diario de Jornada consolidado con éxito.*\n\n🚗 Odómetro: ${reporteCompleto.km_inicial?.toLocaleString("es-CL") || "—"} → ${kmFinalCalculado?.toLocaleString("es-CL") || "—"} km\n${kmRecorridos !== null ? `⏱ Kilómetros recorridos: ${kmRecorridos.toLocaleString("es-CL")} km\n` : ""}${horasDetFinalTxt}${resumenMaquinas}\n\n📄 Descarga tu reporte aquí:\n👉 ${baseUrl}${pdfUrl}\n\n¡Buen término de jornada, ${personal.nombre_completo}! 👷‍♂️`;
        
        await guardarMensajeChat(supabase, phoneClean, "model", msgText, "texto", sesion.reporte_activo_id);
        await enviarMensajeWhatsApp(jid, phoneClean, msgText, !!audio, geminiKey);
      } else {
        const msgText = `✅ *Reporte Diario de Jornada consolidado con éxito.*\n\n📊 Horómetro: ${reporteCompleto.horometro_inicio} → ${horometroFinal || "—"} hrs\n${horometroFinal ? `⏱ Horas trabajadas: ${(horometroFinal - reporteCompleto.horometro_inicio).toFixed(1)} hrs\n` : ""}${horasDetFinalTxt}${resumenMaquinas}\n\n📄 Descarga tu reporte aquí:\n👉 ${baseUrl}${pdfUrl}\n\n¡Buen término de jornada, ${personal.nombre_completo}! 👷‍♂️`;
        
        await guardarMensajeChat(supabase, phoneClean, "model", msgText, "texto", sesion.reporte_activo_id);
        await enviarMensajeWhatsApp(jid, phoneClean, msgText, !!audio, geminiKey);
      }
    } catch (pdfErr) {
      console.error("[cierreHandler] Error generando PDF en segundo plano:", pdfErr.message);
      await supabase.from("sesiones_whatsapp").delete().eq("id", sesion.id);
      await enviarMensajeWhatsApp(jid, phoneClean,
        `✅ Jornada cerrada correctamente. Hubo un problema generando el PDF, pero tus datos están guardados. Contacta a tu supervisor.`,
        !!audio,
        geminiKey
      );
    }
  })().catch(err => {
    console.error("[cierreHandler] Error crítico en ejecución asíncrona de PDF:", err.message);
  });
}
