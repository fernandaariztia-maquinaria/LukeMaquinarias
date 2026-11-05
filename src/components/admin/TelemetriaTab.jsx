import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Radio, RefreshCw, Gauge, Clock, Fuel,
  MapPin, Search, Calendar, ChevronLeft, ChevronRight,
  ExternalLink, Filter, Car, Navigation, User, Info, Check,
  Building2, FileText, Map, BarChart3, TrendingUp, Layers
} from "lucide-react";
import TelemetriaMapaTab from "./TelemetriaMapaTab";
import TelemetriaDashboardsTab from "./TelemetriaDashboardsTab";
import { formatearPatente, clasificarTipoEquipo, TIPOS_EQUIPO_FILTROS } from "../../lib/telemetriaUtils";

export default function TelemetriaTab({ currentUser, hookProps }) {
  // Sub-apartados: "dashboards" | "resumen" | "mapa" (Dashboards primero según solicitud)
  const [subTab, setSubTab] = useState("dashboards");
  const [mapaPatente, setMapaPatente] = useState("");
  const [mapaFecha, setMapaFecha] = useState("");
  const [tipoEquipoFiltro, setTipoEquipoFiltro] = useState("todos"); // "todos" | "camionetas" | "camiones" | "gruas" | "maquinaria" | "buses" | "otros"
  // 1. Permiso de Administrador
  const esAdmin = useMemo(() => {
    if (!currentUser) return false;
    const rol = String(currentUser.rol || "").toLowerCase();
    return rol.includes("admin") || rol === "administrador";
  }, [currentUser]);

  // Estados de datos
  const [viajes, setViajes] = useState([]);
  const [totalViajes, setTotalViajes] = useState(0);
  const [fechasDisponibles, setFechasDisponibles] = useState([]);
  const [fechaMinima, setFechaMinima] = useState("2026-10-01");
  const [fechaMaxima, setFechaMaxima] = useState(() => new Date().toISOString().slice(0, 10));
  const [proyectosApi, setProyectosApi] = useState([]);

  // Lista unificada de proyectos (desde hookProps o desde la API de telemetría)
  const listaProyectos = useMemo(() => {
    if (hookProps?.proyectos?.data && hookProps.proyectos.data.length > 0) {
      return hookProps.proyectos.data;
    }
    return proyectosApi;
  }, [hookProps?.proyectos?.data, proyectosApi]);

  const [kpis, setKpis] = useState({
    total_viajes: 0,
    total_km: 0,
    total_km_can: 0,
    total_km_gps: 0,
    total_horas: 0,
    total_combustible_litros: 0,
    total_combustible_can: 0,
    total_combustible_gps: 0,
  });

  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // Paginación
  const [pagina, setPagina] = useState(1);
  const LIMIT = 100;

  // Filtros de Consulta en Base de Datos (NO llaman a la API externa)
  // Por defecto abarca desde el 01 de Octubre hasta hoy para ver todo el histórico guardado
  const [desdeFiltro, setDesdeFiltro] = useState("2026-10-01");
  const [hastaFiltro, setHastaFiltro] = useState(() => new Date().toISOString().slice(0, 10));
  const [proyectoFiltro, setProyectoFiltro] = useState(() => currentUser?.proyecto_actual_id || "");
  const [search, setSearch] = useState("");
  const [origenFiltro, setOrigenFiltro] = useState(""); // "" | "CAN" | "GPS"
  const [equipoFiltro, setEquipoFiltro] = useState("");

  // Sincronizar si cambia el proyecto global del sidebar
  useEffect(() => {
    setProyectoFiltro(currentUser?.proyecto_actual_id || "");
    setPagina(1);
  }, [currentUser?.proyecto_actual_id]);

  // Rango para el panel de sincronización manual (solo visible para Administradores)
  const [syncDesde, setSyncDesde] = useState("2026-10-01");
  const [syncHasta, setSyncHasta] = useState(() => new Date().toISOString().slice(0, 10));

  // Cargar viajes desde Supabase
  const cargarViajesGuardados = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (desdeFiltro) params.set("desde", desdeFiltro);
      if (hastaFiltro) params.set("hasta", hastaFiltro);
      if (proyectoFiltro) params.set("proyecto_id", proyectoFiltro);
      if (search) params.set("search", search);
      if (origenFiltro) params.set("origen", origenFiltro);
      if (equipoFiltro) params.set("patente", equipoFiltro);
      params.set("limit", String(LIMIT));
      params.set("offset", String((pagina - 1) * LIMIT));

      const res = await fetch(`/api/admin/telemetria?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setViajes(json.data || []);
        setTotalViajes(json.total || 0);
        if (json.kpis) setKpis(json.kpis);
        if (json.fechas_disponibles) setFechasDisponibles(json.fechas_disponibles);
        if (json.fecha_min) setFechaMinima(json.fecha_min);
        if (json.fecha_max) setFechaMaxima(json.fecha_max);
        if (json.proyectos) setProyectosApi(json.proyectos);
      }
    } catch (e) {
      console.error("[TelemetriaTab] Error al cargar viajes:", e.message);
    } finally {
      setLoading(false);
    }
  }, [desdeFiltro, hastaFiltro, proyectoFiltro, search, origenFiltro, equipoFiltro, pagina]);

  useEffect(() => {
    cargarViajesGuardados();
  }, [cargarViajesGuardados]);

  // Filtrado de viajes por tipo de equipo
  const viajesFiltrados = useMemo(() => {
    if (tipoEquipoFiltro === "todos") return viajes;
    return viajes.filter((v) => clasificarTipoEquipo(v.equipo || v) === tipoEquipoFiltro);
  }, [viajes, tipoEquipoFiltro]);

  // Al cambiar filtros, resetear a página 1
  const handleFiltroCambio = (setter, val) => {
    setter(val);
    setPagina(1);
  };

  // Sincronización manual (solo Administrador)
  const ejecutarSincronizacion = async (desde, hasta) => {
    if (!esAdmin) return;
    setSincronizando(true);
    setSyncMsg({ tipo: "info", texto: "Sincronizando viajes con SKYNAV... (consultando API externa)" });
    try {
      const res = await fetch("/api/admin/telemetria/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          desde,
          hasta,
          iniciadoPor: currentUser?.nombre_completo || "ADMIN_MANUAL",
          userRol: currentUser?.rol || "",
        }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncMsg({
          tipo: "success",
          texto: `Sincronización completada: ${json.total_viajes || 0} viajes registrados.`,
        });
        setPagina(1);
        cargarViajesGuardados();
      } else {
        setSyncMsg({ tipo: "error", texto: `Error en sincronización: ${json.error || "Falla desconocida"}` });
      }
    } catch (err) {
      setSyncMsg({ tipo: "error", texto: `Error de red: ${err.message}` });
    } finally {
      setSincronizando(false);
    }
  };

  const totalPaginas = Math.ceil(totalViajes / LIMIT) || 1;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const proyectoSeleccionadoObj = useMemo(
    () => listaProyectos.find((p) => p.id === proyectoFiltro) || null,
    [listaProyectos, proyectoFiltro]
  );

  return (
    <div style={{ padding: "24px", maxWidth: "1650px", margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "space-between",
        alignItems: "center", gap: "16px", marginBottom: "20px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            backgroundColor: "#e0f2fe", color: "#0284c7",
            padding: "10px", borderRadius: "10px", display: "flex",
          }}>
            <Radio size={26} />
          </div>
          <div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "var(--color-text, #0f172a)" }}>
              Telemetría y Registro de Viajes
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>
              Histórico permanente de cada viaje: equipo, chofer, kilometraje, combustible consumido, lugar de inicio y fin.
            </p>
          </div>
        </div>

        {/* Panel de Sincronización SKYNAV: EXCLUSIVO PARA ADMINISTRADORES */}
        {esAdmin && (
          <div style={{
            display: "flex", alignItems: "center", flexWrap: "wrap",
            gap: "10px", backgroundColor: "#ffffff", padding: "10px 14px",
            borderRadius: "10px", border: "1px solid #e2e8f0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
          }}>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#475569" }}>
              Sincronizar SKYNAV:
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="date"
                value={syncDesde}
                onChange={(e) => setSyncDesde(e.target.value)}
                style={{
                  fontSize: "12px", padding: "5px 8px", borderRadius: "6px",
                  border: "1px solid #cbd5e1", outline: "none",
                }}
              />
              <span style={{ fontSize: "12px", color: "#94a3b8" }}>a</span>
              <input
                type="date"
                value={syncHasta}
                onChange={(e) => setSyncHasta(e.target.value)}
                style={{
                  fontSize: "12px", padding: "5px 8px", borderRadius: "6px",
                  border: "1px solid #cbd5e1", outline: "none",
                }}
              />
            </div>
            <button
              onClick={() => ejecutarSincronizacion(syncDesde, syncHasta)}
              disabled={sincronizando}
              style={{
                backgroundColor: sincronizando ? "#94a3b8" : "#0284c7",
                color: "#ffffff", border: "none", padding: "6px 14px",
                borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                cursor: sincronizando ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <RefreshCw size={14} className={sincronizando ? "animate-spin" : ""} />
              {sincronizando ? "Consultando API..." : "Sincronizar Rango"}
            </button>
          </div>
        )}
      </div>

      {/* Mensaje de Sincronización */}
      {syncMsg && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
          fontSize: "13px", fontWeight: 500,
          backgroundColor: syncMsg.tipo === "success" ? "#dcfce7" : syncMsg.tipo === "error" ? "#fee2e2" : "#e0f2fe",
          color: syncMsg.tipo === "success" ? "#166534" : syncMsg.tipo === "error" ? "#991b1b" : "#075985",
          border: `1px solid ${syncMsg.tipo === "success" ? "#bbf7d0" : syncMsg.tipo === "error" ? "#fecaca" : "#bae6fd"}`,
        }}>
          {syncMsg.texto}
        </div>
      )}

      {/* ── SELECTOR DE SUB-APARTADOS DESTACADO ───────────────────────────── */}
      <div style={{
        backgroundColor: "#ffffff", padding: "8px 10px", borderRadius: "14px",
        border: "1px solid #cbd5e1", boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
        display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px",
        marginBottom: "24px",
      }}>
        {/* Tab 1: Dashboards (Primero) */}
        <button
          onClick={() => setSubTab("dashboards")}
          style={{
            flex: "1 1 200px", display: "flex", alignItems: "center", gap: "12px",
            padding: "12px 18px", borderRadius: "10px", border: "none", cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            background: subTab === "dashboards"
              ? "linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)"
              : "#f8fafc",
            color: subTab === "dashboards" ? "#ffffff" : "#334155",
            boxShadow: subTab === "dashboards"
              ? "0 4px 14px rgba(79, 70, 229, 0.35)"
              : "inset 0 0 0 1px #e2e8f0",
            position: "relative",
          }}
        >
          <div style={{
            backgroundColor: subTab === "dashboards" ? "rgba(255,255,255,0.2)" : "#ede9fe",
            color: subTab === "dashboards" ? "#ffffff" : "#4f46e5",
            padding: "8px", borderRadius: "8px", display: "flex",
          }}>
            <BarChart3 size={18} />
          </div>
          <div style={{ textAlign: "left", flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.2px" }}>
                1. Dashboards
              </span>
              <span style={{
                fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "10px",
                backgroundColor: subTab === "dashboards" ? "#fbbf24" : "#4f46e5",
                color: subTab === "dashboards" ? "#1e1b4b" : "#ffffff",
                letterSpacing: "0.5px", textTransform: "uppercase",
              }}>
                Top Flota
              </span>
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 500,
              color: subTab === "dashboards" ? "rgba(255,255,255,0.85)" : "#64748b",
            }}>
              Métricas, uso y rankings
            </div>
          </div>
        </button>

        {/* Tab 2: Resumen Viajes (Segundo) */}
        <button
          onClick={() => setSubTab("resumen")}
          style={{
            flex: "1 1 200px", display: "flex", alignItems: "center", gap: "12px",
            padding: "12px 18px", borderRadius: "10px", border: "none", cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            background: subTab === "resumen"
              ? "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)"
              : "#f8fafc",
            color: subTab === "resumen" ? "#ffffff" : "#334155",
            boxShadow: subTab === "resumen"
              ? "0 4px 14px rgba(2, 132, 199, 0.35)"
              : "inset 0 0 0 1px #e2e8f0",
          }}
        >
          <div style={{
            backgroundColor: subTab === "resumen" ? "rgba(255,255,255,0.2)" : "#e0f2fe",
            color: subTab === "resumen" ? "#ffffff" : "#0284c7",
            padding: "8px", borderRadius: "8px", display: "flex",
          }}>
            <FileText size={18} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.2px" }}>
              2. Resumen Viajes
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 500,
              color: subTab === "resumen" ? "rgba(255,255,255,0.85)" : "#64748b",
            }}>
              Bitácora y tabla detallada
            </div>
          </div>
        </button>

        {/* Tab 3: Mapa Viajes (Tercero) */}
        <button
          onClick={() => setSubTab("mapa")}
          style={{
            flex: "1 1 200px", display: "flex", alignItems: "center", gap: "12px",
            padding: "12px 18px", borderRadius: "10px", border: "none", cursor: "pointer",
            transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            background: subTab === "mapa"
              ? "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
              : "#f8fafc",
            color: subTab === "mapa" ? "#ffffff" : "#334155",
            boxShadow: subTab === "mapa"
              ? "0 4px 14px rgba(13, 148, 136, 0.35)"
              : "inset 0 0 0 1px #e2e8f0",
          }}
        >
          <div style={{
            backgroundColor: subTab === "mapa" ? "rgba(255,255,255,0.2)" : "#ccfbf1",
            color: subTab === "mapa" ? "#ffffff" : "#0d9488",
            padding: "8px", borderRadius: "8px", display: "flex",
          }}>
            <Map size={18} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: "14px", fontWeight: 800, letterSpacing: "-0.2px" }}>
              3. Mapa Viajes
            </div>
            <div style={{
              fontSize: "11px", fontWeight: 500,
              color: subTab === "mapa" ? "rgba(255,255,255,0.85)" : "#64748b",
            }}>
              Recorridos GPS alta fidelidad
            </div>
          </div>
        </button>
      </div>

      {/* RENDERIZADO CONDICIONAL DE SUB-APARTADOS */}
      {subTab === "mapa" ? (
        <TelemetriaMapaTab
          fechaInicial={mapaFecha || "2026-10-02"}
          patenteInicial={mapaPatente || "PGXT-19"}
        />
      ) : subTab === "dashboards" ? (
        <TelemetriaDashboardsTab
          currentUser={currentUser}
          hookProps={hookProps}
        />
      ) : (
        <>
      {/* Tarjetas KPI (Sin excesos de velocidad) */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px", marginBottom: "20px",
      }}>
        {/* Total Viajes Registrados */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Total de Viajes / Usos</span>
            <Navigation size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_viajes?.toLocaleString("es-CL") || 0}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
            {proyectoSeleccionadoObj
              ? `Proyecto: ${proyectoSeleccionadoObj.codigo_cc ? `[${proyectoSeleccionadoObj.codigo_cc}] ` : ""}${proyectoSeleccionadoObj.nombre_proyecto}`
              : "Viajes en el período filtrado"}
          </div>
        </div>

        {/* Distancia Total con Desglose CAN vs GPS */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Distancia Recorrida</span>
            <Gauge size={18} color="#16a34a" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_km?.toLocaleString("es-CL") || 0} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>km</span>
          </div>
          <div style={{
            fontSize: "11px", color: "#475569", marginTop: "6px", display: "flex",
            alignItems: "center", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "6px",
          }}>
            <span style={{ color: "#047857", fontWeight: 600 }}>CAN: {kpis.total_km_can?.toLocaleString("es-CL") || 0} km</span>
            <span style={{ color: "#94a3b8" }}>|</span>
            <span style={{ color: "#475569" }}>GPS: {kpis.total_km_gps?.toLocaleString("es-CL") || 0} km</span>
          </div>
        </div>

        {/* Tiempo de Uso / Duración */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Tiempo de Operación</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_horas?.toLocaleString("es-CL") || 0} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>hrs</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
            Horas acumuladas de uso
          </div>
        </div>

        {/* Combustible Total con Desglose CAN vs GPS */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Combustible Consumido</span>
            <Fuel size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: "26px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_combustible_litros?.toLocaleString("es-CL") || 0} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>L</span>
          </div>
          <div style={{
            fontSize: "11px", color: "#475569", marginTop: "6px", display: "flex",
            alignItems: "center", gap: "8px", borderTop: "1px solid #f1f5f9", paddingTop: "6px",
          }}>
            <span style={{ color: "#15803d", fontWeight: 600 }}>CAN: {kpis.total_combustible_can?.toLocaleString("es-CL") || 0} L</span>
            <span style={{ color: "#94a3b8" }}>|</span>
            <span style={{ color: "#86198f" }}>GPS: {kpis.total_combustible_gps?.toLocaleString("es-CL") || 0} L</span>
          </div>
        </div>
      </div>

      {/* Barra de Filtros en Base de Datos (NO consulta la API, solo datos guardados) */}
      <div style={{
        backgroundColor: "#ffffff", padding: "16px 18px", borderRadius: "10px",
        border: "1px solid #e2e8f0", marginBottom: "20px", display: "flex",
        flexDirection: "column", gap: "12px",
      }}>
        {/* Banner Informativo del Histórico */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
          gap: "8px", fontSize: "12px", color: "#475569", backgroundColor: "#f8fafc",
          padding: "8px 14px", borderRadius: "6px", border: "1px solid #e2e8f0",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Info size={15} color="#0284c7" />
            <span>
              <strong>Histórico de viajes disponible:</strong> desde el <strong>{fechaMinima}</strong> hasta el <strong>{fechaMaxima}</strong> ({fechasDisponibles.length} días registrados).
            </span>
          </div>
          <span style={{ color: "#16a34a", fontWeight: 600, fontSize: "11px" }}>
            ✓ Consultando base de datos guardada
          </span>
        </div>

        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: "12px",
        }}>
          {/* Rango de Fechas (Permite consultar TODO octubre, noviembre o cualquier fecha) */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <Calendar size={16} color="#64748b" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Rango de Fechas:</span>
            <input
              type="date"
              value={desdeFiltro}
              max={hoyISO}
              onChange={(e) => handleFiltroCambio(setDesdeFiltro, e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff",
              }}
            />
            <span style={{ fontSize: "12px", color: "#94a3b8" }}>al</span>
            <input
              type="date"
              value={hastaFiltro}
              max={hoyISO}
              onChange={(e) => handleFiltroCambio(setHastaFiltro, e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 8px", borderRadius: "6px",
                border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff",
              }}
            />

            {/* Accesos rápidos */}
            <div style={{ display: "flex", gap: "4px", marginLeft: "4px", flexWrap: "wrap" }}>
              <button
                onClick={() => {
                  handleFiltroCambio(setDesdeFiltro, "2026-10-01");
                  handleFiltroCambio(setHastaFiltro, hoyISO);
                }}
                style={{
                  fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
                  border: "1px solid #0284c7", backgroundColor: (desdeFiltro === "2026-10-01" && hastaFiltro === hoyISO) ? "#e0f2fe" : "#ffffff",
                  color: "#0369a1", cursor: "pointer", fontWeight: 600,
                }}
              >
                Octubre a Hoy
              </button>
              <button
                onClick={() => {
                  handleFiltroCambio(setDesdeFiltro, "2026-11-01");
                  handleFiltroCambio(setHastaFiltro, hoyISO);
                }}
                style={{
                  fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
                  border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", cursor: "pointer",
                }}
              >
                Noviembre
              </button>
              <button
                onClick={() => {
                  handleFiltroCambio(setDesdeFiltro, "2026-10-01");
                  handleFiltroCambio(setHastaFiltro, "2026-10-31");
                }}
                style={{
                  fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
                  border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", cursor: "pointer",
                }}
              >
                Solo Octubre
              </button>
              <button
                onClick={() => {
                  handleFiltroCambio(setDesdeFiltro, fechaMaxima);
                  handleFiltroCambio(setHastaFiltro, fechaMaxima);
                }}
                style={{
                  fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
                  border: "1px solid #cbd5e1", backgroundColor: "#f8fafc", cursor: "pointer",
                }}
              >
                Último día ({fechaMaxima})
              </button>
            </div>
          </div>

          {/* Filtro por Proyecto */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Building2 size={15} color="#0284c7" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Proyecto:</span>
            <select
              value={proyectoFiltro}
              onChange={(e) => handleFiltroCambio(setProyectoFiltro, e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
                border: proyectoFiltro ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
                outline: "none",
                backgroundColor: proyectoFiltro ? "#f0f9ff" : "#ffffff",
                color: proyectoFiltro ? "#0369a1" : "#334155",
                fontWeight: proyectoFiltro ? 600 : 500,
                minWidth: "210px",
              }}
            >
              <option value="">🌎 Todos los Proyectos</option>
              {listaProyectos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo_cc ? `[${p.codigo_cc}] ` : ""}{p.nombre_proyecto}
                </option>
              ))}
            </select>
          </div>

          {/* Filtro por Origen de Medición (CAN vs GPS) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={14} color="#64748b" />
            <select
              value={origenFiltro}
              onChange={(e) => handleFiltroCambio(setOrigenFiltro, e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
                border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff",
                fontWeight: 500,
              }}
            >
              <option value="">CANBUS y GPS</option>
              <option value="CAN">Solo CANBUS (Computador)</option>
              <option value="GPS">Solo GPS (Satélite)</option>
            </select>
          </div>

          {/* Búsqueda por texto (Chofer, lugar, patente, etc.) */}
          <div style={{ position: "relative", minWidth: "240px" }}>
            <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Buscar por patente, chofer, lugar..."
              value={search}
              onChange={(e) => handleFiltroCambio(setSearch, e.target.value)}
              style={{
                width: "100%", padding: "6px 10px 6px 30px", fontSize: "12px",
                borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none",
              }}
            />
          </div>

          {/* Botón limpiar */}
          {(desdeFiltro !== "2026-10-01" || hastaFiltro !== hoyISO || proyectoFiltro || search || origenFiltro || equipoFiltro || tipoEquipoFiltro !== "todos") && (
            <button
              onClick={() => {
                setDesdeFiltro("2026-10-01");
                setHastaFiltro(hoyISO);
                setProyectoFiltro("");
                setSearch("");
                setOrigenFiltro("");
                setEquipoFiltro("");
                setTipoEquipoFiltro("todos");
                setPagina(1);
              }}
              style={{
                fontSize: "12px", color: "#0284c7", background: "none",
                border: "none", textDecoration: "underline", cursor: "pointer",
              }}
            >
              Restablecer filtros
            </button>
          )}
        </div>

        {/* ── BOTONES DE FILTRO POR TIPO DE EQUIPO ─────────────────────── */}
        <div style={{
          marginTop: "4px", paddingTop: "12px", borderTop: "1px solid #f1f5f9",
          display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
            <Layers size={14} color="#0284c7" />
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
                    border: activo ? "1px solid #0284c7" : "1px solid #cbd5e1",
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

      {/* Contenedor de la Tabla */}
      <div style={{
        backgroundColor: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}>
        {/* Barra superior de conteo y paginación */}
        <div style={{
          padding: "12px 18px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px",
        }}>
          <div style={{ fontSize: "13px", color: "#475569", fontWeight: 600 }}>
            Mostrando {viajes.length > 0 ? `${(pagina - 1) * LIMIT + 1} - ${Math.min(pagina * LIMIT, totalViajes)}` : 0} de {totalViajes.toLocaleString("es-CL")} viajes
            {proyectoSeleccionadoObj && (
              <span style={{
                marginLeft: "8px", padding: "2px 8px", borderRadius: "999px",
                backgroundColor: "#e0f2fe", color: "#0369a1", fontSize: "11px", fontWeight: 700,
              }}>
                {proyectoSeleccionadoObj.codigo_cc ? `${proyectoSeleccionadoObj.codigo_cc} — ` : ""}{proyectoSeleccionadoObj.nombre_proyecto}
              </span>
            )}
          </div>

          {totalPaginas > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "12px", color: "#64748b" }}>
                Página {pagina} de {totalPaginas}
              </span>
              <button
                onClick={() => setPagina((p) => Math.max(p - 1, 1))}
                disabled={pagina === 1}
                style={{
                  display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px",
                  fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1",
                  backgroundColor: pagina === 1 ? "#f1f5f9" : "#ffffff",
                  cursor: pagina === 1 ? "not-allowed" : "pointer", color: pagina === 1 ? "#94a3b8" : "#334155",
                }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => setPagina((p) => Math.min(p + 1, totalPaginas))}
                disabled={pagina === totalPaginas}
                style={{
                  display: "flex", alignItems: "center", gap: "4px", padding: "5px 10px",
                  fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1",
                  backgroundColor: pagina === totalPaginas ? "#f1f5f9" : "#ffffff",
                  cursor: pagina === totalPaginas ? "not-allowed" : "pointer", color: pagina === totalPaginas ? "#94a3b8" : "#334155",
                }}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Tabla */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 10px", display: "block" }} />
            Cargando viajes registrados...
          </div>
        ) : viajes.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            <Car size={38} style={{ margin: "0 auto 12px", display: "block", color: "#cbd5e1" }} />
            <div style={{ fontSize: "16px", fontWeight: 600, color: "#334155" }}>
              No se encontraron viajes para los filtros seleccionados
            </div>
            <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "480px", margin: "6px auto 16px" }}>
              Intenta seleccionar "Todos los Proyectos" o un rango de fechas más amplio.
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: 600 }}>
                  <th style={{ padding: "12px 14px", width: "180px" }}>Equipo / Proyecto</th>
                  <th style={{ padding: "12px 14px", width: "110px" }}>Fecha</th>
                  <th style={{ padding: "12px 14px", width: "130px" }}>Horario / Tiempo</th>
                  <th style={{ padding: "12px 14px", width: "180px" }}>Chofer / Conductor</th>
                  <th style={{ padding: "12px 14px", width: "130px" }}>Distancia</th>
                  <th style={{ padding: "12px 14px", width: "130px" }}>Combustible</th>
                  <th style={{ padding: "12px 14px", minWidth: "250px" }}>Lugar de Inicio</th>
                  <th style={{ padding: "12px 14px", minWidth: "250px" }}>Lugar de Fin</th>
                </tr>
              </thead>
              <tbody>
                {viajesFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: "30px", textAlign: "center", color: "#64748b" }}>
                      No se encontraron viajes registrados para el filtro de equipo seleccionado ({tipoEquipoFiltro}).
                    </td>
                  </tr>
                ) : (
                  viajesFiltrados.map((viaje) => {
                    const mapsInicio = viaje.latitud_inicio && viaje.longitud_inicio
                      ? `https://www.google.com/maps?q=${viaje.latitud_inicio},${viaje.longitud_inicio}`
                      : null;

                    const mapsFin = viaje.latitud_fin && viaje.longitud_fin
                      ? `https://www.google.com/maps?q=${viaje.latitud_fin},${viaje.longitud_fin}`
                      : null;

                    const esCan = viaje.origen_km === "CAN" || viaje.origen_combustible === "CAN" || Number(viaje.litros_can) > 0;

                    const minTotales = Math.round(Number(viaje.tiempo_min) || 0);
                    const horas = Math.floor(minTotales / 60);
                    const minResto = minTotales % 60;
                    const duracionTxt = horas > 0 ? `${horas}h ${minResto}m` : `${minResto} min`;

                    return (
                      <tr
                        key={viaje.id}
                        style={{ borderBottom: "1px solid #f1f5f9", transition: "background-color 0.15s" }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        {/* Equipo / Patente / Proyecto */}
                        <td style={{ padding: "12px 14px" }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{
                              padding: "2px 6px", backgroundColor: "#f1f5f9",
                              borderRadius: "4px", fontWeight: 700, fontSize: "12px",
                              fontFamily: "monospace", color: "#0f172a", width: "fit-content",
                            }}>
                              {formatearPatente(viaje.patente || viaje.identificador_skynav)}
                            </span>
                          {viaje.equipo ? (
                            <>
                              <div style={{ fontWeight: 600, fontSize: "12px", color: "#1e293b" }}>
                                {viaje.equipo.codigo_interno}
                              </div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                {viaje.equipo.tipo || viaje.subtipo_skynav || ""}
                              </div>
                              {viaje.equipo.proyecto && (
                                <span style={{
                                  fontSize: "10px", fontWeight: 600, color: "#0369a1",
                                  backgroundColor: "#e0f2fe", padding: "1px 6px", borderRadius: "4px",
                                  width: "fit-content", marginTop: "2px",
                                }}>
                                  {viaje.equipo.proyecto.codigo_cc
                                    ? `${viaje.equipo.proyecto.codigo_cc} · ${viaje.equipo.proyecto.nombre_proyecto}`
                                    : viaje.equipo.proyecto.nombre_proyecto}
                                </span>
                              )}
                            </>
                          ) : (
                            <span style={{ fontSize: "10px", color: "#94a3b8" }}>
                              {viaje.subtipo_skynav || "Flota"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fecha */}
                      <td style={{ padding: "12px 14px", color: "#334155", fontWeight: 500 }}>
                        {viaje.fecha}
                      </td>

                      {/* Horario y Duración */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, color: "#0f172a" }}>
                          {viaje.hora_inicio || "--:--"} {viaje.hora_fin ? `→ ${viaje.hora_fin}` : ""}
                        </div>
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
                          ⏱️ {duracionTxt}
                        </div>
                      </td>

                      {/* Chofer / Conductor */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <User size={14} color="#64748b" style={{ flexShrink: 0 }} />
                          <div>
                            <div style={{ fontWeight: 500, color: viaje.nombre_conductor ? "#1e293b" : "#94a3b8" }}>
                              {viaje.nombre_conductor || "Sin chofer identificado"}
                            </div>
                            {viaje.rut_conductor && (
                              <div style={{ fontSize: "10px", color: "#64748b" }}>
                                RUT: {viaje.rut_conductor}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Distancia + Origen */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a" }}>
                          {viaje.km_recorridos > 0 ? `${viaje.km_recorridos} km` : <span style={{ color: "#94a3b8" }}>0 km</span>}
                        </div>
                        <div style={{ marginTop: "3px" }}>
                          {esCan ? (
                            <span style={{
                              fontSize: "9px", fontWeight: 700, padding: "1px 5px",
                              borderRadius: "4px", backgroundColor: "#ecfdf5", color: "#047857",
                              border: "1px solid #a7f3d0",
                            }}>
                              CANBUS
                            </span>
                          ) : (
                            <span style={{
                              fontSize: "9px", fontWeight: 600, padding: "1px 5px",
                              borderRadius: "4px", backgroundColor: "#f8fafc", color: "#475569",
                              border: "1px solid #e2e8f0",
                            }}>
                              GPS
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Combustible + Origen */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ fontWeight: 700, color: viaje.litros_combustible > 0 ? "#7c3aed" : "#94a3b8" }}>
                          {viaje.litros_combustible > 0 ? `${viaje.litros_combustible} L` : "-"}
                        </div>
                        <div style={{ marginTop: "3px" }}>
                          {Number(viaje.litros_can) > 0 ? (
                            <span style={{
                              fontSize: "9px", fontWeight: 700, padding: "1px 5px",
                              borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#15803d",
                              border: "1px solid #bbf7d0",
                            }}>
                              CAN ({viaje.litros_can} L)
                            </span>
                          ) : Number(viaje.litros_gps) > 0 ? (
                            <span style={{
                              fontSize: "9px", fontWeight: 600, padding: "1px 5px",
                              borderRadius: "4px", backgroundColor: "#fdf4ff", color: "#86198f",
                              border: "1px solid #f0abfc",
                            }}>
                              GPS ({viaje.litros_gps} L)
                            </span>
                          ) : (
                            <span style={{ fontSize: "9px", color: "#94a3b8" }}>-</span>
                          )}
                        </div>
                      </td>

                      {/* Lugar de Inicio (Con enlace a Google Maps) */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <MapPin size={14} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <div style={{ fontSize: "11px", color: "#334155", lineHeight: "1.3" }}>
                            <div>{viaje.lugar_inicio || viaje.geocerca_inicio || "Coordenadas registradas"}</div>
                            {mapsInicio ? (
                              <a
                                href={mapsInicio}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "3px",
                                  marginTop: "3px", color: "#0284c7", textDecoration: "none",
                                  fontWeight: 600, fontSize: "10px",
                                }}
                              >
                                Ver en Google Maps <ExternalLink size={9} />
                              </a>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "10px" }}>Sin coordenadas</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Lugar de Fin / Destino (Con enlace a Google Maps) */}
                      <td style={{ padding: "12px 14px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <MapPin size={14} color="#dc2626" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <div style={{ fontSize: "11px", color: "#334155", lineHeight: "1.3" }}>
                            <div>{viaje.lugar_fin || viaje.geocerca_fin || "Coordenadas registradas"}</div>
                            {mapsFin ? (
                              <a
                                href={mapsFin}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "3px",
                                  marginTop: "3px", color: "#0284c7", textDecoration: "none",
                                  fontWeight: 600, fontSize: "10px",
                                }}
                              >
                                Ver en Google Maps <ExternalLink size={9} />
                              </a>
                            ) : (
                              <span style={{ color: "#94a3b8", fontSize: "10px" }}>Sin coordenadas</span>
                            )}

                            {/* Botón directo a Mapa Viajes */}
                            <button
                              onClick={() => {
                                setMapaPatente(viaje.patente);
                                setMapaFecha(viaje.fecha);
                                setSubTab("mapa");
                              }}
                              title="Ver recorrido y línea de tiempo de este vehículo en el visor de mapa GPS"
                              style={{
                                display: "inline-flex", alignItems: "center", gap: "4px",
                                marginTop: "6px", backgroundColor: "#f0fdf4", color: "#166534",
                                border: "1px solid #bbf7d0", padding: "3px 8px", borderRadius: "4px",
                                fontSize: "10px", fontWeight: 600, cursor: "pointer",
                              }}
                            >
                              <Map size={11} /> Ver en Mapa GPS
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                }))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación Inferior */}
        {totalPaginas > 1 && (
          <div style={{
            padding: "12px 18px", borderTop: "1px solid #e2e8f0", backgroundColor: "#f8fafc",
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ fontSize: "12px", color: "#64748b" }}>
              Página {pagina} de {totalPaginas} ({totalViajes.toLocaleString("es-CL")} viajes en total)
            </span>
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => {
                  setPagina((p) => Math.max(p - 1, 1));
                  window.scrollTo({ top: 300, behavior: "smooth" });
                }}
                disabled={pagina === 1}
                style={{
                  display: "flex", alignItems: "center", gap: "4px", padding: "5px 12px",
                  fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1",
                  backgroundColor: pagina === 1 ? "#f1f5f9" : "#ffffff",
                  cursor: pagina === 1 ? "not-allowed" : "pointer", color: pagina === 1 ? "#94a3b8" : "#334155",
                }}
              >
                <ChevronLeft size={14} /> Anterior
              </button>
              <button
                onClick={() => {
                  setPagina((p) => Math.min(p + 1, totalPaginas));
                  window.scrollTo({ top: 300, behavior: "smooth" });
                }}
                disabled={pagina === totalPaginas}
                style={{
                  display: "flex", alignItems: "center", gap: "4px", padding: "5px 12px",
                  fontSize: "12px", borderRadius: "6px", border: "1px solid #cbd5e1",
                  backgroundColor: pagina === totalPaginas ? "#f1f5f9" : "#ffffff",
                  cursor: pagina === totalPaginas ? "not-allowed" : "pointer", color: pagina === totalPaginas ? "#94a3b8" : "#334155",
                }}
              >
                Siguiente <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  );
}
