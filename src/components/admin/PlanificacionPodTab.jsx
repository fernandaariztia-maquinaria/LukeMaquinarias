import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Calendar, ChevronLeft, ChevronRight,
  Loader2, Send, Trash2, X, Users, Wifi, QrCode, Clock,
  Copy, Check, Zap, Link2
} from "lucide-react";

// ================================================================
// CONSTANTES
// ================================================================
const HORA_INI = 7;  // 07:00
const HORA_FIN = 18; // 18:00
const HORAS_TOTAL = HORA_FIN - HORA_INI; // 11 horas
const SNAP_MIN = 30; // snap a 30 minutos

const COLOR_FALLBACK = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

// ================================================================
// HELPERS
// ================================================================
function horaStr(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minFromStr(str) {
  const [h, m] = (str || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function snapMin(min) {
  return Math.round(min / SNAP_MIN) * SNAP_MIN;
}

// Posición porcentual dentro del timeline (07:00–18:00)
function minToPct(min) {
  const clamp = Math.max(HORA_INI * 60, Math.min(HORA_FIN * 60, min));
  return ((clamp - HORA_INI * 60) / (HORAS_TOTAL * 60)) * 100;
}

function dateOffsetStr(base, offset) {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("sv-SE");
}

function formatFecha(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const dias = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${dias[date.getDay()]} ${d} ${meses[Number(m) - 1]} ${y}`;
}

function getColor(especialidades, espId, idx = 0) {
  if (espId) {
    const esp = especialidades.find(e => e.id === espId);
    if (esp?.color) return esp.color;
  }
  return COLOR_FALLBACK[idx % COLOR_FALLBACK.length];
}

// ================================================================
// COMPONENTE: Barra horaria del timeline
// ================================================================
function TimelineRuler() {
  const hours = Array.from({ length: HORAS_TOTAL + 1 }, (_, i) => HORA_INI + i);
  return (
    <div style={{ position: "relative", height: "28px", background: "var(--bg-sidebar, #f8fafc)" }}>
      {hours.map(h => (
        <div
          key={h}
          style={{
            position: "absolute",
            left: `${((h - HORA_INI) / HORAS_TOTAL) * 100}%`,
            top: 0, bottom: 0,
            display: "flex", flexDirection: "column", alignItems: "center",
            transform: "translateX(-50%)",
          }}
        >
          <div style={{
            fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted, #64748b)",
            lineHeight: "28px", letterSpacing: "0.3px", userSelect: "none",
          }}>
            {String(h).padStart(2, "0")}:00
          </div>
        </div>
      ))}
    </div>
  );
}

// ================================================================
// COMPONENTE: Bloque en el timeline (draggable + resizable)
// ================================================================
function BloqueTimeline({ bloque, equipoRowRef, especialidades, onResize, onDelete }) {
  const iniMin = minFromStr(bloque.hora_inicio?.slice(0, 5));
  const finMin = minFromStr(bloque.hora_fin?.slice(0, 5));
  const left = minToPct(iniMin);
  const width = minToPct(finMin) - minToPct(iniMin);
  const color = getColor(especialidades, bloque.especialidades?.id);

  const resizingRef = useRef(null);

  const handleResizeStart = (e, side) => {
    e.stopPropagation();
    e.preventDefault();
    const rowRect = equipoRowRef.current?.getBoundingClientRect();
    if (!rowRect) return;
    resizingRef.current = { side, startX: e.clientX, iniMin, finMin, rowWidth: rowRect.width };

    const onMove = (mv) => {
      const { side, startX, iniMin, finMin, rowWidth } = resizingRef.current;
      const deltaPx = mv.clientX - startX;
      const deltaMin = (deltaPx / rowWidth) * HORAS_TOTAL * 60;

      let newIni = iniMin, newFin = finMin;
      if (side === "left") {
        newIni = snapMin(iniMin + deltaMin);
        newIni = Math.max(HORA_INI * 60, Math.min(newFin - 30, newIni));
      } else {
        newFin = snapMin(finMin + deltaMin);
        newFin = Math.min(HORA_FIN * 60, Math.max(newIni + 30, newFin));
      }
      onResize(bloque.id, { iniMin: newIni, finMin: newFin, preview: true });
    };

    const onUp = (mu) => {
      const { side, startX, iniMin, finMin, rowWidth } = resizingRef.current;
      const deltaPx = mu.clientX - startX;
      const deltaMin = (deltaPx / rowWidth) * HORAS_TOTAL * 60;

      let newIni = iniMin, newFin = finMin;
      if (side === "left") {
        newIni = snapMin(iniMin + deltaMin);
        newIni = Math.max(HORA_INI * 60, Math.min(newFin - 30, newIni));
      } else {
        newFin = snapMin(finMin + deltaMin);
        newFin = Math.min(HORA_FIN * 60, Math.max(newIni + 30, newFin));
      }
      onResize(bloque.id, { iniMin: newIni, finMin: newFin, preview: false });
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const durMin = finMin - iniMin;
  const showLabel = durMin >= 60;

  return (
    <div
      title={`${bloque.supervisor?.nombre_completo || ""} | ${bloque.especialidades?.nombre_oficial || ""} · ${bloque.hora_inicio?.slice(0,5)}–${bloque.hora_fin?.slice(0,5)}`}
      style={{
        position: "absolute",
        left: `${left}%`,
        width: `${width}%`,
        top: "4px", bottom: "4px",
        background: `${color}30`,
        border: `2px solid ${color}`,
        borderRadius: "6px",
        display: "flex", alignItems: "center",
        overflow: "hidden",
        userSelect: "none",
        zIndex: 2,
        transition: "box-shadow 0.15s",
        cursor: "default",
      }}
      onMouseEnter={e => e.currentTarget.style.boxShadow = `0 2px 12px ${color}50`}
      onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
    >
      {/* Handle Izquierdo */}
      <div
        onMouseDown={e => handleResizeStart(e, "left")}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: "10px",
          cursor: "ew-resize", zIndex: 3,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: `${color}80` }} />
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, padding: "0 12px", overflow: "hidden" }}>
        {showLabel && (
          <div style={{ fontSize: "11px", fontWeight: 700, color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {bloque.supervisor?.nombre_completo?.split(" ").slice(0, 2).join(" ")}
          </div>
        )}
        <div style={{ fontSize: "10px", color: `${color}bb`, whiteSpace: "nowrap" }}>
          {bloque.hora_inicio?.slice(0, 5)}–{bloque.hora_fin?.slice(0, 5)}
        </div>
      </div>

      {/* Botón eliminar */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(bloque.id); }}
        style={{
          background: "none", border: "none", color: `${color}80`, cursor: "pointer",
          padding: "2px 4px", display: "flex", alignItems: "center",
          fontSize: "12px", flexShrink: 0,
        }}
        title="Eliminar bloque"
      >
        <X size={12} />
      </button>

      {/* Handle Derecho */}
      <div
        onMouseDown={e => handleResizeStart(e, "right")}
        style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: "10px",
          cursor: "ew-resize", zIndex: 3,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div style={{ width: "3px", height: "16px", borderRadius: "2px", background: `${color}80` }} />
      </div>
    </div>
  );
}

// ================================================================
// COMPONENTE: Tarjeta de Supervisor (arrastrable + click para asignar)
// ================================================================
function SupervisorCard({ participante, isDragging, onDragStart, bloquesCount, onDesconectar, onClick }) {
  const esp = participante.personal?.especialidades;
  const nombre = participante.personal?.nombre_completo || "?";
  const color = esp?.color || "#10b981";
  const initials = nombre.split(" ").map(n => n[0]).slice(0, 2).join("");

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, participante)}
      onClick={onClick}
      title="Clic para asignar · Arrastra sobre un equipo"
      style={{
        background: `${color}15`,
        border: `1.5px solid ${color}60`,
        borderRadius: "12px",
        padding: "12px 14px",
        cursor: "grab",
        userSelect: "none",
        display: "flex", alignItems: "center", gap: "10px",
        transition: "all 0.15s",
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        animation: "cardPulse 2.5s ease-in-out infinite",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "translateX(2px)";
        e.currentTarget.style.boxShadow = `0 4px 20px ${color}40`;
        e.currentTarget.style.animation = "none";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "translateX(0)";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.animation = "cardPulse 2.5s ease-in-out infinite";
      }}
    >
      {/* Botón desconectar */}
      {!participante.id.toString().startsWith("virtual-") && (
        <button
          onClick={e => { e.stopPropagation(); onDesconectar(participante); }}
          title="Desconectar"
          style={{
            position: "absolute", top: "4px", right: "4px",
            background: "none", border: "none", cursor: "pointer",
            color: "rgba(0,0,0,0.15)", padding: "2px",
            display: "flex", alignItems: "center",
            transition: "color 0.15s",
          }}
          onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
          onMouseLeave={e => e.currentTarget.style.color = "rgba(0,0,0,0.15)"}
        >
          <X size={11} />
        </button>
      )}

      {/* Avatar */}
      <div style={{
        width: "40px", height: "40px", borderRadius: "50%",
        background: `${color}30`, border: `2px solid ${color}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "14px", fontWeight: 800, color, flexShrink: 0,
        boxShadow: `0 0 10px ${color}50`,
      }}>
        {initials}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {nombre.split(" ").slice(0, 2).join(" ")}
        </div>
        {esp && (
          <div style={{ fontSize: "11px", color, fontWeight: 600, marginTop: "1px" }}>
            {esp.nombre_oficial}
          </div>
        )}
      </div>

      {/* Badges */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
        <div style={{
          width: "8px", height: "8px", borderRadius: "50%",
          background: "#10b981", boxShadow: "0 0 8px rgba(16,185,129,0.8)",
        }} />
        {bloquesCount > 0 && (
          <div style={{
            background: `${color}20`, border: `1px solid ${color}50`,
            borderRadius: "6px", padding: "1px 6px",
            fontSize: "10px", fontWeight: 800, color,
          }}>
            {bloquesCount}b
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// MODAL: Panel QR grande (tipo "mostrar en pantalla")
// ================================================================
function ModalQR({ qrImgSrc, podJoinUrl, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(podJoinUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(15, 23, 42, 0.3)", backdropFilter: "blur(6px)",
        zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "var(--bg-container, #ffffff)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          borderRadius: "20px", padding: "32px",
          width: "min(440px, 92vw)", textAlign: "center",
          boxShadow: "0 20px 50px rgba(0,0,0,0.1), 0 0 0 1px rgba(16, 185, 129, 0.05)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "8px",
              background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <QrCode size={16} color="#10b981" />
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "14px", fontWeight: 800, color: "var(--color-text, #1f2937)" }}>Escanea para unirte</div>
              <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 700 }}>SALA POD — EN VIVO</div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "rgba(0,0,0,0.04)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: "8px", cursor: "pointer", color: "var(--color-text-muted, #6b7280)", padding: "6px", display: "flex" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* QR grande */}
        <div style={{
          display: "inline-block", padding: "12px",
          background: "#ffffff", borderRadius: "16px",
          boxShadow: "0 10px 30px rgba(16,185,129,0.12), 0 1px 3px rgba(0,0,0,0.05)",
          border: "1px solid rgba(0, 0, 0, 0.04)",
          marginBottom: "20px",
        }}>
          {qrImgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrImgSrc} alt="QR Sala POD" style={{ width: "240px", height: "240px", display: "block", borderRadius: "8px" }} />
          ) : (
            <div style={{ width: "240px", height: "240px", display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontSize: "14px" }}>
              Sin QR disponible
            </div>
          )}
        </div>

        {/* Descripción */}
        <div style={{ color: "var(--color-text-muted, #6b7280)", fontSize: "13px", marginBottom: "18px", lineHeight: 1.5 }}>
          Escanea el código QR para abrir WhatsApp y enviar el mensaje.<br />
          Aparecerás automáticamente en la pantalla de la sala. 📱
        </div>

        {/* URL copiable */}
        {podJoinUrl && (
          <div style={{
            display: "flex", alignItems: "center", gap: "8px",
            background: "var(--bg-input, #f9fafb)", border: "1px solid var(--border-input, #d1d5db)",
            borderRadius: "10px", padding: "8px 12px", marginBottom: "12px",
          }}>
            <Link2 size={13} color="var(--color-text-muted, #6b7280)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: "11px", color: "var(--color-text-muted, #6b7280)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "left" }}>
              {podJoinUrl}
            </span>
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "rgba(16,185,129,0.15)" : "rgba(0,0,0,0.04)",
                border: `1px solid ${copied ? "rgba(16,185,129,0.3)" : "rgba(0,0,0,0.06)"}`,
                borderRadius: "6px", cursor: "pointer",
                color: copied ? "#059669" : "var(--color-text, #1f2937)",
                padding: "4px 8px", fontSize: "11px", fontWeight: 700,
                display: "flex", alignItems: "center", gap: "4px",
                transition: "all 0.2s",
              }}
            >
              {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ================================================================
// COMPONENTE: Fila de Equipo en el Timeline
// ================================================================
function EquipoRow({ equipo, bloques, participantes, especialidades, draggingSup, onDrop, onResize, onDelete }) {
  const rowRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const bloquesEquipo = bloques.filter(b => b.equipos?.id === equipo.id);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (!draggingSup) return;
    const rowRect = rowRef.current?.getBoundingClientRect();
    if (!rowRect) return;
    const pct = (e.clientX - rowRect.left) / rowRect.width;
    const totalMin = HORA_INI * 60 + pct * HORAS_TOTAL * 60;
    const snapIni = snapMin(Math.max(HORA_INI * 60, Math.min(HORA_FIN * 60 - 60, totalMin - 30)));
    const snapFin = Math.min(HORA_FIN * 60, snapIni + 60);
    onDrop(equipo, draggingSup, snapIni, snapFin);
  };

  return (
    <div style={{ display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--border-container, #e2e8f0)", minHeight: "54px" }}>
      {/* Label equipo */}
      <div style={{
        width: "130px", flexShrink: 0, padding: "8px 12px",
        background: "var(--bg-sidebar, #f8fafc)",
        borderRight: "1px solid var(--border-container, #e2e8f0)",
        display: "flex", flexDirection: "column", justifyContent: "center",
      }}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text)" }}>
          {equipo.codigo_interno}
        </div>
        <div style={{ fontSize: "10px", color: "var(--color-text-muted, #64748b)", marginTop: "1px", lineHeight: 1.2 }}>
          {equipo.descripcion_equipo?.slice(0, 24)}{equipo.descripcion_equipo?.length > 24 ? "…" : ""}
        </div>
      </div>

      {/* Timeline drop zone */}
      <div
        ref={rowRef}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          flex: 1, position: "relative",
          background: dragOver ? "rgba(16,185,129,0.06)" : "transparent",
          borderLeft: dragOver ? "2px solid #10b981" : "2px solid transparent",
          transition: "all 0.15s",
          minHeight: "54px",
        }}
      >
        {/* Grid de horas (líneas verticales) */}
        {Array.from({ length: HORAS_TOTAL + 1 }, (_, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${(i / HORAS_TOTAL) * 100}%`,
              top: 0, bottom: 0,
              width: "1px",
              background: i === 0 || i === HORAS_TOTAL ? "transparent" : "rgba(0,0,0,0.06)",
            }}
          />
        ))}

        {/* Drop hint */}
        {dragOver && bloquesEquipo.length === 0 && (
          <div style={{
            position: "absolute", inset: "6px", borderRadius: "6px",
            border: "2px dashed #10b981", display: "flex", alignItems: "center",
            justifyContent: "center", color: "#10b981", fontSize: "12px", fontWeight: 700,
            pointerEvents: "none", zIndex: 1,
          }}>
            Suelta aquí para asignar
          </div>
        )}

        {/* Bloques */}
        {bloquesEquipo.map(b => (
          <BloqueTimeline
            key={b.id}
            bloque={b}
            equipoRowRef={rowRef}
            especialidades={especialidades}
            onResize={onResize}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ================================================================
// MODAL: Confirmar asignación al hacer drop o click directo en tarjeta
// ================================================================
function obtenerSiguienteRangoDisponible(equipoId, bloques, duracionMin = 60) {
  const bloquesEquipo = (bloques || []).filter(b => b.equipos?.id === equipoId);
  const ocupados = bloquesEquipo.map(b => ({
    ini: minFromStr(b.hora_inicio),
    fin: minFromStr(b.hora_fin)
  }));

  for (let min = HORA_INI * 60; min <= HORA_FIN * 60 - duracionMin; min += 30) {
    const iniTest = min;
    const finTest = min + duracionMin;

    const solapa = ocupados.some(o => (iniTest < o.fin && finTest > o.ini));
    if (!solapa) {
      return { ini: iniTest, fin: finTest };
    }
  }
  return { ini: HORA_INI * 60, fin: (HORA_INI + 1) * 60 };
}

function ModalAsignacion({ data, especialidades, equiposList, onConfirm, onClose, saving, bloques }) {
  const supId = data.supervisor?.personal?.id;
  const esVirtual = supId === "11111111-1111-1111-1111-111111111111" || supId === "22222222-2222-2222-2222-222222222222";
  
  const getInitialEspId = () => {
    if (esVirtual) {
      const mantEsp = (especialidades || []).find(e => e.nombre_oficial.toLowerCase().includes("mantenimiento"));
      return mantEsp?.id || "";
    }
    return data.supervisor?.personal?.especialidad_id || "";
  };

  const getInitialActividad = () => {
    if (supId === "11111111-1111-1111-1111-111111111111") return "Mantenimiento Preventivo";
    if (supId === "22222222-2222-2222-2222-222222222222") return "Taller / Reparación";
    return "";
  };

  const getInitialHours = () => {
    if (data.iniMin && data.finMin) {
      return { ini: data.iniMin, fin: data.finMin };
    }
    const eqId = data.equipo?.id || "";
    if (eqId) {
      return obtenerSiguienteRangoDisponible(eqId, bloques);
    }
    return { ini: HORA_INI * 60, fin: (HORA_INI + 1) * 60 };
  };

  const initialHours = getInitialHours();

  const [tabModo, setTabModo] = useState(esVirtual ? "manual" : "eimiplanner"); // "eimiplanner" | "manual"
  const [form, setForm] = useState({
    hora_inicio: horaStr(initialHours.ini),
    hora_fin: horaStr(initialHours.fin),
    especialidad_id: getInitialEspId(),
    tarea_programada_id: "",
    descripcion: getInitialActividad(),
    motivo_manual: "",
    cantidad_planificada: "",
    unidad: "",
    equipo_id: data.equipo?.id || "",
  });

  const [selectedTaskObj, setSelectedTaskObj] = useState(null);
  const [tareasModal, setTareasModal] = useState([]);
  const [loadingTareas, setLoadingTareas] = useState(false);
  const [filtroActividadModal, setFiltroActividadModal] = useState("");

  // Cargar actividades desde /api/pod/actividades según especialidad
  useEffect(() => {
    if (!form.especialidad_id) {
      setTareasModal([]);
      setSelectedTaskObj(null);
      return;
    }
    setLoadingTareas(true);
    setSelectedTaskObj(null);
    fetch(`/api/pod/actividades?especialidad_id=${form.especialidad_id}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) setTareasModal(j.data || []);
        else setTareasModal([]);
      })
      .catch(() => setTareasModal([]))
      .finally(() => setLoadingTareas(false));
  }, [form.especialidad_id]);

  const tareasFiltradasModal = (tareasModal || []).filter(t => {
    if (!filtroActividadModal.trim()) return true;
    const q = filtroActividadModal.toLowerCase();
    return (
      (t.nombre && t.nombre.toLowerCase().includes(q)) ||
      (t.codigo && t.codigo.toLowerCase().includes(q)) ||
      (t.idtask && t.idtask.toLowerCase().includes(q)) ||
      (t.area && t.area.toLowerCase().includes(q)) ||
      (t.subarea && t.subarea.toLowerCase().includes(q)) ||
      (t.item_itemizado && t.item_itemizado.toLowerCase().includes(q)) ||
      (t.descripcion_partida && t.descripcion_partida.toLowerCase().includes(q))
    );
  });

  const horasOpciones = Array.from({ length: (HORA_FIN - HORA_INI) * 2 + 1 }, (_, i) => {
    const min = HORA_INI * 60 + i * 30;
    return horaStr(min);
  });

  const esp = data.supervisor?.personal?.especialidades;
  const nombre = data.supervisor?.personal?.nombre_completo || "";
  const color = esp?.color || "#10b981";
  const initials = nombre.split(" ").map(n => n[0]).slice(0, 2).join("");

  const bloquesEquipo = (bloques || []).filter(b => b.equipos?.id === (data.equipo?.id || form.equipo_id));
  const iniMinSel = minFromStr(form.hora_inicio);
  const finMinSel = minFromStr(form.hora_fin);
  const bloqueSolapado = bloquesEquipo.find(o => (iniMinSel < minFromStr(o.hora_fin) && finMinSel > minFromStr(o.hora_inicio)));
  const esHorarioInvalido = iniMinSel >= finMinSel;

  const handleSubmit = () => {
    if (tabModo === "eimiplanner" && selectedTaskObj) {
      const wbsTag = selectedTaskObj.codigo ? `[${selectedTaskObj.codigo}] ` : "";
      const areaTag = selectedTaskObj.area ? ` · Área: ${selectedTaskObj.area}` : "";
      const partidaTag = selectedTaskObj.descripcion_partida
        ? ` · Partida: ${selectedTaskObj.item_itemizado ? `[${selectedTaskObj.item_itemizado}] ` : ""}${selectedTaskObj.descripcion_partida}`
        : "";
      const actTexto = `${wbsTag}${selectedTaskObj.nombre}${areaTag}${partidaTag}`;

      onConfirm({
        ...form,
        origen_actividad: "eimiplanner",
        tarea_programada_id: selectedTaskObj.idtask,
        descripcion: selectedTaskObj.nombre,
        actividad_especifica: actTexto,
        unidad: form.unidad || selectedTaskObj.unid || "",
        equipo_id: data.equipo?.id || form.equipo_id,
        supervisor_id: data.supervisor.personal.id,
        fecha: data.fecha,
      });
    } else {
      const actTexto = `[MANUAL] ${form.descripcion || "Actividad adicional"}${form.motivo_manual ? ` · Motivo: ${form.motivo_manual}` : ""}`;
      onConfirm({
        ...form,
        origen_actividad: "manual",
        tarea_programada_id: null,
        actividad_especifica: actTexto,
        equipo_id: data.equipo?.id || form.equipo_id,
        supervisor_id: data.supervisor.personal.id,
        fecha: data.fecha,
      });
    }
  };

  const isFormValid =
    form.especialidad_id &&
    (data.equipo?.id || form.equipo_id) &&
    !bloqueSolapado &&
    !esHorarioInvalido &&
    ((tabModo === "eimiplanner" && selectedTaskObj) || (tabModo === "manual" && form.descripcion?.trim()));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "var(--bg-card, #fff)", borderRadius: "18px", padding: "24px 28px",
        width: "min(680px, 96vw)", maxHeight: "90vh", display: "flex", flexDirection: "column",
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)", border: "1px solid var(--border-container, #e2e8f0)",
      }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <Zap size={18} color="#10b981" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 800, color: "var(--color-text)" }}>
                Asignar Bloque Horario
              </h3>
              <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>
                Planificación Operativa de Equipos · Sala POD
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "4px" }}>
            <X size={20} />
          </button>
        </div>

        {/* Info Supervisor + Equipo */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
          <div style={{ display: "flex", gap: "10px", padding: "10px 12px", background: "rgba(16,185,129,0.06)", borderRadius: "10px", alignItems: "center" }}>
            <div style={{
              width: "34px", height: "34px", borderRadius: "50%",
              background: `${color}25`, border: `2px solid ${color}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "12px", fontWeight: 800, color, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {nombre}
              </div>
              {esp && <div style={{ fontSize: "10px", color, fontWeight: 700 }}>{esp.nombre_oficial}</div>}
            </div>
          </div>

          {data.equipo ? (
            <div style={{ padding: "10px 12px", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "10px", display: "flex", alignItems: "center", minWidth: 0 }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 800, color: "#1d4ed8" }}>
                  🚜 {data.equipo.codigo_interno}
                </div>
                <div style={{ fontSize: "11px", color: "var(--color-text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {data.equipo.descripcion_equipo}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <select
                value={form.equipo_id}
                onChange={e => setForm(f => ({ ...f, equipo_id: e.target.value }))}
                style={{ width: "100%", height: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "10px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
              >
                <option value="">Seleccionar equipo…</option>
                {(equiposList || []).map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.codigo_interno} — {eq.descripcion_equipo}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Selector de Horarios y Especialidad */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: "10px", marginBottom: "14px" }}>
          <div>
            <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Hora Inicio</label>
            <select
              value={form.hora_inicio}
              onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
              style={{ width: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {horasOpciones.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Hora Fin</label>
            <select
              value={form.hora_fin}
              onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))}
              style={{ width: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              {horasOpciones.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Especialidad</label>
            <select
              value={form.especialidad_id}
              onChange={e => {
                setForm(f => ({ ...f, especialidad_id: e.target.value, tarea_programada_id: "", descripcion: "" }));
                setSelectedTaskObj(null);
              }}
              style={{ width: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px", padding: "8px 10px", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              <option value="">Seleccionar especialidad…</option>
              {especialidades.map(e => <option key={e.id} value={e.id}>{e.nombre_oficial}</option>)}
            </select>
          </div>
        </div>

        {/* Pestañas de Modo: EIMIPLANNER vs Tarea Manual */}
        <div style={{ display: "flex", gap: "8px", marginBottom: "12px", borderBottom: "1px solid var(--border-container, #e2e8f0)", paddingBottom: "8px" }}>
          <button
            type="button"
            onClick={() => setTabModo("eimiplanner")}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "8px", border: "none",
              background: tabModo === "eimiplanner" ? "rgba(16, 185, 129, 0.15)" : "transparent",
              color: tabModo === "eimiplanner" ? "#059669" : "var(--color-text-muted)",
              fontWeight: tabModo === "eimiplanner" ? 800 : 600,
              fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              transition: "all 0.15s",
            }}
          >
            📋 Actividades EIMIPLANNER ({tareasModal.length})
          </button>
          <button
            type="button"
            onClick={() => setTabModo("manual")}
            style={{
              flex: 1, padding: "8px 12px", borderRadius: "8px", border: "none",
              background: tabModo === "manual" ? "rgba(59, 130, 246, 0.15)" : "transparent",
              color: tabModo === "manual" ? "#2563eb" : "var(--color-text-muted)",
              fontWeight: tabModo === "manual" ? 800 : 600,
              fontSize: "12px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
              transition: "all 0.15s",
            }}
          >
            ➕ Tarea Adicional / Manual
          </button>
        </div>

        {/* CONTENIDO SEGÚN MODO */}
        <div style={{ flex: 1, overflowY: "auto", minHeight: "160px", maxHeight: "250px", marginBottom: "14px", paddingRight: "4px" }}>
          {tabModo === "eimiplanner" ? (
            <div>
              <div style={{ marginBottom: "8px" }}>
                <input
                  type="text"
                  value={filtroActividadModal}
                  onChange={e => setFiltroActividadModal(e.target.value)}
                  placeholder="🔍 Buscar por nombre, WBS, área o partida..."
                  style={{
                    width: "100%", background: "var(--bg-input,#f8fafc)",
                    border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px",
                    padding: "8px 12px", fontSize: "12px", boxSizing: "border-box", outline: "none",
                  }}
                />
              </div>

              {loadingTareas ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Cargando actividades de EIMIPLANNER...
                </div>
              ) : tareasFiltradasModal.length === 0 ? (
                <div style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                  {tareasModal.length === 0
                    ? "No hay actividades de EIMIPLANNER para la especialidad seleccionada."
                    : "No se encontraron actividades con ese filtro."}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {tareasFiltradasModal.map((t) => {
                    const isSelected = selectedTaskObj?.idtask === t.idtask;
                    return (
                      <div
                        key={t.idtask}
                        onClick={() => {
                          setSelectedTaskObj(t);
                          setForm(f => ({
                            ...f,
                            tarea_programada_id: t.idtask,
                            descripcion: t.nombre,
                            unidad: t.unid || f.unidad,
                          }));
                        }}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "10px",
                          border: isSelected ? "2px solid #10b981" : "1px solid var(--border-container, #e2e8f0)",
                          background: isSelected ? "rgba(16, 185, 129, 0.08)" : "var(--bg-input, #f8fafc)",
                          cursor: "pointer",
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text)" }}>
                              {t.nombre}
                            </div>

                            {/* Área / Ubicación */}
                            {t.area && (
                              <div style={{ fontSize: "11px", color: "#059669", fontWeight: 600, marginTop: "2px", display: "flex", alignItems: "center", gap: "4px" }}>
                                <span>📍</span>
                                <span>{t.area}</span>
                                {t.subarea && t.subarea !== t.area && (
                                  <span style={{ color: "var(--color-text-muted)", fontWeight: 400 }}>· {t.subarea}</span>
                                )}
                              </div>
                            )}

                            {/* Partida / Itemizado */}
                            {(t.descripcion_partida || t.item_itemizado) && (
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "2px", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
                                {t.item_itemizado && (
                                  <span style={{ background: "rgba(59, 130, 246, 0.12)", color: "#2563eb", padding: "1px 5px", borderRadius: "3px", fontWeight: 700, fontSize: "10px" }}>
                                    {t.item_itemizado}
                                  </span>
                                )}
                                {t.descripcion_partida && (
                                  <span style={{ fontStyle: "italic" }}>
                                    {t.descripcion_partida}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* WBS y Task ID */}
                            <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", display: "flex", gap: "8px" }}>
                              {t.codigo && <span>WBS: <strong>{t.codigo}</strong></span>}
                              <span>ID: <strong>#{t.idtask}</strong></span>
                              {t.fechas && <span>Fechas: {t.fechas}</span>}
                              {t.unid && <span>Unidad: {t.unid}</span>}
                            </div>
                          </div>

                          {isSelected && (
                            <div style={{
                              background: "#10b981", color: "white", borderRadius: "50%",
                              width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center",
                              flexShrink: 0,
                            }}>
                              <Check size={12} />
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Descripción de la Tarea Manual *
                </label>
                <input
                  type="text"
                  value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="Ej: Apoyo extraordinario traslado de componentes"
                  style={{
                    width: "100%", background: "var(--bg-input,#f8fafc)",
                    border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px",
                    padding: "9px 12px", fontSize: "13px", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                  Motivo / Observación de Trabajo No Programado
                </label>
                <input
                  type="text"
                  value={form.motivo_manual}
                  onChange={e => setForm(f => ({ ...f, motivo_manual: e.target.value }))}
                  placeholder="Ej: Emergencia climática / solicitud urgente de faena"
                  style={{
                    width: "100%", background: "var(--bg-input,#f8fafc)",
                    border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px",
                    padding: "9px 12px", fontSize: "13px", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Cantidad y Unidad */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
          <div>
            <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Cantidad Planificada (Opcional)</label>
            <input
              type="number" value={form.cantidad_planificada}
              onChange={e => setForm(f => ({ ...f, cantidad_planificada: e.target.value }))}
              placeholder="Ej: 40"
              style={{ width: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div>
            <label style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>Unidad</label>
            <input
              type="text" value={form.unidad}
              onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
              placeholder="Ej: M3, ML, TON, GL"
              style={{ width: "100%", background: "var(--bg-input,#f8fafc)", border: "1px solid var(--border-input,#e2e8f0)", borderRadius: "8px", padding: "7px 10px", fontSize: "12px", outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* Advertencias */}
        {bloqueSolapado && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", color: "#dc2626", fontSize: "11px", fontWeight: 600, marginBottom: "10px" }}>
            ⚠️ Solapamiento de horario: Ya existe un bloque de {bloqueSolapado.supervisor?.nombre_completo || 'Mantenimiento'} ({bloqueSolapado.hora_inicio?.slice(0,5)} - {bloqueSolapado.hora_fin?.slice(0,5)}) para este equipo.
          </div>
        )}

        {esHorarioInvalido && (
          <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", color: "#dc2626", fontSize: "11px", fontWeight: 600, marginBottom: "10px" }}>
            ⚠️ La hora de inicio debe ser menor a la hora de fin.
          </div>
        )}

        {/* Footer */}
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "auto" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid var(--border-input,#e2e8f0)", background: "transparent", color: "var(--color-text-muted)", cursor: "pointer", fontSize: "13px", fontWeight: 600 }}>
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !isFormValid}
            style={{
              padding: "8px 20px", borderRadius: "8px", border: "none",
              background: "linear-gradient(135deg, #10b981, #059669)",
              color: "white", cursor: (saving || !isFormValid) ? "not-allowed" : "pointer",
              fontSize: "13px", fontWeight: 700, opacity: (saving || !isFormValid) ? 0.6 : 1,
              display: "flex", alignItems: "center", gap: "8px",
            }}
          >
            {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Zap size={14} />}
            Crear bloque
          </button>
        </div>
      </div>
    </div>
  );
}

// ================================================================
// COMPONENTE PRINCIPAL: PlanificacionPodTab
// ================================================================
export default function PlanificacionPodTab({ hookProps, currentUser, setCurrentUser }) {
  const { equiposCompleto, personalCompleto, especialidades, showMsg, saving, setSaving, botPhone } = hookProps;

  const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const manana = dateOffsetStr(hoy, 1);

  const [fechaPOD, setFechaPOD] = useState(manana);
  const [bloques, setBloques] = useState([]);
  const [loadingBloques, setLoadingBloques] = useState(false);
  const [participantes, setParticipantes] = useState([]);
  const [draggingSup, setDraggingSup] = useState(null);
  const [pendingDrop, setPendingDrop] = useState(null);
  const [pendingAssign, setPendingAssign] = useState(null); // asignación directa por click en tarjeta
  const [enviandoPOD, setEnviandoPOD] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);

  const pollRef = useRef(null);

  // ── Contexto del proyecto ──
  const proyectoActivoId = currentUser?.proyecto_actual_id || null;
  const proyectoActivoInfo = currentUser?.proyecto || null;

  // ── Datos filtrados ──
  const todosLosEquipos = equiposCompleto.data || [];
  const equiposList = proyectoActivoId
    ? todosLosEquipos.filter(eq => eq.proyecto_actual_id === proyectoActivoId)
    : todosLosEquipos;

  const especialidadesList = especialidades.data || [];

  // ── URL del QR → WhatsApp directo para unirse sin abrir web ──
  const projectCode = proyectoActivoInfo?.codigo_cc || proyectoActivoId || "";
  const cleanBotPhone = botPhone ? botPhone.replace(/[^0-9]/g, "") : "56940470139";
  const podJoinUrl = projectCode
    ? `https://wa.me/${cleanBotPhone}?text=PARTICIPAR_POD_${projectCode}`
    : "";
  const qrImgSrc = podJoinUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(podJoinUrl)}&bgcolor=ffffff&color=000000&margin=10`
    : null;

  // ── Cargar bloques ──
  const cargarBloques = useCallback(async () => {
    setLoadingBloques(true);
    try {
      const params = new URLSearchParams({ fecha: fechaPOD });
      if (proyectoActivoId) params.set("proyecto_id", proyectoActivoId);
      const r = await fetch(`/api/pod/bloques?${params}`);
      const json = await r.json();
      if (json.success) setBloques(json.data || []);
    } catch (e) { console.error(e); }
    setLoadingBloques(false);
  }, [fechaPOD, proyectoActivoId]);

  // ── Cargar participantes (polling) ──
  const cargarParticipantes = useCallback(async () => {
    if (!proyectoActivoId) return;
    try {
      const r = await fetch(`/api/pod/sesion?fecha=${fechaPOD}&proyecto_id=${proyectoActivoId}`);
      const json = await r.json();
      if (json.success) setParticipantes(json.data || []);
    } catch {}
  }, [fechaPOD, proyectoActivoId]);

  useEffect(() => { cargarBloques(); }, [cargarBloques]);
  useEffect(() => { cargarParticipantes(); }, [cargarParticipantes]);

  // Polling de participantes cada 4s
  useEffect(() => {
    pollRef.current = setInterval(() => cargarParticipantes(), 4000);
    return () => clearInterval(pollRef.current);
  }, [cargarParticipantes]);

  // ── Añadir participantes virtuales de Mantenimiento y Taller al listado de conectados ──
  const participantesConVirtuales = [
    {
      id: "virtual-mant-prev",
      fecha: fechaPOD,
      proyecto_id: proyectoActivoId,
      personal_id: "11111111-1111-1111-1111-111111111111",
      joined_at: new Date().toISOString(),
      personal: {
        id: "11111111-1111-1111-1111-111111111111",
        nombre_completo: "Mantenimiento Preventivo",
        rol: "Supervisor",
        especialidades: {
          nombre_oficial: "Mantenimiento",
          color: "#d97706"
        }
      }
    },
    {
      id: "virtual-mant-rep",
      fecha: fechaPOD,
      proyecto_id: proyectoActivoId,
      personal_id: "22222222-2222-2222-2222-222222222222",
      joined_at: new Date().toISOString(),
      personal: {
        id: "22222222-2222-2222-2222-222222222222",
        nombre_completo: "Taller / Reparación",
        rol: "Supervisor",
        especialidades: {
          nombre_oficial: "Mantenimiento",
          color: "#dc2626"
        }
      }
    },
    ...participantes
  ];

  // ── Supervisores del proyecto aún NO conectados ──
  const todoElPersonal = personalCompleto.data || [];
  const supervisoresProyecto = todoElPersonal.filter(p =>
    (p.rol === "Supervisor" || p.rol === "Jefe de Area") &&
    (!proyectoActivoId || p.proyecto_actual_id === proyectoActivoId)
  );
  const idsConectados = new Set(participantesConVirtuales.map(pa => pa.personal?.id));
  const supervisoresPendientes = supervisoresProyecto.filter(s => !idsConectados.has(s.id));

  // ── Contar bloques asignados por supervisor ──
  const bloquesPorSupervisor = participantesConVirtuales.reduce((acc, pa) => {
    const supId = pa.personal?.id;
    if (!supId) return acc;
    acc[supId] = bloques.filter(b => b.supervisor?.id === supId).length;
    return acc;
  }, {});

  // ── Preview local de resize ──
  const handleResize = useCallback((bloqueId, { iniMin, finMin, preview }) => {
    setBloques(prev => prev.map(b => b.id !== bloqueId ? b : {
      ...b,
      hora_inicio: horaStr(iniMin) + ":00",
      hora_fin: horaStr(finMin) + ":00",
    }));
    if (!preview) {
      fetch("/api/pod/bloques", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bloqueId,
          hora_inicio: horaStr(iniMin) + ":00",
          hora_fin: horaStr(finMin) + ":00",
        }),
      }).then(() => cargarBloques());
    }
  }, [cargarBloques]);

  // ── Eliminar bloque ──
  const handleDeleteBloque = async (id) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/pod/bloques?id=${id}`, { method: "DELETE" });
      const json = await r.json();
      if (json.success) { showMsg("✅ Bloque eliminado"); cargarBloques(); }
      else showMsg(`❌ ${json.error}`, false);
    } catch (e) { showMsg(`❌ ${e.message}`, false); }
    setSaving(false);
  };

  // ── Drop de supervisor sobre equipo ──
  const handleDrop = (equipo, supervisor, iniMin, finMin) => {
    setPendingDrop({ equipo, supervisor, iniMin, finMin, fecha: fechaPOD });
  };

  // ── Click en tarjeta conectada → modal de asignación directa ──
  const handleCardClick = (participante) => {
    setPendingAssign({
      supervisor: participante,
      equipo: null,
      iniMin: 7 * 60,
      finMin: 8 * 60,
      fecha: fechaPOD,
    });
  };

  // ── Click en tarjeta PENDIENTE → asignar igual aunque no asistió ──
  // El supervisor pendiente tiene estructura plana (s.id, s.nombre_completo...)
  // lo adaptamos al formato {personal: ...} que espera el modal.
  const handlePendingCardClick = (supervisor) => {
    setPendingAssign({
      supervisor: { personal: supervisor },
      equipo: null,
      iniMin: 7 * 60,
      finMin: 8 * 60,
      fecha: fechaPOD,
    });
  };

  // ── Desconectar supervisor ──
  const handleDesconectar = async (participante) => {
    try {
      await fetch(`/api/pod/sesion?fecha=${fechaPOD}&proyecto_id=${proyectoActivoId}&personal_id=${participante.personal?.id}`, {
        method: "DELETE"
      });
      cargarParticipantes();
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    }
  };

  // ── Confirmar asignación desde modal (drop o click) ──
  const handleConfirmDrop = async (formData) => {
    setSaving(true);
    try {
      const r = await fetch("/api/pod/bloques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Bloque creado");
        setPendingDrop(null);
        setPendingAssign(null);
        cargarBloques();
      } else {
        showMsg(`❌ ${json.error}`, false);
      }
    } catch (e) { showMsg(`❌ ${e.message}`, false); }
    setSaving(false);
  };

  // ── Inicializar POD ──
  const handleInicializarPOD = async () => {
    if (!window.confirm(`¿Cerrar e inicializar el POD para el ${formatFecha(fechaPOD)}?\n\nSe enviará el resumen de asignaciones por WhatsApp a cada supervisor con equipos planificados.`)) return;
    setEnviandoPOD(true);
    try {
      const r = await fetch("/api/pod/finalizar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fecha: fechaPOD, proyecto_id: proyectoActivoId })
      });
      const json = await r.json();
      if (json.success) showMsg(`✅ POD inicializado — ${json.alertas_enviadas || 0} alertas enviadas`);
      else showMsg(`❌ ${json.message || json.error}`, false);
    } catch (e) { showMsg(`❌ ${e.message}`, false); }
    setEnviandoPOD(false);
  };

  // ================================================================
  // RENDER
  // ================================================================
  return (
    <div style={{ padding: "20px 24px", maxWidth: "1600px", fontFamily: "'Poppins', sans-serif" }}>
      {/* ── HEADER ── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: "20px", fontWeight: 800, color: "var(--color-text)", margin: 0 }}>
              📋 Sala POD
            </h1>
            {proyectoActivoInfo && (
              <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                <span style={{ color: "#10b981", fontWeight: 700 }}>{proyectoActivoInfo.codigo_cc}</span>
                {" · "}{proyectoActivoInfo.nombre_proyecto}
              </div>
            )}
          </div>

          {/* Selector de proyecto directo en la Sala POD para Administrador */}
          {currentUser?.rol === "Administrador" && (hookProps.proyectosCompleto?.data || []).length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--bg-sidebar)", border: "1px solid var(--border-sidebar)", borderRadius: "10px", padding: "5px 10px" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)" }}>Proyecto:</span>
              <select
                value={proyectoActivoId || ""}
                onChange={e => {
                  const val = e.target.value;
                  const projList = hookProps.proyectosCompleto?.data || [];
                  const found = projList.find(p => p.id === val);
                  if (setCurrentUser) {
                    const updated = {
                      ...currentUser,
                      proyecto_actual_id: val || null,
                      proyecto: found || null
                    };
                    setCurrentUser(updated);
                    try {
                      localStorage.setItem("luke_filtro_proyecto_id", val || "");
                      localStorage.setItem("luke_user", JSON.stringify(updated));
                    } catch (err) {}
                  }
                }}
                style={{
                  background: "none",
                  border: "none",
                  outline: "none",
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--color-text)",
                  cursor: "pointer",
                  maxWidth: "280px"
                }}
              >
                <option value="">Selecciona Proyecto para la POD...</option>
                {(hookProps.proyectosCompleto.data || []).map(p => (
                  <option key={p.id} value={p.id}>{p.codigo_cc} — {p.nombre_proyecto}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Navegación de fecha */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "var(--bg-sidebar)", border: "1px solid var(--border-sidebar)", borderRadius: "10px", padding: "5px 10px" }}>
            <button onClick={() => setFechaPOD(dateOffsetStr(fechaPOD, -1))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>
              <ChevronLeft size={15} />
            </button>
            <Calendar size={13} style={{ color: "#10b981" }} />
            <input
              type="date" value={fechaPOD}
              onChange={e => setFechaPOD(e.target.value)}
              style={{ background: "none", border: "none", outline: "none", fontSize: "13px", fontWeight: 700, color: "var(--color-text)", cursor: "pointer", fontFamily: "inherit" }}
            />
            <button onClick={() => setFechaPOD(dateOffsetStr(fechaPOD, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>
              <ChevronRight size={15} />
            </button>
          </div>

          <button
            onClick={cargarBloques}
            style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-sidebar)", borderRadius: "8px", padding: "7px 10px", cursor: "pointer", color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}
            title="Recargar"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={handleInicializarPOD}
            disabled={enviandoPOD}
            style={{
              background: "linear-gradient(135deg, #10b981, #059669)", border: "none",
              borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
              color: "white", fontSize: "12px", fontWeight: 700,
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            {enviandoPOD ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Send size={13} />}
            {enviandoPOD ? "Enviando..." : "📲 Inicializar POD y enviar WA"}
          </button>
        </div>
      </div>

      {/* ── BODY: SPLIT PANEL ── */}
      <div style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>

        {/* ═══════════ PANEL IZQUIERDO: Supervisores ═══════════ */}
        <div style={{
          width: "260px", flexShrink: 0,
          background: "var(--bg-container, #fff)",
          border: "1px solid var(--border-container, #e2e8f0)",
          borderRadius: "14px",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
        }}>
          {/* Header panel */}
          <div style={{
            padding: "14px 16px",
            background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(5,150,105,0.04))",
            borderBottom: "1px solid var(--border-container, #e2e8f0)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={15} color="#10b981" />
                <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text)" }}>Supervisores</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#10b981", boxShadow: "0 0 6px rgba(16,185,129,0.6)", animation: "pulse 2s infinite" }} />
                <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 700 }}>EN VIVO</span>
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
              {participantesConVirtuales.length} conectado{participantesConVirtuales.length !== 1 ? "s" : ""} · Arrastra o clic para asignar
            </div>
          </div>

          {/* Supervisores conectados */}
          <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
            {participantesConVirtuales.length === 0 && (
              <div style={{ padding: "16px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                Esperando supervisores…<br />
                <span style={{ fontSize: "11px", opacity: 0.7 }}>Comparte el QR para que se unan</span>
              </div>
            )}
            {participantesConVirtuales.map(p => (
              <SupervisorCard
                key={p.id}
                participante={p}
                isDragging={draggingSup?.id === p.id}
                bloquesCount={bloquesPorSupervisor[p.personal?.id] || 0}
                onDragStart={(e, part) => {
                  setDraggingSup(part);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDesconectar={handleDesconectar}
                onClick={() => handleCardClick(p)}
              />
            ))}

            {/* Separador: pendientes */}
            {supervisoresPendientes.length > 0 && (
              <div style={{ margin: "4px 0" }}>
                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{ flex: 1, height: "1px", background: "var(--border-container,#e2e8f0)" }} />
                  Pendiente
                  <div style={{ flex: 1, height: "1px", background: "var(--border-container,#e2e8f0)" }} />
                </div>
                  {supervisoresPendientes.map(s => {
                    const color = s.especialidades?.color || "#6b7280";
                    return (
                      <div
                        key={s.id}
                        onClick={() => handlePendingCardClick(s)}
                        title="Clic para asignar equipo aunque no asistió a la POD"
                        style={{
                          display: "flex", alignItems: "center", gap: "8px",
                          padding: "10px 12px", borderRadius: "10px",
                          background: "rgba(107,114,128,0.06)", border: "1px dashed rgba(107,114,128,0.3)",
                          marginBottom: "6px", opacity: 0.75,
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.opacity = "1";
                          e.currentTarget.style.background = "rgba(107,114,128,0.12)";
                          e.currentTarget.style.border = "1px solid rgba(107,114,128,0.4)";
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.opacity = "0.75";
                          e.currentTarget.style.background = "rgba(107,114,128,0.06)";
                          e.currentTarget.style.border = "1px dashed rgba(107,114,128,0.3)";
                        }}
                      >
                        <div style={{
                          width: "30px", height: "30px", borderRadius: "50%",
                          background: "rgba(107,114,128,0.1)", border: "1px dashed rgba(107,114,128,0.3)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "11px", fontWeight: 700, color: "#6b7280", flexShrink: 0,
                        }}>
                          {s.nombre_completo.split(" ").map(n => n[0]).slice(0, 2).join("")}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.nombre_completo.split(" ").slice(0, 2).join(" ")}
                          </div>
                          {s.especialidades && (
                            <div style={{ fontSize: "10px", color, fontWeight: 600 }}>{s.especialidades.nombre_oficial}</div>
                          )}
                        </div>
                        {/* Indicador: sin conectar, pero asignable */}
                        <div style={{ fontSize: "10px", color: "#9ca3af", fontWeight: 600, flexShrink: 0 }}>
                          + asignar
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Botón QR → abre modal grande */}
          {proyectoActivoId && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid var(--border-container, #e2e8f0)" }}>
              <button
                onClick={() => setShowQRModal(true)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  background: "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))",
                  border: "1px solid rgba(16,185,129,0.35)", borderRadius: "10px",
                  padding: "10px 14px", cursor: "pointer", color: "#10b981",
                  fontSize: "12px", fontWeight: 700, transition: "all 0.15s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(5,150,105,0.14))"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))"; }}
              >
                <QrCode size={14} />
                📱 Mostrar QR a supervisores
              </button>
            </div>
          )}
        </div>

        {/* ═══════════ PANEL DERECHO: Timeline ═══════════ */}
        <div style={{
          flex: 1, minWidth: 0,
          background: "var(--bg-container, #fff)",
          border: "1px solid var(--border-container, #e2e8f0)",
          borderRadius: "14px", overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0,0,0,0.04)",
        }}
          onDragEnd={() => setDraggingSup(null)}
        >
          {/* Header timeline */}
          <div style={{
            padding: "12px 16px",
            background: "var(--bg-sidebar, #f8fafc)",
            borderBottom: "1px solid var(--border-container, #e2e8f0)",
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            <Clock size={14} color="#64748b" />
            <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--color-text)" }}>
              {formatFecha(fechaPOD)}
            </span>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              — {equiposList.length} equipo{equiposList.length !== 1 ? "s" : ""}
            </span>
            {loadingBloques && <Loader2 size={13} color="#10b981" style={{ marginLeft: "auto", animation: "spin 1s linear infinite" }} />}
          </div>

          {/* Regla horaria */}
          <div style={{ display: "flex" }}>
            <div style={{ width: "130px", flexShrink: 0, background: "var(--bg-sidebar,#f8fafc)", borderRight: "1px solid var(--border-container,#e2e8f0)", borderBottom: "1px solid var(--border-container,#e2e8f0)" }} />
            <div style={{ flex: 1, borderBottom: "1px solid var(--border-container,#e2e8f0)" }}>
              <TimelineRuler />
            </div>
          </div>

          {/* Filas de equipos */}
          {equiposList.length === 0 ? (
            <div style={{ padding: "40px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
              {proyectoActivoId
                ? "No hay equipos asignados a este proyecto."
                : "Selecciona tu identidad para ver los equipos del proyecto."
              }
            </div>
          ) : (
            equiposList.map(eq => (
              <EquipoRow
                key={eq.id}
                equipo={eq}
                bloques={bloques}
                participantes={participantes}
                especialidades={especialidadesList}
                draggingSup={draggingSup}
                onDrop={handleDrop}
                onResize={handleResize}
                onDelete={handleDeleteBloque}
              />
            ))
          )}
        </div>
      </div>

      {/* Modal QR grande */}
      {showQRModal && (
        <ModalQR
          qrImgSrc={qrImgSrc}
          podJoinUrl={podJoinUrl}
          onClose={() => setShowQRModal(false)}
        />
      )}

      {/* Modal de confirmación de asignación (drag & drop) */}
      {pendingDrop && (
        <ModalAsignacion
          data={pendingDrop}
          especialidades={especialidadesList}
          equiposList={equiposList}
          onConfirm={handleConfirmDrop}
          onClose={() => setPendingDrop(null)}
          saving={saving}
          bloques={bloques}
        />
      )}

      {/* Modal de asignación directa (click en tarjeta) */}
      {pendingAssign && (
        <ModalAsignacion
          data={pendingAssign}
          especialidades={especialidadesList}
          equiposList={equiposList}
          onConfirm={handleConfirmDrop}
          onClose={() => setPendingAssign(null)}
          saving={saving}
          bloques={bloques}
        />
      )}

      {/* Estilos globales */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(16,185,129,0.6); }
          50% { opacity: 0.6; box-shadow: 0 0 12px rgba(16,185,129,0.9); }
        }
        @keyframes cardPulse {
          0%, 100% { box-shadow: 0 2px 8px rgba(0,0,0,0.06); }
          50% { box-shadow: 0 2px 16px rgba(16,185,129,0.25); }
        }
      `}</style>
    </div>
  );
}
