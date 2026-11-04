const BRIDGE_URL = process.env.WA_BRIDGE_URL || "http://localhost:4000/equipos";

export async function enviarMensajeWhatsApp(jid, phoneClean, texto, tieneAudioEntrante = false, geminiKey = null) {
  const cleanDigits = String(phoneClean || "").replace(/[^0-9]/g, "");
  // CRÍTICO: Evitar enviar a JIDs @lid en mensajes directos 1:1 (causa "Esperando mensaje. Esto puede tomar tiempo.")
  const dest = (jid && String(jid).endsWith("@g.us"))
    ? jid
    : cleanDigits
      ? `${cleanDigits}@s.whatsapp.net`
      : (jid && String(jid).includes("@s.whatsapp.net") ? jid : `${String(jid || "").replace(/[^0-9]/g, "")}@s.whatsapp.net`);
  let audioBase64ParaEnviar = null;

  // Solo sintetizar si el usuario original envió audio y no hay URLs en la respuesta,
  // ni es un reporte o lista larga (por ejemplo, con más de 350 caracteres o estructura de lista).
  const contieneLink = texto.includes("http://") || texto.includes("https://") || texto.includes("lukeapp.cl") || texto.includes("lukeapp.me");
  const lineas = texto.split("\n");
  const tieneEstructuraLista = lineas.filter(line => line.trim().startsWith("-") || line.trim().startsWith("*") || /^\d+\./.test(line.trim())).length >= 3;
  const esReporteLargo = texto.length > 350 || tieneEstructuraLista;

  if (tieneAudioEntrante && texto && !contieneLink && !esReporteLargo && geminiKey) {
    try {
      const ttsModelName = "gemini-2.5-flash-preview-tts";
      console.log(`[messageService] 🎙️ Sintetizando voz con Gemini TTS: "${texto.substring(0, 50)}..."`);
      const ttsRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${ttsModelName}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: texto }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: "Charon" }
                }
              }
            }
          })
        }
      );

      if (ttsRes.ok) {
        const ttsData = await ttsRes.json();
        const ttsParts = ttsData.candidates?.[0]?.content?.parts || [];
        for (const part of ttsParts) {
          if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith("audio/")) {
            audioBase64ParaEnviar = part.inlineData.data;
            break;
          }
        }
      } else {
        const ttsErrBody = await ttsRes.text();
        console.error(`[messageService] Error TTS (${ttsRes.status}):`, ttsErrBody.substring(0, 200));
      }
    } catch (ttsErr) {
      console.error("[messageService] Error en síntesis de voz:", ttsErr.message);
    }
  }

  try {
    await fetch(`${BRIDGE_URL}/send`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-wa-bridge-secret": process.env.WA_BRIDGE_SECRET
      },
      body: JSON.stringify({
        to: dest,
        text: audioBase64ParaEnviar ? "" : texto,
        audioBase64: audioBase64ParaEnviar || null,
      }),
    });
  } catch (err) {
    console.error("[messageService] Error enviando mensaje a través del bridge:", err.message);
  }
}

export async function guardarMensajeChat(supabase, whatsapp_remitente, rol, contenido, tipo_mensaje = "texto", reporte_id = null) {
  const { data, error } = await supabase
    .from("mensajes_chat")
    .insert({ whatsapp_remitente, reporte_id, rol, tipo_mensaje, contenido })
    .select()
    .maybeSingle();
  if (error) {
    console.error("[mensajes_chat] Error guardando mensaje:", error.message);
    return null;
  }
  return data;
}

export async function cargarHistorialGemini(supabase, whatsapp_remitente, limite = 10, reporteId = null) {
  let query = supabase
    .from("mensajes_chat")
    .select("rol, contenido")
    .eq("whatsapp_remitente", whatsapp_remitente);

  if (reporteId) {
    query = query.eq("reporte_id", reporteId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error || !data?.length) return [];

  return data.reverse().map(msg => ({
    role: msg.rol, // 'user' o 'model'
    parts: [{ text: msg.contenido }]
  }));
}

export async function notificarSupervisor(supabase, supervisorId, mensaje) {
  if (!supervisorId) return;
  const { data: sup } = await supabase
    .from("personal")
    .select("whatsapp, nombre_completo")
    .eq("id", supervisorId)
    .maybeSingle();

  if (sup?.whatsapp) {
    await enviarMensajeWhatsApp(null, sup.whatsapp, `🚨 ALERTA CRÍTICA LukeMontaje:\n${mensaje}`);
  }
}
