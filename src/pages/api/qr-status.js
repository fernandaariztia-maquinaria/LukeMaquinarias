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
    const candidateDirs = new Set([
      path.join(process.cwd(), "wa-bridge", "auth_info_baileys"),
      path.join(process.cwd(), "auth_info_baileys"),
    ]);
    let pm2Info = [];
    let bridgeSourcePreview = null;

    try {
      try {
        const rawPm2 = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 jlist", {
          shell: "/bin/bash",
          timeout: 8000,
        }).toString();
        const list = JSON.parse(rawPm2);
        pm2Info = list.map((p) => ({
          name: p.name,
          status: p.pm2_env?.status,
          cwd: p.pm2_env?.pm_cwd,
          exec_path: p.pm2_env?.pm_exec_path,
        }));

        for (const proc of pm2Info) {
          if (proc.cwd) {
            candidateDirs.add(path.join(proc.cwd, "auth_info_baileys"));
            candidateDirs.add(path.join(proc.cwd, "wa-bridge", "auth_info_baileys"));
            try {
              const sub = fs.readdirSync(proc.cwd);
              for (const s of sub) {
                if (s.startsWith("auth_info") || s.includes("session") || s.includes("baileys") || s.includes("equipos")) {
                  const fullSub = path.join(proc.cwd, s);
                  if (fs.statSync(fullSub).isDirectory()) {
                    candidateDirs.add(fullSub);
                    try {
                      for (const nested of fs.readdirSync(fullSub)) {
                        const fn = path.join(fullSub, nested);
                        if (fs.statSync(fn).isDirectory()) candidateDirs.add(fn);
                      }
                    } catch {}
                  }
                }
              }
            } catch {}
          }
          if (proc.exec_path && (proc.name.includes("bridge") || proc.name.includes("wa")) && fs.existsSync(proc.exec_path)) {
            bridgeSourcePreview = {
              path: proc.exec_path,
              content: fs.readFileSync(proc.exec_path, "utf8").slice(0, 4000),
            };
          }
        }
      } catch (e) {
        console.warn("[api/qr-status] Error leyendo pm2 jlist:", e.message);
      }

      for (const dir of candidateDirs) {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          const files = fs.readdirSync(dir);
          for (const f of files) {
            if (
              (f.startsWith("session-") || f.startsWith("device-list-") || f.startsWith("lid-mapping-")) &&
              f.endsWith(".json")
            ) {
              fs.unlinkSync(path.join(dir, f));
              cleaned.push(`${dir}/${f}`);
            }
          }
        }
      }

      try {
        execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 restart luke-equipos-wa-bridge luke-wa-bridge 2>/dev/null || pm2 restart luke-equipos-wa-bridge", {
          shell: "/bin/bash",
          timeout: 8000,
        });
      } catch (pm2Err) {
        console.warn("[api/qr-status] Aviso reiniciando wa-bridge:", pm2Err.message);
      }

      return res.status(200).json({
        success: true,
        healed: true,
        waBridgeUrl: WA_BRIDGE_URL,
        pm2Info,
        bridgeSourcePreview,
        cleanedSessionsCount: cleaned.length,
        cleaned,
      });
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
