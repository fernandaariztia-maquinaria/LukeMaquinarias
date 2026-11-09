import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  RefreshCw, MapPin, Navigation, Search, Calendar, Building2,
  Layers, Route, User, Fuel, Gauge, ExternalLink, X, Clock, Radio
} from "lucide-react";

export default function MapTab({ hookProps, currentUser }) {
  const [unidades, setUnidades] = useState([]);
  const [proyectosApi, setProyectosApi] = useState([]);
  const [fechasDisponibles, setFechasDisponibles] = useState([]);
  const [fechaMax, setFechaMax] = useState("");
  const [loading, setLoading] = useState(true);

  // Filtros
  const [proyectoFiltro, setProyectoFiltro] = useState(() => currentUser?.proyecto_actual_id || "");
  const [fechaFiltro, setFechaFiltro] = useState(""); // "" = Última posición conocida (histórico reciente)
  const [search, setSearch] = useState("");
  const [origenFiltro, setOrigenFiltro] = useState(""); // "" | "CANBUS" | "GPS"
  const [mostrarRutas, setMostrarRutas] = useState(true);
  const [capaSatelital, setCapaSatelital] = useState(false);
  const [unidadSeleccionadaId, setUnidadSeleccionadaId] = useState(null);

  // Sincronizar con proyecto global del sidebar
  useEffect(() => {
    setProyectoFiltro(currentUser?.proyecto_actual_id || "");
    setUnidadSeleccionadaId(null);
  }, [currentUser?.proyecto_actual_id]);

  const listaProyectos = useMemo(() => {
    let list = [];
    if (hookProps?.proyectos?.data && hookProps.proyectos.data.length > 0) {
      list = hookProps.proyectos.data;
    } else {
      list = proyectosApi;
    }
    if (currentUser?.proyectos_permitidos && currentUser.proyectos_permitidos.length > 0) {
      return list.filter(
        (p) =>
          currentUser.proyectos_permitidos.includes(p.id) ||
          currentUser.codigos_cc_permitidos?.includes(p.codigo_cc)
      );
    }
    return list;
  }, [hookProps?.proyectos?.data, proyectosApi, currentUser]);

  // Referencias para Leaflet
  const mapContainerRef = useRef(null);
  const mapInstance = useRef(null);
  const tileLayerRef = useRef(null);
  const markersLayer = useRef(null);
  const routesLayer = useRef(null);

  const cargarMapaTelemetria = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("action", "mapa");
      if (proyectoFiltro) params.set("proyecto_id", proyectoFiltro);
      if (fechaFiltro) params.set("fecha", fechaFiltro);

      const res = await fetch(`/api/admin/telemetria?${params.toString()}`);
      const json = await res.json();
      if (json.success) {
        setUnidades(json.unidades || []);
        if (json.proyectos) setProyectosApi(json.proyectos);
        if (json.fechas_disponibles) setFechasDisponibles(json.fechas_disponibles);
        if (json.fecha_max) setFechaMax(json.fecha_max);
      }
    } catch (e) {
      console.error("[MapTab] Error cargando datos de telemetría para mapa:", e.message);
    } finally {
      setLoading(false);
    }
  }, [proyectoFiltro, fechaFiltro]);

  useEffect(() => {
    cargarMapaTelemetria();
  }, [cargarMapaTelemetria]);

  // Filtrado rápido en cliente por texto y origen
  const unidadesFiltradas = useMemo(() => {
    return unidades.filter((u) => {
      if (origenFiltro && u.origen_medicion !== origenFiltro) return false;
      if (search && search.trim() !== "") {
        const term = search.trim().toLowerCase();
        const match =
          String(u.patente || "").toLowerCase().includes(term) ||
          String(u.codigo_interno || "").toLowerCase().includes(term) ||
          String(u.descripcion_equipo || "").toLowerCase().includes(term) ||
          String(u.ultimo_conductor || "").toLowerCase().includes(term) ||
          String(u.lugar_actual || "").toLowerCase().includes(term) ||
          String(u.proyecto?.nombre_proyecto || "").toLowerCase().includes(term);
        if (!match) return false;
      }
      return true;
    });
  }, [unidades, origenFiltro, search]);

  const unidadSeleccionada = useMemo(
    () => unidadesFiltradas.find((u) => u.id === unidadSeleccionadaId) || null,
    [unidadesFiltradas, unidadSeleccionadaId]
  );

  // KPIs agregados del mapa actual
  const kpisMapa = useMemo(() => {
    let viajes = 0,
      km = 0,
      litros = 0,
      canCount = 0;
    for (const u of unidadesFiltradas) {
      viajes += u.resumen?.total_viajes || 0;
      km += u.resumen?.total_km || 0;
      litros += u.resumen?.total_litros || 0;
      if (u.origen_medicion === "CANBUS") canCount++;
    }
    return {
      unidades: unidadesFiltradas.length,
      canCount,
      viajes,
      km: Math.round(km * 10) / 10,
      litros: Math.round(litros * 10) / 10,
    };
  }, [unidadesFiltradas]);

  // Inicializar instancia de Leaflet
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!document.getElementById("leaflet-css")) {
      const linkEl = document.createElement("link");
      linkEl.id = "leaflet-css";
      linkEl.rel = "stylesheet";
      linkEl.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(linkEl);
    }

    let isMounted = true;

    const setupMap = async () => {
      if (mapInstance.current || !mapContainerRef.current) return;
      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      // Centro inicial: Norte de Chile / Spence (-22.79, -69.25)
      const map = L.map(mapContainerRef.current, {
        center: [-22.8, -69.25],
        zoom: 7,
        zoomControl: false,
      });

      tileLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      L.control.zoom({ position: "bottomright" }).addTo(map);

      routesLayer.current = L.layerGroup().addTo(map);
      markersLayer.current = L.layerGroup().addTo(map);
      mapInstance.current = map;
    };

    setupMap();

    return () => {
      isMounted = false;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markersLayer.current = null;
        routesLayer.current = null;
        tileLayerRef.current = null;
      }
    };
  }, []);

  // Cambiar entre capa estándar OSM y Vista Satelital Esri
  useEffect(() => {
    const updateTileLayer = async () => {
      if (!mapInstance.current) return;
      const L = (await import("leaflet")).default;
      if (tileLayerRef.current) {
        mapInstance.current.removeLayer(tileLayerRef.current);
      }
      if (capaSatelital) {
        tileLayerRef.current = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
            maxZoom: 19,
          }
        ).addTo(mapInstance.current);
      } else {
        tileLayerRef.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(mapInstance.current);
      }
    };
    updateTileLayer();
  }, [capaSatelital]);

  // Renderizar marcadores y rutas de telemetría
  useEffect(() => {
    const renderLayers = async () => {
      if (!mapInstance.current || !markersLayer.current || !routesLayer.current) return;
      const L = (await import("leaflet")).default;

      markersLayer.current.clearLayers();
      routesLayer.current.clearLayers();

      const boundsPoints = [];

      // 1. Dibujar trazados de rutas (si hay una unidad seleccionada, dibujar todos sus viajes; si no y mostrarRutas=true, dibujar el último trayecto de cada unidad)
      if (mostrarRutas) {
        const unidadesParaRutas = unidadSeleccionada ? [unidadSeleccionada] : unidadesFiltradas;
        for (const u of unidadesParaRutas) {
          const listaViajes = unidadSeleccionada ? u.viajes : (u.viajes || []).slice(0, 2);
          listaViajes.forEach((v, idx) => {
            if (v.latitud_inicio && v.longitud_inicio && v.latitud_fin && v.longitud_fin) {
              const pIni = [v.latitud_inicio, v.longitud_inicio];
              const pFin = [v.latitud_fin, v.longitud_fin];
              const distLat = Math.abs(pIni[0] - pFin[0]) + Math.abs(pIni[1] - pFin[1]);
              if (distLat < 0.0001) return;

              const colorLinea = unidadSeleccionada
                ? idx === 0
                  ? "#0284c7"
                  : "#6366f1"
                : u.origen_medicion === "CANBUS"
                ? "#059669"
                : "#0284c7";

              const polyline = L.polyline([pIni, pFin], {
                color: colorLinea,
                weight: unidadSeleccionada ? 4 : 2.5,
                opacity: unidadSeleccionada ? 0.85 : 0.55,
                dashArray: idx === 0 ? null : "6, 6",
              }).addTo(routesLayer.current);

              polyline.bindPopup(`
                <div style="font-family: sans-serif; min-width: 210px; font-size: 12px; color: #0f172a;">
                  <div style="font-weight: 700; color: #0284c7; margin-bottom: 4px;">
                    🛣️ Trayecto ${u.patente} (${v.fecha})
                  </div>
                  <div><strong>Horario:</strong> ${v.hora_inicio || "--:--"} → ${v.hora_fin || "--:--"}</div>
                  <div><strong>Chofer:</strong> ${v.nombre_conductor || "Sin chofer"}</div>
                  <div><strong>Distancia:</strong> ${v.km_recorridos} km (${v.origen_medicion})</div>
                  <div><strong>Combustible:</strong> ${v.litros_combustible > 0 ? `${v.litros_combustible} L` : "-"}</div>
                  <div style="margin-top: 4px; font-size: 11px; color: #475569;">
                    🟢 <strong>Origen:</strong> ${v.lugar_inicio || "Coordenadas"}<br/>
                    🏁 <strong>Destino:</strong> ${v.lugar_fin || "Coordenadas"}
                  </div>
                </div>
              `);

              // Si hay una unidad seleccionada, mostrar también el pin de inicio del último viaje
              if (unidadSeleccionada && idx === 0) {
                boundsPoints.push(pIni);
                const startIcon = L.divIcon({
                  className: "",
                  html: `<div style="background:#16a34a;color:#fff;font-size:9px;font-weight:700;padding:2px 6px;border-radius:999px;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">🟢 Inicio ${v.hora_inicio || ""}</div>`,
                  iconSize: [70, 22],
                  iconAnchor: [35, 11],
                });
                L.marker(pIni, { icon: startIcon })
                  .addTo(routesLayer.current)
                  .bindPopup(`<strong>Origen del viaje (${v.hora_inicio || ""}):</strong><br/>${v.lugar_inicio || ""}`);
              }
            }
          });
        }
      }

      // 2. Dibujar marcadores de unidades
      unidadesFiltradas.forEach((u) => {
        if (!u.latitud || !u.longitud) return;
        const esSeleccionada = unidadSeleccionadaId === u.id;
        const esCan = u.origen_medicion === "CANBUS";
        const bgColor = esSeleccionada ? "#dc2626" : esCan ? "#059669" : "#0284c7";
        const labelPin = String(u.patente && u.patente !== "S/P" ? u.patente : u.codigo_interno).slice(0, 7);

        const icon = L.divIcon({
          className: "",
          html: `
            <div style="
              display: flex; flex-direction: column; align-items: center;
              transform: ${esSeleccionada ? "scale(1.15)" : "scale(1)"};
              transition: transform 0.2s;
            ">
              <div style="
                background: ${bgColor};
                color: #ffffff;
                font-size: 10px;
                font-weight: 800;
                font-family: monospace;
                padding: 3px 7px;
                border-radius: 6px;
                border: 2px solid #ffffff;
                box-shadow: 0 3px 10px rgba(0,0,0,0.35);
                white-space: nowrap;
              ">
                ${labelPin}
              </div>
              <div style="
                width: 0; height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 7px solid ${bgColor};
                margin-top: -1px;
              "></div>
            </div>
          `,
          iconSize: [64, 32],
          iconAnchor: [32, 30],
          popupAnchor: [0, -28],
        });

        const gmapsUrl = `https://www.google.com/maps?q=${u.latitud},${u.longitud}`;
        const popupHtml = `
          <div style="min-width: 240px; font-family: 'Inter', sans-serif; color: #0f172a; padding: 2px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 800; font-size: 12px; color: #0f172a;">
                ${u.patente}
              </span>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: ${esCan ? "#ecfdf5" : "#e0f2fe"}; color: ${esCan ? "#047857" : "#0369a1"};">
                ${u.origen_medicion}
              </span>
            </div>
            <div style="font-size: 13px; font-weight: 700; color: #0f172a;">
              ${u.codigo_interno}
            </div>
            <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
              ${u.descripcion_equipo}
            </div>
            ${
              u.proyecto
                ? `<div style="font-size: 11px; font-weight: 600; color: #0369a1; background: #f0f9ff; padding: 3px 6px; border-radius: 4px; margin-bottom: 6px;">
                    🏗️ ${u.proyecto.codigo_cc ? `[${u.proyecto.codigo_cc}] ` : ""}${u.proyecto.nombre_proyecto}
                   </div>`
                : ""
            }
            <div style="font-size: 11px; color: #334155; border-top: 1px solid #e2e8f0; padding-top: 6px; display: flex; flex-direction: column; gap: 3px;">
              <div>👤 <strong>Chofer:</strong> ${u.ultimo_conductor || "Sin chofer identificado"}</div>
              <div>📍 <strong>Ubicación:</strong> ${u.lugar_actual}</div>
              <div>🕒 <strong>Último reporte:</strong> ${u.ultima_fecha} a las ${u.ultima_hora}</div>
              <div>🛣️ <strong>Actividad:</strong> ${u.resumen.total_viajes} viajes · ${u.resumen.total_km} km · ${u.resumen.total_litros} L</div>
            </div>
            <div style="margin-top: 8px; padding-top: 6px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
              <a href="${gmapsUrl}" target="_blank" rel="noreferrer" style="color: #0284c7; font-size: 11px; font-weight: 700; text-decoration: none;">
                Abrir en Google Maps ↗
              </a>
            </div>
          </div>
        `;

        const marker = L.marker([u.latitud, u.longitud], { icon })
          .addTo(markersLayer.current)
          .bindPopup(popupHtml);

        marker.on("click", () => {
          setUnidadSeleccionadaId(u.id);
        });

        if (!unidadSeleccionada || esSeleccionada) {
          boundsPoints.push([u.latitud, u.longitud]);
        }
      });

      if (boundsPoints.length > 0 && mapInstance.current) {
        if (unidadSeleccionada) {
          const bounds = L.latLngBounds(boundsPoints);
          mapInstance.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
        } else if (boundsPoints.length === 1) {
          mapInstance.current.setView(boundsPoints[0], 14);
        } else {
          const bounds = L.latLngBounds(boundsPoints);
          mapInstance.current.fitBounds(bounds, { padding: [45, 45], maxZoom: 14 });
        }
      }
    };

    renderLayers();
  }, [unidadesFiltradas, mostrarRutas, unidadSeleccionada, unidadSeleccionadaId]);

  const centrarEnUnidad = (u) => {
    setUnidadSeleccionadaId(u.id);
    if (mapInstance.current && u.latitud && u.longitud) {
      mapInstance.current.setView([u.latitud, u.longitud], 15);
    }
  };

  return (
    <div style={{ maxWidth: "1650px", margin: "0 auto" }}>
      {/* Encabezado */}
      <div style={{
        display: "flex", flexWrap: "wrap", justifyContent: "space-between",
        alignItems: "center", gap: "16px", marginBottom: "18px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            backgroundColor: "#e0f2fe", color: "#0284c7",
            padding: "10px", borderRadius: "10px", display: "flex",
          }}>
            <MapPin size={26} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a" }}>
              Mapa de Faena y Telemetría GPS
            </h1>
            <p style={{ margin: "2px 0 0", color: "#64748b", fontSize: "13px" }}>
              Geolocalización satelital SKYNAV y CANBUS de equipos, conductores, geocercas y trazado de recorridos por proyecto.
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <button
            onClick={() => setMostrarRutas((r) => !r)}
            style={{
              backgroundColor: mostrarRutas ? "#e0f2fe" : "#ffffff",
              color: mostrarRutas ? "#0369a1" : "#475569",
              border: `1px solid ${mostrarRutas ? "#0284c7" : "#cbd5e1"}`,
              borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600,
            }}
          >
            <Route size={14} /> {mostrarRutas ? "Trazados Activos" : "Mostrar Trazados"}
          </button>

          <button
            onClick={() => setCapaSatelital((s) => !s)}
            style={{
              backgroundColor: capaSatelital ? "#0f172a" : "#ffffff",
              color: capaSatelital ? "#ffffff" : "#475569",
              border: "1px solid #cbd5e1",
              borderRadius: "8px", padding: "8px 12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600,
            }}
          >
            <Layers size={14} /> {capaSatelital ? "🛰️ Vista Satelital" : "🗺️ Mapa Estándar"}
          </button>

          <button
            onClick={cargarMapaTelemetria}
            disabled={loading}
            style={{
              backgroundColor: "#0284c7", color: "#ffffff",
              border: "none", borderRadius: "8px", padding: "8px 14px",
              cursor: loading ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600,
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Actualizar Mapa
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen Geográfico */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "14px", marginBottom: "16px",
      }}>
        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b" }}>
            <span>Unidades en el Mapa</span>
            <Radio size={16} color="#0284c7" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {kpisMapa.unidades}
          </div>
          <div style={{ fontSize: "11px", color: "#047857", marginTop: "2px", fontWeight: 600 }}>
            {kpisMapa.canCount} con computador CANBUS
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b" }}>
            <span>Viajes / Trayectos</span>
            <Navigation size={16} color="#6366f1" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {kpisMapa.viajes.toLocaleString("es-CL")}
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
            {fechaFiltro ? `Fecha: ${fechaFiltro}` : "Últimos movimientos registrados"}
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b" }}>
            <span>Kilómetros en Vista</span>
            <Gauge size={16} color="#16a34a" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {kpisMapa.km.toLocaleString("es-CL")} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>km</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
            Recorrido total de las unidades visibles
          </div>
        </div>

        <div style={{ backgroundColor: "#ffffff", padding: "14px 16px", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", color: "#64748b" }}>
            <span>Combustible en Trayectos</span>
            <Fuel size={16} color="#8b5cf6" />
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
            {kpisMapa.litros.toLocaleString("es-CL")} <span style={{ fontSize: "13px", fontWeight: 500, color: "#64748b" }}>L</span>
          </div>
          <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "2px" }}>
            Consumo medido en las rutas visibles
          </div>
        </div>
      </div>

      {/* Barra de Filtros del Mapa */}
      <div style={{
        backgroundColor: "#ffffff", padding: "12px 16px", borderRadius: "10px",
        border: "1px solid #e2e8f0", marginBottom: "16px", display: "flex",
        flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px",
      }}>
        {/* Filtro por Proyecto */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Building2 size={15} color="#0284c7" />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Proyecto:</span>
          <select
            value={proyectoFiltro}
            onChange={(e) => {
              setProyectoFiltro(e.target.value);
              setUnidadSeleccionadaId(null);
            }}
            style={{
              fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
              border: proyectoFiltro ? "1.5px solid #0284c7" : "1px solid #cbd5e1",
              backgroundColor: proyectoFiltro ? "#f0f9ff" : "#ffffff",
              color: proyectoFiltro ? "#0369a1" : "#334155",
              fontWeight: proyectoFiltro ? 600 : 500, minWidth: "210px", outline: "none",
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

        {/* Selector de Fecha de Telemetría */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <Calendar size={15} color="#64748b" />
          <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Fecha de Ruta:</span>
          <select
            value={fechaFiltro}
            onChange={(e) => {
              setFechaFiltro(e.target.value);
              setUnidadSeleccionadaId(null);
            }}
            style={{
              fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
              border: "1px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none", fontWeight: 500,
            }}
          >
            <option value="">📍 Última Posición Conocida (Global)</option>
            {fechasDisponibles.map((f) => (
              <option key={f} value={f}>
                📅 Viajes del {f}
              </option>
            ))}
          </select>
        </div>

        {/* Filtro CANBUS vs GPS */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <select
            value={origenFiltro}
            onChange={(e) => setOrigenFiltro(e.target.value)}
            style={{
              fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
              border: "1px solid #cbd5e1", backgroundColor: "#ffffff", outline: "none", fontWeight: 500,
            }}
          >
            <option value="">CANBUS y GPS</option>
            <option value="CANBUS">🟢 Solo CANBUS</option>
            <option value="GPS">🔵 Solo GPS</option>
          </select>
        </div>

        {/* Buscador */}
        <div style={{ position: "relative", minWidth: "240px", flex: 1, maxWidth: "340px" }}>
          <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8" }} />
          <input
            type="text"
            placeholder="Buscar patente, código, chofer, lugar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%", padding: "6px 10px 6px 30px", fontSize: "12px",
              borderRadius: "6px", border: "1px solid #cbd5e1", outline: "none",
            }}
          />
        </div>

        {(proyectoFiltro || fechaFiltro || origenFiltro || search || unidadSeleccionadaId) && (
          <button
            onClick={() => {
              setProyectoFiltro("");
              setFechaFiltro("");
              setOrigenFiltro("");
              setSearch("");
              setUnidadSeleccionadaId(null);
            }}
            style={{
              fontSize: "12px", color: "#0284c7", background: "none",
              border: "none", textDecoration: "underline", cursor: "pointer", fontWeight: 600,
            }}
          >
            Ver toda la flota
          </button>
        )}
      </div>

      {/* Contenedor Principal: Mapa (3fr) + Panel Lateral (1.2fr) */}
      <div style={{ display: "grid", gridTemplateColumns: "2.8fr 1.2fr", gap: "16px" }}>
        {/* Mapa Leaflet */}
        <div style={{
          position: "relative", height: "calc(100vh - 290px)", minHeight: "520px",
          borderRadius: "12px", overflow: "hidden", border: "1px solid #e2e8f0",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        }}>
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

          {/* Leyenda flotante en esquina inferior izquierda */}
          <div style={{
            position: "absolute", bottom: "16px", left: "16px", zIndex: 500,
            backgroundColor: "rgba(255,255,255,0.95)", padding: "8px 12px",
            borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "11px",
            display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: 600, color: "#0f172a" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#059669", display: "inline-block" }} />
              CANBUS (Computador)
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: 600, color: "#0f172a" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#0284c7", display: "inline-block" }} />
              GPS Satelital
            </span>
            {unidadSeleccionada && (
              <span style={{ display: "flex", alignItems: "center", gap: "5px", fontWeight: 700, color: "#dc2626" }}>
                <span style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#dc2626", display: "inline-block" }} />
                Seleccionado: {unidadSeleccionada.patente}
              </span>
            )}
          </div>
        </div>

        {/* Panel Lateral: Detalle de Unidad Seleccionada o Lista de Unidades */}
        <div style={{
          backgroundColor: "#ffffff", border: "1px solid #e2e8f0", borderRadius: "12px",
          padding: "14px", overflowY: "auto", height: "calc(100vh - 290px)", minHeight: "520px",
          display: "flex", flexDirection: "column", gap: "10px",
        }}>
          {unidadSeleccionada ? (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                paddingBottom: "10px", borderBottom: "1px solid #e2e8f0",
              }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{
                      backgroundColor: "#0f172a", color: "#ffffff", fontFamily: "monospace",
                      fontWeight: 800, fontSize: "13px", padding: "2px 8px", borderRadius: "4px",
                    }}>
                      {unidadSeleccionada.patente}
                    </span>
                    <span style={{
                      fontSize: "10px", fontWeight: 700, padding: "2px 6px", borderRadius: "4px",
                      backgroundColor: unidadSeleccionada.origen_medicion === "CANBUS" ? "#ecfdf5" : "#e0f2fe",
                      color: unidadSeleccionada.origen_medicion === "CANBUS" ? "#047857" : "#0369a1",
                    }}>
                      {unidadSeleccionada.origen_medicion}
                    </span>
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                    {unidadSeleccionada.codigo_interno}
                  </div>
                  <div style={{ fontSize: "11px", color: "#64748b" }}>
                    {unidadSeleccionada.descripcion_equipo}
                  </div>
                </div>
                <button
                  onClick={() => setUnidadSeleccionadaId(null)}
                  style={{
                    backgroundColor: "#f1f5f9", border: "none", borderRadius: "6px",
                    padding: "5px", cursor: "pointer", color: "#475569",
                  }}
                  title="Volver al listado completo"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Resumen de la unidad seleccionada */}
              <div style={{
                backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: "8px",
                border: "1px solid #e2e8f0", fontSize: "12px", display: "flex", flexDirection: "column", gap: "4px",
              }}>
                <div>👤 <strong>Conductor:</strong> {unidadSeleccionada.ultimo_conductor || "Sin chofer identificado"}</div>
                <div>📍 <strong>Última ubicación:</strong> {unidadSeleccionada.lugar_actual}</div>
                <div>🕒 <strong>Reporte:</strong> {unidadSeleccionada.ultima_fecha} ({unidadSeleccionada.ultima_hora})</div>
                {unidadSeleccionada.proyecto && (
                  <div>🏗️ <strong>Proyecto:</strong> {unidadSeleccionada.proyecto.nombre_proyecto}</div>
                )}
                <div style={{
                  display: "flex", justifyContent: "space-between", marginTop: "6px",
                  paddingTop: "6px", borderTop: "1px solid #e2e8f0", fontWeight: 700, color: "#0369a1",
                }}>
                  <span>{unidadSeleccionada.resumen.total_viajes} viajes</span>
                  <span>{unidadSeleccionada.resumen.total_km} km</span>
                  <span>{unidadSeleccionada.resumen.total_litros} L</span>
                </div>
              </div>

              <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginTop: "4px" }}>
                🛣️ Historial de Recorridos ({unidadSeleccionada.viajes.length})
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
                {unidadSeleccionada.viajes.map((v, idx) => (
                  <div
                    key={v.id || idx}
                    onClick={() => {
                      if (mapInstance.current && v.latitud_fin && v.longitud_fin) {
                        mapInstance.current.setView([v.latitud_fin, v.longitud_fin], 15);
                      }
                    }}
                    style={{
                      padding: "10px", borderRadius: "8px", border: "1px solid #e2e8f0",
                      backgroundColor: idx === 0 ? "#f0f9ff" : "#ffffff", cursor: "pointer",
                      fontSize: "11px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, color: "#0f172a", marginBottom: "4px" }}>
                      <span>📅 {v.fecha} · {v.hora_inicio || "--:--"} → {v.hora_fin || "--:--"}</span>
                      <span style={{ color: "#0284c7" }}>{v.km_recorridos} km</span>
                    </div>
                    {v.nombre_conductor && (
                      <div style={{ color: "#475569", marginBottom: "3px" }}>
                        👤 {v.nombre_conductor} {v.litros_combustible > 0 ? `· ⛽ ${v.litros_combustible} L` : ""}
                      </div>
                    )}
                    <div style={{ color: "#334155", lineHeight: "1.35" }}>
                      <div>🟢 <strong>Inicio:</strong> {v.lugar_inicio || "Coordenadas GPS"}</div>
                      <div>🏁 <strong>Fin:</strong> {v.lugar_fin || "Coordenadas GPS"}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                paddingBottom: "8px", borderBottom: "1px solid #e2e8f0",
              }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                  Flota Georreferenciada ({unidadesFiltradas.length})
                </span>
                <span style={{ fontSize: "11px", color: "#64748b" }}>
                  Clic para ver ruta
                </span>
              </div>

              {loading ? (
                <div style={{ padding: "40px 10px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                  <RefreshCw size={20} className="animate-spin" style={{ margin: "0 auto 8px", display: "block" }} />
                  Cargando posiciones de telemetría...
                </div>
              ) : unidadesFiltradas.length === 0 ? (
                <div style={{ padding: "40px 10px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                  No hay unidades con coordenadas para este filtro.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", overflowY: "auto" }}>
                  {unidadesFiltradas.map((u) => {
                    const esCan = u.origen_medicion === "CANBUS";
                    return (
                      <div
                        key={u.id}
                        onClick={() => centrarEnUnidad(u)}
                        style={{
                          padding: "10px 12px", borderRadius: "8px",
                          border: "1px solid #e2e8f0", backgroundColor: "#f8fafc",
                          cursor: "pointer", transition: "all 0.15s",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "#0284c7";
                          e.currentTarget.style.backgroundColor = "#f0f9ff";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "#e2e8f0";
                          e.currentTarget.style.backgroundColor = "#f8fafc";
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "3px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{
                              backgroundColor: "#ffffff", border: "1px solid #cbd5e1",
                              padding: "1px 6px", borderRadius: "4px", fontFamily: "monospace",
                              fontWeight: 800, fontSize: "11px", color: "#0f172a",
                            }}>
                              {u.patente}
                            </span>
                            <span style={{ fontWeight: 700, fontSize: "12px", color: "#0369a1" }}>
                              {u.codigo_interno !== u.patente ? u.codigo_interno : ""}
                            </span>
                          </div>
                          <span style={{
                            fontSize: "9px", fontWeight: 700, padding: "2px 6px", borderRadius: "999px",
                            backgroundColor: esCan ? "#ecfdf5" : "#e0f2fe",
                            color: esCan ? "#047857" : "#0369a1",
                          }}>
                            {u.origen_medicion}
                          </span>
                        </div>

                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                          {u.descripcion_equipo}
                        </div>

                        {u.proyecto && (
                          <div style={{ fontSize: "10px", fontWeight: 600, color: "#0284c7", marginTop: "2px" }}>
                            🏗️ {u.proyecto.codigo_cc ? `[${u.proyecto.codigo_cc}] ` : ""}{u.proyecto.nombre_proyecto}
                          </div>
                        )}

                        {u.ultimo_conductor && (
                          <div style={{ fontSize: "11px", color: "#475569", marginTop: "3px" }}>
                            👤 {u.ultimo_conductor}
                          </div>
                        )}

                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", display: "flex", alignItems: "flex-start", gap: "4px" }}>
                          <MapPin size={12} color="#16a34a" style={{ flexShrink: 0, marginTop: "2px" }} />
                          <span style={{ lineHeight: "1.25" }}>{u.lugar_actual}</span>
                        </div>

                        <div style={{
                          display: "flex", justifyContent: "space-between", alignItems: "center",
                          marginTop: "6px", paddingTop: "5px", borderTop: "1px solid #e2e8f0",
                          fontSize: "10px", color: "#64748b", fontWeight: 600,
                        }}>
                          <span>🕒 {u.ultima_fecha} {u.ultima_hora}</span>
                          <span style={{ color: "#0f172a" }}>
                            {u.resumen.total_viajes} vjs · {u.resumen.total_km} km
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
