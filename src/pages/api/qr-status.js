import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Cargar puerto desde variables de entorno
const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL || "http://localhost:4000/equipos";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  // Permite limpiar sesiones Signal corruptas ("Esperando mensaje...") y reiniciar wa-bridge sin perder creds.json
  if (req.query.heal === "1") {
    const cleaned = [];
    try {
      const authDir = path.join(process.cwd(), "wa-bridge", "auth_info_baileys");
      if (fs.existsSync(authDir)) {
        const files = fs.readdirSync(authDir);
        for (const f of files) {
          if (f.startsWith("session-") && f.endsWith(".json")) {
            fs.unlinkSync(path.join(authDir, f));
            cleaned.push(f);
          }
        }
      }
      try {
        execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 restart luke-equipos-wa-bridge", {
          shell: "/bin/bash",
          timeout: 8000,
        });
      } catch (pm2Err) {
        console.warn("[api/qr-status] Aviso reiniciando wa-bridge:", pm2Err.message);
      }
      return res.status(200).json({ success: true, healed: true, cleanedSessionsCount: cleaned.length, cleaned });
    } catch (healErr) {
      return res.status(500).json({ success: false, error: healErr.message });
    }
  }

  try {
    const response = await fetch(`${WA_BRIDGE_URL}/qr`, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      return res.status(200).json({
        success: false,
        status: "disconnected",
        qr: null,
        message: `El puente de WhatsApp respondió con estado HTTP ${response.status}`
      });
    }

    const data = await response.json();
    return res.status(200).json({
      success: true,
      status: data.status || "disconnected",
      qr: data.qr || null
    });
  } catch (err) {
    console.error("[api/qr-status] Error conectando al puente de WhatsApp:", err.message);
    return res.status(200).json({
      success: false,
      status: "disconnected",
      qr: null,
      message: `No se pudo conectar al puente de WhatsApp en ${WA_BRIDGE_URL} (¿está corriendo?)`
    });
  }
}
