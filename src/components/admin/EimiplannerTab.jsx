import React, { useState, useEffect, useMemo } from "react";
import {
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  RefreshCw,
  Building2,
  Users,
  Layers,
  ArrowUpDown,
  Filter,
  FileSpreadsheet,
  TrendingUp,
  ShieldAlert,
  ChevronRight,
  ExternalLink,
  ChevronLeft,
  Info,
  Check,
  X,
  Minus
} from "lucide-react";

export default function EimiplannerTab({ currentUser }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [subTab, setSubTab] = useState("restricciones"); // 'restricciones' | 'lookahead' | 'productividad' | 'requisitos' | 'ficha'

  // Filtros de Restricciones
  const [searchRestricciones, setSearchRestricciones] = useState("");
  const [filtroEstadoRestr, setFiltroEstadoRestr] = useState("TODOS");
  const [filtroDisciplinaRestr, setFiltroDisciplinaRestr] = useState("TODAS");
  const [selectedRestriccion, setSelectedRestriccion] = useState(null);

  // Filtros de Lookahead
  const [searchLookahead, setSearchLookahead] = useState("");
  const [filtroTipoLookahead, setFiltroTipoLookahead] = useState("TODOS");
  const [pageLookahead, setPageLookahead] = useState(1);
  const PAGE_SIZE_LOOKAHEAD = 25;

  // Cargar datos
  const fetchData = async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      const url = `/api/eimiplanner?refresh=${force ? "true" : "false"}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error("[EimiplannerTab] Error al cargar:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData(false);
  }, []);

  // --- FILTRADO DE RESTRICCIONES ---
  const restriccionesFiltradas = useMemo(() => {
    const list = data?.logRequisitos || [];
    return list.filter((r) => {
      const matchSearch =
        !searchRestricciones ||
        (r.nombre_actividad && r.nombre_actividad.toLowerCase().includes(searchRestricciones.toLowerCase())) ||
        (r.descripcion_restriccion && r.descripcion_restriccion.toLowerCase().includes(searchRestricciones.toLowerCase())) ||
        (r.responsable && r.responsable.toLowerCase().includes(searchRestricciones.toLowerCase())) ||
        (r.categoria && r.categoria.toLowerCase().includes(searchRestricciones.toLowerCase())) ||
        (r.disciplina && r.disciplina.toLowerCase().includes(searchRestricciones.toLowerCase())) ||
        (r.id_task && String(r.id_task).includes(searchRestricciones));

      const matchEstado =
        filtroEstadoRestr === "TODOS" ||
        (r.estado || "").toUpperCase() === filtroEstadoRestr;

      const matchDisc =
        filtroDisciplinaRestr === "TODAS" ||
        (r.disciplina || "").toUpperCase() === filtroDisciplinaRestr ||
        (r.categoria || "").toUpperCase() === filtroDisciplinaRestr;

      return matchSearch && matchEstado && matchDisc;
    });
  }, [data, searchRestricciones, filtroEstadoRestr, filtroDisciplinaRestr]);

  // Disciplinas únicas en restricciones
  const disciplinasUnicas = useMemo(() => {
    const set = new Set();
    (data?.logRequisitos || []).forEach((r) => {
      if (r.disciplina) set.add(r.disciplina.toUpperCase());
      if (r.categoria) set.add(r.categoria.toUpperCase());
    });
    return ["TODAS", ...Array.from(set)];
  }, [data]);

  // --- FILTRADO Y PAGINACIÓN DE LOOKAHEAD ---
  const lookaheadFiltrado = useMemo(() => {
    const list = data?.lookaheadSample || [];
    return list.filter((t) => {
      const matchSearch =
        !searchLookahead ||
        (t.activity_name && t.activity_name.toLowerCase().includes(searchLookahead.toLowerCase())) ||
        (t.group && t.group.toLowerCase().includes(searchLookahead.toLowerCase())) ||
        (t.idtask && String(t.idtask).includes(searchLookahead)) ||
        (t.especialidad && t.especialidad.toLowerCase().includes(searchLookahead.toLowerCase()));

      const matchTipo =
        filtroTipoLookahead === "TODOS" ||
        t.type_task === filtroTipoLookahead;

      return matchSearch && matchTipo;
    });
  }, [data, searchLookahead, filtroTipoLookahead]);

  const totalPagesLookahead = Math.ceil(lookaheadFiltrado.length / PAGE_SIZE_LOOKAHEAD) || 1;
  const lookaheadPaginado = useMemo(() => {
    const start = (pageLookahead - 1) * PAGE_SIZE_LOOKAHEAD;
    return lookaheadFiltrado.slice(start, start + PAGE_SIZE_LOOKAHEAD);
  }, [lookaheadFiltrado, pageLookahead]);

  const metricas = data?.metricas || {
    totalTareas: 0,
    totalRestricciones: 0,
    restriccionesAbiertas: 0,
    restriccionesCerradas: 0,
    restriccionesResueltas: 0,
    restriccionesPrioridad1: 0,
    supervisoresRegistrados: 0,
  };

  const project = data?.project;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ============================================================ */}
      {/* 1. HEADER DE LA SECCIÓN (OBRA EIMI00418 SPENCE)              */}
      {/* ============================================================ */}
      <div
        style={{
          background: "var(--bg-container)",
          border: "1px solid var(--border-container)",
          borderRadius: "var(--border-radius-lg)",
          padding: "24px",
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(0,0,0,0.03)",
        }}
      >
        {/* Acento lateral */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: "5px",
            background: "linear-gradient(180deg, #ff303e, #f59e0b)",
          }}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span
                style={{
                  background: "rgba(255, 48, 62, 0.12)",
                  color: "#ff303e",
                  fontWeight: 800,
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "20px",
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                }}
              >
                OBRA EIMI00418 · EIMIPLANNER v2.0
              </span>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "#10b981",
                  fontWeight: 700,
                  fontSize: "11px",
                  padding: "4px 10px",
                  borderRadius: "20px",
                }}
              >
                ● API Conectada
              </span>
            </div>
            <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 900, color: "var(--color-text)", letterSpacing: "-0.5px" }}>
              {project?.project_name || "Proyecto Spence Chalcopyrite Leach (SCPY) - BHP"}
            </h1>
            <p style={{ margin: "6px 0 0", color: "var(--color-text-muted)", fontSize: "13px" }}>
              Cliente: <strong style={{ color: "var(--color-text)" }}>{project?.client_name || "MINERA SPENCE SA (MSSA)"}</strong> ·
              Empresa: <strong style={{ color: "var(--color-text)" }}>{project?.empresa_name || "EIMISA"}</strong> ·
              Ciudad: <strong style={{ color: "var(--color-text)" }}>{project?.city_name || "Calama"}</strong> ·
              Rubro: <strong style={{ color: "var(--color-text)" }}>{project?.rubro_name || "Minería"}</strong>
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              style={{
                background: "var(--bg-sidebar)",
                border: "1px solid var(--border-sidebar)",
                color: "var(--color-text)",
                borderRadius: "10px",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: 600,
                cursor: refreshing ? "not-allowed" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.2s",
              }}
            >
              <RefreshCw size={14} className={refreshing ? "spin-icon" : ""} />
              {refreshing ? "Sincronizando..." : "Sincronizar EIMIPLANNER"}
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* 2. TARJETAS DE KPIs Y RESUMEN OPERACIONAL                    */}
        {/* ============================================================ */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "14px",
            marginTop: "24px",
          }}
        >
          <div
            style={{
              background: "var(--bg-sidebar)",
              border: "1px solid var(--border-sidebar)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)", fontSize: "12px", fontWeight: 600 }}>
              <Layers size={14} color="#3b82f6" /> Tareas Lookahead
            </div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "var(--color-text)", marginTop: "8px" }}>
              {metricas.totalTareas.toLocaleString("es-CL")}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
              2 páginas de programa 3WL
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-sidebar)",
              border: "1px solid var(--border-sidebar)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)", fontSize: "12px", fontWeight: 600 }}>
              <AlertTriangle size={14} color="#f59e0b" /> Restricciones Totales
            </div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "var(--color-text)", marginTop: "8px" }}>
              {metricas.totalRestricciones}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
              {metricas.restriccionesAbiertas} abiertas · {metricas.restriccionesCerradas + metricas.restriccionesResueltas} resueltas
            </div>
          </div>

          <div
            style={{
              background: "rgba(239, 68, 68, 0.06)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ef4444", fontSize: "12px", fontWeight: 700 }}>
              <ShieldAlert size={14} color="#ef4444" /> Críticas (Prioridad 1)
            </div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "#ef4444", marginTop: "8px" }}>
              {metricas.restriccionesPrioridad1}
            </div>
            <div style={{ fontSize: "11px", color: "#b91c1c", marginTop: "4px" }}>
              Impacto directo en ruta crítica
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-sidebar)",
              border: "1px solid var(--border-sidebar)",
              borderRadius: "12px",
              padding: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--color-text-muted)", fontSize: "12px", fontWeight: 600 }}>
              <Users size={14} color="#10b981" /> Supervisores en Plan
            </div>
            <div style={{ fontSize: "26px", fontWeight: 900, color: "var(--color-text)", marginTop: "8px" }}>
              {metricas.supervisoresRegistrados}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "4px" }}>
              Con asignación de horas activas
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. PESTAÑAS INTERNAS DE EIMIPLANNER                          */}
      {/* ============================================================ */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "1px solid var(--border-container)", paddingBottom: "12px", flexWrap: "wrap" }}>
        {[
          { id: "restricciones", label: `Log de Restricciones (${metricas.totalRestricciones})`, icon: AlertTriangle },
          { id: "lookahead", label: `Programa Lookahead (${metricas.totalTareas.toLocaleString("es-CL")})`, icon: Calendar },
          { id: "productividad", label: `Indicadores Productividad (${metricas.supervisoresRegistrados})`, icon: TrendingUp },
          { id: "requisitos", label: "Matriz Requisitos por Tarea", icon: FileSpreadsheet },
          { id: "ficha", label: "Ficha de Obra & API", icon: Building2 },
        ].map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              style={{
                background: active ? "#ff303e" : "var(--bg-container)",
                color: active ? "white" : "var(--color-text-muted)",
                border: active ? "1px solid #ff303e" : "1px solid var(--border-container)",
                borderRadius: "10px",
                padding: "9px 16px",
                fontSize: "13px",
                fontWeight: active ? 700 : 500,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "all 0.15s ease",
              }}
            >
              <Icon size={14} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* 4. CONTENIDO DE SUB-TAB: RESTRICCIONES (LOG REQUISITOS)      */}
      {/* ============================================================ */}
      {subTab === "restricciones" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Barra de Búsqueda y Filtros */}
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              padding: "16px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "280px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  borderRadius: "8px",
                  padding: "0 12px",
                  flex: 1,
                }}
              >
                <Search size={14} color="var(--color-text-muted)" />
                <input
                  type="text"
                  placeholder="Buscar por actividad, descripción, responsable o categoría..."
                  value={searchRestricciones}
                  onChange={(e) => setSearchRestricciones(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "8px 0",
                    color: "var(--color-input-text)",
                    fontSize: "13px",
                    width: "100%",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {/* Filtro Estado */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600 }}>Estado:</span>
                <select
                  value={filtroEstadoRestr}
                  onChange={(e) => setFiltroEstadoRestr(e.target.value)}
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--color-text)",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  <option value="TODOS">Todos</option>
                  <option value="ABIERTA">Abierta</option>
                  <option value="CERRADA">Cerrada</option>
                  <option value="RESUELTA">Resuelta</option>
                </select>
              </div>

              {/* Filtro Disciplina */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600 }}>Disciplina:</span>
                <select
                  value={filtroDisciplinaRestr}
                  onChange={(e) => setFiltroDisciplinaRestr(e.target.value)}
                  style={{
                    background: "var(--bg-input)",
                    border: "1px solid var(--border-input)",
                    color: "var(--color-text)",
                    borderRadius: "8px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}
                >
                  {disciplinasUnicas.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Tabla de Restricciones */}
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-container)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 700, width: "70px" }}>Prio</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Categoría / Disciplina</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Actividad & Restricción</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Responsable</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Fechas Clave</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Estado</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700, textAlign: "right" }}>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {restriccionesFiltradas.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                        No se encontraron restricciones con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    restriccionesFiltradas.map((r, idx) => {
                      const esP1 = String(r.prioridad) === "1";
                      const esP2 = String(r.prioridad) === "2";
                      const estado = (r.estado || "").toUpperCase();

                      const badgeEstadoStyle =
                        estado === "CERRADA" || estado === "RESUELTA"
                          ? { bg: "rgba(16, 185, 129, 0.12)", color: "#10b981", border: "rgba(16, 185, 129, 0.25)" }
                          : estado === "ABIERTA"
                          ? { bg: "rgba(239, 68, 68, 0.12)", color: "#ef4444", border: "rgba(239, 68, 68, 0.25)" }
                          : { bg: "rgba(245, 158, 11, 0.12)", color: "#f59e0b", border: "rgba(245, 158, 11, 0.25)" };

                      return (
                        <tr
                          key={r.id_restriccion || idx}
                          style={{
                            borderBottom: "1px solid var(--border-container)",
                            background: idx % 2 === 0 ? "transparent" : "rgba(0,0,0,0.01)",
                            transition: "background 0.15s",
                          }}
                        >
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "3px 8px",
                                borderRadius: "6px",
                                fontSize: "11px",
                                fontWeight: 800,
                                background: esP1 ? "#fee2e2" : esP2 ? "#fef3c7" : "#e0e7ff",
                                color: esP1 ? "#b91c1c" : esP2 ? "#b45309" : "#3730a3",
                              }}
                            >
                              P{r.prioridad || "—"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 700, color: "var(--color-text)" }}>{r.categoria || r.disciplina || "General"}</div>
                            <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>{r.subcategoria || "—"}</div>
                          </td>
                          <td style={{ padding: "12px 16px", maxWidth: "340px" }}>
                            <div style={{ fontWeight: 600, color: "var(--color-text)", marginBottom: "3px" }}>
                              {r.nombre_actividad || "Sin actividad"}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                              {r.descripcion_restriccion || "Sin descripción"}
                            </div>
                            {r.observacion && (
                              <div style={{ fontSize: "11px", color: "#6b7280", fontStyle: "italic", marginTop: "3px" }}>
                                💡 {r.observacion}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ fontWeight: 600, color: "var(--color-text)" }}>{r.responsable || "Sin asignar"}</div>
                            {r.responsable2 && (
                              <div style={{ fontSize: "11px", color: "var(--color-text-muted)" }}>Apoyo: {r.responsable2}</div>
                            )}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                            <div>Identificada: <strong style={{ color: "var(--color-text)" }}>{r.fecha_identificacion || "—"}</strong></div>
                            <div>Compromiso: <strong style={{ color: "var(--color-text)" }}>{r.fecha_comprometida || r.fecha_requerida_resolucion || "—"}</strong></div>
                            {r.fecha_resolucion && <div>Resuelta: <strong style={{ color: "#10b981" }}>{r.fecha_resolucion}</strong></div>}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "4px 10px",
                                borderRadius: "100px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background: badgeEstadoStyle.bg,
                                color: badgeEstadoStyle.color,
                                border: `1px solid ${badgeEstadoStyle.border}`,
                              }}
                            >
                              {r.estado || "PENDIENTE"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", textAlign: "right" }}>
                            <button
                              onClick={() => setSelectedRestriccion(r)}
                              style={{
                                background: "transparent",
                                border: "1px solid var(--border-container)",
                                borderRadius: "6px",
                                padding: "4px 8px",
                                color: "var(--color-text)",
                                cursor: "pointer",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              Ver Ficha
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 5. CONTENIDO DE SUB-TAB: LOOKAHEAD (PROGRAMA DE TAREAS)      */}
      {/* ============================================================ */}
      {subTab === "lookahead" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Barra de Filtros Lookahead */}
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              padding: "16px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", gap: "10px", flex: 1, minWidth: "280px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  borderRadius: "8px",
                  padding: "0 12px",
                  flex: 1,
                }}
              >
                <Search size={14} color="var(--color-text-muted)" />
                <input
                  type="text"
                  placeholder="Buscar tarea por nombre, WBS group, idtask o especialidad..."
                  value={searchLookahead}
                  onChange={(e) => {
                    setSearchLookahead(e.target.value);
                    setPageLookahead(1);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "8px 0",
                    color: "var(--color-input-text)",
                    fontSize: "13px",
                    width: "100%",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600 }}>Tipo Tarea:</span>
              <select
                value={filtroTipoLookahead}
                onChange={(e) => {
                  setFiltroTipoLookahead(e.target.value);
                  setPageLookahead(1);
                }}
                style={{
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--color-text)",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "12px",
                  fontWeight: 600,
                }}
              >
                <option value="TODOS">Todos los niveles</option>
                <option value="T">Títulos (T)</option>
                <option value="A">Actividades (A)</option>
                <option value="SA">Subactividades (SA)</option>
              </select>
            </div>
          </div>

          {/* Tabla Lookahead */}
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              overflow: "hidden",
            }}
          >
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
                <thead>
                  <tr style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-container)" }}>
                    <th style={{ padding: "12px 16px", fontWeight: 700, width: "60px" }}>Tipo</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>ID Task</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Nombre de la Actividad</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>WBS / Grupo</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Fechas (3WL)</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Duración</th>
                    <th style={{ padding: "12px 16px", fontWeight: 700 }}>Especialidad</th>
                  </tr>
                </thead>
                <tbody>
                  {lookaheadPaginado.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)" }}>
                        No se encontraron tareas con los filtros actuales.
                      </td>
                    </tr>
                  ) : (
                    lookaheadPaginado.map((t, idx) => {
                      const esTitulo = t.type_task === "T";
                      const esSub = t.type_task === "SA";

                      return (
                        <tr
                          key={t.idtask || idx}
                          style={{
                            borderBottom: "1px solid var(--border-container)",
                            background: esTitulo ? "rgba(255, 48, 62, 0.03)" : "transparent",
                            fontWeight: esTitulo ? 700 : 400,
                          }}
                        >
                          <td style={{ padding: "12px 16px" }}>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "10px",
                                fontWeight: 800,
                                background: esTitulo ? "#dbeafe" : esSub ? "#fef3c7" : "#e0e7ff",
                                color: esTitulo ? "#1e40af" : esSub ? "#92400e" : "#3730a3",
                              }}
                            >
                              {t.type_task || "A"}
                            </span>
                          </td>
                          <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "12px", color: "var(--color-text-muted)" }}>
                            {t.idtask || "—"}
                          </td>
                          <td style={{ padding: "12px 16px" }}>
                            <div style={{ color: esTitulo ? "#ff303e" : "var(--color-text)", paddingLeft: esSub ? "14px" : "0" }}>
                              {esSub && "↳ "}
                              {t.activity_name || "Sin nombre"}
                            </div>
                          </td>
                          <td style={{ padding: "12px 16px", fontFamily: "monospace", fontSize: "11px", color: "var(--color-text-muted)" }}>
                            {t.group || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: "11px", whiteSpace: "nowrap" }}>
                            {t["3wl_start"] || t.date_start_ini || "—"} → {t["3wl_finish"] || t.date_finish_ini || "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                            {t.duracion ? `${t.duracion} d` : "—"}
                          </td>
                          <td style={{ padding: "12px 16px", fontSize: "12px" }}>
                            {t.especialidad ? (
                              <span
                                style={{
                                  background: "var(--bg-sidebar)",
                                  padding: "3px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                }}
                              >
                                {t.especialidad}
                              </span>
                            ) : (
                              <span style={{ color: "var(--color-text-muted)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderTop: "1px solid var(--border-container)",
                background: "var(--bg-sidebar)",
                fontSize: "12px",
                color: "var(--color-text-muted)",
              }}
            >
              <div>
                Mostrando {lookaheadPaginado.length} de {lookaheadFiltrado.length} tareas (Página {pageLookahead} de {totalPagesLookahead})
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => setPageLookahead((p) => Math.max(p - 1, 1))}
                  disabled={pageLookahead === 1}
                  style={{
                    background: "var(--bg-container)",
                    border: "1px solid var(--border-container)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    cursor: pageLookahead === 1 ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <ChevronLeft size={14} /> Anterior
                </button>
                <button
                  onClick={() => setPageLookahead((p) => Math.min(p + 1, totalPagesLookahead))}
                  disabled={pageLookahead === totalPagesLookahead}
                  style={{
                    background: "var(--bg-container)",
                    border: "1px solid var(--border-container)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    cursor: pageLookahead === totalPagesLookahead ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  Siguiente <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 6. CONTENIDO DE SUB-TAB: PRODUCTIVIDAD                       */}
      {/* ============================================================ */}
      {subTab === "productividad" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              padding: "20px",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 800 }}>
              Indicadores de Productividad y Horas por Supervisor (Spence 418)
            </h3>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px" }}>
              {(data?.productividad || []).map((p, idx) => {
                return (
                  <div
                    key={idx}
                    style={{
                      background: "var(--bg-sidebar)",
                      border: "1px solid var(--border-sidebar)",
                      borderRadius: "12px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>
                        {p.especialidad || "General"}
                      </div>
                      <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--color-text)", marginTop: "2px" }}>
                        {p.supervisor || "Sin supervisor"}
                      </div>
                      {p.jefe_area?.trim() && (
                        <div style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
                          Jefe Área: {p.jefe_area}
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {(p.weeks || []).map((w, wIdx) => {
                        const wd = w.weekData || {};
                        // Extraer valores dinámicos
                        const fechaKey = Object.keys(wd).find((k) => k.startsWith("week_") && !k.includes("_hh_") && !k.includes("_pf") && !k.includes("_ind_"));
                        const fechaLabel = fechaKey ? wd[fechaKey] : `Semana ${wIdx + 1}`;

                        const hhPlanKey = Object.keys(wd).find((k) => k.includes("_hh_plan"));
                        const hhDispKey = Object.keys(wd).find((k) => k.includes("_hh_disponible"));
                        const hhRemKey = Object.keys(wd).find((k) => k.includes("_hh_remanente"));
                        const pfKey = Object.keys(wd).find((k) => k.includes("_pf"));

                        const hhPlan = hhPlanKey ? String(wd[hhPlanKey]).split("|")[0] : "—";
                        const hhDisp = hhDispKey ? String(wd[hhDispKey]).split("|")[0] : "—";
                        const hhRem = hhRemKey ? String(wd[hhRemKey]).split("|")[0] : "—";
                        const pf = pfKey ? String(wd[pfKey]).split("|")[0] : "—";

                        return (
                          <div
                            key={wIdx}
                            style={{
                              background: "var(--bg-container)",
                              border: "1px solid var(--border-container)",
                              borderRadius: "8px",
                              padding: "10px",
                              fontSize: "12px",
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                              <strong style={{ color: "#ff303e" }}>📅 {fechaLabel}</strong>
                              <span style={{ fontWeight: 700, color: pf !== "—" ? "#10b981" : "var(--color-text-muted)" }}>
                                PF: {pf}
                              </span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                              <div>Plan: <strong style={{ color: "var(--color-text)" }}>{hhPlan}h</strong></div>
                              <div>Disp: <strong style={{ color: "var(--color-text)" }}>{hhDisp}h</strong></div>
                              <div>Rem: <strong style={{ color: "var(--color-text)" }}>{hhRem}h</strong></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 7. CONTENIDO DE SUB-TAB: FICHA DE OBRA & METADATOS           */}
      {/* ============================================================ */}
      {subTab === "ficha" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "20px" }}>
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
              <Building2 size={18} color="#ff303e" /> Parámetros Maestros en EIMIPLANNER
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", fontSize: "13px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>ID Obra / Código CC:</span>
                <strong style={{ fontFamily: "monospace", color: "#ff303e" }}>{project?.id_obra || "EIMI00418"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>ID Proyecto Interno:</span>
                <strong style={{ fontFamily: "monospace" }}>{project?.idproject || "418"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Nombre Proyecto:</span>
                <strong style={{ textAlign: "right", maxWidth: "240px" }}>{project?.project_name}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Mandante / Cliente:</span>
                <strong>{project?.client_name} ({project?.idcliente})</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Empresa Contratista:</span>
                <strong>{project?.empresa_name} ({project?.idempresa})</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Ciudad / Ubicación:</span>
                <strong>{project?.city_name}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Día Inicio Semana:</span>
                <strong>{project?.begin_name} (ID: {project?.idbegin})</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-sidebar)", paddingBottom: "8px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Total Páginas Lookahead:</span>
                <strong>{project?.num_pages} páginas</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "4px" }}>
                <span style={{ color: "var(--color-text-muted)" }}>Creado por / Fecha:</span>
                <span>{project?.createBy} ({project?.createDate})</span>
              </div>
            </div>
          </div>

          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "14px",
              padding: "24px",
            }}
          >
            <h3 style={{ margin: "0 0 16px", fontSize: "16px", fontWeight: 800, display: "flex", alignItems: "center", gap: "8px" }}>
              <Info size={18} color="#3b82f6" /> Servicios de Integración Activos
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "12px" }}>
              <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "#10b981" }}>✅ POST /authenticator/signin?companyId=EI</div>
                <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>Autenticación Basic Auth y emisión de Bearer Token JWT.</div>
              </div>

              <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "#10b981" }}>✅ GET /getProyectos?closed=0&paused=0</div>
                <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>Consulta y mapeo de metadatos de obra EIMI00418.</div>
              </div>

              <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "#10b981" }}>✅ GET /getLookahead?projectId=418&numPage=1..2</div>
                <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>Descarga del programa semanal de 3 semanas (Lookahead).</div>
              </div>

              <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "#10b981" }}>✅ GET /getLogRequisitos?projectId=418</div>
                <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>Registro de 194 restricciones de obra con prioridad y responsables.</div>
              </div>

              <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                <div style={{ fontWeight: 700, color: "#10b981" }}>✅ GET /getProductivityIndicators?projectId=418</div>
                <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>Indicadores semanales de HH Plan, Disponible y PF por supervisor.</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 8. CONTENIDO DE SUB-TAB: REQUISITOS POR TAREA                */}
      {/* ============================================================ */}
      {subTab === "requisitos" && (
        <div
          style={{
            background: "var(--bg-container)",
            border: "1px solid var(--border-container)",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <h3 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 800 }}>
            Matriz de Requisitos y Liberaciones por Tarea ({data?.requisitos?.length || 0} tareas)
          </h3>
          <p style={{ margin: "0 0 16px", color: "var(--color-text-muted)", fontSize: "12px" }}>
            Simbología: <strong style={{ color: "#10b981" }}>✓ Liberado (1)</strong> · <strong style={{ color: "#6b7280" }}>— Neutro (0)</strong> · <strong style={{ color: "#ef4444" }}>✗ Bloqueado (-1)</strong>
          </p>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", fontSize: "12px" }}>
              <thead>
                <tr style={{ background: "var(--bg-sidebar)", borderBottom: "1px solid var(--border-container)" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left" }}>ID Task</th>
                  <th style={{ padding: "10px 8px" }}>Equipos</th>
                  <th style={{ padding: "10px 8px" }}>Mano de Obra</th>
                  <th style={{ padding: "10px 8px" }}>Materiales</th>
                  <th style={{ padding: "10px 8px" }}>Suministros</th>
                  <th style={{ padding: "10px 8px" }}>Calidad</th>
                  <th style={{ padding: "10px 8px" }}>SSO / MA</th>
                  <th style={{ padding: "10px 8px" }}>Información</th>
                  <th style={{ padding: "10px 8px" }}>Subcontratos</th>
                  <th style={{ padding: "10px 8px" }}>Admin</th>
                </tr>
              </thead>
              <tbody>
                {(data?.requisitos || []).slice(0, 80).map((reqItem, idx) => {
                  const renderIcon = (val) => {
                    const str = String(val);
                    if (str === "1") return <span style={{ color: "#10b981", fontWeight: 800 }}>✓</span>;
                    if (str === "-1") return <span style={{ color: "#ef4444", fontWeight: 800 }}>✗</span>;
                    return <span style={{ color: "#9ca3af" }}>—</span>;
                  };

                  return (
                    <tr key={idx} style={{ borderBottom: "1px solid var(--border-container)" }}>
                      <td style={{ padding: "8px 12px", textAlign: "left", fontFamily: "monospace", fontWeight: 600 }}>
                        {reqItem.idtask}
                      </td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Equipos)}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem["Mano de Obra"])}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Materiales)}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Suministros)}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Calidad)}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem["SSO y Medioambiente"])}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem["Información"])}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Subcontratos)}</td>
                      <td style={{ padding: "8px" }}>{renderIcon(reqItem.Administrativos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* 9. MODAL DETALLE DE RESTRICCIÓN                             */}
      {/* ============================================================ */}
      {selectedRestriccion && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "20px",
          }}
          onClick={() => setSelectedRestriccion(null)}
        >
          <div
            style={{
              background: "var(--bg-container)",
              border: "1px solid var(--border-container)",
              borderRadius: "16px",
              maxWidth: "600px",
              width: "100%",
              padding: "24px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
              <div>
                <span
                  style={{
                    background: String(selectedRestriccion.prioridad) === "1" ? "#fee2e2" : "#fef3c7",
                    color: String(selectedRestriccion.prioridad) === "1" ? "#b91c1c" : "#b45309",
                    padding: "3px 8px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 800,
                  }}
                >
                  Prioridad {selectedRestriccion.prioridad}
                </span>
                <h3 style={{ margin: "8px 0 0", fontSize: "17px", fontWeight: 800 }}>
                  {selectedRestriccion.nombre_actividad}
                </h3>
              </div>
              <button
                onClick={() => setSelectedRestriccion(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-text-muted)",
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "13px" }}>
              <div>
                <span style={{ color: "var(--color-text-muted)" }}>Restricción identificada:</span>
                <p style={{ margin: "4px 0 0", fontWeight: 600 }}>{selectedRestriccion.descripcion_restriccion}</p>
              </div>

              {selectedRestriccion.observacion && (
                <div style={{ background: "var(--bg-sidebar)", padding: "10px", borderRadius: "8px" }}>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Observación:</span>
                  <p style={{ margin: "2px 0 0" }}>{selectedRestriccion.observacion}</p>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "8px" }}>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Responsable Principal:</span>
                  <div style={{ fontWeight: 600 }}>{selectedRestriccion.responsable}</div>
                </div>
                {selectedRestriccion.responsable2 && (
                  <div>
                    <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Segundo Responsable:</span>
                    <div style={{ fontWeight: 600 }}>{selectedRestriccion.responsable2}</div>
                  </div>
                )}
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Identificada por:</span>
                  <div>{selectedRestriccion.identificada_por} ({selectedRestriccion.fecha_identificacion})</div>
                </div>
                <div>
                  <span style={{ color: "var(--color-text-muted)", fontSize: "11px" }}>Fecha Compromiso:</span>
                  <div style={{ fontWeight: 600, color: "#ff303e" }}>{selectedRestriccion.fecha_comprometida || "—"}</div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => setSelectedRestriccion(null)}
                style={{
                  background: "#ff303e",
                  border: "none",
                  borderRadius: "8px",
                  padding: "8px 18px",
                  color: "white",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .spin-icon {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
