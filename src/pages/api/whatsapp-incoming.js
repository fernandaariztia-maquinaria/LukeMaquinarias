import { createAdminClient } from "../../lib/supabase-server";
import { buscarPersonal } from "../../lib/bot/services/personalService";
import { obtenerSesionActiva } from "../../lib/bot/services/sessionService";
import { handleRegistroFlow } from "../../lib/bot/handlers/registroHandler";
import { handleAdminFlow } from "../../lib/bot/handlers/adminHandler";
import { handleCheckinFlow } from "../../lib/bot/handlers/checkinHandler";
import { handleJornadaFlow } from "../../lib/bot/handlers/jornadaHandler";
import { enviarMensajeWhatsApp } from "../../lib/bot/services/messageService";
import { transcribirAudioSupervisor } from "../../lib/gemini";
import { resolverRespuestaSupervisor } from "../../lib/bot/services/podConsultaService";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  // Validar secreto del bridge
  const bridgeSecret = process.env.WA_BRIDGE_SECRET;
  if (bridgeSecret?.trim()) {
    if (req.headers["x-wa-bridge-secret"] !== bridgeSecret) {
      console.warn("[whatsapp-incoming] 🚫 Secreto inválido");
      return res.status(401).json({ success: false, message: "No autorizado" });
    }
  }

  const { phone, jid, message, audio, image, localImagePath, senderPn, location } = req.body;
  const geminiKey = process.env.GEMINI_API_KEY;
  
  let searchPhone = senderPn || "";
  if (!searchPhone && jid && typeof jid === "string" && jid.includes("@s.whatsapp.net")) {
    searchPhone = jid.split("@")[0].split(":")[0];
  }
  if (!searchPhone) {
    searchPhone = phone || "";
    if (typeof searchPhone === "string") {
      searchPhone = searchPhone.split("@")[0].split(":")[0];
    }
  }
  const phoneClean = searchPhone.replace(/[^0-9]/g, "");

  if (!phoneClean) {
    return res.status(400).json({ success: false, message: "Falta phone" });
  }

  console.log(
    `[whatsapp-incoming] De: ${phoneClean} | ${audio ? "🎤 Audio" : image ? "📷 Imagen" : `💬 "${message}"`}`
  );

  // Simular presencia (escribiendo)
  const BRIDGE_URL = process.env.WA_BRIDGE_URL || "http://localhost:4000/equipos";
  const destJid = jid || `${phoneClean}@s.whatsapp.net`;
  fetch(`${BRIDGE_URL}/presence`, {
    method: "POST",
    headers: { 
      "Content-Type": "application/json",
      "x-wa-bridge-secret": process.env.WA_BRIDGE_SECRET
    },
    body: JSON.stringify({ to: destJid, state: audio ? "recording" : "composing" }),
  }).catch(() => {});

  let personal = null;
  let sesion = null;

  try {
    const supabase = createAdminClient();

    // 1. Resolver entidades core (Personal y Sesión activa)
    const [persRes, sesRes] = await Promise.all([
      buscarPersonal(supabase, phoneClean),
      obtenerSesionActiva(supabase, phoneClean)
    ]);
    personal = persRes;
    sesion = sesRes;

    const ctx = {
      supabase,
      personal,
      sesion,
      phoneClean,
      jid,
      message,
      audio,
      image,
      localImagePath,
      location,
      geminiKey: process.env.GEMINI_API_KEY
    };

    // 2. Ruteo por auto-registro si no está registrado
    if (!personal) {
      return await handleRegistroFlow(ctx, res);
    }

    const esAdmin = personal.rol === "Supervisor" || personal.rol === "Jefe de Area" || personal.rol === "Administrador";
    const msgUpper = (message || "").trim().toUpperCase();

    // --- Flujos Especiales del POD para Supervisores ---
    if (esAdmin) {
      // Caso 1: Registrar participación voluntaria en el POD
      if (msgUpper.startsWith("PARTICIPAR_POD")) {
        // Calcular fecha D+1 (el POD siempre es para mañana)
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        const fechaPOD = manana.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
        
        let proyectoId = personal.proyecto_actual_id || null;

        // Intentar extraer código de proyecto o UUID del mensaje (ej: PARTICIPAR_POD_EIMI00413 o PARTICIPAR_POD EIMI00413)
        const cleanMsg = (message || "").trim();
        const partes = cleanMsg.split(/[\s_]+/);
        if (partes.length > 1) {
          const arg = partes[1].trim();
          if (arg) {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg);
            if (isUuid) {
              proyectoId = arg;
            } else {
              // Buscar por codigo_cc
              const { data: proy } = await supabase
                .from("proyectos")
                .select("id")
                .eq("codigo_cc", arg.toUpperCase())
                .maybeSingle();
              if (proy) {
                proyectoId = proy.id;
              }
            }
          }
        }

        // 1. Registrar en pod_sesion_participantes (tabla en tiempo real)
        const { error: errPart } = await supabase
          .from("pod_sesion_participantes")
          .upsert(
            { fecha: fechaPOD, proyecto_id: proyectoId, personal_id: personal.id, joined_at: new Date().toISOString() },
            { onConflict: "fecha,proyecto_id,personal_id", ignoreDuplicates: false }
          );

        // También mantener compatibilidad con tabla legada participacion_pod
        try {
          await supabase
            .from("participacion_pod")
            .upsert(
              { fecha: fechaPOD, personal_id: personal.id, created_at: new Date().toISOString() },
              { onConflict: "fecha,personal_id" }
            );
        } catch (e) {}

        if (errPart) {
          console.error("[whatsapp-incoming] Error registrando participación POD:", errPart.message);
          await enviarMensajeWhatsApp(jid, phoneClean, `❌ Ocurrió un error al registrar tu participación. Por favor intenta más tarde.`, !!audio, geminiKey);
          return res.status(500).json({ success: false });
        }

        // 2. Buscar bloques asignados al supervisor para esa fecha
        const { data: bloques } = await supabase
          .from("planificacion_bloques_pod")
          .select(`
            hora_inicio, hora_fin, actividad_especifica,
            equipos ( codigo_interno, descripcion_equipo ),
            especialidades ( nombre_oficial )
          `)
          .eq("fecha", fechaPOD)
          .eq("supervisor_id", personal.id)
          .order("hora_inicio");

        // 3. Formatear fecha amigable
        const [y, m, d] = fechaPOD.split("-");
        const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        const fechaObj = new Date(Number(y), Number(m) - 1, Number(d));
        const fechaStr = `${dias[fechaObj.getDay()]} ${d} ${meses[Number(m) - 1]}`;

        // 4. Construir mensaje de respuesta
        let msgConfirmacion = `¡Hola *${personal.nombre_completo}*! 👷‍♂️ Quedaste inscrito en la POD.\n\n📅 *Planificación para ${fechaStr}:*\n`;

        if (!bloques || bloques.length === 0) {
          msgConfirmacion += `\n⏳ Aún no tienes bloques asignados. El Jefe de Área los definirá en la sala POD.\n\nTe avisaremos cuando quede todo listo. ✅`;
        } else {
          for (const b of bloques) {
            const ini = b.hora_inicio?.slice(0, 5) || "--:--";
            const fin = b.hora_fin?.slice(0, 5) || "--:--";
            const equipo = b.equipos?.codigo_interno || "?";
            const desc = b.equipos?.descripcion_equipo || "";
            const esp = b.especialidades?.nombre_oficial || "";
            const act = b.actividad_especifica ? `\n   📌 _${b.actividad_especifica}_` : "";
            msgConfirmacion += `\n🔧 *${ini}–${fin}* | ${equipo} ${desc ? `(${desc})` : ""}\n   🏗 ${esp}${act}`;
          }
          msgConfirmacion += `\n\n¡Que tengas una excelente jornada! 💪`;
        }

        await enviarMensajeWhatsApp(jid, phoneClean, msgConfirmacion, !!audio, geminiKey);
        return res.status(200).json({ success: true, action: "PARTICIPACION_POD_REGISTRADA" });
      }

      // Caso 2: Responder a una o varias consultas de actividad pendientes
      let respuestaTexto = (message || "").trim();
      if (audio && audio.data) {
        try {
          respuestaTexto = await transcribirAudioSupervisor(audio.data, audio.mimeType);
        } catch (errTrans) {
          console.error("[whatsapp-incoming] Error transcribiendo respuesta de supervisor:", errTrans.message);
        }
      }

      const resultadoConsulta = await resolverRespuestaSupervisor(supabase, {
        telefonoSupervisor: phoneClean,
        respuestaTexto,
        jid,
        phoneClean,
        audio,
        geminiKey,
      });

      if (resultadoConsulta.manejado) {
        return res.status(200).json({ success: true, action: resultadoConsulta.action });
      }
    }

    // Caso A: Flujo conversacional de administración para supervisores sin jornada activa
    if (esAdmin && !sesion && !msgUpper.startsWith("REPORTE:")) {
      return await handleAdminFlow(ctx, res);
    }

    // Caso B: Espera de lectura de check-in (inicial)
    if (sesion?.estado_espera === "ESPERANDO_CHECKIN_AUDIO") {
      return await handleCheckinFlow(ctx, res);
    }

    // Caso C: Hitos intermedios de jornada activa, cierre o comandos de inicio/check-in
    return await handleJornadaFlow(ctx, res);

  } catch (err) {
    console.error("[whatsapp-incoming] Error general:", err.message, err.stack);
    try {
      await enviarMensajeWhatsApp(jid, phoneClean, 
        `⚠️ *Aviso del Sistema*:\n\nHola ${personal?.nombre_completo || "Operador"}, tuvimos un inconveniente al procesar tu último mensaje o audio de voz.\n\nPor favor, **intenta nuevamente** escribiendo en texto o enviando un audio más corto. ¡Gracias!`,
        !!audio,
        process.env.GEMINI_API_KEY
      );
    } catch (sendErr) {
      console.error("[whatsapp-incoming] Error al enviar mensaje de fallback en catch:", sendErr.message);
    }
    return res.status(500).json({ success: false, error: err.message });
  }
}
