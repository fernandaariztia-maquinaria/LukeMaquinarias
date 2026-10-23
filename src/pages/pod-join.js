import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { CheckCircle, Loader2, Users, Calendar, Zap } from "lucide-react";

const COLOR_FALLBACK = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

export default function PodJoin() {
  const router = useRouter();
  const { fecha, proyecto_id } = router.query;

  const [personal, setPersonal] = useState([]);
  const [proyecto, setProyecto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(null);
  const [joined, setJoined] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [botPhone, setBotPhone] = useState("56940470139");

  // Cargar configuración del bot
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const r = await fetch("/api/config?clave=bot_phone");
        const json = await r.json();
        if (json.success && json.valor) {
          setBotPhone(json.valor);
        }
      } catch (e) {
        console.error("Error cargando teléfono de bot:", e);
      }
    };
    loadConfig();
  }, []);

  // Cargar personal del proyecto
  useEffect(() => {
    if (!proyecto_id || !fecha) return;
    const load = async () => {
      setLoading(true);
      try {
        const [rPersonal, rProyecto] = await Promise.all([
          fetch(`/api/personal`),
          fetch(`/api/proyectos`),
        ]);
        const jPersonal = await rPersonal.json();
        const jProyecto = await rProyecto.json();

        const supervisores = (jPersonal.data || []).filter(p =>
          (p.rol === "Supervisor" || p.rol === "Jefe de Area") &&
          p.proyecto_actual_id === proyecto_id
        );
        setPersonal(supervisores);

        const proy = (jProyecto.data || []).find(p => p.id === proyecto_id);
        setProyecto(proy);
      } catch (e) {
        setError("Error al cargar datos. Intenta de nuevo.");
      }
      setLoading(false);
    };
    load();
  }, [proyecto_id, fecha]);

  const handleJoin = async (persona) => {
    setJoining(persona.id);
    try {
      const r = await fetch("/api/pod/sesion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha, proyecto_id, personal_id: persona.id }),
      });
      const json = await r.json();
      if (json.success) {
        setJoined({
          nombre_completo: persona.nombre_completo,
          rol: persona.rol,
          especialidad: persona.especialidades?.nombre_oficial || null,
          color: persona.especialidades?.color || "#10b981",
        });
      } else {
        setError(json.error || "Error al unirse a la sesión.");
      }
    } catch (e) {
      setError("Error de conexión. Intenta de nuevo.");
    }
    setJoining(null);
  };

  const formatFecha = (str) => {
    if (!str) return "";
    const [y, m, d] = str.split("-");
    const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return `${dias[date.getDay()]} ${d} de ${meses[Number(m) - 1]} ${y}`;
  };

  const filtrados = personal.filter(p =>
    p.nombre_completo.toLowerCase().includes(search.toLowerCase())
  );

  // ────── Pantalla de éxito / EN SALA ──────
  if (joined) {
    return (
      <>
        <Head>
          <title>¡En la Sala POD! — LukeEquipos</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet" />
        </Head>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(ellipse at center, #071a0e 0%, #040d08 100%)",
          fontFamily: "'Poppins', sans-serif", color: "white", padding: "24px",
          textAlign: "center",
        }}>
          {/* Orbe de fondo animado */}
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "300px", height: "300px",
            borderRadius: "50%",
            background: `radial-gradient(circle, ${joined.color}18 0%, transparent 70%)`,
            animation: "breathe 3s ease-in-out infinite",
            pointerEvents: "none",
          }} />

          <div style={{ position: "relative", zIndex: 1 }}>
            {/* Avatar grande pulsante */}
            <div style={{
              width: "100px", height: "100px", borderRadius: "50%",
              background: `${joined.color}20`,
              border: `3px solid ${joined.color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 20px",
              boxShadow: `0 0 0 0 ${joined.color}60`,
              animation: "ringPulse 2s ease-out infinite",
              fontSize: "32px", fontWeight: 800, color: joined.color,
            }}>
              {joined.nombre_completo.split(" ").map(n => n[0]).slice(0, 2).join("")}
            </div>

            {/* Estado EN SALA */}
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)",
              borderRadius: "100px", padding: "6px 16px", marginBottom: "20px",
            }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 10px rgba(16,185,129,0.8)", animation: "blink 1.2s ease-in-out infinite" }} />
              <span style={{ color: "#10b981", fontSize: "12px", fontWeight: 800, letterSpacing: "0.5px", textTransform: "uppercase" }}>EN SALA</span>
            </div>

            <h1 style={{ fontSize: "26px", fontWeight: 800, marginBottom: "6px", lineHeight: 1.2 }}>
              {joined.nombre_completo.split(" ").slice(0, 2).join(" ")}
            </h1>

            {joined.especialidad && (
              <div style={{
                display: "inline-block",
                background: `${joined.color}18`,
                border: `1px solid ${joined.color}50`,
                borderRadius: "8px", padding: "4px 14px", marginBottom: "24px",
                color: joined.color, fontSize: "13px", fontWeight: 700,
              }}>
                {joined.especialidad}
              </div>
            )}

            {/* Info card */}
            <div style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "16px", padding: "20px 24px", marginBottom: "0",
              maxWidth: "320px", margin: "0 auto",
            }}>
              <div style={{ fontSize: "13px", color: "#94a3b8", lineHeight: 1.8 }}>
                <div>🏗 <span style={{ color: "#cbd5e1" }}>{proyecto?.codigo_cc} — {proyecto?.nombre_proyecto}</span></div>
                <div>📅 <span style={{ color: "#cbd5e1" }}>{formatFecha(fecha)}</span></div>
              </div>
              <div style={{
                marginTop: "16px", paddingTop: "16px",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                color: "#10b981", fontSize: "13px", fontWeight: 600,
              }}>
                El Jefe de Área puede verte en pantalla.<br />
                <span style={{ color: "#64748b", fontWeight: 400, fontSize: "12px" }}>Espera que te asignen un equipo.</span>
              </div>
            </div>

            {/* Botón para abrir WhatsApp y garantizar la ventana de 24h */}
            <a
              href={`https://wa.me/${botPhone}?text=PARTICIPAR_POD`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginTop: "20px",
                padding: "12px 20px",
                background: "linear-gradient(135deg, #10b981, #059669)",
                color: "white",
                borderRadius: "12px",
                textDecoration: "none",
                fontWeight: 700,
                fontSize: "13px",
                boxShadow: "0 4px 15px rgba(16, 185, 129, 0.25)",
                transition: "all 0.2s ease",
                maxWidth: "320px",
                margin: "20px auto 0",
              }}
            >
              <Zap size={14} /> Activar WhatsApp Bot
            </a>
          </div>
        </div>

        <style>{`
          @keyframes ringPulse {
            0% { box-shadow: 0 0 0 0 ${joined.color}60; }
            70% { box-shadow: 0 0 0 20px ${joined.color}00; }
            100% { box-shadow: 0 0 0 0 ${joined.color}00; }
          }
          @keyframes breathe {
            0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
            50% { transform: translate(-50%, -50%) scale(1.15); opacity: 1; }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </>
    );
  }

  // ────── Pantalla de unión ──────
  return (
    <>
      <Head>
        <title>Unirse al POD — LukeEquipos</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: "100vh",
        background: "radial-gradient(ellipse at top, #0f1f2e 0%, #060d14 100%)",
        fontFamily: "'Poppins', sans-serif", color: "white",
        display: "flex", flexDirection: "column",
      }}>
        {/* Header */}
        <div style={{
          background: "rgba(15,31,46,0.95)", backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          padding: "14px 20px",
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.eimontajes.com/wp-content/uploads/2025/09/logo-eimisa.svg"
            alt="EIMISA"
            style={{ height: "26px", filter: "brightness(0) invert(1)", opacity: 0.9 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "10px", color: "#10b981", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px" }}>
              Sala POD
            </div>
            <div style={{ fontSize: "13px", fontWeight: 700, marginTop: "1px" }}>
              {proyecto ? `${proyecto.codigo_cc} — ${proyecto.nombre_proyecto}` : "Cargando..."}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "11px" }}>
            <Calendar size={11} />
            <span>{formatFecha(fecha)}</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, padding: "24px 16px", maxWidth: "520px", width: "100%", margin: "0 auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", gap: "12px", color: "#64748b" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} />
              <span>Cargando sesión...</span>
            </div>
          ) : error ? (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "12px", padding: "16px", color: "#ef4444", textAlign: "center",
            }}>
              ⚠️ {error}
            </div>
          ) : (
            <>
              {/* Título */}
              <div style={{ marginBottom: "20px", textAlign: "center" }}>
                <div style={{
                  width: "52px", height: "52px", borderRadius: "50%",
                  background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 14px",
                  boxShadow: "0 0 20px rgba(16,185,129,0.15)",
                }}>
                  <Users size={24} color="#10b981" />
                </div>
                <h2 style={{ fontSize: "22px", fontWeight: 800, margin: "0 0 6px" }}>¿Quién eres?</h2>
                <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>
                  Toca tu tarjeta para unirte a la sala
                </p>
              </div>

              {/* Buscador */}
              {personal.length > 5 && (
                <input
                  type="text"
                  placeholder="Buscar nombre..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{
                    width: "100%", background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px",
                    color: "white", padding: "12px 16px", fontSize: "14px",
                    outline: "none", boxSizing: "border-box", marginBottom: "16px",
                    fontFamily: "inherit",
                  }}
                />
              )}

              {/* Grid de tarjetas identity */}
              {filtrados.length === 0 ? (
                <div style={{ color: "#64748b", textAlign: "center", padding: "40px", fontSize: "14px" }}>
                  No hay supervisores asignados a este proyecto.
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: filtrados.length === 1 ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: "12px" }}>
                  {filtrados.map((persona, idx) => {
                    const color = persona.especialidades?.color || COLOR_FALLBACK[idx % COLOR_FALLBACK.length];
                    const isJoining = joining === persona.id;
                    const initials = persona.nombre_completo.split(" ").map(n => n[0]).slice(0, 2).join("");
                    const firstName = persona.nombre_completo.split(" ")[0];
                    const lastName = persona.nombre_completo.split(" ").slice(1, 3).join(" ");

                    return (
                      <button
                        key={persona.id}
                        onClick={() => !isJoining && handleJoin(persona)}
                        disabled={isJoining}
                        style={{
                          background: `linear-gradient(145deg, ${color}18, ${color}08)`,
                          border: `1.5px solid ${color}50`,
                          borderRadius: "16px",
                          padding: "20px 16px",
                          cursor: isJoining ? "not-allowed" : "pointer",
                          color: "white", textAlign: "center", width: "100%",
                          transition: "all 0.2s",
                          opacity: isJoining ? 0.7 : 1,
                          display: "flex", flexDirection: "column", alignItems: "center", gap: "10px",
                          boxShadow: `0 4px 20px ${color}15`,
                        }}
                        onTouchStart={e => {
                          e.currentTarget.style.transform = "scale(0.96)";
                          e.currentTarget.style.boxShadow = `0 2px 30px ${color}40`;
                          e.currentTarget.style.borderColor = color;
                        }}
                        onTouchEnd={e => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow = `0 4px 20px ${color}15`;
                          e.currentTarget.style.borderColor = `${color}50`;
                        }}
                        onMouseEnter={e => {
                          if (isJoining) return;
                          e.currentTarget.style.transform = "translateY(-2px)";
                          e.currentTarget.style.boxShadow = `0 8px 32px ${color}35`;
                          e.currentTarget.style.borderColor = color;
                          e.currentTarget.style.background = `linear-gradient(145deg, ${color}28, ${color}12)`;
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.transform = "translateY(0)";
                          e.currentTarget.style.boxShadow = `0 4px 20px ${color}15`;
                          e.currentTarget.style.borderColor = `${color}50`;
                          e.currentTarget.style.background = `linear-gradient(145deg, ${color}18, ${color}08)`;
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width: "64px", height: "64px", borderRadius: "50%",
                          background: `${color}25`,
                          border: `2.5px solid ${color}`,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "22px", fontWeight: 800, color,
                          boxShadow: `0 0 20px ${color}30`,
                          flexShrink: 0,
                        }}>
                          {isJoining ? (
                            <Loader2 size={22} color={color} style={{ animation: "spin 1s linear infinite" }} />
                          ) : initials}
                        </div>

                        {/* Nombre */}
                        <div>
                          <div style={{ fontSize: "16px", fontWeight: 800, lineHeight: 1.2 }}>{firstName}</div>
                          <div style={{ fontSize: "13px", fontWeight: 500, color: "#94a3b8", lineHeight: 1.2 }}>{lastName}</div>
                        </div>

                        {/* Rol / Especialidad */}
                        {persona.especialidades ? (
                          <div style={{
                            background: `${color}20`, border: `1px solid ${color}50`,
                            borderRadius: "8px", padding: "3px 10px",
                            fontSize: "11px", fontWeight: 700, color,
                          }}>
                            {persona.especialidades.nombre_oficial}
                          </div>
                        ) : (
                          <div style={{ fontSize: "11px", color: "#64748b" }}>{persona.rol}</div>
                        )}

                        {/* CTA */}
                        {!isJoining && (
                          <div style={{
                            display: "flex", alignItems: "center", gap: "4px",
                            fontSize: "11px", fontWeight: 700, color: `${color}cc`,
                          }}>
                            <Zap size={11} />
                            Soy yo, unirme
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>
      </div>
    </>
  );
}
