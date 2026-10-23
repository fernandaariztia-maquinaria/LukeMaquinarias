import React from "react";
import { Pencil, Clock } from "lucide-react";
import PersonalAvatar from "./PersonalAvatar";
import { ESTADO_CONFIG } from "./constants";
import { formatEquipoLabel } from "../../../lib/equipoLabel";

export default function EquipoCard({ equipo, onPautaClick, onHistorialClick }) {
  const cfg = ESTADO_CONFIG[equipo.estado_actual] || ESTADO_CONFIG["Disponible"];
  const Icono = cfg.icon;

  const hasImage = equipo.imagen_url && equipo.imagen_url.trim() !== "";
  const cardBackground = hasImage
    ? `linear-gradient(rgba(253, 253, 251, 0.90), rgba(253, 253, 251, 0.97)), url(${equipo.imagen_url})`
    : "var(--bg-container)";

  return (
    <div
      className="equipo-card"
      style={{
        background: cardBackground,
        backgroundSize: hasImage ? "cover" : "auto",
        backgroundPosition: hasImage ? "center" : "auto",
        border: `2px solid ${cfg.border}`,
        borderRadius: "12px",
        padding: "18px",
        position: "relative",
        overflow: "visible", // Permitir que los tooltips floten sobre los bordes de la tarjeta
        transition: "all 0.3s ease",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        minHeight: "410px", // Altura mínima premium
      }}
    >
      {/* Contenedor Superior: Información y Personal */}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginBottom: "14px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", flexShrink: 0 }}>
          <div>
            <div style={{ color: "var(--color-primary-hover)", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase" }}>
              {formatEquipoLabel(equipo)}
            </div>
            <div style={{ color: "var(--color-text)", fontWeight: 700, fontSize: "14px", marginTop: "2px", lineHeight: 1.3 }}>
              {equipo.descripcion_equipo}
            </div>
          </div>
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            {onHistorialClick && (
              <button
                onClick={() => onHistorialClick(equipo)}
                title="Ver Historial de Uso"
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  borderRadius: "50%",
                  width: "26px",
                  height: "26px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  transition: "all 0.2s"
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary-hover)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-input)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}
              >
                <Clock size={12} />
              </button>
            )}
            <div
              style={{
                background: cfg.bg,
                border: `1px solid ${cfg.border}`,
                borderRadius: "20px",
                padding: "4px 10px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <Icono size={12} color={cfg.color} />
              <span style={{ color: cfg.color, fontSize: "11px", fontWeight: 700 }}>{cfg.label}</span>
            </div>
          </div>
        </div>

        {/* Info */}
        <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginBottom: "12px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px", flexShrink: 0 }}>
          <span>{equipo.proveedor}</span>
          {equipo.proyectos && (
            <span style={{ color: "var(--color-text-muted)" }}>
              · 📍 {equipo.proyectos.nombre_proyecto}
            </span>
          )}
          {equipo.clasificacion_comercial && (
            (() => {
              const esArriendo = equipo.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO";
              const estaArrendado = esArriendo && equipo.arriendo_cliente && equipo.arriendo_cliente.trim() !== "";
              
              let bg = "var(--bg-sidebar)";
              let color = "var(--color-text-muted)";
              let border = "1px solid var(--border-sidebar)";
              let label = equipo.clasificacion_comercial;

              if (equipo.clasificacion_comercial === "VENTA") {
                bg = "rgba(59, 130, 246, 0.12)";
                color = "#2563eb";
                border = "1px solid rgba(59, 130, 246, 0.25)";
                label = "💲 VENTA";
              } else if (esArriendo) {
                if (estaArrendado) {
                  bg = "rgba(249, 115, 22, 0.12)";
                  color = "#ea580c";
                  border = "1px solid rgba(249, 115, 22, 0.25)";
                  label = "🤝 ARRENDADO";
                } else {
                  bg = "rgba(16, 185, 129, 0.12)";
                  color = "#059669";
                  border = "1px solid rgba(16, 185, 129, 0.25)";
                  label = "🔑 EN PATIO - DISPONIBLE";
                }
              } else if (equipo.clasificacion_comercial === "OPERATIVO - EN USO") {
                bg = "rgba(16, 185, 129, 0.12)";
                color = "#059669";
                border = "1px solid rgba(16, 185, 129, 0.25)";
                label = "👷 EN USO";
              } else if (equipo.clasificacion_comercial === "EN PREPARACION OBRA") {
                bg = "rgba(217, 119, 6, 0.12)";
                color = "#d97706";
                border = "1px solid rgba(217, 119, 6, 0.25)";
                label = "⚙️ PREPARACIÓN";
              } else if (equipo.clasificacion_comercial === "FUERA DE SERVICIO - REPARACION - MANTENCION") {
                bg = "rgba(194, 26, 37, 0.12)";
                color = "#c21a25";
                border = "1px solid rgba(194, 26, 37, 0.25)";
                label = "🔧 MANTENCION";
              } else if (equipo.clasificacion_comercial === "EN IMPORTACION") {
                bg = "rgba(99, 102, 241, 0.12)";
                color = "#4f46e5";
                border = "1px solid rgba(99, 102, 241, 0.25)";
                label = "🚢 IMPORTACIÓN";
              }

              return (
                <span style={{
                  background: bg,
                  color: color,
                  border: border,
                  borderRadius: "4px", padding: "1px 6px", fontSize: "10px", fontWeight: 700, marginLeft: "4px"
                }}>
                  {label}
                </span>
              );
            })()
          )}
        </div>

        {/* Detalle Arriendo Activo */}
        {equipo.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" && equipo.arriendo_cliente && equipo.arriendo_cliente.trim() !== "" && (
          <div
            style={{
              background: "rgba(249, 115, 22, 0.08)",
              borderLeft: "3px solid #f97316",
              borderRadius: "6px",
              padding: "8px 10px",
              marginBottom: "12px",
              flexShrink: 0
            }}
          >
            <div style={{ color: "#f97316", fontSize: "10px", fontWeight: 700, marginBottom: "2px" }}>
              🤝 ARRENDADO ACTIVO
            </div>
            <div style={{ color: "var(--color-text)", fontSize: "11px", fontWeight: 600 }}>
              Cliente: {equipo.arriendo_cliente}
            </div>
            {(equipo.arriendo_fecha_inicio || equipo.arriendo_fecha_fin) && (
              <div style={{ color: "var(--color-text-muted)", fontSize: "10px", marginTop: "2px", display: "flex", gap: "4px" }}>
                <span>📅</span>
                <span>
                  {(() => {
                    const fmt = (d) => {
                      if (!d) return "—";
                      const p = d.split("-");
                      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
                    };
                    return `${fmt(equipo.arriendo_fecha_inicio)} al ${fmt(equipo.arriendo_fecha_fin)}`;
                  })()}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Pauta activa */}
        {equipo.pauta_preventiva_activa && (
          <div
            style={{
              background: "var(--bg-input)",
              borderLeft: "3px solid var(--color-primary)",
              border: "1px solid var(--border-input)",
              borderRadius: "6px",
              padding: "8px 10px",
              marginBottom: "12px",
              flexShrink: 0
            }}
          >
            <div style={{ color: "var(--color-primary-hover)", fontSize: "10px", fontWeight: 700, marginBottom: "2px" }}>
              📋 PAUTA HOY
            </div>
            <div style={{ color: "var(--color-text)", fontSize: "11px", lineHeight: 1.4 }}>
              {equipo.pauta_preventiva_activa.slice(0, 80)}{equipo.pauta_preventiva_activa.length > 80 ? "…" : ""}
            </div>
          </div>
        )}

        {/* Asignación y Personal (Terreno + Sala POD) */}
        {(equipo.reporte_hoy || equipo.pod_actual) && (
          <div
            style={{
              marginTop: "auto",
              padding: "9px 11px",
              background: "var(--bg-sidebar)",
              borderRadius: "8px",
              border: "1px solid var(--border-sidebar)",
              boxShadow: "none",
              display: "flex",
              flexDirection: "column",
              gap: "7px",
              flexShrink: 0,
            }}
          >
            {/* Header de Asignación / Especialidad POD */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "4px" }}>
              <div style={{ color: "var(--color-text-muted)", fontSize: "9px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.5px" }}>
                {equipo.pod_actual ? "Asignación POD" : "Personal en Turno"}
              </div>

              {equipo.pod_actual?.especialidades?.nombre_oficial && (
                <div
                  title={equipo.pod_actual.actividad_especifica ? `POD: ${equipo.pod_actual.actividad_especifica}` : "Especialidad POD"}
                  style={{
                    background: "rgba(59, 130, 246, 0.12)",
                    color: "#2563eb",
                    border: "1px solid rgba(59, 130, 246, 0.25)",
                    borderRadius: "4px",
                    padding: "1px 6px",
                    fontSize: "10px",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <span>🏷️</span>
                  <span>{equipo.pod_actual.especialidades.nombre_oficial}</span>
                </div>
              )}
            </div>

            {/* Fila con Avatares y Franja Horaria */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
              {/* Contenedor de Avatares */}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", minHeight: "32px", flexWrap: "wrap" }}>
                {/* 1. Operador en Turno Activo o Confirmado */}
                {(() => {
                  const operador = equipo.reporte_hoy?.operador || equipo.pod_actual?.operador_confirmador;
                  if (!operador) return null;
                  return (
                    <PersonalAvatar
                      persona={operador}
                      rolEtiqueta={equipo.tipo_seguimiento === "vehiculo" ? "Conductor" : "Operador"}
                      cfgBorder={cfg.border}
                    />
                  );
                })()}

                {/* 2. Rigger en Terreno */}
                {equipo.reporte_hoy?.rigger && (
                  <PersonalAvatar
                    persona={equipo.reporte_hoy.rigger}
                    rolEtiqueta="Rigger"
                    cfgBorder="#a855f7"
                  />
                )}

                {/* 3. Supervisor (Vehículo o Turno) */}
                {equipo.reporte_hoy?.supervisor && (
                  <PersonalAvatar
                    persona={equipo.reporte_hoy.supervisor}
                    rolEtiqueta="Supervisor"
                    cfgBorder={cfg.border}
                  />
                )}

                {/* 4. Supervisor POD Asignado (si no es el mismo que reporte_hoy) */}
                {equipo.pod_actual?.supervisor && equipo.pod_actual.supervisor.id !== equipo.reporte_hoy?.supervisor?.id && (
                  <PersonalAvatar
                    persona={equipo.pod_actual.supervisor}
                    rolEtiqueta={
                      equipo.pod_actual.supervisor.id === "11111111-1111-1111-1111-111111111111"
                        ? "Mantenimiento"
                        : equipo.pod_actual.supervisor.id === "22222222-2222-2222-2222-222222222222"
                        ? "Taller"
                        : "Supervisor POD"
                    }
                    cfgBorder="#f59e0b"
                  />
                )}

                {/* Si no hay personal asignado */}
                {!equipo.reporte_hoy?.operador &&
                  !equipo.pod_actual?.operador_confirmador &&
                  !equipo.reporte_hoy?.rigger &&
                  !equipo.reporte_hoy?.supervisor &&
                  !equipo.pod_actual?.supervisor && (
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px", fontStyle: "italic" }}>
                      Sin operador registrado
                    </span>
                  )}
              </div>

              {/* Bloque Horario POD */}
              {equipo.pod_actual && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "2px",
                    flexShrink: 0,
                  }}
                >
                  <div
                    title={equipo.pod_actual.actividad_especifica || "Bloque POD"}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontSize: "10px",
                      fontWeight: 700,
                      color: equipo.pod_actual.estado_bloque === "EN_CURSO" ? "#059669" : "var(--color-text-muted)",
                      background: equipo.pod_actual.estado_bloque === "EN_CURSO" ? "rgba(16, 185, 129, 0.12)" : "var(--bg-input)",
                      padding: "2px 6px",
                      borderRadius: "4px",
                      border: equipo.pod_actual.estado_bloque === "EN_CURSO" ? "1px solid rgba(16, 185, 129, 0.25)" : "1px solid var(--border-input)",
                    }}
                  >
                    {equipo.pod_actual.estado_bloque === "EN_CURSO" && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: "#10b981",
                          boxShadow: "0 0 6px #10b981",
                          display: "inline-block",
                        }}
                      />
                    )}
                    <span>
                      {equipo.pod_actual.hora_inicio?.slice(0, 5)} - {equipo.pod_actual.hora_fin?.slice(0, 5)}
                    </span>
                  </div>
                  <span style={{ fontSize: "9px", color: "var(--color-text-muted)" }}>
                    {equipo.pod_actual.estado_bloque === "EN_CURSO"
                      ? "En curso"
                      : equipo.pod_actual.estado_bloque === "PROXIMO"
                      ? "Próximo POD"
                      : "POD Hoy"}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contenedor Inferior: Métricas y Acción */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {/* Indicador Estilo Tablero Automotriz Digital (Horómetro / Odómetro) */}
        {(() => {
          const esVehiculo = equipo.tipo_seguimiento === "vehiculo";
          const valorLectura = esVehiculo ? equipo.ultimo_odometro : equipo.ultimo_horometro;
          const colorGlow = esVehiculo ? "#38bdf8" : "#10b981"; // Azul Glaciar vs Verde Neon
          const label = esVehiculo ? "ODÓMETRO" : "HORÓMETRO";
          const unidad = esVehiculo ? "km" : "hrs";
          const formattedValue = valorLectura != null ? Number(valorLectura).toLocaleString("es-CL") : "------";

          return (
            <div
              style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                borderRadius: "8px",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "none",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "9px", fontWeight: 700, letterSpacing: "1px" }}>
                  {label}
                </span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "9px", fontWeight: 500 }}>
                  ÚLTIMO REGISTRO
                </span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "4px",
                  fontFamily: "monospace",
                  background: "var(--bg-container)",
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: "1px solid var(--border-container)",
                  boxShadow: "none",
                }}
              >
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    color: colorGlow,
                    letterSpacing: "1px",
                    textShadow: `0 0 6px ${colorGlow}`,
                  }}
                >
                  {formattedValue}
                </span>
                <span style={{ fontSize: "10px", color: "var(--color-text-muted)", fontWeight: 700 }}>
                  {unidad}
                </span>
              </div>
            </div>
          );
        })()}

        {/* Indicador de Combustible */}
        {(() => {
          const nivel = equipo.combustible_nivel_porcentaje;
          if (nivel === undefined || nivel === null) return null;

          const esCritico = nivel <= 25;
          const numBloques = 10;
          const bloquesActivos = Math.round((nivel / 100) * numBloques);

          return (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                <span style={{ color: "var(--color-text-muted)", fontSize: "9px", fontWeight: 700, letterSpacing: "1px" }}>
                  ESTANQUE DE COMBUSTIBLE
                </span>
                <span style={{ color: esCritico ? "#ef4444" : "var(--color-text)", fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>
                  {nivel}%
                </span>
              </div>
              
              <div style={{
                background: "var(--bg-input)",
                border: "1px solid var(--border-input)",
                borderRadius: "6px",
                padding: "6px 10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "none",
                gap: "12px"
              }}>
                {/* Bloques de LED segmentados */}
                <div style={{ display: "flex", gap: "3px", flex: 1 }}>
                  {Array.from({ length: numBloques }).map((_, idx) => {
                    const activo = idx < bloquesActivos;
                    
                    // Colores del LED
                    let colorLed;
                    if (idx < 2) {
                      colorLed = "#ef4444"; // 20% o menos: Rojo
                    } else if (idx < 5) {
                      colorLed = "#eab308"; // 50% o menos: Amarillo
                    } else {
                      colorLed = "#22c55e"; // > 50%: Verde
                    }
                    
                    return (
                      <div
                        key={idx}
                        className={activo && esCritico ? "animate-pulse-fuel" : ""}
                        style={{
                          flex: 1,
                          height: "8px",
                          borderRadius: "2px",
                          background: activo ? colorLed : "var(--border-input)",
                          boxShadow: activo ? `0 0 6px ${colorLed}` : "none",
                          transition: "all 0.3s ease",
                          opacity: activo ? 1 : 0.15
                        }}
                      />
                    );
                  })}
                </div>

                {/* Icono de Surtidor / Gasolinera en color glow */}
                <div style={{ color: esCritico ? "#ef4444" : "#38bdf8", filter: `drop-shadow(0 0 4px ${esCritico ? '#ef4444' : '#38bdf8'})`, display: "flex", alignItems: "center" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" />
                    <path d="M11 22v-6" />
                    <path d="M19 14h3" />
                    <path d="M19 18h2.5" />
                    <path d="M19 10H14" />
                  </svg>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Botón editar pauta */}
        <button
          onClick={() => onPautaClick(equipo)}
          style={{
            width: "100%",
            background: "transparent",
            border: "1px solid var(--border-input)",
            borderRadius: "6px",
            color: "var(--color-text-muted)",
            fontSize: "11px",
            padding: "5px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            transition: "all 0.2s",
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--color-primary)"; e.currentTarget.style.color = "var(--color-primary-hover)"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border-input)"; e.currentTarget.style.color = "var(--color-text-muted)"; }}
        >
          <Pencil size={10} /> Editar pauta
        </button>
      </div>
    </div>
  );
}
