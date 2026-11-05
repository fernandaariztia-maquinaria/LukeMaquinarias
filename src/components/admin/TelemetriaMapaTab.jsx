import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MapPin, Calendar, Car, Navigation, Clock, Fuel, Search,
  RefreshCw, ChevronRight, Layers, Eye, User, ShieldAlert,
  Sliders, ArrowRight, CheckCircle2, AlertCircle
} from "lucide-react";
import { formatearPatente, clasificarTipoEquipo, TIPOS_EQUIPO_FILTROS } from "../../lib/telemetriaUtils";

export default function TelemetriaMapaTab({
  patentesDisponibles = [],
  fechaInicial = "",
  patenteInicial = "",
}) {
  // Estados de búsqueda
  const [listaEquipos, setListaEquipos] = useState([]);
  const [patenteSeleccionada, setPatenteSeleccionada] = useState(() => patenteInicial || "");
  const [tipoEquipoFiltro, setTipoEquipoFiltro] = useState("todos"); // "todos" | "camionetas" | "camiones" | "gruas" | "maquinaria" | "buses" | "otros"
  const [fechaFiltro, setFechaFiltro] = useState(
    () => fechaInicial || new Date().toISOString().slice(0, 10)
  );

  // Estados de datos
  const [cargando, setCargando] = useState(false);
  const [datosRecorrido, setDatosRecorrido] = useState(null);
  const [viajeSeleccionado, setViajeSeleccionado] = useState(null);
  const [capaMapa, setCapaMapa] = useState("calles"); // "calles" | "satelite"

  // Referencias de Leaflet y control de carga
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const polylinesLayerRef = useRef(null);
  const markersLayerRef = useRef(null);
  const hasFetchedEquiposRef = useRef(false);

  // Cargar lista de equipos una sola vez si no se suministra
  useEffect(() => {
    if (patentesDisponibles && patentesDisponibles.length > 0) {
      setListaEquipos(patentesDisponibles);
      if (!patenteSeleccionada) {
        const first = patentesDisponibles[0];
        setPatenteSeleccionada(typeof first === "string" ? first : first.patente);
      }
      return;
    }

    if (hasFetchedEquiposRef.current) return;
    hasFetchedEquiposRef.current = true;

    fetch("/api/admin/telemetria/recorrido?action=lista_equipos")
      .then((r) => r.json())
      .then((res) => {
        if (res.success && res.equipos?.length > 0) {
          setListaEquipos(res.equipos);
          if (!patenteSeleccionada) {
            setPatenteSeleccionada(res.equipos[0].patente);
          }
        }
      })
      .catch((err) => console.error("[TelemetriaMapaTab] Error al cargar equipos:", err));
  }, [patentesDisponibles]);

  // Si cambian las props iniciales desde el padre
  useEffect(() => {
    if (patenteInicial) setPatenteSeleccionada(patenteInicial);
    if (fechaInicial) setFechaFiltro(fechaInicial);
  }, [patenteInicial, fechaInicial]);

  // Filtrar lista de equipos según tipo seleccionado
  const equiposFiltrados = useMemo(() => {
    if (tipoEquipoFiltro === "todos") return listaEquipos;
    return listaEquipos.filter((eq) => clasificarTipoEquipo(eq) === tipoEquipoFiltro);
  }, [listaEquipos, tipoEquipoFiltro]);

  // Cargar datos de recorrido desde el endpoint de API
  const cargarRecorrido = useCallback(async (patente, fecha) => {
    if (!patente) return;
    setCargando(true);
    setViajeSeleccionado(null);

    try {
      const res = await fetch(
        `/api/admin/telemetria/recorrido?patente=${encodeURIComponent(patente)}&fecha=${encodeURIComponent(fecha)}`
      );
      const json = await res.json();
      if (json.success) {
        setDatosRecorrido(json);
      } else {
        setDatosRecorrido(null);
      }
    } catch (e) {
      console.error("[TelemetriaMapaTab] Error al cargar recorrido:", e);
      setDatosRecorrido(null);
    } finally {
      setCargando(false);
    }
  }, []);

  // Inicializar mapa Leaflet
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      if (mapInstanceRef.current) return;

      // Cargar CSS de Leaflet si no está presente
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css";
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }

      const L = (await import("leaflet")).default;
      if (!isMounted || !mapContainerRef.current) return;

      // Centro de Chile por defecto
      const map = L.map(mapContainerRef.current, {
        center: [-27.3668, -70.3323], // Copiapó / Atacama
        zoom: 7,
        zoomControl: false,
      });

      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Capas
      const callesLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      });

      callesLayer.addTo(map);

      polylinesLayerRef.current = L.layerGroup().addTo(map);
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Cambiar entre capa callejera y satélite
  const cambiarCapa = async (tipo) => {
    if (!mapInstanceRef.current) return;
    const L = (await import("leaflet")).default;
    setCapaMapa(tipo);

    // Remover capas base existentes
    mapInstanceRef.current.eachLayer((layer) => {
      if (layer instanceof L.TileLayer) {
        mapInstanceRef.current.removeLayer(layer);
      }
    });

    if (tipo === "satelite") {
      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri World Imagery", maxZoom: 19 }
      ).addTo(mapInstanceRef.current);
    } else {
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(mapInstanceRef.current);
    }
  };

  // Dibujar puntos y trazas en el mapa cuando cambian los datos o el viaje seleccionado
  useEffect(() => {
    if (!mapInstanceRef.current || !polylinesLayerRef.current || !markersLayerRef.current) return;

    polylinesLayerRef.current.clearLayers();
    markersLayerRef.current.clearLayers();

    const render = async () => {
      const L = (await import("leaflet")).default;

      // ── CASO A: HAY UN VIAJE / TRAMO ESPECÍFICO SELECCIONADO ──────────
      if (viajeSeleccionado && viajeSeleccionado.puntos_gps && viajeSeleccionado.puntos_gps.length > 0) {
        const ptsViaje = viajeSeleccionado.puntos_gps;
        const coordsViaje = ptsViaje.map((p) => [p.lat, p.lng]);

        // Dibujar traza tenue de fondo con todos los demás puntos del día para dar contexto geográfico
        if (datosRecorrido?.puntos?.length > 0) {
          const allCoords = datosRecorrido.puntos.map((p) => [p.lat, p.lng]);
          L.polyline(allCoords, {
            color: "#94a3b8",
            weight: 2,
            opacity: 0.35,
            dashArray: "4, 6",
          }).addTo(polylinesLayerRef.current);
        }

        // Trazar el viaje seleccionado en azul intenso con alta fidelidad
        const polylineViaje = L.polyline(coordsViaje, {
          color: "#0284c7",
          weight: 5,
          opacity: 0.95,
          smoothFactor: 1,
        }).addTo(polylinesLayerRef.current);

        // Marcador A (Inicio de este tramo)
        const ini = ptsViaje[0];
        const iconIni = L.divIcon({
          className: "custom-pin",
          html: `<div style="background-color:#16a34a;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);font-size:12px;font-weight:bold;">A</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([ini.lat, ini.lng], { icon: iconIni })
          .bindPopup(`<strong>Inicio del Tramo</strong><br/>${viajeSeleccionado.lugar_inicio || ini.lugar || "Origen"}<br/>Hora: <strong>${viajeSeleccionado.hora_inicio || ini.hora?.slice(11, 19) || "--:--"}</strong><br/>Chofer: ${viajeSeleccionado.nombre_conductor || "No informado"}`)
          .openPopup()
          .addTo(markersLayerRef.current);

        // Marcador B (Fin de este tramo)
        if (ptsViaje.length > 1) {
          const fin = ptsViaje[ptsViaje.length - 1];
          const iconFin = L.divIcon({
            className: "custom-pin",
            html: `<div style="background-color:#dc2626;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);font-size:12px;font-weight:bold;">B</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          L.marker([fin.lat, fin.lng], { icon: iconFin })
            .bindPopup(`<strong>Fin del Tramo</strong><br/>${viajeSeleccionado.lugar_fin || fin.lugar || "Destino"}<br/>Hora: <strong>${viajeSeleccionado.hora_fin || fin.hora?.slice(11, 19) || "--:--"}</strong><br/>Distancia: <strong>${viajeSeleccionado.km_recorridos || 0} km</strong>`)
            .addTo(markersLayerRef.current);
        }

        // Muestreo inteligente de puntos GPS interactivos a lo largo de la ruta
        if (ptsViaje.length > 2) {
          const step = Math.max(1, Math.floor(ptsViaje.length / 45));
          for (let i = step; i < ptsViaje.length - 1; i += step) {
            const pt = ptsViaje[i];
            const circleColor = pt.velocidad > 80 ? "#dc2626" : pt.velocidad > 35 ? "#0284c7" : "#f59e0b";
            L.circleMarker([pt.lat, pt.lng], {
              radius: 4,
              fillColor: circleColor,
              color: "#ffffff",
              weight: 1,
              fillOpacity: 0.9,
            })
              .bindPopup(`<strong>Punto GPS #${i + 1}</strong><br/>Hora: ${pt.hora?.slice(11, 19) || ""}<br/>Velocidad: <strong>${pt.velocidad} km/h</strong><br/>Estado: ${pt.estado}<br/>${pt.lugar ? `<small style="color:#64748b;">${pt.lugar}</small>` : ""}`)
              .addTo(markersLayerRef.current);
          }
        }

        try {
          mapInstanceRef.current.fitBounds(polylineViaje.getBounds(), { padding: [50, 50] });
        } catch (e) {}
        return;
      }

      // ── CASO B: VISTA GENERAL DE TODO EL DÍA ──────────────────────────
      const puntos = datosRecorrido?.puntos || [];
      if (puntos.length === 0) return;

      const coords = puntos.map((p) => [p.lat, p.lng]);

      // Trazar línea de recorrido principal (Polyline)
      const polyline = L.polyline(coords, {
        color: "#0284c7",
        weight: 4,
        opacity: 0.85,
        smoothFactor: 1,
      }).addTo(polylinesLayerRef.current);

      // Ícono de Inicio del día (Verde)
      const inicio = puntos[0];
      const startIcon = L.divIcon({
        className: "custom-pin",
        html: `<div style="background-color:#16a34a;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:11px;font-weight:bold;">A</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      L.marker([inicio.lat, inicio.lng], { icon: startIcon })
        .bindPopup(`<strong>Inicio del Día</strong><br/>${inicio.lugar || "Origen"}<br/>Hora: ${inicio.hora?.slice(11, 16) || "--:--"}`)
        .addTo(markersLayerRef.current);

      // Ícono de Fin del día (Rojo)
      if (puntos.length > 1) {
        const fin = puntos[puntos.length - 1];
        const endIcon = L.divIcon({
          className: "custom-pin",
          html: `<div style="background-color:#dc2626;color:white;width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);font-size:11px;font-weight:bold;">B</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        L.marker([fin.lat, fin.lng], { icon: endIcon })
          .bindPopup(`<strong>Destino Final del Día</strong><br/>${fin.lugar || "Destino"}<br/>Hora: ${fin.hora?.slice(11, 16) || "--:--"}`)
          .addTo(markersLayerRef.current);
      }

      // Paradas o cambios de viaje numerados
      (datosRecorrido?.viajes || []).forEach((v, idx) => {
        if (v.latitud_inicio && v.longitud_inicio && idx > 0) {
          const stopIcon = L.divIcon({
            className: "custom-pin",
            html: `<div style="background-color:#0284c7;color:white;width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1.5px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.25);font-size:10px;font-weight:bold;">${idx + 1}</div>`,
            iconSize: [22, 22],
            iconAnchor: [11, 11],
          });

          L.marker([v.latitud_inicio, v.longitud_inicio], { icon: stopIcon })
            .bindPopup(`<strong>Viaje ${idx + 1}</strong><br/>Inicio: ${v.hora_inicio || "--:--"}<br/>${v.lugar_inicio || ""}<br/>Puntos GPS: ${v.total_puntos_gps || 0}`)
            .addTo(markersLayerRef.current);
        }
      });

      // Encuadrar el mapa suavemente en el recorrido
      try {
        mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [40, 40] });
      } catch (err) {}
    };

    render();
  }, [datosRecorrido, viajeSeleccionado]);

  // Enfocar o alternar un viaje específico en el mapa
  const enfocarViaje = (viaje) => {
    if (viajeSeleccionado?.id === viaje.id) {
      setViajeSeleccionado(null); // Deseleccionar para volver al día completo
    } else {
      setViajeSeleccionado(viaje);
    }
  };

  // Clic en la barra de tiempo superior
  const handleClickTimelineBloque = (bloque) => {
    if (!datosRecorrido?.viajes) return;
    const match = datosRecorrido.viajes.find(
      (v) => v.hora_inicio?.slice(0, 5) === bloque.hora_inicio?.slice(0, 5)
    );
    if (match) {
      enfocarViaje(match);
    }
  };

  // Cargar cuando cambia patente o fecha
  useEffect(() => {
    if (patenteSeleccionada && fechaFiltro) {
      cargarRecorrido(patenteSeleccionada, fechaFiltro);
    }
  }, [patenteSeleccionada, fechaFiltro, cargarRecorrido]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      {/* ── BARRA SUPERIOR DE CONTROLES Y FILTROS ───────────────────── */}
      <div style={{
        backgroundColor: "#ffffff", padding: "14px 18px", borderRadius: "10px",
        border: "1px solid #e2e8f0", display: "flex", flexDirection: "column", gap: "12px",
      }}>
        {/* ── BOTONES DE FILTRO POR TIPO DE EQUIPO ─────────────────────── */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexWrap: "wrap", gap: "8px", width: "100%", paddingBottom: "10px",
          borderBottom: "1px solid #f1f5f9",
        }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
            <Layers size={14} color="#0d9488" />
            Tipo de Equipo:
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {TIPOS_EQUIPO_FILTROS.map((t) => {
              const activo = tipoEquipoFiltro === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setTipoEquipoFiltro(t.key);
                    const matched = listaEquipos.filter((eq) => t.key === "todos" || clasificarTipoEquipo(eq) === t.key);
                    if (matched.length > 0 && !matched.some((m) => (m.patente || m) === patenteSeleccionada)) {
                      const nextPat = matched[0].patente || matched[0];
                      setPatenteSeleccionada(nextPat);
                    }
                  }}
                  style={{
                    fontSize: "11px", fontWeight: 700, padding: "5px 12px", borderRadius: "6px",
                    cursor: "pointer", transition: "all 0.15s ease",
                    border: activo ? "1px solid #0d9488" : "1px solid #cbd5e1",
                    backgroundColor: activo ? "#0d9488" : "#ffffff",
                    color: activo ? "#ffffff" : "#475569",
                    boxShadow: activo ? "0 2px 4px rgba(13, 148, 136, 0.25)" : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center",
          justifyContent: "space-between", gap: "12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* Selector de Patente / Equipo */}
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Car size={16} color="#0284c7" />
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Equipo:</span>
              <select
                value={patenteSeleccionada}
                onChange={(e) => setPatenteSeleccionada(e.target.value)}
                style={{
                  fontSize: "13px", padding: "6px 12px", borderRadius: "6px",
                  border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#f8fafc",
                  fontWeight: 700, color: "#0f172a", minWidth: "220px",
                }}
              >
                <option value="">Seleccionar patente...</option>
                {equiposFiltrados.map((p, idx) => {
                  const rawPat = typeof p === "string" ? p : p.patente;
                  const pat = formatearPatente(rawPat);
                  const cod = typeof p === "object" ? p.codigo_interno || p.codigo : "";
                  const desc = typeof p === "object" ? p.descripcion_equipo || p.tipo : "";
                  const optKey = (typeof p === "object" && p.id) ? p.id : `${rawPat || "sin_pat"}_${idx}`;
                  return (
                    <option key={optKey} value={rawPat}>
                      {cod ? `[${cod}] ` : ""}{pat}{desc ? ` - ${desc}` : ""}
                    </option>
                  );
                })}
              </select>
            </div>

          {/* Selector de Fecha */}
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <Calendar size={16} color="#0284c7" />
            <span style={{ fontSize: "12px", fontWeight: 600, color: "#334155" }}>Fecha:</span>
            <input
              type="date"
              value={fechaFiltro}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setFechaFiltro(e.target.value)}
              style={{
                fontSize: "12px", padding: "6px 10px", borderRadius: "6px",
                border: "1px solid #cbd5e1", outline: "none", backgroundColor: "#ffffff",
              }}
            />
          </div>

          <button
            onClick={() => cargarRecorrido(patenteSeleccionada, fechaFiltro)}
            disabled={cargando || !patenteSeleccionada}
            style={{
              backgroundColor: cargando ? "#94a3b8" : "#0284c7", color: "#ffffff",
              border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px",
              fontWeight: 600, cursor: cargando ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", gap: "6px",
            }}
          >
            <RefreshCw size={13} className={cargando ? "animate-spin" : ""} />
            {cargando ? "Cargando..." : "Ver Recorrido"}
          </button>
        </div>

        {/* Selector de Capa de Mapa */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <Layers size={14} color="#64748b" />
          <span style={{ fontSize: "11px", color: "#64748b" }}>Capa:</span>
          <button
            onClick={() => cambiarCapa("calles")}
            style={{
              fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
              border: "1px solid #cbd5e1",
              backgroundColor: capaMapa === "calles" ? "#0284c7" : "#ffffff",
              color: capaMapa === "calles" ? "#ffffff" : "#475569",
              cursor: "pointer", fontWeight: 600,
            }}
          >
            Calles
          </button>
          <button
            onClick={() => cambiarCapa("satelite")}
            style={{
              fontSize: "11px", padding: "4px 8px", borderRadius: "4px",
              border: "1px solid #cbd5e1",
              backgroundColor: capaMapa === "satelite" ? "#0284c7" : "#ffffff",
              color: capaMapa === "satelite" ? "#ffffff" : "#475569",
              cursor: "pointer", fontWeight: 600,
            }}
          >
            Satélite
          </button>
        </div>
        </div>
      </div>

      {/* ── BANNER DE ESTADO DE COBERTURA GPS / CSV ────────────────── */}
      {datosRecorrido && (
        datosRecorrido.fuente === "CSV_POSICIONES" ? (
          <div style={{
            backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0",
            color: "#166534", padding: "10px 16px", borderRadius: "8px",
            fontSize: "12px", display: "flex", alignItems: "center",
            justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <CheckCircle2 size={18} color="#16a34a" style={{ flexShrink: 0 }} />
              <span>
                <strong>Trazado GPS de Alta Fidelidad:</strong> Vinculados <strong>{datosRecorrido.puntos.length.toLocaleString("es-CL")} puntos GPS</strong> del archivo CSV para el día {fechaFiltro}.
                {viajeSeleccionado && (
                  <span style={{ marginLeft: "8px", color: "#0284c7", fontWeight: 700 }}>
                    • Enfocando Tramo: {viajeSeleccionado.hora_inicio} → {viajeSeleccionado.hora_fin} ({viajeSeleccionado.total_puntos_gps || 0} puntos GPS)
                  </span>
                )}
              </span>
            </div>
            {viajeSeleccionado && (
              <button
                onClick={() => setViajeSeleccionado(null)}
                style={{
                  backgroundColor: "#0284c7", color: "#ffffff", border: "none",
                  padding: "4px 10px", borderRadius: "5px", fontSize: "11px",
                  fontWeight: 600, cursor: "pointer",
                }}
              >
                Ver todos los viajes del día
              </button>
            )}
          </div>
        ) : (
          <div style={{
            backgroundColor: "#fef3c7", border: "1px solid #fde68a",
            color: "#92400e", padding: "10px 16px", borderRadius: "8px",
            fontSize: "12px", display: "flex", alignItems: "center",
            justifyContent: "space-between", flexWrap: "wrap", gap: "8px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <AlertCircle size={18} color="#d97706" style={{ flexShrink: 0 }} />
              <span>
                <strong>Modo Preliminar (Sin archivo CSV para el {fechaFiltro}):</strong> Mostrando trazo entre punto de inicio y fin. Los archivos CSV cargados en <code style={{ backgroundColor: "#fde68a", padding: "1px 4px", borderRadius: "3px" }}>telemetria_csv/</code> contienen los registros del <strong>01 al 31 de Octubre de 2026</strong>.
              </span>
            </div>
            <button
              onClick={() => {
                const fTarget = datosRecorrido?.cobertura_csv?.fecha_max || "2026-10-31";
                setFechaFiltro(fTarget);
              }}
              style={{
                backgroundColor: "#d97706", color: "#ffffff", border: "none",
                padding: "6px 12px", borderRadius: "6px", fontSize: "11px",
                fontWeight: 700, cursor: "pointer", display: "inline-flex",
                alignItems: "center", gap: "6px",
              }}
            >
              Ver fecha con GPS ({datosRecorrido?.cobertura_csv?.fecha_max || "31/10/2026"}) →
            </button>
          </div>
        )
      )}

      {/* ── LÍNEA DE TIEMPO SUPERIOR (24 HORAS DEL DÍA) ─────────────── */}
      <div style={{
        backgroundColor: "#ffffff", padding: "14px 18px", borderRadius: "10px",
        border: "1px solid #e2e8f0", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#334155", display: "flex", alignItems: "center", gap: "6px" }}>
            <Clock size={15} color="#0284c7" />
            Línea de Tiempo del Día: {fechaFiltro}
            <span style={{ fontSize: "11px", fontWeight: 400, color: "#64748b" }}>
              (Haz clic en cualquier bloque para enfocar ese viaje)
            </span>
          </div>
          {/* Leyenda de Estados */}
          <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", color: "#64748b", flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", backgroundColor: "#16a34a", borderRadius: "2px" }} />
              En Viaje (Movimiento)
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", backgroundColor: "#f59e0b", borderRadius: "2px" }} />
              En Ralentí
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", backgroundColor: "#0284c7", borderRadius: "2px" }} />
              Encendido / Faena
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
              <span style={{ width: "10px", height: "10px", backgroundColor: "#cbd5e1", borderRadius: "2px" }} />
              Estacionado / Apagado
            </span>
          </div>
        </div>

        {/* Barra de 24 horas */}
        <div style={{
          position: "relative", width: "100%", height: "24px",
          backgroundColor: "#f1f5f9", borderRadius: "6px", overflow: "hidden",
          border: "1px solid #cbd5e1",
        }}>
          {/* Bloques de actividad en la línea de tiempo */}
          {(datosRecorrido?.timeline_bloques || []).map((b, idx) => {
            const leftPct = Math.max(0, Math.min(100, (b.inicio_min / 1440) * 100));
            const widthPct = Math.max(0.5, Math.min(100 - leftPct, ((b.fin_min - b.inicio_min) / 1440) * 100));

            return (
              <div
                key={idx}
                onClick={() => handleClickTimelineBloque(b)}
                title={`${b.label}\nHorario: ${b.hora_inicio} a ${b.hora_fin} (${b.duracion_min} min)\nChofer: ${b.conductor || "Sin chofer"}\n(Haz clic para enfocar este tramo en el mapa)`}
                style={{
                  position: "absolute",
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  top: 0,
                  bottom: 0,
                  backgroundColor: b.color,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = "0.75";
                  e.currentTarget.style.filter = "brightness(1.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.filter = "none";
                }}
              />
            );
          })}
        </div>

        {/* Marcas de horas (00:00, 04:00, 08:00, 12:00, 16:00, 20:00, 24:00) */}
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: "4px",
          fontSize: "10px", color: "#94a3b8", fontFamily: "monospace",
        }}>
          <span>00:00</span>
          <span>04:00</span>
          <span>08:00</span>
          <span>12:00</span>
          <span>16:00</span>
          <span>20:00</span>
          <span>23:59</span>
        </div>
      </div>

      {/* ── CONTENIDO PRINCIPAL: MAPA (IZQUIERDA) + PANEL RESUMEN (DERECHA) ── */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 380px", gap: "16px",
        minHeight: "640px",
      }}>
        {/* Contenedor del Mapa */}
        <div style={{
          position: "relative", backgroundColor: "#ffffff", borderRadius: "10px",
          border: "1px solid #e2e8f0", overflow: "hidden", minHeight: "640px",
          boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          {cargando && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 1000,
              backgroundColor: "rgba(255,255,255,0.75)", display: "flex",
              flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
            }}>
              <RefreshCw size={28} className="animate-spin" color="#0284c7" />
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#334155" }}>
                Trazando recorrido GPS en el mapa...
              </span>
            </div>
          )}

          {!cargando && (!datosRecorrido || datosRecorrido.puntos.length === 0) && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 500,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", padding: "20px", textAlign: "center",
              backgroundColor: "rgba(248, 250, 252, 0.8)",
            }}>
              <Car size={42} color="#cbd5e1" style={{ marginBottom: "12px" }} />
              <div style={{ fontSize: "16px", fontWeight: 600, color: "#334155" }}>
                Sin datos de recorrido para este día
              </div>
              <p style={{ fontSize: "13px", color: "#94a3b8", maxWidth: "400px", margin: "6px auto 14px" }}>
                Selecciona otra fecha en el calendario o verifica si el equipo tuvo viajes registrados.
              </p>
            </div>
          )}

          {/* Div que monta Leaflet */}
          <div ref={mapContainerRef} style={{ width: "100%", height: "100%", minHeight: "640px" }} />
        </div>

        {/* Panel Lateral Derecho: Resumen del Equipo y Viajes */}
        <div style={{
          backgroundColor: "#ffffff", borderRadius: "10px", border: "1px solid #e2e8f0",
          padding: "16px", display: "flex", flexDirection: "column", gap: "16px",
          maxHeight: "820px", overflowY: "auto", boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
        }}>
          {/* Ficha del Equipo */}
          <div style={{
            padding: "14px", backgroundColor: "#f8fafc", borderRadius: "8px",
            border: "1px solid #e2e8f0",
          }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
              <span style={{
                fontSize: "14px", fontWeight: 800, padding: "3px 8px",
                backgroundColor: "#0284c7", color: "#ffffff", borderRadius: "4px",
                fontFamily: "monospace", letterSpacing: "0.5px",
              }}>
                {formatearPatente(patenteSeleccionada) || "SIN PATENTE"}
              </span>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#16a34a", backgroundColor: "#dcfce7", padding: "2px 6px", borderRadius: "4px" }}>
                {datosRecorrido?.equipo?.tipo || "VEHÍCULO"}
              </span>
            </div>

            <div style={{ fontSize: "13px", fontWeight: 700, color: "#0f172a" }}>
              {datosRecorrido?.equipo?.codigo_interno || formatearPatente(patenteSeleccionada)}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px", lineHeight: "1.3" }}>
              {datosRecorrido?.equipo?.descripcion || "Flota de Maquinarias y Equipos"}
            </div>

            {datosRecorrido?.equipo && (
              <div style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #e2e8f0", fontSize: "11px", color: "#475569", display: "flex", flexDirection: "column", gap: "4px" }}>
                <div><strong>Proyecto:</strong> {datosRecorrido.equipo.proyecto}</div>
                <div><strong>Marca / Modelo:</strong> {datosRecorrido.equipo.marca || "-"} {datosRecorrido.equipo.modelo || ""}</div>
                <div><strong>Proveedor:</strong> {datosRecorrido.equipo.proveedor || "EIMISA"}</div>
              </div>
            )}
          </div>

          {/* Resumen de Métricas del Día */}
          <div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", marginBottom: "8px", textTransform: "uppercase" }}>
              Resumen del Día ({fechaFiltro})
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
              {/* Distancia */}
              <div style={{ padding: "10px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Navigation size={12} color="#0284c7" /> Distancia
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                  {datosRecorrido?.resumen?.total_km || 0} km
                </div>
              </div>

              {/* Tiempo */}
              <div style={{ padding: "10px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Clock size={12} color="#16a34a" /> Tiempo
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                  {datosRecorrido?.resumen?.total_horas || 0} hrs
                </div>
              </div>

              {/* Combustible */}
              <div style={{ padding: "10px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Fuel size={12} color="#8b5cf6" /> Combustible
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                  {datosRecorrido?.resumen?.total_combustible || 0} L
                </div>
              </div>

              {/* Viajes */}
              <div style={{ padding: "10px", backgroundColor: "#f8fafc", borderRadius: "6px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px" }}>
                  <Car size={12} color="#f59e0b" /> Viajes
                </div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f172a", marginTop: "4px" }}>
                  {datosRecorrido?.resumen?.total_viajes || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Listado de Viajes / Tramos */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>
                Tramos del Día ({datosRecorrido?.viajes?.length || 0})
              </div>
              {viajeSeleccionado && (
                <button
                  onClick={() => setViajeSeleccionado(null)}
                  style={{
                    fontSize: "11px", color: "#0284c7", background: "none",
                    border: "none", cursor: "pointer", fontWeight: 600, textDecoration: "underline",
                  }}
                >
                  Ver todos los tramos
                </button>
              )}
            </div>

            {(!datosRecorrido?.viajes || datosRecorrido.viajes.length === 0) ? (
              <div style={{ padding: "20px", textAlign: "center", fontSize: "12px", color: "#94a3b8" }}>
                No hay viajes registrados para este día
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {datosRecorrido.viajes.map((viaje, idx) => {
                  const esSeleccionado = viajeSeleccionado?.id === viaje.id;

                  return (
                    <div
                      key={viaje.id || idx}
                      onClick={() => enfocarViaje(viaje)}
                      style={{
                        padding: "10px 12px", borderRadius: "8px",
                        border: `2px solid ${esSeleccionado ? "#0284c7" : "#e2e8f0"}`,
                        backgroundColor: esSeleccionado ? "#f0f9ff" : "#ffffff",
                        cursor: "pointer", transition: "all 0.15s ease",
                        boxShadow: esSeleccionado ? "0 2px 6px rgba(2, 132, 199, 0.15)" : "none",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                        <span style={{ fontSize: "12px", fontWeight: 700, color: esSeleccionado ? "#0369a1" : "#0f172a" }}>
                          Viaje {idx + 1}: {viaje.hora_inicio || "--:--"} → {viaje.hora_fin || "--:--"}
                        </span>
                        <span style={{ fontSize: "11px", fontWeight: 700, color: "#0284c7" }}>
                          {viaje.km_recorridos} km
                        </span>
                      </div>

                      {/* Badges de seguimiento GPS y velocidad */}
                      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
                        {viaje.tiene_gps_detallado ? (
                          <span style={{
                            backgroundColor: "#dcfce7", color: "#166534",
                            fontSize: "10px", fontWeight: 700, padding: "2px 6px",
                            borderRadius: "4px", display: "inline-flex", alignItems: "center", gap: "3px",
                          }}>
                            ✓ {viaje.total_puntos_gps.toLocaleString("es-CL")} puntos GPS
                          </span>
                        ) : (
                          <span style={{
                            backgroundColor: "#f1f5f9", color: "#64748b",
                            fontSize: "10px", padding: "2px 6px", borderRadius: "4px",
                          }}>
                            2 puntos (Origen - Fin)
                          </span>
                        )}

                        {viaje.velocidad_maxima_gps > 0 && (
                          <span style={{ fontSize: "10px", color: "#475569", fontWeight: 500 }}>
                            Máx: <strong>{viaje.velocidad_maxima_gps} km/h</strong> (Prom: {viaje.velocidad_promedio_gps} km/h)
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "11px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px", marginBottom: "4px" }}>
                        <User size={11} /> {viaje.nombre_conductor || "Sin chofer identificado"}
                      </div>

                      <div style={{ fontSize: "10px", color: "#475569", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
                          <span style={{ color: "#16a34a", fontWeight: "bold" }}>●</span>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {viaje.lugar_inicio || "Inicio"}
                          </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "4px" }}>
                          <span style={{ color: "#dc2626", fontWeight: "bold" }}>●</span>
                          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {viaje.lugar_fin || "Destino"}
                          </span>
                        </div>
                      </div>

                      {esSeleccionado && (
                        <div style={{
                          marginTop: "8px", paddingTop: "6px", borderTop: "1px solid #bae6fd",
                          fontSize: "11px", fontWeight: 700, color: "#0284c7",
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                          <span>🎯 Tramo enfocado en el mapa</span>
                          <span style={{ fontSize: "10px", fontWeight: 600, color: "#0369a1" }}>Ver día completo ✕</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
