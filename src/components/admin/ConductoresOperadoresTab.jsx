import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  UserCheck, Users, ShieldCheck, Plus, Trash2, Search,
  Calendar, Building2, Filter, RefreshCw, AlertTriangle,
  Car, Clock, Fuel, Gauge, ChevronRight, X, Briefcase,
  Layers, CalendarDays, CheckCircle2
} from "lucide-react";
import { formatearPatente, normalizarPatente, clasificarTipoEquipo, TIPOS_EQUIPO_FILTROS } from "../../lib/telemetriaUtils";

/**
 * Componente de visualización unificada para patentes de vehículos:
 * - Previene saltos de línea indeseados (PGXT- en una línea y 19 en otra) usando whiteSpace: nowrap y guión no rompible.
 * - Da formato estético tipo placa patente chilena.
 */
function PatenteBadge({ patente, codigo, color = "#0f172a", bg = "#f8fafc", border = "#94a3b8" }) {
  const formatted = formatearPatente(patente);
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "nowrap", flexShrink: 0 }}>
      <span
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          wordBreak: "keep-all",
          fontFamily: "'Roboto Mono', 'SF Pro Mono', 'Segoe UI Mono', monospace",
          fontWeight: 800,
          fontSize: "12px",
          color: color,
          backgroundColor: bg,
          border: `1.5px solid ${border}`,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
          padding: "2px 7px",
          borderRadius: "5px",
          letterSpacing: "0.5px",
          flexShrink: 0,
        }}
      >
        {formatted}
      </span>
      {codigo && (
        <span
          style={{
            fontSize: "11px",
            backgroundColor: "#e2e8f0",
            padding: "1px 6px",
            borderRadius: "4px",
            color: "#475569",
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {codigo}
        </span>
      )}
    </div>
  );
}

