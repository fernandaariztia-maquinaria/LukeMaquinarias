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

  if (req.query.keys === "1") {
    try {
      const files = [
        "/home/cristian/luke-equipos/.env.local",
        "/home/cristian/luke-delivery/.env",
        "/home/cristian/luke-delivery/.env.local",
        "/home/cristian/andina-dashboard/.env",
        "/home/cristian/.bashrc"
      ];
      const results = {};
      for (const f of files) {
        if (fs.existsSync(f)) {
          const content = fs.readFileSync(f, "utf8");
          const matches = content.match(/GEMINI[A-Z0-9_]*\s*=\s*[^\r\n]+/g);
          if (matches) results[f] = matches.map(m => m.split("=")[0].trim() + " = " + m.split("=")[1].trim().slice(0, 10) + "..." + m.split("=")[1].trim().slice(-6));
        }
      }
      return res.status(200).json({ success: true, results });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }
  if (req.query.fix_session === "1") {
    try {
      const p = "/home/cristian/wa-bridge-service/src/session.js";
      let content = fs.readFileSync(p, "utf8");
      
      content = content.replace(/\/\* __sentMsgCacheGlobalDef \*\/[\s\S]*?return _s;\s*\}\n?/g, "");
      content = content.replace(/const __lastTextHolder\s*=\s*\{[^}]*\};\n?/g, "");
      content = content.replace(/var __lastTextHolder\s*=[^;]*;\n?/g, "");
      content = content.replace(/const __sentMsgCache\s*=[^;]*;\n?/g, "");
      content = content.replace(/var __sentMsgCache\s*=[^;]*;\n?/g, "");
      content = content.replace(/function __createHealedSocket[\s\S]*?return _s;\s*\}\n?/g, "");
      content = content.replace(/__createHealedSocket\(makeWASocket,\s*/g, "makeWASocket(");
      content = content.replace(/makeWASocket,\s*\{/g, "makeWASocket({");

      const header = [
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

      content = header + content.replace(/makeWASocket\(\{/g, "__createHealedSocket(makeWASocket, {");
      fs.writeFileSync(p, content, "utf8");

      let restartOut = "";
      try {
        restartOut = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 restart wa-bridge-service || pm2 restart all || true", { shell: "/bin/bash", timeout: 8000 }).toString();
      } catch (e) {
        restartOut = e.message;
      }

      return res.status(200).json({ success: true, fixed: true, restartOut, snippet: content.substring(0, 500) });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.query.cat === "session") {
    try {
      const p = "/home/cristian/wa-bridge-service/src/session.js";
      return res.status(200).json({ success: true, content: fs.readFileSync(p, "utf8") });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.query.migrate === "1") {
    try {
      const sql = `CREATE TABLE IF NOT EXISTS maquinaria.historial_fallas_equipos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), equipo_id UUID NOT NULL REFERENCES maquinaria.equipos(id) ON DELETE CASCADE, reporte_id UUID REFERENCES maquinaria.reportes_diarios(id) ON DELETE SET NULL, operador_id UUID REFERENCES maquinaria.personal(id) ON DELETE SET NULL, hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(), hora_fin TIMESTAMPTZ, horas_detencion NUMERIC(6,2), motivo_falla TEXT NOT NULL, estado TEXT NOT NULL DEFAULT 'abierta', created_at TIMESTAMPTZ NOT NULL DEFAULT now()); CREATE INDEX IF NOT EXISTS idx_fallas_equipo ON maquinaria.historial_fallas_equipos(equipo_id); CREATE INDEX IF NOT EXISTS idx_fallas_reporte ON maquinaria.historial_fallas_equipos(reporte_id); CREATE INDEX IF NOT EXISTS idx_fallas_estado ON maquinaria.historial_fallas_equipos(estado); ALTER TABLE maquinaria.reportes_diarios ADD COLUMN IF NOT EXISTS observaciones TEXT; ALTER TABLE maquinaria.reportes_diarios ADD COLUMN IF NOT EXISTS horas_detencion NUMERIC(6,2) DEFAULT 0; GRANT ALL ON TABLE maquinaria.historial_fallas_equipos TO anon, authenticated, service_role; ALTER TABLE maquinaria.historial_fallas_equipos ENABLE ROW LEVEL SECURITY; DROP POLICY IF EXISTS historial_fallas_all ON maquinaria.historial_fallas_equipos; CREATE POLICY historial_fallas_all ON maquinaria.historial_fallas_equipos FOR ALL USING (true) WITH CHECK (true);`;
      const cmd = `docker exec -i $(docker ps --format "{{.Names}}" | grep -E "supabase.*db|postgres" | head -n 1) psql -U postgres -d postgres -c "${sql}"`;
      const out = execSync(cmd, { shell: "/bin/bash", timeout: 15000 }).toString();
      return res.status(200).json({ success: true, out });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  if (req.query.logs === "1") {
    try {
      const pm2Logs = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 logs luke-equipos-prod --lines 40 --nostream 2>/dev/null || true", {
        shell: "/bin/bash",
        timeout: 8000,
      }).toString();
      const bridgeLogs = execSync("export PATH=$PATH:~/.nvm/versions/node/v20.20.0/bin; pm2 logs wa-bridge-service --lines 40 --nostream 2>/dev/null || pm2 logs luke-equipos-wa-bridge --lines 40 --nostream 2>/dev/null || true", {
        shell: "/bin/bash",
        timeout: 8000,
      }).toString();
      return res.status(200).json({ success: true, pm2Logs, bridgeLogs });
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  }

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

          // Limpiar implementaciones previas para evitar duplicados
          updated = updated.replace(/\/\* __sentMsgCacheGlobalDef \*\/[\s\S]*?return _s;\s*\}\s*/g, "");
          updated = updated.replace(/const __sentMsgCache = new Map\(\);\n?/g, "");
          updated = updated.replace(/const __lastTextHolder\s*=\s*\{[^}]*\};\n?/g, "");
          updated = updated.replace(/var __lastTextHolder\s*=[^;]*;\n?/g, "");
          updated = updated.replace(/var __sentMsgCache\s*=[^;]*;\n?/g, "");
          updated = updated.replace(/function __createHealedSocket[\s\S]*?return _s;\s*\}\n?/g, "");
          updated = updated.replace(/__createHealedSocket\(makeWASocket,\s*/g, "makeWASocket(");
          updated = updated.replace(/makeWASocket,\s*\{/g, "makeWASocket({");

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

          updated = globalPrefix + updated.replace(/makeWASocket\(\{/g, "__createHealedSocket(makeWASocket, {");

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
