/**
 * WA-Bridge - LukeMontaje
 * Microservicio WhatsApp basado en Baileys
 * Puerto: 3025 (separado del Delivery en 3015)
 * 
 * Las imágenes se envían como base64 al webhook de Next.js,
 * que se encarga de subirlas al bucket 'evidencias-montaje'
 * en Supabase Storage.
 */

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const qrcode = require("qrcode-terminal");
const pino = require("pino");
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { exec } = require("child_process");
require("dotenv").config({ path: path.join(__dirname, "../.env.local") });


const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const PORT = process.env.WA_BRIDGE_MONTAJE_PORT || 3025;
const WEBHOOK_URL =
  process.env.WA_MONTAJE_WEBHOOK_URL ||
  "http://localhost:3020/api/whatsapp-incoming";



let sock = null;
let connectionState = "disconnected";
let latestQr = null;

// Cache anti-duplicados (mismo patrón que LukeDelivery)
const processedMessageIds = new Map();
// Cache de mensajes enviados para responder a retry receipts de Signal ("Esperando mensaje...")
const sentMessagesCache = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [id, ts] of processedMessageIds.entries()) {
    if (now - ts > 5 * 60 * 1000) processedMessageIds.delete(id);
  }
  for (const [id, item] of sentMessagesCache.entries()) {
    if (now - item.ts > 30 * 60 * 1000) sentMessagesCache.delete(id);
  }
}, 60000);