export default function ConductoresOperadoresTab({ currentUser, hookProps }) {
  // 1. Verificación de Administrador
  const esAdmin = useMemo(() => {
    if (!currentUser) return false;
    const rol = String(currentUser.rol || "").toLowerCase();
    return rol.includes("admin") || rol === "administrador";
  }, [currentUser]);

  // Proyecto asignado al usuario (obra de origen para no-admins)
  const userProyectoId = currentUser?.proyecto_actual_id || "";

  // 2. Filtros de Consulta
  const [desde, setDesde] = useState("2026-10-01");
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [proyectoFiltro, setProyectoFiltro] = useState("");
  const [busquedaFiltro, setBusquedaFiltro] = useState("");
  const [tipoEquipoFiltro, setTipoEquipoFiltro] = useState("todos");

  // 3. Sub-Pestaña Activa dentro de Conductores/Operadores ("gerencia" | "conductores" | "todos")
  const [subVista, setSubVista] = useState("gerencia");

  // 4. Estados de Datos
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dashData, setDashData] = useState(null);

  // 5. Modal de Asignación de Camioneta a Gerencia / Jefatura
  const [modalAsignacionAbierto, setModalAsignacionAbierto] = useState(false);
  const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);
  const [errorModalAsig, setErrorModalAsig] = useState(null);
  const [formAsignacion, setFormAsignacion] = useState({
    id: null,
    patente: "",
    codigo_interno: "",
    nombre_responsable: "",
    rut_responsable: "",
    cargo: "Gerente de Proyecto",
    proyecto_id: "",
    proyecto_nombre: "",
    notas: "",
  });



  // Etiqueta legible del tipo de equipo activo
  const labelTipoActivo = useMemo(() => {
    const f = TIPOS_EQUIPO_FILTROS.find((t) => t.key === tipoEquipoFiltro);
    return f ? f.label : "Equipos";
  }, [tipoEquipoFiltro]);

  // Cargar datos consolidados desde la API de telemetría
  const cargarDatos = useCallback(async () => {
    setCargando(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (desde) params.set("desde", desde);
      if (hasta) params.set("hasta", hasta);
      if (proyectoFiltro) params.set("proyecto_id", proyectoFiltro);
      if (busquedaFiltro && busquedaFiltro.trim() !== "") {
        params.set("busqueda", busquedaFiltro.trim());
      }
      if (tipoEquipoFiltro && tipoEquipoFiltro !== "todos") {
        params.set("tipo_equipo", tipoEquipoFiltro);
      }
      params.set("user_rol", currentUser?.rol || "");
      params.set("user_proyecto_id", userProyectoId);

      const res = await fetch(`/api/admin/telemetria/dashboards?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setDashData(json);
      } else {
        setErrorMsg(json.error || "No se pudieron obtener los datos de telemetría.");
      }
    } catch (err) {
      console.error("[ConductoresOperadoresTab] Error al cargar:", err);
      setErrorMsg(err.message || "Error de red al consultar el servidor.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, proyectoFiltro, busquedaFiltro, tipoEquipoFiltro, currentUser?.rol, userProyectoId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const diasPeriodo = dashData?.periodo?.dias_totales || 30;
  const listaProyectos = useMemo(() => {
    const fromDash = dashData?.proyectos_disponibles || [];
    if (fromDash.length > 0) return fromDash;
    const fromHook = hookProps?.proyectosCompleto?.data || hookProps?.proyectos?.data || [];
    return fromHook;
  }, [dashData?.proyectos_disponibles, hookProps?.proyectosCompleto?.data, hookProps?.proyectos?.data]);
  const equiposDisponibles = dashData?.equipos_disponibles || [];

  // Equipos asignados a gerencia
  const equiposAsignadosGerencia = useMemo(() => {
    const list =
      dashData?.rankings?.equipos_asignados_gerencia ||
      dashData?.rankings?.equipos_uso_exclusivo ||
      [];
    if (tipoEquipoFiltro === "todos") return list;
    return list.filter((e) => (e.tipo_clasificado || clasificarTipoEquipo(e)) === tipoEquipoFiltro);
  }, [dashData?.rankings?.equipos_asignados_gerencia, dashData?.rankings?.equipos_uso_exclusivo, tipoEquipoFiltro]);

  // Conductores y Operadores de la flota
  const conductoresFiltrados = useMemo(() => {
    return dashData?.rankings?.top_conductores || [];
  }, [dashData?.rankings?.top_conductores]);

  // Resumen numérico de asignaciones de gerencia
  const kpisGerencia = useMemo(() => {
    const totalUnidades = equiposAsignadosGerencia.length;
    const totalHoras =
      Math.round(
        equiposAsignadosGerencia.reduce((acc, e) => acc + (Number(e.horas_totales) || 0), 0) * 10
      ) / 10;
    const totalKm =
      Math.round(
        equiposAsignadosGerencia.reduce((acc, e) => acc + (Number(e.km_totales) || 0), 0) * 10
      ) / 10;
    const totalLitros =
      Math.round(
        equiposAsignadosGerencia.reduce((acc, e) => acc + (Number(e.litros_totales) || 0), 0) * 10
      ) / 10;
    const totalViajes = equiposAsignadosGerencia.reduce(
      (acc, e) => acc + (Number(e.viajes_totales) || 0),
      0
    );

    return { totalUnidades, totalHoras, totalKm, totalLitros, totalViajes };
  }, [equiposAsignadosGerencia]);

  // Manejador para abrir modal de asignación
  const abrirModalNuevaAsignacion = () => {
    setFormAsignacion({
      id: null,
      patente: "",
      codigo_interno: "",
      nombre_responsable: "",
      rut_responsable: "",
      cargo: "Gerente de Proyecto",
      proyecto_id: proyectoFiltro || "",
      proyecto_nombre: "",
      notas: "",
    });
    setErrorModalAsig(null);
    setModalAsignacionAbierto(true);
  };

  // Guardar asignación en API
  const handleGuardarAsignacion = async (e) => {
    e.preventDefault();
    if (!formAsignacion.patente.trim()) {
      setErrorModalAsig("Por favor ingresa o selecciona la patente del vehículo.");
      return;
    }
    if (!formAsignacion.nombre_responsable.trim()) {
      setErrorModalAsig("Por favor ingresa el nombre del gerente o jefatura.");
      return;
    }

    setGuardandoAsignacion(true);
    setErrorModalAsig(null);

    try {
      const res = await fetch("/api/admin/telemetria/asignaciones-gerencia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formAsignacion),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "No se pudo guardar la asignación.");
      }

      setModalAsignacionAbierto(false);
      cargarDatos();
    } catch (err) {
      setErrorModalAsig(err.message || "Error al comunicarse con el servidor.");
    } finally {
      setGuardandoAsignacion(false);
    }
  };

  // Eliminar asignación
  const handleEliminarAsignacion = async (asig) => {
    if (!confirm(`¿Estás seguro de desasignar la camioneta ${asig.patente} de ${asig.nombre_responsable}?`)) {
      return;
    }

    try {
      const res = await fetch("/api/admin/telemetria/asignaciones-gerencia", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asig.id, patente: asig.patente }),
      });
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || "No se pudo eliminar la asignación.");
      }
      cargarDatos();
    } catch (err) {
      alert(`Error al eliminar: ${err.message}`);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* ── BARRA SUPERIOR DE FILTROS MODULARES CON BORDES VISIBLES ─────────── */}
      <div style={{
        backgroundColor: "#ffffff",
        padding: "18px 20px",
        borderRadius: "14px",
        border: "2px solid #cbd5e1",
        boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}>
        {/* Cabecera del Panel */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: "12px", paddingBottom: "14px",
          borderBottom: "1.5px solid #e2e8f0",
        }}>
          <div>
            <h2 style={{ fontSize: "17px", fontWeight: 800, margin: 0, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
              <UserCheck size={20} color="#0284c7" />
              Conductores / Operadores y Asignación Gerencia
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Control de choferes al volante, vehículos asignados a gerencias y resolución de horas por sistema RFID vs asignación fija.
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: "6px",
              padding: "6px 12px", borderRadius: "8px",
              backgroundColor: "#f0f9ff", border: "1.5px solid #bae6fd",
              fontSize: "12px", fontWeight: 700, color: "#0369a1",
            }}>
              <CalendarDays size={14} color="#0284c7" />
              <span>Datos en {diasPeriodo} días ({desde} al {hasta})</span>
            </div>

            <button
              onClick={abrirModalNuevaAsignacion}
              style={{
                backgroundColor: "#0284c7", color: "#ffffff", border: "none",
                padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
                cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            >
              <Plus size={15} /> + Asignar Camioneta a Gerente
            </button>
          </div>
        </div>

        {/* Grilla de Módulos de Filtro con Bordes Notorios */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
          gap: "14px",
        }}>
          {/* Módulo 1: Rango Temporal de Fechas */}
          <div style={{
            backgroundColor: "#f8fafc",
            border: "1.5px solid #cbd5e1",
            borderRadius: "10px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                <Calendar size={14} color="#0284c7" />
                Rango Temporal (Entre Fechas)
              </span>
              <div style={{ display: "flex", gap: "4px" }}>
                <button
                  onClick={() => { setDesde("2026-10-01"); setHasta("2026-10-31"); }}
                  style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                    backgroundColor: desde === "2026-10-01" && hasta === "2026-10-31" ? "#0284c7" : "#e2e8f0",
                    color: desde === "2026-10-01" && hasta === "2026-10-31" ? "#ffffff" : "#475569",
                    border: "none", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  Octubre
                </button>
                <button
                  onClick={() => { setDesde("2026-10-01"); setHasta("2026-10-15"); }}
                  style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                    backgroundColor: desde === "2026-10-01" && hasta === "2026-10-15" ? "#0284c7" : "#e2e8f0",
                    color: desde === "2026-10-01" && hasta === "2026-10-15" ? "#ffffff" : "#475569",
                    border: "none", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  1ra Q.
                </button>
                <button
                  onClick={() => { setDesde("2026-10-15"); setHasta("2026-10-31"); }}
                  style={{
                    fontSize: "10px", padding: "2px 7px", borderRadius: "4px",
                    backgroundColor: desde === "2026-10-15" && hasta === "2026-10-31" ? "#0284c7" : "#e2e8f0",
                    color: desde === "2026-10-15" && hasta === "2026-10-31" ? "#ffffff" : "#475569",
                    border: "none", cursor: "pointer", fontWeight: 700,
                  }}
                >
                  2da Q.
                </button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                  Desde:
                </label>
                <input
                  type="date"
                  value={desde}
                  onChange={(e) => setDesde(e.target.value)}
                  style={{
                    width: "100%", fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none",
                    fontWeight: 600, color: "#0f172a", boxSizing: "border-box",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                  Hasta:
                </label>
                <input
                  type="date"
                  value={hasta}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setHasta(e.target.value)}
                  style={{
                    width: "100%", fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none",
                    fontWeight: 600, color: "#0f172a", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          </div>

          {/* Módulo 2: Proyecto / Obra */}
          <div style={{
            backgroundColor: "#f8fafc",
            border: "1.5px solid #cbd5e1",
            borderRadius: "10px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
              <Building2 size={14} color="#0284c7" />
              Proyecto / Faena
            </span>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                Seleccionar Faena / Obra:
              </label>
              <select
                value={proyectoFiltro}
                onChange={(e) => setProyectoFiltro(e.target.value)}
                style={{
                  width: "100%", fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                  border: proyectoFiltro ? "1.5px solid #0284c7" : "1.5px solid #cbd5e1",
                  backgroundColor: proyectoFiltro ? "#f0f9ff" : "#ffffff",
                  outline: "none",
                  fontWeight: 600, color: proyectoFiltro ? "#0369a1" : "#0f172a", boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                <option value="">🌎 Todos los Proyectos (Flota Completa)</option>
                {listaProyectos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.codigo_cc ? `[${p.codigo_cc}] ` : ""}{p.nombre_proyecto}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Módulo 3: Buscador Chofer / Gerente / Patente */}
          <div style={{
            backgroundColor: "#f8fafc",
            border: "1.5px solid #cbd5e1",
            borderRadius: "10px",
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: "8px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: "6px" }}>
                <Search size={14} color="#0284c7" />
                Búsqueda de Chofer o Camioneta
              </span>
              <span style={{ fontSize: "10px", backgroundColor: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                Filtro
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  placeholder="Buscar por Nombre, RUT o Patente..."
                  value={busquedaFiltro}
                  onChange={(e) => setBusquedaFiltro(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") cargarDatos();
                  }}
                  style={{
                    width: "100%", fontSize: "12px", padding: "6px 28px 6px 8px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none",
                    fontWeight: 600, color: "#0f172a", boxSizing: "border-box",
                  }}
                />
                {busquedaFiltro ? (
                  <button
                    onClick={() => setBusquedaFiltro("")}
                    style={{
                      position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)",
                      background: "none", border: "none", color: "#94a3b8", cursor: "pointer",
                      fontSize: "12px", fontWeight: "bold",
                    }}
                  >
                    ✕
                  </button>
                ) : (
                  <Search size={13} style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
                )}
              </div>
              <button
                onClick={cargarDatos}
                disabled={cargando}
                style={{
                  backgroundColor: cargando ? "#94a3b8" : "#0284c7",
                  color: "#ffffff", border: "none", padding: "7px 14px", borderRadius: "6px",
                  fontSize: "12px", fontWeight: 700, cursor: cargando ? "not-allowed" : "pointer",
                  display: "inline-flex", alignItems: "center", gap: "6px", flexShrink: 0,
                  boxShadow: "0 2px 4px rgba(2, 132, 199, 0.25)",
                }}
              >
                <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
                {cargando ? "Cargando..." : "Buscar"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── BANNER INFORMATIVO DE REGLA RFID VS ASIGNACIÓN ─────────────────────── */}
      <div style={{
        backgroundColor: "#f0f9ff", border: "1.5px solid #bae6fd", borderRadius: "10px",
        padding: "12px 16px", display: "flex", alignItems: "flex-start", gap: "10px",
      }}>
        <ShieldCheck size={20} color="#0284c7" style={{ flexShrink: 0, marginTop: "2px" }} />
        <div style={{ fontSize: "12px", color: "#0369a1", lineHeight: 1.5 }}>
          <strong>Lógica de Identificación de Conductor:</strong> Si el vehículo realiza viajes y el conductor registra tarjeta <strong>RFID</strong>, se mantiene el chofer registrado por el lector. Si el viaje <strong>no tiene registro RFID</strong>, el sistema busca la camioneta en la <strong>base de asignaciones de Gerencia o Jefaturas</strong> y le asocia las horas y consumos al titular.
        </div>
      </div>

      {/* ── BOTONERA DE SUB-VISTAS ────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "8px", borderBottom: "2px solid #e2e8f0", paddingBottom: "4px" }}>
        <button
          onClick={() => setSubVista("gerencia")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: subVista === "gerencia" ? "#0284c7" : "#ffffff",
            color: subVista === "gerencia" ? "#ffffff" : "#475569",
            boxShadow: subVista === "gerencia" ? "0 2px 4px rgba(2, 132, 199, 0.25)" : "none",
          }}
        >
          <ShieldCheck size={15} />
          Camionetas Asignadas a Gerencia ({equiposAsignadosGerencia.length})
        </button>

        <button
          onClick={() => setSubVista("conductores")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: subVista === "conductores" ? "#0f172a" : "#ffffff",
            color: subVista === "conductores" ? "#ffffff" : "#475569",
            boxShadow: subVista === "conductores" ? "0 2px 4px rgba(15, 23, 42, 0.25)" : "none",
          }}
        >
          <Users size={15} />
          Conductores y Operadores Flota ({conductoresFiltrados.length})
        </button>
      </div>

      {/* ── VISTA 1: CAMIONETAS ASIGNADAS A GERENCIA O JEFATURAS ─────────────── */}
      {subVista === "gerencia" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Tarjetas KPI de Asignaciones */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
            gap: "14px",
          }}>
            <div style={{
              backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px",
              border: "1.5px solid #cbd5e1", borderTop: "4px solid #0284c7",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Camionetas Asignadas</span>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {kpisGerencia.totalUnidades} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>unidades</span>
              </div>
            </div>

            <div style={{
              backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px",
              border: "1.5px solid #cbd5e1", borderTop: "4px solid #16a34a",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Horas Operadas ({diasPeriodo}d)</span>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {kpisGerencia.totalHoras.toLocaleString("es-CL")} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>hrs</span>
              </div>
            </div>

            <div style={{
              backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px",
              border: "1.5px solid #cbd5e1", borderTop: "4px solid #8b5cf6",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Distancia Recorrida</span>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {kpisGerencia.totalKm.toLocaleString("es-CL")} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>km</span>
              </div>
            </div>

            <div style={{
              backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px",
              border: "1.5px solid #cbd5e1", borderTop: "4px solid #dc2626",
            }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#64748b" }}>Combustible Consumido</span>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
                {kpisGerencia.totalLitros.toLocaleString("es-CL")} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>L</span>
              </div>
            </div>
          </div>

          {/* Tabla de Asignaciones */}
          <div style={{
            backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
            padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "10px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                  <ShieldCheck size={18} color="#0284c7" />
                  Base de Camionetas Asignadas a Gerencia / Jefaturas
                </h3>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Datos consolidados en los {diasPeriodo} días filtrados ({desde} al {hasta})
                </span>
              </div>

              <button
                onClick={abrirModalNuevaAsignacion}
                style={{
                  backgroundColor: "#0284c7", color: "#ffffff", border: "none",
                  padding: "7px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                  boxShadow: "0 2px 4px rgba(2, 132, 199, 0.25)",
                }}
              >
                <Plus size={14} /> + Asignar Camioneta
              </button>
            </div>

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
                <thead>
                  <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                    <th style={{ padding: "10px 12px" }}>Pos.</th>
                    <th style={{ padding: "10px 12px" }}>Vehículo / Patente</th>
                    <th style={{ padding: "10px 12px" }}>Proyecto</th>
                    <th style={{ padding: "10px 12px" }}>Gerente / Jefatura Titular</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>RUT</th>
                    <th style={{ padding: "10px 12px" }}>Cargo</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas ({diasPeriodo}d)</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Kilometraje</th>
                    <th style={{ padding: "10px 12px", textAlign: "right" }}>Combustible</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Viajes</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Días Activo</th>
                    <th style={{ padding: "10px 12px", textAlign: "center" }}>Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {equiposAsignadosGerencia.length === 0 ? (
                    <tr>
                      <td colSpan="12" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                        <ShieldCheck size={32} style={{ margin: "0 auto 8px", color: "#0284c7", opacity: 0.5 }} />
                        <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                          No hay camionetas registradas en la base de Gerencia / Jefaturas
                        </div>
                        <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px", marginBottom: "12px" }}>
                          Registra qué camionetas están asignadas para computar automáticamente sus horas cuando los viajes no tengan tarjeta RFID.
                        </div>
                        <button
                          onClick={abrirModalNuevaAsignacion}
                          style={{
                            backgroundColor: "#0284c7", color: "#ffffff", border: "none",
                            padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                            cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                          }}
                        >
                          <Plus size={14} /> Registrar Primera Camioneta
                        </button>
                      </td>
                    </tr>
                  ) : (
                    equiposAsignadosGerencia.map((eq, idx) => (
                      <tr key={eq.id || eq.patente} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                        <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                          <span style={{
                            width: "24px", height: "24px", borderRadius: "50%",
                            backgroundColor: idx === 0 ? "#0284c7" : "#e0f2fe",
                            color: idx === 0 ? "#ffffff" : "#0369a1",
                            fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center",
                          }}>
                            #{idx + 1}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <PatenteBadge patente={eq.patente} codigo={eq.codigo_interno} />
                          <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                            {eq.descripcion}
                          </div>
                        </td>
                        <td style={{ padding: "10px 12px", color: "#475569", maxWidth: "160px" }}>
                          <span title={eq.proyecto_nombre} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {eq.proyecto_nombre}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#0f172a" }}>
                          {eq.nombre_responsable}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#64748b", fontFamily: "monospace" }}>
                          {eq.rut_responsable}
                        </td>
                        <td style={{ padding: "10px 12px" }}>
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                            backgroundColor: "#dbeafe", color: "#1e40af", whiteSpace: "nowrap",
                          }}>
                            {eq.cargo}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#0284c7", fontSize: "13px" }}>
                          {eq.horas_totales} hrs
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                          {eq.km_totales.toLocaleString("es-CL")} km
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "right", color: "#dc2626", fontWeight: 600 }}>
                          {eq.litros_totales > 0 ? `${eq.litros_totales} L` : "-"}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>
                          {eq.viajes_totales}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>
                          {eq.dias_activos} / {diasPeriodo}
                        </td>
                        <td style={{ padding: "10px 12px", textAlign: "center" }}>
                          <button
                            onClick={() => handleEliminarAsignacion(eq)}
                            title="Eliminar asignación de gerencia"
                            style={{
                              background: "none", border: "none", color: "#ef4444",
                              cursor: "pointer", padding: "4px", borderRadius: "4px",
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── VISTA 2: CONDUCTORES Y OPERADORES DE LA FLOTA ──────────────────────── */}
      {subVista === "conductores" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <Users size={18} color="#0f172a" />
                Ranking Completo de Conductores y Operadores
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Histórico acumulado en los {diasPeriodo} días filtrados ({desde} al {hasta}): horas registradas por sistema RFID y por asignaciones de gerencia.
              </p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>Pos.</th>
                  <th style={{ padding: "10px 12px" }}>Nombre del Conductor</th>
                  <th style={{ padding: "10px 12px" }}>RUT</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Conducidas ({diasPeriodo}d)</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas RFID</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Asignadas</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Kilometraje</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Viajes</th>
                  <th style={{ padding: "10px 12px" }}>Vehículos Operados</th>
                </tr>
              </thead>
              <tbody>
                {conductoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <Users size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin registros de conductores para el período seleccionado
                      </div>
                    </td>
                  </tr>
                ) : (
                  conductoresFiltrados.map((cond, idx) => (
                    <tr key={cond.nombre} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                        <span style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          backgroundColor: idx === 0 ? "#f59e0b" : "#fef3c7",
                          color: idx === 0 ? "#ffffff" : "#b45309",
                          fontSize: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center",
                        }}>
                          #{idx + 1}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <strong style={{ fontSize: "12px", color: "#0f172a" }}>{cond.nombre}</strong>
                          {cond.es_asignado_gerencia && (
                            <span style={{
                              fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "4px",
                              backgroundColor: "#dbeafe", color: "#1e40af",
                            }}>
                              {cond.cargo || "Gerencia"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748b" }}>
                        {cond.rut}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#0f172a", fontSize: "13px" }}>
                        {cond.horas_conducidas} hrs
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#0284c7", fontWeight: 600 }}>
                        {cond.horas_rfid ? `${cond.horas_rfid} hrs` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#16a34a", fontWeight: 600 }}>
                        {cond.horas_asignadas ? `${cond.horas_asignadas} hrs` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                        {cond.km_totales.toLocaleString("es-CL")} km
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>
                        {cond.viajes}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                          {(cond.vehiculos || []).map((v) => (
                            <PatenteBadge key={v} patente={v} />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: ASIGNAR CAMIONETA A GERENTE O JEFATURA ─────────────────────── */}
      {modalAsignacionAbierto && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          backgroundColor: "rgba(15, 23, 42, 0.65)",
          backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center", padding: "16px",
        }}>
          <div style={{
            backgroundColor: "#ffffff", borderRadius: "14px", border: "2px solid #cbd5e1",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)", width: "100%", maxWidth: "520px",
            overflow: "hidden", display: "flex", flexDirection: "column",
          }}>
            {/* Header del Modal */}
            <div style={{
              padding: "16px 20px", backgroundColor: "#f8fafc", borderBottom: "1.5px solid #e2e8f0",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{ backgroundColor: "#e0f2fe", color: "#0284c7", padding: "6px", borderRadius: "6px" }}>
                  <ShieldCheck size={18} />
                </div>
                <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a" }}>
                  Asignar Camioneta a Gerente o Jefatura
                </h3>
              </div>
              <button
                onClick={() => setModalAsignacionAbierto(false)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", padding: "4px" }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Contenido / Formulario */}
            <form onSubmit={handleGuardarAsignacion} style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{
                padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f0f9ff",
                border: "1px solid #bae6fd", fontSize: "11px", color: "#0369a1", lineHeight: 1.4,
              }}>
                ℹ️ <strong>Lógica de identificación:</strong> Si esta camioneta realiza viajes y el conductor <strong>no registra tarjeta RFID</strong>, el sistema asociará automáticamente las horas y consumos al gerente aquí asignado. Si otro chofer pasa su tarjeta RFID, se mantendrá el chofer de la tarjeta.
              </div>

              {errorModalAsig && (
                <div style={{
                  padding: "8px 12px", borderRadius: "6px", backgroundColor: "#fee2e2",
                  border: "1px solid #fecaca", color: "#991b1b", fontSize: "12px", fontWeight: 600,
                }}>
                  {errorModalAsig}
                </div>
              )}

              {/* Selector de Vehículo / Patente */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Patente o Selección de Equipo *
                </label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <select
                    value={formAsignacion.patente}
                    onChange={(e) => {
                      const selectedPat = e.target.value;
                      const eqFound = equiposDisponibles.find(
                        (item) => normalizarPatente(item.patente) === normalizarPatente(selectedPat)
                      );
                      const proyFound = listaProyectos.find((p) => p.id === eqFound?.proyecto_id);
                      setFormAsignacion((prev) => ({
                        ...prev,
                        patente: selectedPat,
                        codigo_interno: eqFound?.codigo_interno || prev.codigo_interno,
                        proyecto_id: eqFound?.proyecto_id || prev.proyecto_id,
                        proyecto_nombre: proyFound?.nombre_proyecto || prev.proyecto_nombre,
                      }));
                    }}
                    style={{
                      flex: 1, fontSize: "12px", padding: "7px 10px", borderRadius: "6px",
                      border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none",
                    }}
                  >
                    <option value="">-- Seleccionar de la flota disponible --</option>
                    {equiposDisponibles.map((eq) => (
                      <option key={eq.id} value={eq.patente_raw || eq.patente}>
                        {eq.patente} {eq.codigo_interno ? `[${eq.codigo_interno}]` : ""} {eq.descripcion ? `- ${eq.descripcion}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginTop: "4px" }}>
                  <span style={{ fontSize: "10px", color: "#64748b" }}>O digita manualmente la patente:</span>
                  <input
                    type="text"
                    placeholder="Ej. PGXT19 o PGXT-19"
                    value={formAsignacion.patente}
                    onChange={(e) => setFormAsignacion({ ...formAsignacion, patente: e.target.value.toUpperCase() })}
                    style={{
                      marginTop: "2px", width: "100%", fontSize: "12px", padding: "6px 10px",
                      borderRadius: "6px", border: "1.5px solid #cbd5e1", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Nombre del Gerente / Jefatura */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Nombre Completo del Gerente / Jefatura *
                </label>
                <input
                  type="text"
                  placeholder="Ej. Carlos Mendoza Valenzuela"
                  value={formAsignacion.nombre_responsable}
                  onChange={(e) => setFormAsignacion({ ...formAsignacion, nombre_responsable: e.target.value })}
                  style={{
                    width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* RUT y Cargo */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    RUT
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. 12.345.678-9"
                    value={formAsignacion.rut_responsable}
                    onChange={(e) => setFormAsignacion({ ...formAsignacion, rut_responsable: e.target.value })}
                    style={{
                      width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "6px",
                      border: "1.5px solid #cbd5e1", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                    Cargo / Rol
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Gerente de Proyecto"
                    value={formAsignacion.cargo}
                    onChange={(e) => setFormAsignacion({ ...formAsignacion, cargo: e.target.value })}
                    style={{
                      width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "6px",
                      border: "1.5px solid #cbd5e1", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Proyecto / Obra Asignada */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#334155", marginBottom: "4px" }}>
                  Proyecto / Faena
                </label>
                <select
                  value={formAsignacion.proyecto_id}
                  onChange={(e) => {
                    const selProy = listaProyectos.find((p) => p.id === e.target.value);
                    setFormAsignacion({
                      ...formAsignacion,
                      proyecto_id: e.target.value,
                      proyecto_nombre: selProy ? selProy.nombre_proyecto : "",
                    });
                  }}
                  style={{
                    width: "100%", fontSize: "12px", padding: "7px 10px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", outline: "none", boxSizing: "border-box",
                  }}
                >
                  <option value="">-- Faena General / Sin Proyecto Fijo --</option>
                  {listaProyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo_cc ? `[${p.codigo_cc}] ` : ""}{p.nombre_proyecto}
                    </option>
                  ))}
                </select>
              </div>

              {/* Footer del Modal */}
              <div style={{
                display: "flex", justifyContent: "flex-end", gap: "10px",
                paddingTop: "12px", borderTop: "1.5px solid #e2e8f0", marginTop: "6px",
              }}>
                <button
                  type="button"
                  onClick={() => setModalAsignacionAbierto(false)}
                  style={{
                    padding: "7px 14px", borderRadius: "6px", fontSize: "12px",
                    fontWeight: 600, border: "1px solid #cbd5e1", backgroundColor: "#ffffff",
                    color: "#475569", cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoAsignacion}
                  style={{
                    padding: "7px 16px", borderRadius: "6px", fontSize: "12px",
                    fontWeight: 700, border: "none", backgroundColor: "#0284c7",
                    color: "#ffffff", cursor: guardandoAsignacion ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", gap: "6px",
                    boxShadow: "0 2px 4px rgba(2, 132, 199, 0.25)",
                  }}
                >
                  {guardandoAsignacion ? "Guardando..." : "Guardar Asignación"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

