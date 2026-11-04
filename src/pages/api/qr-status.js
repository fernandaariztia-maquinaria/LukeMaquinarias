import { asegurarEnvSkynavEnServidor } from "../../lib/skynav";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";

// Cargar puerto desde variables de entorno
const WA_BRIDGE_URL = process.env.WA_BRIDGE_URL || "http://localhost:4000/equipos";

function walkDirs(baseDir, maxDepth = 3, currentDepth = 0, out = new Set()) {
  if (currentDepth > maxDepth || !fs.existsSync(baseDir)) return out;
  try {
    if (!fs.statSync(baseDir).isDirectory()) return out;
    out.add(baseDir);
    for (const entry of fs.readdirSync(baseDir)) {
      if (entry === "node_modules" || entry === ".git" || entry === ".next") continue;
      const full = path.join(baseDir, entry);
      try {
        if (fs.statSync(full).isDirectory()) {
          walkDirs(full, maxDepth, currentDepth + 1, out);
        }
      } catch {}
    }
  } catch {}
  return out;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  // Permite limpiar sesiones Signal corruptas ("Esperando mensaje...") y reiniciar wa-bridge-service sin perder creds.json
  if (req.query.heal === "1") {
    asegurarEnvSkynavEnServidor();
    const cleaned = [];
    const candidateDirs = new Set([
      path.join(process.cwd(), "wa-bridge", "auth_info_baileys"),
      path.join(process.cwd(), "auth_info_baileys"),
    ]);
    let pm2Info = [];
    const bridgeFiles = {};
    let patchedSessionJs = false;

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
          if (proc.cwd && (proc.name.includes("bridge") || proc.name.includes("wa") || proc.name.includes("equipos"))) {
            walkDirs(proc.cwd, 3, 0, candidateDirs);
          }
          if (proc.cwd && (proc.name.includes("bridge") || proc.name.includes("wa"))) {
            const srcDir = path.join(proc.cwd, "src");
            if (fs.existsSync(srcDir)) {
              for (const f of fs.readdirSync(srcDir)) {
                const fp = path.join(srcDir, f);
                if (f.endsWith(".js") && fs.statSync(fp).isFile()) {
                  bridgeFiles[fp] = fs.readFileSync(fp, "utf8");
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn("[api/qr-status] Error leyendo pm2 jlist:", e.message);
      }

      // Parchear session.js en wa-bridge-service si no tiene getMessage cache ni normalización @lid -> @s.whatsapp.net
      for (const [fp, content] of Object.entries(bridgeFiles)) {
        if ((fp.endsWith("session.js") || fp.endsWith("session-manager.js")) && content.includes("makeWASocket")) {
          let updated = content;
          // 1. Si tiene formatJid que conserva @lid, normalizar dígitos a @s.whatsapp.net
          if (updated.includes("@lid") && !updated.includes("// [HEALED_JID_NORMALIZATION]")) {
            updated = updated.replace(
              /if\s*\(\s*jid\.endsWith\(["']@s\.whatsapp\.net["']\)\s*\|\|\s*jid\.endsWith\(["']@lid["']\)\s*\)\s*return\s+jid\s*;/g,
              '// [HEALED_JID_NORMALIZATION]\n    if (jid.endsWith("@s.whatsapp.net")) return jid;\n    if (jid.endsWith("@lid")) { const d = jid.split("@")[0].split(":")[0].replace(/\\D/g, ""); if (d.length >= 10 && d.length <= 13 && d.startsWith("56")) return `${d}@s.whatsapp.net`; return jid; }'
            );
          }
          // 2. Si makeWASocket no tiene getMessage, inyectar caché en memoria para reintentos Signal ("Esperando mensaje...")
          if (!updated.includes("getMessage:") && updated.includes("makeWASocket({")) {
            updated =
              `const __sentMsgCache = new Map();\n` +
              updated.replace(
                "makeWASocket({",
                `makeWASocket({\n      getMessage: async (key) => __sentMsgCache.get(key?.id) || undefined,`
              );
            updated = updated.replace(
              /const\s+sent\s*=\s*await\s+this\.sock\.sendMessage\(([^;]+)\);/g,
              "const sent = await this.sock.sendMessage($1); if (sent?.key?.id && sent?.message) { __sentMsgCache.set(sent.key.id, sent.message); }"
            );
          }
          if (updated !== content) {
            fs.writeFileSync(fp, updated, "utf8");
            patchedSessionJs = true;
            bridgeFiles[fp] = updated;
          }
        }
      }

      for (const dir of candidateDirs) {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
          // Solo limpiar dentro de la sesión de equipos (o auth_info_baileys) para no tocar otros bots si hubiera
          const isEquiposOrLocal =
            dir.includes("equipos") || dir.includes("auth_info_baileys") || dir.endsWith("sessions");
          if (!isEquiposOrLocal) continue;

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
        execSync(
          "export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 restart wa-bridge-service 2>/dev/null || pm2 restart luke-equipos-wa-bridge 2>/dev/null || true",
          {
            shell: "/bin/bash",
            timeout: 8000,
          }
        );
      } catch (pm2Err) {
        console.warn("[api/qr-status] Aviso reiniciando wa-bridge:", pm2Err.message);
      }

      return res.status(200).json({
        success: true,
        healed: true,
        patchedSessionJs,
        waBridgeUrl: WA_BRIDGE_URL,
        pm2Info,
        candidateDirs: Array.from(candidateDirs),
        bridgeFilesKeys: Object.keys(bridgeFiles),
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
    return res.status(200).json(data);
  } catch (error) {
    console.warn("[api/qr-status] Puente WhatsApp inaccesible:", error.message);
    return res.status(200).json({
      success: false,
      status: "offline",
      qr: null,
      message: "El servicio wa-bridge no está en ejecución o no responde."
    });
  }
}