// ================================================================
// CONEXIÓN WHATSAPP
// ================================================================
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[wa-bridge-montaje] Baileys v${version.join(".")}`);

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    syncFullHistory: false,
    markOnlineOnConnect: true,
    getMessage: async (key) => {
      const cached = key?.id ? sentMessagesCache.get(key.id) : null;
      // Nunca retornar undefined ante un retryReceipt de Signal para destrabar "Esperando mensaje..."
      return cached?.message || { conversation: "✅ Mensaje sincronizado (LukeEquipos)" };
    },
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      latestQr = qr;
      console.log("\n🔌 LukeMontaje WA-Bridge - Escanea este QR:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      connectionState = "disconnected";
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;
      console.log("[wa-bridge-montaje] Conexión cerrada, reconectando:", shouldReconnect);
      if (shouldReconnect) {
        connectToWhatsApp();
      } else {
        console.log("[wa-bridge-montaje] Sesión desvinculada (loggedOut). Limpiando credenciales para generar nuevo QR...");
        try {
          fs.rmSync("auth_info_baileys", { recursive: true, force: true });
        } catch (err) {
          console.error("[wa-bridge-montaje] Error limpiando credenciales:", err.message);
        }
        latestQr = null;
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      connectionState = "connected";
      latestQr = null;
      console.log("[wa-bridge-montaje] ✅ Conectado a WhatsApp (LukeMontaje)");
    } else if (connection === "connecting") {
      connectionState = "connecting";
    }
  });

  sock.ev.on("creds.update", saveCreds);

  // ================================================================
  // ESCUCHAR MENSAJES ENTRANTES
  // ================================================================
  sock.ev.on("messages.upsert", async (m) => {
    if (m.type !== "notify") return;

    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;

      const msgId = msg.key.id;
      if (msgId) {
        if (processedMessageIds.has(msgId)) {
          console.log(`[wa-bridge-montaje] Ignorando duplicado: ${msgId}`);
          continue;
        }
        processedMessageIds.set(msgId, Date.now());
      }

      const senderNumber = msg.key.remoteJid;
      const getCleanId = (jid) => (jid ? jid.split("@")[0].split(":")[0] : null);
      const mePhone = sock.user?.id ? getCleanId(sock.user.id) : null;
      const meLid = sock.user?.lid ? getCleanId(sock.user.lid) : null;
      const senderClean = getCleanId(senderNumber);

      if (
        (mePhone && senderClean === mePhone) ||
        (meLid && senderClean === meLid)
      ) continue;

      const messageText =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        "";

      const isAudio = !!msg.message?.audioMessage;
      const isImage = !!msg.message?.imageMessage;
      const isLocation = !!msg.message?.locationMessage || !!msg.message?.liveLocationMessage;

      if (!messageText.trim() && !isAudio && !isImage && !isLocation) continue;

      // --- Descargar audio ---
      let audioData = null;
      if (isAudio) {
        console.log(`[wa-bridge-montaje] 🎤 Audio de ${senderClean}`);
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {}, {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage,
          });
          audioData = {
            data: buffer.toString("base64"),
            mimeType: msg.message.audioMessage.mimetype || "audio/ogg; codecs=opus",
          };
        } catch (err) {
          console.error("[wa-bridge-montaje] Error descargando audio:", err.message);
        }
      }

      // --- Descargar imagen (solo base64, Storage lo maneja el webhook) ---
      let imageData = null;
      if (isImage) {
        console.log(`[wa-bridge-montaje] 📷 Imagen de ${senderClean}`);
        try {
          const buffer = await downloadMediaMessage(msg, "buffer", {}, {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage,
          });
          const mimeType = msg.message.imageMessage.mimetype || "image/jpeg";
          imageData = {
            data: buffer.toString("base64"),
            mimeType,
          };
          console.log(`[wa-bridge-montaje] Imagen codificada en base64 (${Math.round(buffer.length / 1024)} KB)`);
        } catch (err) {
          console.error("[wa-bridge-montaje] Error descargando imagen:", err.message);
        }
      }

      // --- Procesar geolocalización ---
      let locationData = null;
      if (isLocation) {
        const loc = msg.message?.locationMessage || msg.message?.liveLocationMessage;
        locationData = {
          latitude: loc.degreesLatitude,
          longitude: loc.degreesLongitude,
          name: loc.name || null,
          address: loc.address || null,
        };
        console.log(`[wa-bridge-montaje] 📍 Ubicación de ${senderClean}: ${loc.degreesLatitude}, ${loc.degreesLongitude}`);
      }

      // --- Enviar al webhook de Next.js ---
      try {
        const headers = { "Content-Type": "application/json" };
        if (process.env.WA_BRIDGE_SECRET) {
          headers["x-wa-bridge-secret"] = process.env.WA_BRIDGE_SECRET;
        }

        const pnClean = msg.key.senderPn ? getCleanId(msg.key.senderPn) : null;
        const effectivePhone = pnClean || senderClean;
        const effectiveJid = (senderNumber && senderNumber.endsWith("@lid") && pnClean)
          ? `${pnClean}@s.whatsapp.net`
          : senderNumber;

        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers,
          body: JSON.stringify({
            phone: effectivePhone,
            jid: effectiveJid,
            message: messageText,
            audio: audioData,
            image: imageData,
            location: locationData,
            timestamp: msg.messageTimestamp,
            senderPn: msg.key.senderPn || null,
          }),
        });

        console.log(`[wa-bridge-montaje] Webhook → ${response.status}`);
      } catch (err) {
        console.error("[wa-bridge-montaje] Error webhook:", err.message);
      }
    }
  });
}

// ================================================================
// API ENDPOINTS
// ================================================================

app.get("/qr", (req, res) => {
  res.json({ success: true, qr: latestQr, status: connectionState });
});

app.get("/status", (req, res) => {
  res.json({ success: true, status: connectionState, service: "luke-montaje-wa-bridge" });
});

// Enviar mensaje de texto o audio
app.post("/send", async (req, res) => {
  const { to, text, audioBase64 } = req.body;

  if (!to) {
    return res.status(400).json({ success: false, message: "Falta destinatario (to)" });
  }

  if (connectionState !== "connected" || !sock) {
    return res.status(503).json({ success: false, message: "WhatsApp no conectado" });
  }

  try {
    const formattedNum = to.includes("@")
      ? to
      : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;

    let sentMsg;

    if (audioBase64) {
      const pcmBuffer = Buffer.from(audioBase64, "base64");
      const tempId = crypto.randomBytes(16).toString("hex");
      const tempPcmPath = path.join(__dirname, `temp_${tempId}.pcm`);
      const tempOggPath = path.join(__dirname, `temp_${tempId}.ogg`);

      try {
        fs.writeFileSync(tempPcmPath, pcmBuffer);

        // Convertir PCM crudo de Gemini (24kHz Mono 16-bit LE) a Opus OGG para WhatsApp
        await new Promise((resolve, reject) => {
          exec(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${tempPcmPath}" -c:a libopus -b:a 64k "${tempOggPath}"`, (err, stdout, stderr) => {
            if (err) {
              console.error("[wa-bridge-montaje] Error de ffmpeg:", stderr);
              return reject(err);
            }
            resolve();
          });
        });

        const oggBuffer = fs.readFileSync(tempOggPath);

        sentMsg = await sock.sendMessage(formattedNum, {
          audio: oggBuffer,
          mimetype: "audio/ogg; codecs=opus",
          ptt: true,
        });
      } finally {
        try {
          if (fs.existsSync(tempPcmPath)) fs.unlinkSync(tempPcmPath);
          if (fs.existsSync(tempOggPath)) fs.unlinkSync(tempOggPath);
        } catch (cleanupErr) {
          console.error("[wa-bridge-montaje] Error al limpiar archivos temporales:", cleanupErr.message);
        }
      }
    } else {
      if (!text) {
        return res.status(400).json({ success: false, message: "Falta texto para enviar" });
      }
      sentMsg = await sock.sendMessage(formattedNum, { text });
    }

    if (sentMsg?.key?.id && sentMsg?.message) {
      sentMessagesCache.set(sentMsg.key.id, { message: sentMsg.message, ts: Date.now() });
    }

    res.json({ success: true, data: sentMsg });
  } catch (err) {
    console.error("[wa-bridge-montaje] Error sending message:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Enviar presencia (escribiendo/grabando)
app.post("/presence", async (req, res) => {
  const { to, state } = req.body;

  if (!to || !state) {
    return res.status(400).json({ success: false, message: "Falta 'to' o 'state'" });
  }

  if (connectionState !== "connected" || !sock) {
    return res.status(503).json({ success: false, message: "WhatsApp no conectado" });
  }

  try {
    const formattedNum = to.includes("@")
      ? to
      : `${to.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
    await sock.sendPresenceUpdate(state, formattedNum);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ================================================================
// ARRANCAR SERVIDOR
// ================================================================
app.listen(PORT, () => {
  console.log(`\n🚀 LukeMontaje WA-Bridge corriendo en puerto ${PORT}`);
  console.log(`📡 Webhook destino: ${WEBHOOK_URL}`);
  console.log(`📦 Fotos → Supabase Storage bucket 'evidencias-montaje'\n`);
  connectToWhatsApp();
});
