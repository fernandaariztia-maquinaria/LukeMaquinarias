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

  if (req.query.cat === "session") {
    try {
      const p = "/home/cristian/wa-bridge-service/src/session.js";
      return res.status(200).json({ success: true, content: fs.readFileSync(p, "utf8") });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.query.logs === "1") {
    try {
      const pm2Logs = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 logs luke-equipos-prod --lines 40 --nostream 2>/dev/null", {
        shell: "/bin/bash",
        timeout: 8000,
      }).toString();
      const bridgeLogs = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 logs wa-bridge-service --lines 40 --nostream 2>/dev/null", {
        shell: "/bin/bash",
        timeout: 8000,
      }).toString();
      return res.status(200).json({ success: true, pm2Logs, bridgeLogs });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
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

      // Parchear session.js en wa-bridge-service con __createHealedSocket y __sentMsgCache global
      for (const [fp, content] of Object.entries(bridgeFiles)) {
        if ((fp.endsWith("session.js") || fp.endsWith("session-manager.js")) && content.includes("makeWASocket")) {
          let updated = content;

          // 1. Normalizar formato JID en wa-bridge para asegurar que los números chilenos salgan a @s.whatsapp.net
          updated = updated.replace(
            /formatJid\s*\([^)]*\)\s*\{[\s\S]*?return\s+[^;]+;\s*\}/g,
            `formatJid(jid) {
    if (!jid) return "";
    if (jid.endsWith("@g.us")) return jid;
    const digits = jid.split("@")[0].split(":")[0].replace(/\\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) return \`\${digits}@s.whatsapp.net\`;
    if (jid.endsWith("@s.whatsapp.net")) return jid;
    if (jid.endsWith("@lid")) return jid;
    return \`\${digits}@s.whatsapp.net\`;
  }`
          );

          // 2. Inyectar __createHealedSocket y __sentMsgCache de forma global e incondicional
          if (!updated.includes("__sentMsgCacheGlobalDef")) {
            const globalPrefix = [
              "/* __sentMsgCacheGlobalDef */",
              "global.__sentMsgCache = global.__sentMsgCache || new Map();",
              "global.__lastTextHolder = global.__lastTextHolder || { text: '' };",
              "var __sentMsgCache = global.__sentMsgCache;",
              "var __lastTextHolder = global.__lastTextHolder;",
              "function __createHealedSocket(makeFn, cfg) {",
              "  const _s = makeFn({",
              "    ...cfg,",
              "    getMessage: async (key) => {",
              "      const cached = key?.id ? (global.__sentMsgCache ? global.__sentMsgCache.get(key.id) : null) : null;",
              "      if (cached) return cached;",
              "      return { conversation: (global.__lastTextHolder ? global.__lastTextHolder.text : '') || 'Mensaje LukeEquipos' };",
              "    },",
              "  });",
              "  const _orig = _s.sendMessage.bind(_s);",
              "  _s.sendMessage = async (...a) => {",
              "    if (a[1] && typeof a[1].text === 'string' && global.__lastTextHolder) global.__lastTextHolder.text = a[1].text;",
              "    const r = await _orig(...a);",
              "    if (r?.key?.id && global.__sentMsgCache) {",
              "      const msgProto = r.message || (typeof a[1]?.text === 'string' ? { conversation: a[1].text } : a[1]);",
              "      if (msgProto) {",
              "        global.__sentMsgCache.set(r.key.id, msgProto);",
              "        if (global.__sentMsgCache.size > 2000) {",
              "          const fk = global.__sentMsgCache.keys().next().value;",
              "          global.__sentMsgCache.delete(fk);",
              "        }",
              "      }",
              "    }",
              "    return r;",
              "  };",
              "  return _s;",
              "}",
              "",
            ].join("\n");

            // Limpiar implementaciones previas para evitar duplicados
            updated = updated.replace(/const __sentMsgCache = new Map\(\);\n?/g, "");
            updated = updated.replace(/function __createHealedSocket[\s\S]*?return _s;\s*\}\n?/g, "");
            updated = updated.replace(/__createHealedSocket\(makeWASocket/g, "makeWASocket");

            updated = globalPrefix + updated.replace("makeWASocket({", "__createHealedSocket(makeWASocket, {");
          }

          if (updated !== content) {
            fs.writeFileSync(fp, updated, "utf8");
            patchedSessionJs = true;
            bridgeFiles[fp] = updated;
          }
        }
      }

      // IMPORTANTE: NO borrar session-*.json por defecto porque destruye el ratchet Signal activo con el teléfono.
      // Solo borrar si se pide explícitamente ?heal=1&reset_sessions=1
      if (req.query.reset_sessions === "1") {
        for (const dir of candidateDirs) {
          if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
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
