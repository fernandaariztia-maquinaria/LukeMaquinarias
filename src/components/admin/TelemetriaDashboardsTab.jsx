import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  BarChart3, Clock, Fuel, Gauge, TrendingUp, Filter, Calendar,
  Building2, Car, User, Search, RefreshCw, AlertTriangle,
  CheckCircle2, Award, ArrowUpRight, Flame, Layers, Sliders,
  Info, ChevronRight, FileSpreadsheet, UserCheck, CalendarDays,
  Plus, Trash2, Settings, X, Briefcase, ShieldCheck
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

export default function TelemetriaDashboardsTab({ currentUser, hookProps }) {
  // 1. Verificación de Administrador
  const esAdmin = useMemo(() => {
    if (!currentUser) return false;
    const rol = String(currentUser.rol || "").toLowerCase();
    return rol.includes("admin") || rol === "administrador";
  }, [currentUser]);

  // Proyecto asignado al usuario (obra de origen para no-admins)
  const userProyectoId = currentUser?.proyecto_actual_id || "";

  // 2. Filtros de Consulta
  // Por defecto cubre el mes de octubre (datos históricos de telemetría cargados)
  const [desde, setDesde] = useState("2026-10-01");
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [proyectoFiltro, setProyectoFiltro] = useState(() => (esAdmin ? "" : userProyectoId));
  // Filtro unificado de búsqueda (Conductor, RUT, Patente o Vehículo)
  const [busquedaFiltro, setBusquedaFiltro] = useState("");
  const [tipoEquipoFiltro, setTipoEquipoFiltro] = useState("todos"); // "todos" | "camionetas" | "camiones" | "gruas" | "maquinaria" | "buses" | "otros"

  // 3. Parámetro de Meta de Utilización Editable por el Usuario
  const [modoMeta, setModoMeta] = useState("diario"); // "diario" | "total"
  const [horasMetaDiaria, setHorasMetaDiaria] = useState(8.0);
  const [horasMetaTotalPersonalizada, setHorasMetaTotalPersonalizada] = useState(160);

  // 4. Estados de Datos de la API
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [dashData, setDashData] = useState(null);

  // Vista de Dashboard activa ("general" | "horas" | "combustible" | "utilizacion" | "kilometraje" | "conductores" | "horario")
  const [seccionActiva, setSeccionActiva] = useState("general");
  const [filtroUtilizacion, setFiltroUtilizacion] = useState("todos"); // "todos" | "optimo" | "en_rango" | "subutilizado" | "sobreutilizado"

  // Sincronizar proyecto si cambia el usuario y no es admin
  useEffect(() => {
    if (!esAdmin && userProyectoId) {
      setProyectoFiltro(userProyectoId);
    }
  }, [esAdmin, userProyectoId]);

  // Etiqueta legible del tipo de equipo activo
  const labelTipoActivo = useMemo(() => {
    const f = TIPOS_EQUIPO_FILTROS.find((t) => t.key === tipoEquipoFiltro);
    return f ? f.label : "Equipos";
  }, [tipoEquipoFiltro]);

  // Cargar datos desde la API
  const cargarDashboards = useCallback(async () => {
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
      console.error("[TelemetriaDashboardsTab] Error al cargar:", err);
      setErrorMsg(err.message || "Error de red al consultar el servidor.");
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, proyectoFiltro, busquedaFiltro, tipoEquipoFiltro, currentUser?.rol, userProyectoId]);

  useEffect(() => {
    cargarDashboards();
  }, [cargarDashboards]);

  // Cálculos dinámicos de meta de utilización
  const diasPeriodo = dashData?.periodo?.dias_totales || 30;
  const horasMetaCalculadas = useMemo(() => {
    if (modoMeta === "diario") {
      return Math.max(1, Math.round(Number(horasMetaDiaria || 8) * diasPeriodo * 10) / 10);
    }
    return Math.max(1, Number(horasMetaTotalPersonalizada || 160));
  }, [modoMeta, horasMetaDiaria, diasPeriodo, horasMetaTotalPersonalizada]);

  // Filtrar rankings y listas por tipo de equipo (Camionetas, grúas, camiones, etc.)
  const topHorasFiltradas = useMemo(() => {
    const list = dashData?.rankings?.top_horas_uso || [];
    if (tipoEquipoFiltro === "todos") return list;
    return list.filter((e) => (e.tipo_clasificado || clasificarTipoEquipo(e)) === tipoEquipoFiltro);
  }, [dashData?.rankings?.top_horas_uso, tipoEquipoFiltro]);

  const topCombustibleFiltrado = useMemo(() => {
    const list = dashData?.rankings?.top_consumo_combustible || [];
    if (tipoEquipoFiltro === "todos") return list;
    return list.filter((e) => (e.tipo_clasificado || clasificarTipoEquipo(e)) === tipoEquipoFiltro);
  }, [dashData?.rankings?.top_consumo_combustible, tipoEquipoFiltro]);

  const topKmFiltrado = useMemo(() => {
    const list = dashData?.rankings?.top_kilometraje || [];
    if (tipoEquipoFiltro === "todos") return list;
    return list.filter((e) => (e.tipo_clasificado || clasificarTipoEquipo(e)) === tipoEquipoFiltro);
  }, [dashData?.rankings?.top_kilometraje, tipoEquipoFiltro]);

  const topRalentiFiltrado = useMemo(() => {
    const list = dashData?.rankings?.top_ralenti || [];
    if (tipoEquipoFiltro === "todos") return list;
    return list.filter((e) => (e.tipo_clasificado || clasificarTipoEquipo(e)) === tipoEquipoFiltro);
  }, [dashData?.rankings?.top_ralenti, tipoEquipoFiltro]);

  // KPIs globales dinámicos que se actualizan inmediatamente al cambiar el filtro de tipo de equipo
  const kpisDinamicos = useMemo(() => {
    if (!dashData?.kpis_globales) return null;
    if (tipoEquipoFiltro === "todos") return dashData.kpis_globales;

    // Calcular KPIs instantáneos a partir de los equipos filtrados
    const totalVehiculos = topHorasFiltradas.length;
    const totalHoras =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.horas_totales) || 0), 0) * 10
      ) / 10;
    const horasEfectivas =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.horas_efectivas) || 0), 0) * 10
      ) / 10;
    const horasRalenti =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.horas_ralenti) || 0), 0) * 10
      ) / 10;
    const pctRalenti =
      totalHoras > 0 ? Math.round((horasRalenti / totalHoras) * 1000) / 10 : 0;
    const totalLitros =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.litros_totales) || 0), 0) * 10
      ) / 10;
    const litrosCan =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.litros_can) || 0), 0) * 10
      ) / 10;
    const litrosGps =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.litros_gps) || 0), 0) * 10
      ) / 10;
    const totalKm =
      Math.round(
        topHorasFiltradas.reduce((acc, e) => acc + (Number(e.km_totales) || 0), 0) * 10
      ) / 10;
    const totalViajes = topHorasFiltradas.reduce(
      (acc, e) => acc + (Number(e.viajes_totales) || 0),
      0
    );
    const rendProm =
      totalLitros > 0 ? Math.round((totalKm / totalLitros) * 10) / 10 : null;

    return {
      total_vehiculos_activos: totalVehiculos,
      total_viajes: totalViajes,
      total_horas: totalHoras,
      horas_efectivas: horasEfectivas,
      horas_ralenti: horasRalenti,
      pct_ralenti: pctRalenti,
      total_km: totalKm,
      total_litros: totalLitros,
      litros_can: litrosCan,
      litros_gps: litrosGps,
      rendimiento_promedio: rendProm,
    };
  }, [dashData?.kpis_globales, tipoEquipoFiltro, topHorasFiltradas]);

  // Conductores filtrados por tipo de equipo
  const topConductoresFiltrados = useMemo(() => {
    const list = dashData?.rankings?.top_conductores || [];
    if (tipoEquipoFiltro === "todos") return list;

    // Patentes de vehículos correspondientes al tipo de equipo filtrado
    const patentesTipoSet = new Set(
      topHorasFiltradas.map((e) => normalizarPatente(e.patente))
    );

    return list.filter((cond) => {
      if (!cond.vehiculos || cond.vehiculos.length === 0) return false;
      return cond.vehiculos.some((v) => patentesTipoSet.has(normalizarPatente(v)));
    });
  }, [dashData?.rankings?.top_conductores, tipoEquipoFiltro, topHorasFiltradas]);

  // Enriquecer la lista de horas de uso con los porcentajes dinámicos de utilización
  const equiposConUtilizacion = useMemo(() => {
    return topHorasFiltradas.map((eq) => {
      const horasReales = eq.horas_totales || 0;
      const pctUtilizacion = Math.round((horasReales / horasMetaCalculadas) * 1000) / 10;
      let estado = "optimo";
      let color = "#16a34a"; // verde
      let etiqueta = "Óptimo (80% - 100%)";

      if (pctUtilizacion < 60) {
        estado = "subutilizado";
        color = "#dc2626"; // rojo
        etiqueta = "Subutilizado (< 60%)";
      } else if (pctUtilizacion < 80) {
        estado = "en_rango";
        color = "#f59e0b"; // ámbar
        etiqueta = "En Rango (60% - 79%)";
      } else if (pctUtilizacion > 100) {
        estado = "sobreutilizado";
        color = "#9333ea"; // púrpura
        etiqueta = "Sobreutilizado (> 100%)";
      }

      return {
        ...eq,
        horas_meta: horasMetaCalculadas,
        pct_utilizacion: pctUtilizacion,
        estado_utilizacion: estado,
        color_utilizacion: color,
        etiqueta_utilizacion: etiqueta,
      };
    }).sort((a, b) => b.pct_utilizacion - a.pct_utilizacion);
  }, [topHorasFiltradas, horasMetaCalculadas]);

  // Filtrado de equipos por estado de utilización
  const equiposUtilizacionFiltrados = useMemo(() => {
    if (filtroUtilizacion === "todos") return equiposConUtilizacion;
    return equiposConUtilizacion.filter((e) => e.estado_utilizacion === filtroUtilizacion);
  }, [equiposConUtilizacion, filtroUtilizacion]);

  // Proyectos disponibles para selector
  const listaProyectos = dashData?.proyectos_disponibles || [];
  const equiposDisponibles = dashData?.equipos_disponibles || [];

  // Encontrar nombre del proyecto actual si no es admin
  const nombreProyectoObra = useMemo(() => {
    if (!userProyectoId) return "Obra General";
    const found = listaProyectos.find((p) => p.id === userProyectoId);
    return found ? found.nombre_proyecto : "Obra Asignada";
  }, [listaProyectos, userProyectoId]);

  // Máximo consumo para barras proporcionales
  const maxLitros = useMemo(() => {
    const top = topCombustibleFiltrado[0];
    return top ? top.litros_totales || 1 : 1;
  }, [topCombustibleFiltrado]);

  // Máximas horas para barras proporcionales
  const maxHoras = useMemo(() => {
    const top = topHorasFiltradas[0];
    return top ? top.horas_totales || 1 : 1;
  }, [topHorasFiltradas]);

  // Máximo km para barras proporcionales
  const maxKm = useMemo(() => {
    const top = topKmFiltrado[0];
    return top ? top.km_totales || 1 : 1;
  }, [topKmFiltrado]);

  // Distribución horaria máxima para barras
  const maxHorasDistribucion = useMemo(() => {
    const dist = dashData?.distribucion_horaria || [];
    return Math.max(1, ...dist.map((d) => d.horas_operacion || 0));
  }, [dashData?.distribucion_horaria]);

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
        {/* Cabecera del Panel de Filtros */}
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: "12px", paddingBottom: "14px",
          borderBottom: "1.5px solid #e2e8f0",
        }}>
          <div>
            <h2 style={{ fontSize: "16px", fontWeight: 800, margin: 0, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={18} color="#0284c7" />
              Filtros de Análisis de Flota
            </h2>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Analiza métricas y rankings consolidados de mayor a menor por equipo, conductor y faena.
            </p>
          </div>

          {/* Badge informativo de período filtrado */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "6px 12px", borderRadius: "8px",
            backgroundColor: "#f0f9ff", border: "1.5px solid #bae6fd",
            fontSize: "12px", fontWeight: 700, color: "#0369a1",
          }}>
            <CalendarDays size={14} color="#0284c7" />
            <span>Datos filtrados: {diasPeriodo} días ({desde} al {hasta})</span>
          </div>
        </div>

        {/* Grilla de Módulos de Filtro Separados por Bordes Notorios */}
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
                  title="Octubre completo"
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
                  title="1ra Quincena Octubre"
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
                  title="2da Quincena Octubre"
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
              Proyecto / Obra (Faena)
            </span>
            <div>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "3px" }}>
                {esAdmin ? "Seleccionar Faena:" : "Obra Asignada:"}
              </label>
              {esAdmin ? (
                <select
                  value={proyectoFiltro}
                  onChange={(e) => setProyectoFiltro(e.target.value)}
                  style={{
                    width: "100%", fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                    border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none",
                    fontWeight: 600, color: "#0f172a", boxSizing: "border-box",
                  }}
                >
                  <option value="">-- Todos los Proyectos (Flota Completa) --</option>
                  {listaProyectos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.codigo_cc ? `[${p.codigo_cc}] ` : ""}{p.nombre_proyecto}
                    </option>
                  ))}
                </select>
              ) : (
                <div style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 10px", borderRadius: "6px",
                  backgroundColor: "#fef3c7", border: "1.5px solid #fde68a",
                  fontSize: "12px", fontWeight: 600, color: "#92400e",
                }} title="Acceso limitado a su obra asignada">
                  <span>🔒 {nombreProyectoObra}</span>
                </div>
              )}
            </div>
          </div>

          {/* Módulo 3: Buscador Unificado Conductor / Vehículo */}
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
                Buscador Conductor / Vehículo
              </span>
              <span style={{ fontSize: "10px", backgroundColor: "#e0f2fe", color: "#0369a1", padding: "1px 6px", borderRadius: "4px", fontWeight: 600 }}>
                Unificado
              </span>
            </div>
            <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="text"
                  placeholder="Chofer, Gerente, RUT o Patente (ej. PGXT19)..."
                  value={busquedaFiltro}
                  onChange={(e) => setBusquedaFiltro(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") cargarDashboards();
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
                onClick={cargarDashboards}
                disabled={cargando}
                title="Actualizar datos con los filtros seleccionados"
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

        {/* Módulo 4: Filtro por Tipo de Equipo con Borde Notorio */}
        <div style={{
          backgroundColor: "#f0f9ff",
          border: "1.5px solid #bae6fd",
          borderRadius: "10px",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#0369a1", display: "flex", alignItems: "center", gap: "6px" }}>
            <Layers size={15} color="#0284c7" />
            Tipo de Equipo:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {TIPOS_EQUIPO_FILTROS.map((t) => {
              const activo = tipoEquipoFiltro === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTipoEquipoFiltro(t.key)}
                  style={{
                    fontSize: "11px", fontWeight: 700, padding: "5px 12px", borderRadius: "6px",
                    cursor: "pointer", transition: "all 0.15s ease",
                    border: activo ? "1.5px solid #0284c7" : "1.5px solid #cbd5e1",
                    backgroundColor: activo ? "#0284c7" : "#ffffff",
                    color: activo ? "#ffffff" : "#475569",
                    boxShadow: activo ? "0 2px 4px rgba(2, 132, 199, 0.25)" : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MENSAJE DE ERROR SI OCURRIÓ ──────────────────────────────────────── */}
      {errorMsg && (
        <div style={{
          padding: "14px 18px", borderRadius: "10px", backgroundColor: "#fee2e2",
          border: "1.5px solid #fca5a5", color: "#991b1b", fontSize: "13px", fontWeight: 600,
          display: "flex", alignItems: "center", gap: "10px",
        }}>
          <AlertTriangle size={18} />
          {errorMsg}
        </div>
      )}

      {/* ── PANEL DE CONFIGURACIÓN DE META DE UTILIZACIÓN DINÁMICA ────────────── */}
      <div style={{
        backgroundColor: "#f8fafc", padding: "16px 20px", borderRadius: "12px",
        border: "1.5px solid #cbd5e1", display: "flex", flexWrap: "wrap",
        alignItems: "center", justifyContent: "space-between", gap: "16px",
        boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            backgroundColor: "#dbeafe", color: "#1d4ed8", padding: "10px",
            borderRadius: "10px", display: "flex",
          }}>
            <Sliders size={20} />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "6px" }}>
              Parámetro de Meta de Utilización de Equipos
              <span style={{ fontSize: "11px", backgroundColor: "#0284c7", color: "#ffffff", padding: "2px 8px", borderRadius: "10px" }}>
                Interactivo
              </span>
            </div>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Digita las horas esperadas para calcular el % de cumplimiento sobre los <strong>{diasPeriodo} días filtrados</strong>.
            </p>
          </div>
        </div>

        {/* Selector de modo y valor de meta editable */}
        <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", backgroundColor: "#e2e8f0", borderRadius: "8px", padding: "2px" }}>
            <button
              onClick={() => setModoMeta("diario")}
              style={{
                fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                border: "none", cursor: "pointer",
                backgroundColor: modoMeta === "diario" ? "#ffffff" : "transparent",
                color: modoMeta === "diario" ? "#0f172a" : "#64748b",
                boxShadow: modoMeta === "diario" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
            >
              Horas / Día
            </button>
            <button
              onClick={() => setModoMeta("total")}
              style={{
                fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                border: "none", cursor: "pointer",
                backgroundColor: modoMeta === "total" ? "#ffffff" : "transparent",
                color: modoMeta === "total" ? "#0f172a" : "#64748b",
                boxShadow: modoMeta === "total" ? "0 1px 2px rgba(0,0,0,0.1)" : "none",
              }}
            >
              Horas Totales Periodo
            </button>
          </div>

          {modoMeta === "diario" ? (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Horas objetivo/día:</span>
              <input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={horasMetaDiaria}
                onChange={(e) => setHorasMetaDiaria(parseFloat(e.target.value) || 0)}
                style={{
                  width: "80px", fontSize: "13px", fontWeight: 700, padding: "6px 8px",
                  borderRadius: "6px", border: "2px solid #0284c7", outline: "none",
                  textAlign: "center", backgroundColor: "#ffffff", color: "#0f172a",
                }}
              />
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                = <strong>{horasMetaCalculadas} hrs</strong> en {diasPeriodo} días
              </span>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Meta total periodo:</span>
              <input
                type="number"
                min="1"
                max="744"
                step="5"
                value={horasMetaTotalPersonalizada}
                onChange={(e) => setHorasMetaTotalPersonalizada(parseFloat(e.target.value) || 0)}
                style={{
                  width: "90px", fontSize: "13px", fontWeight: 700, padding: "6px 8px",
                  borderRadius: "6px", border: "2px solid #0284c7", outline: "none",
                  textAlign: "center", backgroundColor: "#ffffff", color: "#0f172a",
                }}
              />
              <span style={{ fontSize: "12px", color: "#64748b" }}>horas en los {diasPeriodo} días</span>
            </div>
          )}
        </div>
      </div>

      {/* ── TARJETAS KPIS GLOBALES CON BORDES NOTORIOS Y ESPECIFICACIÓN DE DÍAS ── */}
      {kpisDinamicos && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
          gap: "16px",
        }}>
          {/* KPI 1: Horas Totales con Desglose de Ralentí */}
          <div style={{
            backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px",
            border: "1.5px solid #cbd5e1", borderTop: "4px solid #0284c7",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Horas de Motor ({tipoEquipoFiltro === "todos" ? "Uso Flota" : labelTipoActivo})
                </span>
                <div style={{ backgroundColor: "#eff6ff", color: "#2563eb", padding: "6px", borderRadius: "8px" }}>
                  <Clock size={18} />
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>
                {kpisDinamicos.total_horas.toLocaleString("es-CL")} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>hrs</span>
              </div>
              {/* Barra apilada: Efectiva vs Ralentí */}
              <div style={{ width: "100%", height: "8px", backgroundColor: "#f1f5f9", borderRadius: "4px", overflow: "hidden", display: "flex", margin: "10px 0 6px" }}>
                <div
                  style={{
                    width: `${100 - (kpisDinamicos.pct_ralenti || 0)}%`,
                    backgroundColor: "#0284c7",
                  }}
                  title={`Horas Efectivas: ${kpisDinamicos.horas_efectivas} hrs (${100 - (kpisDinamicos.pct_ralenti || 0)}%)`}
                />
                <div
                  style={{
                    width: `${kpisDinamicos.pct_ralenti || 0}%`,
                    backgroundColor: "#f97316",
                  }}
                  title={`Ralentí: ${kpisDinamicos.horas_ralenti} hrs (${kpisDinamicos.pct_ralenti}%)`}
                />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: "#475569" }}>
                <span>Efectiva: <strong>{kpisDinamicos.horas_efectivas} hrs</strong></span>
                <span style={{ color: "#c2410c" }}>Ralentí: <strong>{kpisDinamicos.horas_ralenti} hrs ({kpisDinamicos.pct_ralenti}%)</strong></span>
              </div>
            </div>
            {/* Especificación de días filtrados */}
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#64748b",
              marginTop: "12px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <CalendarDays size={12} color="#0284c7" />
              <span>Acumulado en los {diasPeriodo} días filtrados</span>
            </div>
          </div>

          {/* KPI 2: Consumo de Combustible */}
          <div style={{
            backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px",
            border: "1.5px solid #cbd5e1", borderTop: "4px solid #dc2626",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Combustible Consumido ({tipoEquipoFiltro === "todos" ? "Total Flota" : labelTipoActivo})
                </span>
                <div style={{ backgroundColor: "#fef2f2", color: "#dc2626", padding: "6px", borderRadius: "8px" }}>
                  <Fuel size={18} />
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>
                {kpisDinamicos.total_litros.toLocaleString("es-CL")} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>Lts</span>
              </div>
              <div style={{ display: "flex", gap: "10px", fontSize: "11px", color: "#64748b", marginTop: "10px" }}>
                <span>CAN Bus: <strong>{kpisDinamicos.litros_can} L</strong></span>
                <span>•</span>
                <span>GPS: <strong>{kpisDinamicos.litros_gps} L</strong></span>
              </div>
              <div style={{ fontSize: "11px", color: "#0369a1", marginTop: "4px", fontWeight: 600 }}>
                Rendimiento: {kpisDinamicos.rendimiento_promedio ? `${kpisDinamicos.rendimiento_promedio} km/L` : "Calculando..."}
              </div>
            </div>
            {/* Especificación de días filtrados */}
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#64748b",
              marginTop: "12px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <CalendarDays size={12} color="#dc2626" />
              <span>Consumo en los {diasPeriodo} días filtrados</span>
            </div>
          </div>

          {/* KPI 3: Distancia Recorrida */}
          <div style={{
            backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px",
            border: "1.5px solid #cbd5e1", borderTop: "4px solid #16a34a",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Distancia Total Recorrida ({tipoEquipoFiltro === "todos" ? "Total Flota" : labelTipoActivo})
                </span>
                <div style={{ backgroundColor: "#f0fdf4", color: "#16a34a", padding: "6px", borderRadius: "8px" }}>
                  <Gauge size={18} />
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>
                {kpisDinamicos.total_km.toLocaleString("es-CL")} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>km</span>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "10px" }}>
                Total Viajes: <strong>{kpisDinamicos.total_viajes?.toLocaleString("es-CL")}</strong>
              </div>
              <div style={{ fontSize: "11px", color: "#15803d", marginTop: "4px", fontWeight: 600 }}>
                Promedio por viaje: {kpisDinamicos.total_viajes > 0 ? `${(Math.round((kpisDinamicos.total_km / kpisDinamicos.total_viajes) * 10) / 10)} km` : "0 km"}
              </div>
            </div>
            {/* Especificación de días filtrados */}
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#64748b",
              marginTop: "12px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <CalendarDays size={12} color="#16a34a" />
              <span>Desplazamiento en los {diasPeriodo} días filtrados</span>
            </div>
          </div>

          {/* KPI 4: Flota en Operación */}
          <div style={{
            backgroundColor: "#ffffff", padding: "16px", borderRadius: "12px",
            border: "1.5px solid #cbd5e1", borderTop: "4px solid #9333ea",
            boxShadow: "0 2px 6px rgba(0,0,0,0.03)", display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b" }}>
                  Equipos Activos ({labelTipoActivo})
                </span>
                <div style={{ backgroundColor: "#fdf4ff", color: "#a855f7", padding: "6px", borderRadius: "8px" }}>
                  <Car size={18} />
                </div>
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#0f172a" }}>
                {kpisDinamicos.total_vehiculos_activos} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>unidades</span>
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "10px" }}>
                Días con actividad: <strong>{dashData?.periodo?.dias_con_actividad || 0} de {diasPeriodo} días</strong>
              </div>
              <div style={{ fontSize: "11px", color: "#7e22ce", marginTop: "4px", fontWeight: 600 }}>
                Meta actual: {horasMetaCalculadas} hrs / equipo
              </div>
            </div>
            {/* Especificación de días filtrados */}
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#64748b",
              marginTop: "12px", paddingTop: "8px", borderTop: "1px dashed #e2e8f0",
              display: "flex", alignItems: "center", gap: "5px",
            }}>
              <CalendarDays size={12} color="#9333ea" />
              <span>Operatividad en el rango de {diasPeriodo} días</span>
            </div>
          </div>
        </div>
      )}

      {/* ── SELECTOR DE SECCIONES DE DASHBOARDS (SUB-TABS INTERNOS) ───────────── */}
      <div style={{
        display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px",
        borderBottom: "2px solid #e2e8f0",
      }}>
        <button
          onClick={() => setSeccionActiva("general")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "general" ? "#0f172a" : "#ffffff",
            color: seccionActiva === "general" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "general" ? "0 2px 4px rgba(0,0,0,0.15)" : "none",
          }}
        >
          <Layers size={14} />
          Vista General (Top Resumen)
        </button>

        <button
          onClick={() => setSeccionActiva("horas")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "horas" ? "#0284c7" : "#ffffff",
            color: seccionActiva === "horas" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "horas" ? "0 2px 4px rgba(2, 132, 199, 0.2)" : "none",
          }}
        >
          <Clock size={14} />
          Top Horas de Uso
        </button>

        <button
          onClick={() => setSeccionActiva("combustible")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "combustible" ? "#dc2626" : "#ffffff",
            color: seccionActiva === "combustible" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "combustible" ? "0 2px 4px rgba(220, 38, 38, 0.2)" : "none",
          }}
        >
          <Fuel size={14} />
          Top Consumo Combustible
        </button>

        <button
          onClick={() => setSeccionActiva("utilizacion")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "utilizacion" ? "#16a34a" : "#ffffff",
            color: seccionActiva === "utilizacion" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "utilizacion" ? "0 2px 4px rgba(22, 163, 74, 0.2)" : "none",
          }}
        >
          <TrendingUp size={14} />
          % Utilización por Equipo
        </button>

        <button
          onClick={() => setSeccionActiva("kilometraje")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "kilometraje" ? "#8b5cf6" : "#ffffff",
            color: seccionActiva === "kilometraje" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "kilometraje" ? "0 2px 4px rgba(139, 92, 246, 0.2)" : "none",
          }}
        >
          <Gauge size={14} />
          Top Kilometraje Recorrido
        </button>

        <button
          onClick={() => setSeccionActiva("conductores")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "conductores" ? "#f59e0b" : "#ffffff",
            color: seccionActiva === "conductores" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "conductores" ? "0 2px 4px rgba(245, 158, 11, 0.2)" : "none",
          }}
        >
          <User size={14} />
          Top Conductores Más Activos
        </button>

        <button
          onClick={() => setSeccionActiva("horario")}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
            border: "none", cursor: "pointer", transition: "all 0.15s ease",
            backgroundColor: seccionActiva === "horario" ? "#0369a1" : "#ffffff",
            color: seccionActiva === "horario" ? "#ffffff" : "#475569",
            boxShadow: seccionActiva === "horario" ? "0 2px 4px rgba(3, 105, 161, 0.2)" : "none",
          }}
        >
          <BarChart3 size={14} />
          Distribución Horaria (24 Horas)
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 1: VISTA GENERAL (PANEL RESUMEN DE TODOS LOS DASHBOARDS)       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "general" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Fila 1: Top Horas de Uso & Top Combustible */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "20px" }}>
            {/* Top Horas de Uso (Preview) */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Clock size={16} color="#0284c7" />
                    Top Horas de Uso ({topHorasFiltradas.length}) {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Desglose en los {diasPeriodo} días filtrados (efectiva vs ralentí)
                  </span>
                </div>
                <button
                  onClick={() => setSeccionActiva("horas")}
                  style={{
                    fontSize: "11px", fontWeight: 700, color: "#0284c7", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                  }}
                >
                  Ver tabla completa <ChevronRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                {topHorasFiltradas.length === 0 ? (
                  <div style={{
                    padding: "24px 16px", textAlign: "center", backgroundColor: "#f8fafc",
                    borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b",
                  }}>
                    <Clock size={24} style={{ margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      Sin registros de horas para {labelTipoActivo.toLowerCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      No se encontraron equipos de esta categoría con actividad en el período.
                    </div>
                  </div>
                ) : (
                  topHorasFiltradas.map((eq, idx) => (
                    <div key={eq.patente} style={{
                      padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
                          <span style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            backgroundColor: idx === 0 ? "#fbbf24" : idx === 1 ? "#94a3b8" : idx === 2 ? "#d97706" : "#e2e8f0",
                            color: idx === 0 || idx === 2 ? "#ffffff" : "#0f172a",
                            fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </span>
                          <PatenteBadge patente={eq.patente} codigo={eq.codigo_interno} />
                          <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                            {eq.proyecto_nombre}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontSize: "14px", color: "#0f172a" }}>{eq.horas_totales} hrs</strong>
                        </div>
                      </div>
                      {/* Barra visual apilada */}
                      <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden", display: "flex" }}>
                        <div
                          style={{ width: `${maxHoras > 0 ? (eq.horas_efectivas / maxHoras) * 100 : 0}%`, backgroundColor: "#0284c7" }}
                          title={`Efectiva: ${eq.horas_efectivas} hrs`}
                        />
                        <div
                          style={{ width: `${maxHoras > 0 ? (eq.horas_ralenti / maxHoras) * 100 : 0}%`, backgroundColor: "#f97316" }}
                          title={`Ralentí: ${eq.horas_ralenti} hrs`}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                        <span>Efectiva: <strong>{eq.horas_efectivas} hrs</strong></span>
                        <span style={{ color: "#ea580c" }}>Ralentí: <strong>{eq.horas_ralenti} hrs ({eq.pct_ralenti}%)</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Consumo de Combustible (Preview) */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Fuel size={16} color="#dc2626" />
                    Top Consumo de Combustible ({topCombustibleFiltrado.length}) {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Litros consumidos en los {diasPeriodo} días filtrados
                  </span>
                </div>
                <button
                  onClick={() => setSeccionActiva("combustible")}
                  style={{
                    fontSize: "11px", fontWeight: 700, color: "#dc2626", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                  }}
                >
                  Ver tabla completa <ChevronRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                {topCombustibleFiltrado.length === 0 ? (
                  <div style={{
                    padding: "24px 16px", textAlign: "center", backgroundColor: "#f8fafc",
                    borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b",
                  }}>
                    <Fuel size={24} style={{ margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      Sin consumo registrado para {labelTipoActivo.toLowerCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      No se registraron litros consumidos para este tipo de equipo en el período.
                    </div>
                  </div>
                ) : (
                  topCombustibleFiltrado.map((eq, idx) => (
                    <div key={eq.patente} style={{
                      padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
                          <span style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            backgroundColor: idx === 0 ? "#ef4444" : "#fee2e2",
                            color: idx === 0 ? "#ffffff" : "#b91c1c",
                            fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </span>
                          <PatenteBadge patente={eq.patente} codigo={eq.codigo_interno} />
                          <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                            {eq.proyecto_nombre}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontSize: "14px", color: "#b91c1c" }}>{eq.litros_totales} L</strong>
                        </div>
                      </div>
                      {/* Barra de progreso de consumo proporcional */}
                      <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${maxLitros > 0 ? (eq.litros_totales / maxLitros) * 100 : 0}%`,
                            backgroundColor: "#ef4444", height: "100%",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                        <span>Distancia: <strong>{eq.km_totales} km</strong></span>
                        <span>Rendimiento: <strong>{eq.rendimiento_kml ? `${eq.rendimiento_kml} km/L` : "N/D"}</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Fila 2: Porcentaje de Utilización (Meta Dinámica) & Top Kilometraje */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "20px" }}>
            {/* Utilización Dinámica (Preview) */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <TrendingUp size={16} color="#16a34a" />
                    % de Utilización ({equiposConUtilizacion.length}) {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "por Equipo"} (Meta: {horasMetaCalculadas} hrs)
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Calculado sobre la meta en los {diasPeriodo} días filtrados
                  </span>
                </div>
                <button
                  onClick={() => setSeccionActiva("utilizacion")}
                  style={{
                    fontSize: "11px", fontWeight: 700, color: "#16a34a", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                  }}
                >
                  Ver tabla completa <ChevronRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                {equiposConUtilizacion.length === 0 ? (
                  <div style={{
                    padding: "24px 16px", textAlign: "center", backgroundColor: "#f8fafc",
                    borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b",
                  }}>
                    <TrendingUp size={24} style={{ margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      Sin datos de utilización para {labelTipoActivo.toLowerCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      No hay equipos registrados de esta categoría en el período consultado.
                    </div>
                  </div>
                ) : (
                  equiposConUtilizacion.map((eq, idx) => (
                    <div key={eq.patente} style={{
                      padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
                          <PatenteBadge patente={eq.patente} codigo={eq.codigo_interno} />
                          <span style={{
                            fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                            backgroundColor: `${eq.color_utilizacion}15`, color: eq.color_utilizacion,
                            border: `1px solid ${eq.color_utilizacion}30`, whiteSpace: "nowrap", flexShrink: 0,
                          }}>
                            {eq.etiqueta_utilizacion}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontSize: "14px", color: eq.color_utilizacion }}>{eq.pct_utilizacion}%</strong>
                        </div>
                      </div>
                      {/* Barra de progreso de cumplimiento de meta */}
                      <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${Math.min(100, eq.pct_utilizacion)}%`,
                            backgroundColor: eq.color_utilizacion, height: "100%",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                        <span>Reales: <strong>{eq.horas_totales} hrs</strong></span>
                        <span>Meta: <strong>{horasMetaCalculadas} hrs</strong></span>
                        <span>Días activos: <strong>{eq.dias_activos} días</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Top Kilometraje (Preview) */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Gauge size={16} color="#8b5cf6" />
                    Top Kilometraje Recorrido ({topKmFiltrado.length}) {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Distancia recorrida en los {diasPeriodo} días filtrados
                  </span>
                </div>
                <button
                  onClick={() => setSeccionActiva("kilometraje")}
                  style={{
                    fontSize: "11px", fontWeight: 700, color: "#8b5cf6", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                  }}
                >
                  Ver tabla completa <ChevronRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                {topKmFiltrado.length === 0 ? (
                  <div style={{
                    padding: "24px 16px", textAlign: "center", backgroundColor: "#f8fafc",
                    borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b",
                  }}>
                    <Gauge size={24} style={{ margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      Sin desplazamientos para {labelTipoActivo.toLowerCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      No se registraron kilómetros en el período consultado.
                    </div>
                  </div>
                ) : (
                  topKmFiltrado.map((eq, idx) => (
                    <div key={eq.patente} style={{
                      padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "nowrap" }}>
                          <span style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            backgroundColor: idx === 0 ? "#8b5cf6" : "#ede9fe",
                            color: idx === 0 ? "#ffffff" : "#6d28d9",
                            fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </span>
                          <PatenteBadge patente={eq.patente} codigo={eq.codigo_interno} />
                          <span style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "160px" }}>
                            {eq.proyecto_nombre}
                          </span>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontSize: "14px", color: "#6d28d9" }}>{eq.km_totales.toLocaleString("es-CL")} km</strong>
                        </div>
                      </div>
                      {/* Barra de progreso de km */}
                      <div style={{ width: "100%", height: "6px", backgroundColor: "#e2e8f0", borderRadius: "3px", overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${maxKm > 0 ? (eq.km_totales / maxKm) * 100 : 0}%`,
                            backgroundColor: "#8b5cf6", height: "100%",
                          }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "#64748b", marginTop: "4px" }}>
                        <span>Viajes: <strong>{eq.viajes_totales}</strong></span>
                        <span>Promedio: <strong>{eq.viajes_totales > 0 ? `${Math.round((eq.km_totales / eq.viajes_totales) * 10) / 10} km/viaje` : "-"}</strong></span>
                        <span>Chofer: <strong>{eq.conductor_principal}</strong></span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Fila 3: A LA IZQUIERDA: Top Conductores Más Activos | A LA DERECHA: Distribución Horaria (24 Horas) */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gap: "20px" }}>
            {/* Apartado Izquierdo: Top Conductores Más Activos */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    <User size={16} color="#f59e0b" />
                    Top Conductores Más Activos ({topConductoresFiltrados.length}) {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
                  </h3>
                  <span style={{ fontSize: "11px", color: "#64748b" }}>
                    Choferes y personal asignado al volante en los {diasPeriodo} días filtrados
                  </span>
                </div>
                <button
                  onClick={() => setSeccionActiva("conductores")}
                  style={{
                    fontSize: "11px", fontWeight: 700, color: "#d97706", background: "none",
                    border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                  }}
                >
                  Ver tabla completa <ChevronRight size={13} />
                </button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "450px", overflowY: "auto", paddingRight: "4px" }}>
                {topConductoresFiltrados.length === 0 ? (
                  <div style={{
                    padding: "24px 16px", textAlign: "center", backgroundColor: "#f8fafc",
                    borderRadius: "8px", border: "1px dashed #cbd5e1", color: "#64748b",
                  }}>
                    <User size={24} style={{ margin: "0 auto 6px", opacity: 0.4 }} />
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155" }}>
                      Sin registros de choferes para {labelTipoActivo.toLowerCase()}
                    </div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                      No se encontraron viajes con conductor registrado para este tipo de equipo en el período.
                    </div>
                  </div>
                ) : (
                  topConductoresFiltrados.map((cond, idx) => (
                    <div key={cond.nombre} style={{
                      padding: "10px 12px", borderRadius: "8px", backgroundColor: "#f8fafc",
                      border: "1.5px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            width: "22px", height: "22px", borderRadius: "50%",
                            backgroundColor: idx === 0 ? "#f59e0b" : "#fef3c7",
                            color: idx === 0 ? "#ffffff" : "#b45309",
                            fontSize: "11px", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
                            flexShrink: 0,
                          }}>
                            {idx + 1}
                          </span>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <strong style={{ fontSize: "12px", color: "#0f172a" }}>{cond.nombre}</strong>
                              {cond.es_asignado_gerencia && (
                                <span style={{ fontSize: "9px", fontWeight: 700, backgroundColor: "#dbeafe", color: "#1e40af", padding: "1px 5px", borderRadius: "3px" }}>
                                  {cond.cargo || "Gerencia"}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: "10px", color: "#64748b" }}>RUT: {cond.rut}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <strong style={{ fontSize: "14px", color: "#0f172a" }}>{cond.horas_conducidas} hrs</strong>
                          <div style={{ fontSize: "10px", color: "#64748b" }}>{cond.km_totales} km</div>
                        </div>
                      </div>
                      <div style={{ fontSize: "10px", color: "#64748b", marginTop: "4px", display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
                        <span>Vehículos:</span>
                        {(cond.vehiculos || []).slice(0, 3).map((v) => (
                          <PatenteBadge key={v} patente={v} />
                        ))}
                        {cond.vehiculos?.length > 3 ? (
                          <span style={{ fontSize: "10px", color: "#64748b", fontWeight: 600 }}>
                            (+{cond.vehiculos.length - 3})
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Apartado Derecho: Distribución Horaria de Operación (24 Horas) */}
            <div style={{
              backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
              padding: "18px", boxShadow: "0 2px 6px rgba(0,0,0,0.03)",
              display: "flex", flexDirection: "column", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                      <BarChart3 size={16} color="#0369a1" />
                      Distribución Horaria de Operación (24 Horas)
                    </h3>
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Curva de horas punta de operación en los {diasPeriodo} días filtrados
                    </span>
                  </div>
                  <button
                    onClick={() => setSeccionActiva("horario")}
                    style={{
                      fontSize: "11px", fontWeight: 700, color: "#0369a1", background: "none",
                      border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: "2px",
                    }}
                  >
                    Ver detalle <ChevronRight size={13} />
                  </button>
                </div>

                {/* Gráfico compacto de 24 horas */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(24, 1fr)",
                  gap: "4px", alignItems: "flex-end", height: "140px",
                  padding: "14px 8px 8px", backgroundColor: "#f8fafc",
                  borderRadius: "8px", border: "1px solid #e2e8f0",
                }}>
                  {(dashData?.distribucion_horaria || []).map((d) => {
                    const hPct = maxHorasDistribucion > 0 ? (d.horas_operacion / maxHorasDistribucion) * 100 : 0;
                    const esPunta = d.hora >= 7 && d.hora <= 19;
                    return (
                      <div key={d.hora} style={{
                        display: "flex", flexDirection: "column", alignItems: "center",
                        height: "100%", justifyContent: "flex-end",
                      }}>
                        <div
                          style={{
                            width: "100%",
                            height: `${Math.max(6, hPct)}%`,
                            backgroundColor: esPunta ? "#0284c7" : "#94a3b8",
                            borderRadius: "3px 3px 0 0",
                            transition: "all 0.2s ease",
                            cursor: "pointer",
                          }}
                          title={`${d.etiqueta}: ${d.horas_operacion} hrs, ${d.viajes} viajes, ${d.km} km`}
                        />
                        <span style={{ fontSize: "8px", color: "#64748b", marginTop: "3px", fontWeight: 600 }}>
                          {String(d.hora).padStart(2, "0")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", fontSize: "10px", color: "#64748b", paddingTop: "8px", borderTop: "1px solid #f1f5f9" }}>
                <div style={{ display: "flex", gap: "10px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", backgroundColor: "#0284c7", borderRadius: "2px" }} />
                    Día (07h-19h)
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ width: "8px", height: "8px", backgroundColor: "#94a3b8", borderRadius: "2px" }} />
                    Noche (20h-06h)
                  </span>
                </div>
                <span>Pasa el cursor para ver horas por bloque</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 2: TOP HORAS DE USO COMPLETO (RALENTÍ VS EFECTIVA)              */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "horas" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <Clock size={18} color="#0284c7" />
                Ranking Completo: Top Horas de Uso {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Datos consolidados en los <strong>{diasPeriodo} días filtrados</strong> ({desde} al {hasta}). Identifica equipos con mayor operación y ratio de ralentí.
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "12px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "#0284c7", borderRadius: "2px", display: "inline-block" }} />
                Horas Efectivas
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "#f97316", borderRadius: "2px", display: "inline-block" }} />
                Horas Ralentí
              </span>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>Pos.</th>
                  <th style={{ padding: "10px 12px" }}>Equipo / Patente</th>
                  <th style={{ padding: "10px 12px" }}>Proyecto</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Horas Totales ({diasPeriodo}d)</th>
                  <th style={{ padding: "10px 12px" }}>Desglose Visual (Efectiva vs Ralentí)</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Efectivas</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Ralentí</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>% Ralentí</th>
                  <th style={{ padding: "10px 12px" }}>Chofer Frecuente</th>
                </tr>
              </thead>
              <tbody>
                {topHorasFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <Clock size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin registros de horas para {labelTipoActivo.toLowerCase()}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        No se encontraron equipos de esta categoría con actividad en el período seleccionado.
                      </div>
                    </td>
                  </tr>
                ) : (
                  topHorasFiltradas.map((eq, idx) => (
                    <tr key={eq.patente} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                        <span style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          backgroundColor: idx === 0 ? "#fbbf24" : idx === 1 ? "#94a3b8" : idx === 2 ? "#d97706" : "#f1f5f9",
                          color: idx === 0 || idx === 2 ? "#ffffff" : "#0f172a",
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
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 800, color: "#0f172a", fontSize: "13px" }}>
                        {eq.horas_totales} hrs
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "160px" }}>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px", overflow: "hidden", display: "flex" }}>
                          <div
                            style={{ width: `${maxHoras > 0 ? (eq.horas_efectivas / maxHoras) * 100 : 0}%`, backgroundColor: "#0284c7" }}
                            title={`Efectiva: ${eq.horas_efectivas} hrs`}
                          />
                          <div
                            style={{ width: `${maxHoras > 0 ? (eq.horas_ralenti / maxHoras) * 100 : 0}%`, backgroundColor: "#f97316" }}
                            title={`Ralentí: ${eq.horas_ralenti} hrs`}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0284c7" }}>
                        {eq.horas_efectivas} hrs
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#ea580c" }}>
                        {eq.horas_ralenti} hrs
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <span style={{
                          padding: "2px 6px", borderRadius: "4px", fontSize: "11px", fontWeight: 700,
                          backgroundColor: eq.pct_ralenti > 25 ? "#fee2e2" : eq.pct_ralenti > 10 ? "#fef3c7" : "#dcfce7",
                          color: eq.pct_ralenti > 25 ? "#991b1b" : eq.pct_ralenti > 10 ? "#92400e" : "#166534",
                        }}>
                          {eq.pct_ralenti}%
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "11px" }}>
                        {eq.conductor_principal}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 3: TOP CONSUMO DE COMBUSTIBLE COMPLETO                         */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "combustible" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <Fuel size={18} color="#dc2626" />
                Ranking Completo: Top Consumo de Combustible {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Gasto acumulado en los <strong>{diasPeriodo} días filtrados</strong> ({desde} al {hasta}), desglosando CAN Bus vs telemetría GPS.
              </p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>Pos.</th>
                  <th style={{ padding: "10px 12px" }}>Equipo / Patente</th>
                  <th style={{ padding: "10px 12px" }}>Proyecto</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Total Litros ({diasPeriodo}d)</th>
                  <th style={{ padding: "10px 12px" }}>Proporción de Consumo</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Litros CAN</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Litros GPS</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Km Totales</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Rendimiento Est.</th>
                </tr>
              </thead>
              <tbody>
                {topCombustibleFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <Fuel size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin registros de combustible para {labelTipoActivo.toLowerCase()}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        No se registran litros consumidos por esta categoría en el período seleccionado.
                      </div>
                    </td>
                  </tr>
                ) : (
                  topCombustibleFiltrado.map((eq, idx) => (
                    <tr key={eq.patente} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                        <span style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          backgroundColor: idx === 0 ? "#ef4444" : "#fee2e2",
                          color: idx === 0 ? "#ffffff" : "#b91c1c",
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
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#b91c1c", fontSize: "13px" }}>
                        {eq.litros_totales} L
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "140px" }}>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${maxLitros > 0 ? (eq.litros_totales / maxLitros) * 100 : 0}%`,
                              backgroundColor: "#ef4444", height: "100%",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>
                        {eq.litros_can > 0 ? `${eq.litros_can} L` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#475569" }}>
                        {eq.litros_gps > 0 ? `${eq.litros_gps} L` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0f172a" }}>
                        {eq.km_totales} km
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right" }}>
                        <span style={{ fontWeight: 700, color: "#0369a1" }}>
                          {eq.rendimiento_kml ? `${eq.rendimiento_kml} km/L` : "N/D"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 4: % DE UTILIZACIÓN DINÁMICA COMPLETA                           */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "utilizacion" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <TrendingUp size={18} color="#16a34a" />
                Porcentaje de Utilización por Equipo (Meta Actual: {horasMetaCalculadas} Horas en {diasPeriodo} días)
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Tasa de utilización: <strong>(Horas Reales / Horas Meta) × 100%</strong>. Modifica el parámetro en la barra superior para recalcular al instante.
              </p>
            </div>

            {/* Filtros rápidos por estado */}
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              <button
                onClick={() => setFiltroUtilizacion("todos")}
                style={{
                  fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                  border: "1.5px solid #cbd5e1", cursor: "pointer",
                  backgroundColor: filtroUtilizacion === "todos" ? "#0f172a" : "#ffffff",
                  color: filtroUtilizacion === "todos" ? "#ffffff" : "#475569",
                }}
              >
                Todos ({equiposConUtilizacion.length})
              </button>
              <button
                onClick={() => setFiltroUtilizacion("optimo")}
                style={{
                  fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                  border: "1.5px solid #bbf7d0", cursor: "pointer",
                  backgroundColor: filtroUtilizacion === "optimo" ? "#16a34a" : "#f0fdf4",
                  color: filtroUtilizacion === "optimo" ? "#ffffff" : "#166534",
                }}
              >
                Óptimos 80-100% ({equiposConUtilizacion.filter((e) => e.estado_utilizacion === "optimo").length})
              </button>
              <button
                onClick={() => setFiltroUtilizacion("subutilizado")}
                style={{
                  fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                  border: "1.5px solid #fecaca", cursor: "pointer",
                  backgroundColor: filtroUtilizacion === "subutilizado" ? "#dc2626" : "#fef2f2",
                  color: filtroUtilizacion === "subutilizado" ? "#ffffff" : "#991b1b",
                }}
              >
                Subutilizados &lt;60% ({equiposConUtilizacion.filter((e) => e.estado_utilizacion === "subutilizado").length})
              </button>
              <button
                onClick={() => setFiltroUtilizacion("sobreutilizado")}
                style={{
                  fontSize: "11px", fontWeight: 700, padding: "5px 10px", borderRadius: "6px",
                  border: "1.5px solid #e9d5ff", cursor: "pointer",
                  backgroundColor: filtroUtilizacion === "sobreutilizado" ? "#9333ea" : "#faf5ff",
                  color: filtroUtilizacion === "sobreutilizado" ? "#ffffff" : "#6b21a8",
                }}
              >
                Sobreutilizados &gt;100% ({equiposConUtilizacion.filter((e) => e.estado_utilizacion === "sobreutilizado").length})
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>Pos.</th>
                  <th style={{ padding: "10px 12px" }}>Equipo / Patente</th>
                  <th style={{ padding: "10px 12px" }}>Proyecto</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Reales ({diasPeriodo}d)</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Horas Meta</th>
                  <th style={{ padding: "10px 12px" }}>Barra Cumplimiento</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>% Utilización</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Estado</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Días Activo</th>
                </tr>
              </thead>
              <tbody>
                {equiposUtilizacionFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="9" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <TrendingUp size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin equipos que coincidan con los filtros
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        No se encontraron equipos para {labelTipoActivo.toLowerCase()} con el criterio de utilización seleccionado.
                      </div>
                    </td>
                  </tr>
                ) : (
                  equiposUtilizacionFiltrados.map((eq, idx) => (
                    <tr key={eq.patente} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                        #{idx + 1}
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
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: "#0f172a" }}>
                        {eq.horas_totales} hrs
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#64748b" }}>
                        {horasMetaCalculadas} hrs
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "140px" }}>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${Math.min(100, eq.pct_utilizacion)}%`,
                              backgroundColor: eq.color_utilizacion, height: "100%",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, fontSize: "13px", color: eq.color_utilizacion }}>
                        {eq.pct_utilizacion}%
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        <span style={{
                          padding: "3px 8px", borderRadius: "6px", fontSize: "10px", fontWeight: 700,
                          backgroundColor: `${eq.color_utilizacion}15`, color: eq.color_utilizacion,
                          border: `1px solid ${eq.color_utilizacion}30`,
                        }}>
                          {eq.etiqueta_utilizacion}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", color: "#475569" }}>
                        {eq.dias_activos} / {diasPeriodo}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 5: TOP KILOMETRAJE RECORRIDO                                    */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "kilometraje" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <Gauge size={18} color="#8b5cf6" />
                Ranking Completo: Top Kilometraje Recorrido {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Equipos con mayor recorrido acumulado en los <strong>{diasPeriodo} días filtrados</strong> ({desde} al {hasta}).
              </p>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid #cbd5e1", color: "#475569" }}>
                  <th style={{ padding: "10px 12px" }}>Pos.</th>
                  <th style={{ padding: "10px 12px" }}>Equipo / Patente</th>
                  <th style={{ padding: "10px 12px" }}>Proyecto</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Km Totales ({diasPeriodo}d)</th>
                  <th style={{ padding: "10px 12px" }}>Proporción Distancia</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Viajes Realizados</th>
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Promedio Km/Viaje</th>
                  <th style={{ padding: "10px 12px" }}>Chofer Principal</th>
                </tr>
              </thead>
              <tbody>
                {topKmFiltrado.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <Gauge size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin registros de kilometraje para {labelTipoActivo.toLowerCase()}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        No se registraron desplazamientos de esta categoría en el período seleccionado.
                      </div>
                    </td>
                  </tr>
                ) : (
                  topKmFiltrado.map((eq, idx) => (
                    <tr key={eq.patente} style={{ borderBottom: "1.5px solid #e2e8f0" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 800 }}>
                        <span style={{
                          width: "24px", height: "24px", borderRadius: "50%",
                          backgroundColor: idx === 0 ? "#8b5cf6" : "#ede9fe",
                          color: idx === 0 ? "#ffffff" : "#6d28d9",
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
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#6d28d9", fontSize: "13px" }}>
                        {eq.km_totales.toLocaleString("es-CL")} km
                      </td>
                      <td style={{ padding: "10px 12px", minWidth: "140px" }}>
                        <div style={{ width: "100%", height: "8px", backgroundColor: "#e2e8f0", borderRadius: "4px", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${maxKm > 0 ? (eq.km_totales / maxKm) * 100 : 0}%`,
                              backgroundColor: "#8b5cf6", height: "100%",
                            }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: 600, color: "#0f172a" }}>
                        {eq.viajes_totales}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: "#0369a1" }}>
                        {eq.viajes_totales > 0 ? `${Math.round((eq.km_totales / eq.viajes_totales) * 10) / 10} km` : "-"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748b", fontSize: "11px" }}>
                        {eq.conductor_principal}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 7: TOP CONDUCTORES MÁS ACTIVOS                                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "conductores" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <div>
              <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={18} color="#f59e0b" />
                Ranking Completo: Top Conductores Más Activos {tipoEquipoFiltro !== "todos" ? `(${labelTipoActivo})` : "(Mayor a Menor)"}
              </h3>
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
                Histórico acumulado en los <strong>{diasPeriodo} días filtrados</strong> ({desde} al {hasta}): horas de conducción (RFID y asignaciones), kilometraje y vehículos operados.
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
                  <th style={{ padding: "10px 12px", textAlign: "right" }}>Kilometraje</th>
                  <th style={{ padding: "10px 12px", textAlign: "center" }}>Total Viajes</th>
                  <th style={{ padding: "10px 12px" }}>Vehículos Operados</th>
                </tr>
              </thead>
              <tbody>
                {topConductoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: "36px 16px", textAlign: "center", color: "#64748b" }}>
                      <User size={30} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                      <div style={{ fontSize: "14px", fontWeight: 700, color: "#334155" }}>
                        Sin registros de conductores para {labelTipoActivo.toLowerCase()}
                      </div>
                      <div style={{ fontSize: "12px", color: "#64748b", marginTop: "4px" }}>
                        No se registraron choferes asociados a este tipo de equipo en el período seleccionado.
                      </div>
                    </td>
                  </tr>
                ) : (
                  topConductoresFiltrados.map((cond, idx) => (
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
                      <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 800, color: "#b45309", fontSize: "13px" }}>
                        {cond.horas_conducidas} hrs
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

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* SECCIÓN 8: DISTRIBUCIÓN HORARIA (CURVA DE 24 HORAS)                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {seccionActiva === "horario" && (
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "12px", border: "1.5px solid #cbd5e1",
          padding: "20px", boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div style={{ marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
              <BarChart3 size={18} color="#0369a1" />
              Distribución Horaria de Operación de la Flota (24 Horas)
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "12px", color: "#64748b" }}>
              Visualiza las horas punta de operación durante los <strong>{diasPeriodo} días filtrados</strong> ({desde} al {hasta}).
            </p>
          </div>

          {/* Gráfico de barras interactivo */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(24, 1fr)",
            gap: "6px", alignItems: "flex-end", height: "220px",
            padding: "20px 10px 10px", backgroundColor: "#f8fafc",
            borderRadius: "10px", border: "1px solid #e2e8f0",
          }}>
            {(dashData?.distribucion_horaria || []).map((d) => {
              const hPct = maxHorasDistribucion > 0 ? (d.horas_operacion / maxHorasDistribucion) * 100 : 0;
              const esPunta = d.hora >= 7 && d.hora <= 19;
              return (
                <div key={d.hora} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  height: "100%", justifyContent: "flex-end",
                }}>
                  <div
                    style={{
                      width: "100%",
                      height: `${Math.max(6, hPct)}%`,
                      backgroundColor: esPunta ? "#0284c7" : "#94a3b8",
                      borderRadius: "4px 4px 0 0",
                      transition: "all 0.2s ease",
                      cursor: "pointer",
                    }}
                    title={`${d.etiqueta}: ${d.horas_operacion} hrs de motor, ${d.viajes} viajes, ${d.km} km`}
                  />
                  <span style={{ fontSize: "9px", color: "#64748b", marginTop: "4px", fontWeight: 600 }}>
                    {String(d.hora).padStart(2, "0")}h
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px", fontSize: "11px", color: "#64748b" }}>
            <div style={{ display: "flex", gap: "12px" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "#0284c7", borderRadius: "2px" }} />
                Turno Día (07:00 a 19:00)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                <span style={{ width: "10px", height: "10px", backgroundColor: "#94a3b8", borderRadius: "2px" }} />
                Turno Noche / Descanso (20:00 a 06:00)
              </span>
            </div>
            <span>Pasa el cursor sobre cada hora para ver detalle exacto de horas y viajes.</span>
          </div>
        </div>
      )}
    </div>
  );
}
