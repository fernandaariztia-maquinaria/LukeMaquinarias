import React, { useState, useEffect, useCallback } from "react";
import {
  Radio, RefreshCw, Gauge, Clock, Fuel, AlertTriangle,
  MapPin, Search, Calendar, CheckCircle2, ChevronRight,
  ExternalLink, ArrowDownUp, Car, Filter, Cpu
} from "lucide-react";

export default function TelemetriaTab({ currentUser }) {
  const [data, setData] = useState([]);
  const [kpis, setKpis] = useState({
    total_km: 0,
    total_km_can: 0,
    total_km_gps: 0,
    total_horas_motor: 0,
    total_horas_ralenti: 0,
    total_combustible_litros: 0,
    total_combustible_can: 0,
    total_combustible_gps: 0,
    total_excesos_velocidad: 0,
  });
  const [loading, setLoading] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // Filtros
  const [search, setSearch] = useState("");
  const [fechaFiltro, setFechaFiltro] = useState("");
  const [desdeFiltro, setDesdeFiltro] = useState("");
  const [hastaFiltro, setHastaFiltro] = useState("");
  const [origenFiltro, setOrigenFiltro] = useState(""); // "" | "CAN" | "GPS"

  // Rango para sincronizar
  const [syncDesde, setSyncDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [syncHasta, setSyncHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fechaFiltro) params.set("fecha", fechaFiltro);
      if (desdeFiltro) params.set("desde", desdeFiltro);
      if (hastaFiltro) params.set("hasta", hastaFiltro);
      if (search) params.set("search", search);
      params.set("limit", "150");

      const res = await fetch(`/api/admin/telemetria?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
        if (json.kpis) setKpis(json.kpis);
      }
    } catch (e) {
      console.error("[TelemetriaTab] Error al cargar:", e.message);
    } finally {
      setLoading(false);
    }
  }, [fechaFiltro, desdeFiltro, hastaFiltro, search]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const ejecutarSincronizacion = async (desde, hasta) => {
    setSincronizando(true);
    setSyncMsg({ tipo: "info", texto: "Sincronizando telemetría con SKYNAV... (consultando API externa)" });
    try {
      const res = await fetch("/api/admin/telemetria/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desde, hasta, iniciadoPor: currentUser?.nombre_completo || "ADMIN" }),
      });
      const json = await res.json();
      if (json.success) {
        setSyncMsg({
          tipo: "success",
          texto: `Sincronización exitosa: ${json.unidades_procesadas} unidades procesadas (${json.unidades_mapeadas} vinculadas a flota, ${json.equipos_gps_actualizados} posiciones GPS actualizadas).`,
        });
        cargarDatos();
      } else {
        setSyncMsg({ tipo: "error", texto: `Error en sincronización: ${json.error || "Falla desconocida"}` });
      }
    } catch (err) {
      setSyncMsg({ tipo: "error", texto: `Error de red: ${err.message}` });
    } finally {
      setSincronizando(false);
    }
  };

  // Filtrado en memoria por origen (CAN vs GPS)
  const datosFiltrados = data.filter((row) => {
    if (!origenFiltro) return true;
    const esCan = row.origen_km === "CAN" || row.origen_combustible === "CAN" || row.combustible_origen === "CAN" || Number(row.litros_can) > 0;
    if (origenFiltro === "CAN") return esCan;
    if (origenFiltro === "GPS") return !esCan;
    return true;
  });

  return (
    <div style={{ padding: "24px", maxWidth: "1600px", margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "space-between",
        alignItems: "center", gap: "16px", marginBottom: "24px",
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              backgroundColor: "#e0f2fe", color: "#0369a1",
              padding: "8px", borderRadius: "8px", display: "flex",
            }}>
              <Radio size={24} />
            </div>
            <div>
              <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, color: "var(--color-text)" }}>
                Telemetría SKYNAV
              </h1>
              <p style={{ margin: "2px 0 0", fontSize: "13px", color: "var(--color-text-muted)" }}>
                Histórico permanente de GPS, horómetros, distancias y combustible consumido (desglose CANBUS y GPS)
              </p>
            </div>
          </div>
        </div>

        {/* Panel de Sincronización Manual */}
        <div style={{
          display: "flex", alignItems: "center", flexWrap: "wrap",
          gap: "10px", backgroundColor: "#ffffff", padding: "10px 14px",
          borderRadius: "10px", border: "1px solid var(--border-sidebar, #e2e8f0)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
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
            {sincronizando ? "Sincronizando..." : "Sincronizar Rango"}
          </button>
        </div>
      </div>

      {/* Alerta / Mensaje de sincronización */}
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

      {/* KPI Cards */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "16px", marginBottom: "24px",
      }}>
        {/* Distancia Total con desglose CAN vs GPS */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Distancia Total</span>
            <Gauge size={18} color="#0284c7" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_km.toLocaleString("es-CL")} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>km</span>
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

        {/* Horas Motor */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Horas Motor</span>
            <Clock size={18} color="#16a34a" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_horas_motor.toLocaleString("es-CL")} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>hrs</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
            Tiempo total activo
          </div>
        </div>

        {/* Tiempo Ralentí */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Tiempo en Ralentí</span>
            <Clock size={18} color="#f59e0b" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_horas_ralenti.toLocaleString("es-CL")} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>hrs</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
            Motor encendido sin avance
          </div>
        </div>

        {/* Combustible Total con desglose CAN vs GPS */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Combustible Consumido</span>
            <Fuel size={18} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "8px" }}>
            {kpis.total_combustible_litros.toLocaleString("es-CL")} <span style={{ fontSize: "14px", fontWeight: 500, color: "#64748b" }}>L</span>
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

        {/* Excesos de Velocidad */}
        <div style={{
          backgroundColor: "#ffffff", padding: "16px", borderRadius: "10px",
          border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: "13px" }}>
            <span>Excesos de Velocidad</span>
            <AlertTriangle size={18} color="#ef4444" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#ef4444", marginTop: "8px" }}>
            {kpis.total_excesos_velocidad}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
            Alertas de velocidad
          </div>
        </div>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div style={{
        backgroundColor: "#ffffff", padding: "14px 18px", borderRadius: "10px",
        border: "1px solid #e2e8f0", marginBottom: "20px", display: "flex",
        flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: "1 1 350px", flexWrap: "wrap" }}>
          {/* Búsqueda */}
          <div style={{ position: "relative", width: "100%", maxWidth: "340px" }}>
            <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
            <input
              type="text"
              placeholder="Buscar por patente, código interno o lugar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                width: "100%", padding: "7px 10px 7px 32px", fontSize: "13px",
                borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none",
              }}
            />
          </div>

          {/* Filtro por Origen de Datos (CAN vs GPS) */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Filter size={14} color="#64748b" />
            <select
              value={origenFiltro}
              onChange={(e) => setOrigenFiltro(e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
                border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#f8fafc",
                fontWeight: 600, color: "#334155",
              }}
            >
              <option value="">Todos los orígenes (CAN y GPS)</option>
              <option value="CAN">Solo CAN / CANBUS (Computador a Bordo)</option>
              <option value="GPS">Solo GPS (Cálculo Satelital)</option>
            </select>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", color: "#64748b" }}>Fecha específica:</span>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e) => {
              setFechaFiltro(e.target.value);
              setDesdeFiltro("");
              setHastaFiltro("");
            }}
            style={{
              padding: "6px 10px", fontSize: "12px", borderRadius: "6px",
              border: "1px solid #cbd5e1", outline: "none",
            }}
          />
          {(fechaFiltro || search || origenFiltro) && (
            <button
              onClick={() => {
                setFechaFiltro("");
                setSearch("");
                setDesdeFiltro("");
                setHastaFiltro("");
                setOrigenFiltro("");
              }}
              style={{
                fontSize: "12px", color: "#64748b", background: "none",
                border: "none", textDecoration: "underline", cursor: "pointer",
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla de Registros */}
      <div style={{
        backgroundColor: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0",
        overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}>
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            <RefreshCw size={24} className="animate-spin" style={{ margin: "0 auto 10px", display: "block" }} />
            Cargando registros de telemetría...
          </div>
        ) : datosFiltrados.length === 0 ? (
          <div style={{ padding: "60px", textAlign: "center", color: "#64748b" }}>
            <Car size={36} style={{ margin: "0 auto 12px", display: "block", color: "#cbd5e1" }} />
            <div style={{ fontSize: "15px", fontWeight: 600, color: "#334155" }}>
              No hay registros de telemetría para este filtro
            </div>
            <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "450px", margin: "6px auto 16px" }}>
              Ejecuta una sincronización con el botón superior para traer el histórico desde SKYNAV y guardarlo permanentemente.
            </p>
            <button
              onClick={() => ejecutarSincronizacion(syncDesde, syncHasta)}
              disabled={sincronizando}
              style={{
                backgroundColor: "#0284c7", color: "#ffffff", border: "none",
                padding: "8px 18px", borderRadius: "6px", fontSize: "13px",
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Sincronizar ahora
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", textAlign: "left" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", color: "#475569", fontWeight: 600 }}>
                  <th style={{ padding: "12px 16px" }}>Equipo / Patente</th>
                  <th style={{ padding: "12px 16px" }}>Fecha</th>
                  <th style={{ padding: "12px 16px" }}>Distancia / Origen</th>
                  <th style={{ padding: "12px 16px" }}>Horas Motor</th>
                  <th style={{ padding: "12px 16px" }}>Ralentí</th>
                  <th style={{ padding: "12px 16px" }}>Combustible / Origen</th>
                  <th style={{ padding: "12px 16px" }}>Última Ubicación</th>
                  <th style={{ padding: "12px 16px" }}>Conductor(es)</th>
                  <th style={{ padding: "12px 16px", textAlign: "center" }}>Alertas</th>
                </tr>
              </thead>
              <tbody>
                {datosFiltrados.map((row) => {
                  const tieneUbicacion = row.latitud_ultima && row.longitud_ultima;
                  const mapsUrl = tieneUbicacion
                    ? `https://www.google.com/maps?q=${row.latitud_ultima},${row.longitud_ultima}`
                    : null;

                  const esCan =
                    row.origen_km === "CAN" ||
                    row.origen_combustible === "CAN" ||
                    row.combustible_origen === "CAN" ||
                    Number(row.litros_can) > 0;

                  return (
                    <tr
                      key={row.id}
                      style={{ borderBottom: "1px solid #f1f5f9", transition: "background-color 0.15s" }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      {/* Equipo / Patente */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            padding: "3px 8px", backgroundColor: "#f1f5f9",
                            borderRadius: "4px", fontWeight: 700, fontSize: "12px",
                            fontFamily: "monospace", color: "#1e293b",
                          }}>
                            {row.patente || row.identificador_skynav}
                          </span>
                          {row.equipo ? (
                            <div>
                              <div style={{ fontWeight: 600, color: "#0f172a" }}>
                                {row.equipo.codigo_interno}
                              </div>
                              <div style={{ fontSize: "11px", color: "#64748b" }}>
                                {row.equipo.descripcion_equipo}
                              </div>
                            </div>
                          ) : (
                            <span style={{
                              fontSize: "10px", backgroundColor: "#fef3c7",
                              color: "#d97706", padding: "2px 6px", borderRadius: "4px",
                            }}>
                              Sin vincular
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fecha */}
                      <td style={{ padding: "12px 16px", color: "#334155", fontWeight: 500 }}>
                        {row.fecha}
                      </td>

                      {/* Distancia + Detalle de Origen */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ fontWeight: 700, color: "#0f172a" }}>
                            {row.km_recorridos > 0 ? `${row.km_recorridos} km` : <span style={{ color: "#94a3b8" }}>0 km</span>}
                          </span>
                          <div>
                            {esCan ? (
                              <span style={{
                                fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#ecfdf5", color: "#047857",
                                border: "1px solid #a7f3d0", display: "inline-block",
                              }}>
                                CANBUS (ECM)
                              </span>
                            ) : (
                              <span style={{
                                fontSize: "10px", fontWeight: 600, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#f8fafc", color: "#475569",
                                border: "1px solid #e2e8f0", display: "inline-block",
                              }}>
                                GPS (Satélite)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Horas Motor */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ fontWeight: 600, color: row.horas_motor > 0 ? "#16a34a" : "#94a3b8" }}>
                          {row.horas_motor > 0 ? `${row.horas_motor} h` : "0 h"}
                        </span>
                      </td>

                      {/* Ralentí */}
                      <td style={{ padding: "12px 16px" }}>
                        <span style={{ color: row.horas_ralenti > 0.5 ? "#d97706" : "#64748b" }}>
                          {row.horas_ralenti > 0 ? `${row.horas_ralenti} h` : "-"}
                        </span>
                      </td>

                      {/* Combustible + Detalle de Origen */}
                      <td style={{ padding: "12px 16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          {row.combustible_litros > 0 ? (
                            <span style={{ fontWeight: 700, color: "#7c3aed" }}>
                              {row.combustible_litros} L
                            </span>
                          ) : (
                            <span style={{ color: "#94a3b8" }}>-</span>
                          )}
                          <div>
                            {Number(row.litros_can) > 0 ? (
                              <span style={{
                                fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#15803d",
                                border: "1px solid #bbf7d0", display: "inline-block",
                              }}>
                                CAN: {row.litros_can} L
                              </span>
                            ) : Number(row.litros_gps) > 0 ? (
                              <span style={{
                                fontSize: "10px", fontWeight: 600, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#fdf4ff", color: "#86198f",
                                border: "1px solid #f0abfc", display: "inline-block",
                              }}>
                                GPS: {row.litros_gps} L
                              </span>
                            ) : esCan ? (
                              <span style={{
                                fontSize: "10px", fontWeight: 700, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#f0fdf4", color: "#15803d",
                                border: "1px solid #bbf7d0", display: "inline-block",
                              }}>
                                CANBUS
                              </span>
                            ) : (
                              <span style={{
                                fontSize: "10px", fontWeight: 600, padding: "1px 6px",
                                borderRadius: "4px", backgroundColor: "#f8fafc", color: "#64748b",
                                border: "1px solid #e2e8f0", display: "inline-block",
                              }}>
                                GPS
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Ubicación */}
                      <td style={{ padding: "12px 16px", maxWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px" }}>
                          <MapPin size={14} color="#0284c7" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <div style={{ fontSize: "11px", color: "#475569", lineHeight: "1.3" }}>
                            {row.lugar_ultimo || row.geocerca_ultima || "Sin datos GPS"}
                            {mapsUrl && (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex", alignItems: "center", gap: "3px",
                                  marginLeft: "6px", color: "#0284c7", textDecoration: "none",
                                  fontWeight: 600,
                                }}
                              >
                                Ver mapa <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Conductor(es) */}
                      <td style={{ padding: "12px 16px", fontSize: "12px", color: "#475569" }}>
                        {row.conductores && row.conductores.length > 0 ? (
                          row.conductores.join(", ")
                        ) : (
                          <span style={{ color: "#94a3b8" }}>No asignado</span>
                        )}
                      </td>

                      {/* Alertas */}
                      <td style={{ padding: "12px 16px", textAlign: "center" }}>
                        {row.eventos_exceso_velocidad > 0 ? (
                          <span style={{
                            backgroundColor: "#fee2e2", color: "#b91c1c",
                            padding: "3px 8px", borderRadius: "12px",
                            fontSize: "11px", fontWeight: 700,
                          }}>
                            {row.eventos_exceso_velocidad} exceso{row.eventos_exceso_velocidad > 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span style={{ color: "#16a34a", fontSize: "12px" }}>✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
