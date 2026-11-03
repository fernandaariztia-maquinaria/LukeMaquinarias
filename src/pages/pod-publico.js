import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Clock,
  Search,
  Users,
  Truck,
  Share2,
  Check,
  LayoutGrid,
  AlignLeft,
  Building2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const HORA_INI = 7;  // 07:00
const HORA_FIN = 18; // 18:00
const HORAS_TOTAL = HORA_FIN - HORA_INI; // 11 horas (660 min)

const COLOR_FALLBACK = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

function minFromStr(str) {
  const [h, m] = (str || "00:00").split(":").map(Number);
  return h * 60 + m;
}

function horaStr(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minToPct(min) {
  const clamp = Math.max(HORA_INI * 60, Math.min(HORA_FIN * 60, min));
  return ((clamp - HORA_INI * 60) / (HORAS_TOTAL * 60)) * 100;
}

function dateOffsetStr(base, offset) {
  const d = new Date(base + "T12:00:00");
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("sv-SE");
}

function formatFechaDMY(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  if (!y || !m || !d) return dateStr;
  return `${d} / ${m} / ${y}`;
}

function formatFechaCompleta(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const dias = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return `${dias[date.getDay()]} ${d} / ${m} / ${y}`;
}

// Calcula los tramos horarios libres de un equipo entre 07:00 y 18:00
function calcularDisponibilidadEquipo(bloquesEquipo, estadoActual, nowMin) {
  const esFalla =
    estadoActual === "Detenido por Falla" ||
    (estadoActual && estadoActual.toLowerCase().includes("panne")) ||
    (estadoActual && estadoActual.toLowerCase().includes("mantenci"));

  const rangosOcupados = (bloquesEquipo || [])
    .map(b => ({
      ini: Math.max(HORA_INI * 60, minFromStr(b.hora_inicio?.slice(0, 5))),
      fin: Math.min(HORA_FIN * 60, minFromStr(b.hora_fin?.slice(0, 5))),
      bloque: b,
    }))
    .filter(r => r.fin > r.ini)
    .sort((a, b) => a.ini - b.ini);

  // Fusionar posibles solapamientos para calcular ventanas libres exactas
  const merged = [];
  for (const r of rangosOcupados) {
    if (merged.length === 0 || merged[merged.length - 1].fin < r.ini) {
      merged.push({ ini: r.ini, fin: r.fin });
    } else {
      merged[merged.length - 1].fin = Math.max(merged[merged.length - 1].fin, r.fin);
    }
  }

  const ventanasLibres = [];
  let cursor = HORA_INI * 60;
  for (const m of merged) {
    if (m.ini > cursor) {
      ventanasLibres.push({ ini: cursor, fin: m.ini, texto: `${horaStr(cursor)}–${horaStr(m.ini)}` });
    }
    cursor = Math.max(cursor, m.fin);
  }
  if (cursor < HORA_FIN * 60) {
    ventanasLibres.push({ ini: cursor, fin: HORA_FIN * 60, texto: `${horaStr(cursor)}–${horaStr(HORA_FIN * 60)}` });
  }

  const minOcupados = merged.reduce((acc, m) => acc + (m.fin - m.ini), 0);
  const minLibres = Math.max(0, HORAS_TOTAL * 60 - minOcupados);
  const horasLibres = +(minLibres / 60).toFixed(1);
  const horasOcupadas = +(minOcupados / 60).toFixed(1);

  const bloqueActual =
    nowMin !== null
      ? rangosOcupados.find(r => nowMin >= r.ini && nowMin < r.fin)?.bloque || null
      : null;

  let estadoDisponibilidad = "DISPONIBLE_TOTAL"; // DISPONIBLE_TOTAL | DISPONIBLE_PARCIAL | OCUPADO_TOTAL | EN_FALLA
  if (esFalla) {
    estadoDisponibilidad = "EN_FALLA";
  } else if (minLibres === 0) {
    estadoDisponibilidad = "OCUPADO_TOTAL";
  } else if (minOcupados > 0) {
    estadoDisponibilidad = "DISPONIBLE_PARCIAL";
  }

  return {
    esFalla,
    ventanasLibres,
    horasLibres,
    horasOcupadas,
    bloqueActual,
    disponibleAhora: !esFalla && !bloqueActual,
    estadoDisponibilidad,
  };
}

export default function PodPublicoPage() {
  const router = useRouter();
  const dateInputRef = useRef(null);

  const hoy = useMemo(
    () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" }),
    []
  );
  const manana = useMemo(() => dateOffsetStr(hoy, 1), [hoy]);

  // Por defecto muestra el DÍA ACTUAL
  const [fecha, setFecha] = useState(hoy);
  const [proyectoId, setProyectoId] = useState("");
  const [especialidadId, setEspecialidadId] = useState("");
  const [filtroDisp, setFiltroDisp] = useState("TODOS"); // TODOS | LIBRES_AHORA | CON_VENTANA_LIBRE | ASIGNADOS | EN_FALLA
  const [search, setSearch] = useState("");
  const [vista, setVista] = useState("timeline"); // "timeline" | "tarjetas" | "supervisores"

  const [proyectos, setProyectos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [especialidades, setEspecialidades] = useState([]);
  const [bloques, setBloques] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [nowMin, setNowMin] = useState(null);

  // Hora actual en Chile para el indicador "Disponible ahora" y línea de tiempo en vivo
  useEffect(() => {
    const updateClock = () => {
      const nowStr = new Date().toLocaleTimeString("en-GB", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setNowMin(minFromStr(nowStr));
    };
    updateClock();
    const t = setInterval(updateClock, 30000);
    return () => clearInterval(t);
  }, []);

  // Inicializar filtros desde query params si vienen en la URL
  useEffect(() => {
    if (!router.isReady) return;
    if (router.query.fecha && typeof router.query.fecha === "string") {
      setFecha(router.query.fecha);
    }
    if (router.query.proyecto_id && typeof router.query.proyecto_id === "string") {
      setProyectoId(router.query.proyecto_id);
    }
  }, [router.isReady, router.query.fecha, router.query.proyecto_id]);

  // Cargar catálogos base (proyectos, equipos, especialidades)
  const cargarCatalogos = useCallback(async () => {
    try {
      const [jProy, jEq, jEsp] = await Promise.all([
        fetch("/api/proyectos").then(r => r.json()).catch(() => ({ data: [] })),
        fetch("/api/equipos?limit=500").then(r => r.json()).catch(() => ({ data: [] })),
        fetch("/api/especialidades").then(r => r.json()).catch(() => ({ data: [] })),
      ]);
      setProyectos(jProy.data || []);
      setEquipos(jEq.data || []);
      setEspecialidades(jEsp.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    cargarCatalogos();
  }, [cargarCatalogos]);

  // Cargar bloques POD
  const cargarBloques = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ fecha });
      if (proyectoId) params.set("proyecto_id", proyectoId);
      const r = await fetch(`/api/pod/bloques?${params.toString()}`);
      const json = await r.json();
      if (json.success) {
        setBloques(json.data || []);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Error cargando bloques POD públicos:", err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fecha, proyectoId]);

  useEffect(() => {
    cargarBloques(false);
    const interval = setInterval(() => {
      cargarBloques(true);
      cargarCatalogos();
    }, 15000);
    return () => clearInterval(interval);
  }, [cargarBloques, cargarCatalogos]);

  // Filtrado de bloques por especialidad
  const bloquesDelDia = useMemo(() => {
    return (bloques || []).filter(b => {
      if (especialidadId && b.especialidades?.id !== especialidadId) return false;
      return true;
    });
  }, [bloques, especialidadId]);

  // Calcular disponibilidad por cada equipo del proyecto
  const equiposConDisponibilidad = useMemo(() => {
    const esHoy = fecha === hoy;
    return (equipos || [])
      .filter(eq => !proyectoId || eq.proyecto_actual_id === proyectoId)
      .map(eq => {
        const bloquesEq = bloquesDelDia.filter(b => b.equipos?.id === eq.id);
        const disp = calcularDisponibilidadEquipo(bloquesEq, eq.estado_actual, esHoy ? nowMin : null);
        return {
          ...eq,
          bloquesEq,
          disp,
        };
      });
  }, [equipos, proyectoId, bloquesDelDia, fecha, hoy, nowMin]);

  // Aplicar filtros de búsqueda y disponibilidad
  const equiposFiltrados = useMemo(() => {
    return equiposConDisponibilidad
      .filter(eq => {
        if (filtroDisp === "LIBRES_AHORA" && !eq.disp.disponibleAhora) return false;
        if (filtroDisp === "CON_VENTANA_LIBRE" && (eq.disp.esFalla || eq.disp.horasLibres <= 0)) return false;
        if (filtroDisp === "ASIGNADOS" && eq.bloquesEq.length === 0) return false;
        if (filtroDisp === "EN_FALLA" && !eq.disp.esFalla) return false;
        if (especialidadId && eq.bloquesEq.length === 0) return false;

        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const matchEq =
          (eq.codigo_interno && eq.codigo_interno.toLowerCase().includes(q)) ||
          (eq.descripcion_equipo && eq.descripcion_equipo.toLowerCase().includes(q)) ||
          (eq.patente && eq.patente.toLowerCase().includes(q));
        const matchBloque = eq.bloquesEq.some(
          b =>
            (b.supervisor?.nombre_completo && b.supervisor.nombre_completo.toLowerCase().includes(q)) ||
            (b.especialidades?.nombre_oficial && b.especialidades.nombre_oficial.toLowerCase().includes(q)) ||
            (b.actividad_especifica && b.actividad_especifica.toLowerCase().includes(q))
        );
        return matchEq || matchBloque;
      })
      .sort((a, b) => (a.codigo_interno || "").localeCompare(b.codigo_interno || ""));
  }, [equiposConDisponibilidad, filtroDisp, especialidadId, search]);

  // Resumen de KPIs de disponibilidad del día
  const resumenDia = useMemo(() => {
    const total = equiposConDisponibilidad.length;
    const libresTotal = equiposConDisponibilidad.filter(e => e.disp.estadoDisponibilidad === "DISPONIBLE_TOTAL").length;
    const libresParcial = equiposConDisponibilidad.filter(e => e.disp.estadoDisponibilidad === "DISPONIBLE_PARCIAL").length;
    const ocupadosTotal = equiposConDisponibilidad.filter(e => e.disp.estadoDisponibilidad === "OCUPADO_TOTAL").length;
    const enFalla = equiposConDisponibilidad.filter(e => e.disp.estadoDisponibilidad === "EN_FALLA").length;
    const libresAhora = equiposConDisponibilidad.filter(e => e.disp.disponibleAhora).length;
    return { total, libresTotal, libresParcial, ocupadosTotal, enFalla, libresAhora };
  }, [equiposConDisponibilidad]);

  // Agrupación por supervisor
  const gruposPorSupervisor = useMemo(() => {
    const map = new Map();
    bloquesDelDia.forEach(b => {
      const supId = b.supervisor?.id || "sin-supervisor";
      const supNombre = b.supervisor?.nombre_completo || "Sin supervisor asignado";
      if (!map.has(supId)) {
        map.set(supId, {
          id: supId,
          nombre: supNombre,
          especialidad: b.especialidades?.nombre_oficial || null,
          color: b.especialidades?.color || "#10b981",
          bloques: [],
        });
      }
      map.get(supId).bloques.push(b);
    });
    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [bloquesDelDia]);

  const handleShareLink = () => {
    if (typeof window === "undefined") return;
    const url = new URL("/pod-publico", window.location.origin);
    url.searchParams.set("fecha", fecha);
    if (proyectoId) url.searchParams.set("proyecto_id", proyectoId);
    navigator.clipboard.writeText(url.toString()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const hours = Array.from({ length: HORAS_TOTAL + 1 }, (_, i) => HORA_INI + i);
  const esHoy = fecha === hoy;
  const showNowLine = esHoy && nowMin !== null && nowMin >= HORA_INI * 60 && nowMin <= HORA_FIN * 60;

  return (
    <>
      <Head>
        <title>Disponibilidad de Equipos y Sala POD — {formatFechaDMY(fecha)} · LukeEquipos</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div style={{
        minHeight: "100vh",
        background: "#0b1320",
        color: "#f8fafc",
        fontFamily: "'Poppins', sans-serif",
        paddingBottom: "48px",
      }}>
        {/* ── TOP BAR ── */}
        <header style={{
          background: "rgba(15, 23, 42, 0.94)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "14px 24px",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}>
          <div style={{
            maxWidth: "1560px",
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "14px",
          }}>
            {/* Marca + Título */}
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://www.eimontajes.com/wp-content/uploads/2025/09/logo-eimisa.svg"
                alt="EIMISA"
                style={{ height: "28px", filter: "brightness(0) invert(1)", opacity: 0.95 }}
              />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{
                    fontSize: "10px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px",
                    background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.35)",
                    padding: "2px 8px", borderRadius: "100px",
                  }}>
                    ● EN VIVO · CONSULTA PÚBLICA SIN LOGIN
                  </span>
                  {lastUpdated && (
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Actualizado {lastUpdated.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  )}
                </div>
                <h1 style={{ fontSize: "18px", fontWeight: 800, margin: "2px 0 0", color: "#ffffff" }}>
                  Disponibilidad de Equipos y Asignaciones POD
                </h1>
              </div>
            </div>

            {/* Controles de Fecha y Compartir */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={() => setFecha(hoy)}
                style={{
                  background: fecha === hoy ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${fecha === hoy ? "#10b981" : "rgba(255,255,255,0.1)"}`,
                  color: fecha === hoy ? "#10b981" : "#cbd5e1",
                  borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                }}
              >
                Hoy ({formatFechaDMY(hoy)})
              </button>
              <button
                onClick={() => setFecha(manana)}
                style={{
                  background: fecha === manana ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${fecha === manana ? "#10b981" : "rgba(255,255,255,0.1)"}`,
                  color: fecha === manana ? "#10b981" : "#cbd5e1",
                  borderRadius: "8px", padding: "6px 12px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                }}
              >
                Mañana
              </button>

              {/* Selector Día / Mes / Año */}
              <div style={{
                display: "flex", alignItems: "center", gap: "6px",
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: "10px", padding: "5px 10px",
              }}>
                <button
                  onClick={() => setFecha(dateOffsetStr(fecha, -1))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex" }}
                  title="Día anterior"
                >
                  <ChevronLeft size={16} />
                </button>
                <div
                  onClick={() => dateInputRef.current?.showPicker?.()}
                  style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "2px 6px" }}
                >
                  <Calendar size={14} color="#10b981" />
                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
                    {formatFechaDMY(fecha)}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={fecha}
                    onChange={e => e.target.value && setFecha(e.target.value)}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%", height: "100%" }}
                  />
                </div>
                <button
                  onClick={() => setFecha(dateOffsetStr(fecha, 1))}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", display: "flex" }}
                  title="Día siguiente"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <button
                onClick={() => cargarBloques(false)}
                style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "8px", padding: "7px 10px", cursor: "pointer", color: "#cbd5e1", display: "flex",
                }}
                title="Actualizar pizarra"
              >
                <RefreshCw size={15} className={loading ? "spin" : ""} />
              </button>

              <button
                onClick={handleShareLink}
                style={{
                  background: copied ? "rgba(16,185,129,0.2)" : "linear-gradient(135deg, #10b981, #059669)",
                  border: copied ? "1px solid #10b981" : "none",
                  borderRadius: "8px", padding: "7px 14px", cursor: "pointer",
                  color: "#fff", fontSize: "12px", fontWeight: 700,
                  display: "flex", alignItems: "center", gap: "6px",
                }}
              >
                {copied ? <><Check size={14} /> ¡Enlace copiado!</> : <><Share2 size={14} /> Compartir enlace</>}
              </button>
            </div>
          </div>
        </header>

        {/* ── MAIN CONTENT ── */}
        <main style={{ maxWidth: "1560px", margin: "20px auto 0", padding: "0 20px" }}>
          {/* ── TARJETAS KPI DE DISPONIBILIDAD DEL DÍA ── */}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "12px",
            marginBottom: "18px",
          }}>
            <div
              onClick={() => setFiltroDisp("TODOS")}
              style={{
                background: filtroDisp === "TODOS" ? "rgba(59,130,246,0.16)" : "rgba(30,41,59,0.65)",
                border: `1px solid ${filtroDisp === "TODOS" ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "12px", padding: "14px 16px", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "11px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase" }}>Total Equipos</div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#fff", marginTop: "2px" }}>{resumenDia.total}</div>
              <div style={{ fontSize: "11px", color: "#60a5fa" }}>📅 {formatFechaCompleta(fecha)}</div>
            </div>

            <div
              onClick={() => setFiltroDisp(filtroDisp === "LIBRES_AHORA" ? "TODOS" : "LIBRES_AHORA")}
              style={{
                background: filtroDisp === "LIBRES_AHORA" ? "rgba(16,185,129,0.2)" : "rgba(30,41,59,0.65)",
                border: `1px solid ${filtroDisp === "LIBRES_AHORA" ? "#10b981" : "rgba(16,185,129,0.25)"}`,
                borderRadius: "12px", padding: "14px 16px", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 700, textTransform: "uppercase" }}>
                🟢 {esHoy ? "Disponibles Ahora" : "100% Libres en el Día"}
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#10b981", marginTop: "2px" }}>
                {esHoy ? resumenDia.libresAhora : resumenDia.libresTotal}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                {resumenDia.libresTotal} sin bloques + {resumenDia.libresParcial} con horas libres
              </div>
            </div>

            <div
              onClick={() => setFiltroDisp(filtroDisp === "CON_VENTANA_LIBRE" ? "TODOS" : "CON_VENTANA_LIBRE")}
              style={{
                background: filtroDisp === "CON_VENTANA_LIBRE" ? "rgba(245,158,11,0.18)" : "rgba(30,41,59,0.65)",
                border: `1px solid ${filtroDisp === "CON_VENTANA_LIBRE" ? "#f59e0b" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "12px", padding: "14px 16px", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "11px", color: "#fbbf24", fontWeight: 700, textTransform: "uppercase" }}>
                🕒 Con Ventanas Libres Hoy
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#fbbf24", marginTop: "2px" }}>
                {resumenDia.libresTotal + resumenDia.libresParcial}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>Equipos con horas disponibles (07:00–18:00)</div>
            </div>

            <div
              onClick={() => setFiltroDisp(filtroDisp === "ASIGNADOS" ? "TODOS" : "ASIGNADOS")}
              style={{
                background: filtroDisp === "ASIGNADOS" ? "rgba(139,92,246,0.18)" : "rgba(30,41,59,0.65)",
                border: `1px solid ${filtroDisp === "ASIGNADOS" ? "#8b5cf6" : "rgba(255,255,255,0.08)"}`,
                borderRadius: "12px", padding: "14px 16px", cursor: "pointer",
              }}
            >
              <div style={{ fontSize: "11px", color: "#c4b5fd", fontWeight: 700, textTransform: "uppercase" }}>
                📋 Bloques POD Asignados
              </div>
              <div style={{ fontSize: "24px", fontWeight: 800, color: "#c4b5fd", marginTop: "2px" }}>
                {bloquesDelDia.length}
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>En {gruposPorSupervisor.length} supervisor(es)</div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div style={{
            background: "rgba(30, 41, 59, 0.65)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "14px",
            padding: "14px 16px",
            marginBottom: "18px",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", flex: 1, minWidth: "280px" }}>
              {/* Proyecto */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "6px 10px" }}>
                <Building2 size={14} color="#10b981" />
                <select
                  value={proyectoId}
                  onChange={e => setProyectoId(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "#f8fafc", fontSize: "12px", fontWeight: 600, outline: "none", cursor: "pointer" }}
                >
                  <option value="" style={{ background: "#0f172a" }}>Todos los proyectos</option>
                  {proyectos.map(p => (
                    <option key={p.id} value={p.id} style={{ background: "#0f172a" }}>
                      {p.codigo_cc} — {p.nombre_proyecto}
                    </option>
                  ))}
                </select>
              </div>

              {/* Disponibilidad */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "6px 10px" }}>
                <select
                  value={filtroDisp}
                  onChange={e => setFiltroDisp(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "#f8fafc", fontSize: "12px", fontWeight: 600, outline: "none", cursor: "pointer" }}
                >
                  <option value="TODOS" style={{ background: "#0f172a" }}>Todos los estados de disponibilidad</option>
                  <option value="LIBRES_AHORA" style={{ background: "#0f172a" }}>🟢 Disponibles ahora mismo</option>
                  <option value="CON_VENTANA_LIBRE" style={{ background: "#0f172a" }}>🕒 Con horas libres en el día</option>
                  <option value="ASIGNADOS" style={{ background: "#0f172a" }}>📋 Con bloques POD asignados</option>
                  <option value="EN_FALLA" style={{ background: "#0f172a" }}>🔴 Detenidos / En falla / Mantención</option>
                </select>
              </div>

              {/* Especialidad */}
              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "6px 10px" }}>
                <select
                  value={especialidadId}
                  onChange={e => setEspecialidadId(e.target.value)}
                  style={{ background: "transparent", border: "none", color: "#f8fafc", fontSize: "12px", fontWeight: 600, outline: "none", cursor: "pointer" }}
                >
                  <option value="" style={{ background: "#0f172a" }}>Todas las especialidades</option>
                  {especialidades.map(esp => (
                    <option key={esp.id} value={esp.id} style={{ background: "#0f172a" }}>
                      {esp.nombre_oficial}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buscador */}
              <div style={{
                display: "flex", alignItems: "center", gap: "8px", flex: 1, minWidth: "200px",
                background: "rgba(15,23,42,0.8)", border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "8px", padding: "6px 12px",
              }}>
                <Search size={14} color="#64748b" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar equipo, patente, supervisor o actividad..."
                  style={{
                    background: "transparent", border: "none", outline: "none",
                    color: "#f8fafc", fontSize: "12px", width: "100%", fontFamily: "inherit",
                  }}
                />
              </div>
            </div>

            {/* Selector de Vista Derecha */}
            <div style={{ display: "flex", gap: "6px", background: "rgba(15,23,42,0.8)", padding: "4px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)" }}>
              <button
                onClick={() => setVista("timeline")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: 700,
                  background: vista === "timeline" ? "#10b981" : "transparent",
                  color: vista === "timeline" ? "#04130b" : "#94a3b8",
                }}
              >
                <AlignLeft size={14} /> Pizarra y Disponibilidad
              </button>
              <button
                onClick={() => setVista("tarjetas")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: 700,
                  background: vista === "tarjetas" ? "#10b981" : "transparent",
                  color: vista === "tarjetas" ? "#04130b" : "#94a3b8",
                }}
              >
                <LayoutGrid size={14} /> Tarjetas por Equipo
              </button>
              <button
                onClick={() => setVista("supervisores")}
                style={{
                  display: "flex", alignItems: "center", gap: "6px",
                  padding: "6px 12px", borderRadius: "7px", border: "none", cursor: "pointer",
                  fontSize: "12px", fontWeight: 700,
                  background: vista === "supervisores" ? "#10b981" : "transparent",
                  color: vista === "supervisores" ? "#04130b" : "#94a3b8",
                }}
              >
                <Users size={14} /> Por Supervisor
              </button>
            </div>
          </div>

          {/* ══════════ VISTA 1: TIMELINE HORARIO + DISPONIBILIDAD ══════════ */}
          {vista === "timeline" && (
            <div style={{
              background: "#111c2d",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "14px",
              overflow: "hidden",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}>
              <div style={{ overflowX: "auto" }}>
                <div style={{ minWidth: "980px" }}>
                  {/* Cabecera de horas */}
                  <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#0d1624" }}>
                    <div style={{
                      width: "260px", flexShrink: 0, padding: "10px 14px",
                      borderRight: "1px solid rgba(255,255,255,0.08)",
                      fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase",
                    }}>
                      Equipo / Estado y Horas Libres
                    </div>
                    <div style={{ flex: 1, position: "relative", height: "34px" }}>
                      {hours.map(h => (
                        <div
                          key={h}
                          style={{
                            position: "absolute",
                            left: `${((h - HORA_INI) / HORAS_TOTAL) * 100}%`,
                            top: 0, bottom: 0,
                            transform: "translateX(-50%)",
                            display: "flex", alignItems: "center",
                            fontSize: "11px", fontWeight: 700, color: "#64748b",
                          }}
                        >
                          {String(h).padStart(2, "0")}:00
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Filas de equipos */}
                  {equiposFiltrados.length === 0 ? (
                    <div style={{ padding: "48px 20px", textAlign: "center", color: "#64748b", fontSize: "14px" }}>
                      No hay equipos que coincidan con el filtro seleccionado.
                    </div>
                  ) : (
                    equiposFiltrados.map((eq, idx) => {
                      const { disp, bloquesEq } = eq;
                      const badgeColor = disp.esFalla
                        ? "#ef4444"
                        : disp.disponibleAhora
                        ? "#10b981"
                        : "#f59e0b";
                      const badgeText = disp.esFalla
                        ? "Fuera de Servicio"
                        : disp.horasLibres === HORAS_TOTAL
                        ? "100% Disponible Hoy"
                        : disp.horasLibres > 0
                        ? `${disp.horasLibres}h libres hoy`
                        : "Ocupado todo el día";

                      return (
                        <div
                          key={eq.id}
                          style={{
                            display: "flex",
                            alignItems: "stretch",
                            minHeight: "68px",
                            borderBottom: "1px solid rgba(255,255,255,0.06)",
                            background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                          }}
                        >
                          {/* Columna Equipo + Resumen Disponibilidad */}
                          <div style={{
                            width: "260px", flexShrink: 0, padding: "10px 14px",
                            borderRight: "1px solid rgba(255,255,255,0.08)",
                            display: "flex", flexDirection: "column", justifyContent: "center", gap: "3px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span style={{ fontSize: "13px", fontWeight: 800, color: "#f8fafc" }}>
                                  {eq.codigo_interno}
                                </span>
                                {eq.patente && (
                                  <span style={{
                                    fontSize: "10px", fontWeight: 700, color: "#94a3b8",
                                    background: "rgba(255,255,255,0.06)", padding: "1px 6px", borderRadius: "4px",
                                  }}>
                                    {eq.patente}
                                  </span>
                                )}
                              </div>
                              <span style={{
                                fontSize: "10px", fontWeight: 800, color: badgeColor,
                                background: `${badgeColor}18`, border: `1px solid ${badgeColor}40`,
                                padding: "1px 7px", borderRadius: "100px", whiteSpace: "nowrap",
                              }}>
                                {badgeText}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "#94a3b8", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {eq.descripcion_equipo}
                            </div>
                            {!disp.esFalla && disp.ventanasLibres.length > 0 && disp.horasLibres < HORAS_TOTAL && (
                              <div style={{ fontSize: "10px", color: "#10b981", fontWeight: 600 }}>
                                🟢 Libre: {disp.ventanasLibres.map(v => v.texto).join(", ")}
                              </div>
                            )}
                          </div>

                          {/* Barra Horaria */}
                          <div style={{ flex: 1, position: "relative", minHeight: "68px" }}>
                            {/* Líneas verticales de hora */}
                            {hours.map((h, i) => (
                              <div
                                key={h}
                                style={{
                                  position: "absolute",
                                  left: `${(i / HORAS_TOTAL) * 100}%`,
                                  top: 0, bottom: 0,
                                  width: "1px",
                                  background: i === 0 || i === HORAS_TOTAL ? "transparent" : "rgba(255,255,255,0.05)",
                                }}
                              />
                            ))}

                            {/* Línea de hora actual si es hoy */}
                            {showNowLine && (
                              <div
                                title={`Hora actual: ${horaStr(nowMin)}`}
                                style={{
                                  position: "absolute",
                                  left: `${minToPct(nowMin)}%`,
                                  top: 0, bottom: 0,
                                  width: "2px",
                                  background: "#ef4444",
                                  zIndex: 5,
                                  pointerEvents: "none",
                                }}
                              />
                            )}

                            {/* Si no tiene bloques y no está en falla, mostrar franja verde suave de disponibilidad */}
                            {!disp.esFalla && bloquesEq.length === 0 && (
                              <div style={{
                                position: "absolute",
                                inset: "10px 8px",
                                borderRadius: "8px",
                                border: "1px dashed rgba(16,185,129,0.3)",
                                background: "rgba(16,185,129,0.04)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "11px",
                                fontWeight: 600,
                                color: "rgba(16,185,129,0.7)",
                              }}>
                                🟢 Disponible 07:00 – 18:00 (Sin asignación POD)
                              </div>
                            )}

                            {/* Bloques asignados del equipo */}
                            {bloquesEq.map((b, bIdx) => {
                              const iniMin = minFromStr(b.hora_inicio?.slice(0, 5));
                              const finMin = minFromStr(b.hora_fin?.slice(0, 5));
                              const left = minToPct(iniMin);
                              const width = Math.max(3, minToPct(finMin) - minToPct(iniMin));
                              const color = b.especialidades?.color || COLOR_FALLBACK[bIdx % COLOR_FALLBACK.length];
                              const supName = b.supervisor?.nombre_completo || "Supervisor";
                              const espName = b.especialidades?.nombre_oficial || "";
                              const actText = b.actividad_especifica || b.actividades?.descripcion || "Sin detalle de tarea";

                              return (
                                <div
                                  key={b.id}
                                  title={`${supName} (${espName})\nHorario: ${b.hora_inicio?.slice(0, 5)} – ${b.hora_fin?.slice(0, 5)}\nLabor: ${actText}`}
                                  style={{
                                    position: "absolute",
                                    left: `${left}%`,
                                    width: `${width}%`,
                                    top: "6px",
                                    bottom: "6px",
                                    background: `${color}28`,
                                    border: `2px solid ${color}`,
                                    borderRadius: "8px",
                                    padding: "4px 8px",
                                    overflow: "hidden",
                                    display: "flex",
                                    flexDirection: "column",
                                    justifyContent: "center",
                                    zIndex: 2,
                                  }}
                                >
                                  <div style={{ fontSize: "11px", fontWeight: 800, color: "#ffffff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {supName.split(" ").slice(0, 2).join(" ")}
                                    {espName ? ` · ${espName}` : ""}
                                  </div>
                                  <div style={{ fontSize: "10px", color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                    {b.hora_inicio?.slice(0, 5)}–{b.hora_fin?.slice(0, 5)} · {actText}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══════════ VISTA 2: TARJETAS POR EQUIPO (DISPONIBILIDAD Y BLOQUES) ══════════ */}
          {vista === "tarjetas" && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "16px",
            }}>
              {equiposFiltrados.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", padding: "48px 20px", textAlign: "center", color: "#64748b", background: "#111c2d", borderRadius: "14px" }}>
                  No hay equipos que coincidan con el filtro seleccionado.
                </div>
              ) : (
                equiposFiltrados.map(eq => {
                  const { disp, bloquesEq } = eq;
                  const statusColor = disp.esFalla ? "#ef4444" : disp.disponibleAhora ? "#10b981" : "#f59e0b";

                  return (
                    <div
                      key={eq.id}
                      style={{
                        background: "#111c2d",
                        border: `1px solid ${statusColor}35`,
                        borderRadius: "14px",
                        padding: "16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Truck size={16} color={statusColor} />
                            <span style={{ fontSize: "15px", fontWeight: 800, color: "#fff" }}>{eq.codigo_interno}</span>
                            {eq.patente && (
                              <span style={{ fontSize: "11px", color: "#94a3b8", background: "rgba(255,255,255,0.06)", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                                {eq.patente}
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                            {eq.descripcion_equipo}
                          </div>
                        </div>
                        <span style={{
                          fontSize: "11px", fontWeight: 800, color: statusColor,
                          background: `${statusColor}18`, border: `1px solid ${statusColor}40`,
                          padding: "3px 9px", borderRadius: "100px",
                        }}>
                          {disp.esFalla
                            ? "🔴 En Falla / Mant."
                            : disp.disponibleAhora
                            ? "🟢 Disponible Ahora"
                            : "🟡 En Uso Ahora"}
                        </span>
                      </div>

                      {/* Ventanas de disponibilidad hoy */}
                      {!disp.esFalla && (
                        <div style={{
                          background: "rgba(16,185,129,0.08)",
                          border: "1px solid rgba(16,185,129,0.2)",
                          borderRadius: "8px",
                          padding: "8px 12px",
                          fontSize: "11px",
                        }}>
                          <div style={{ fontWeight: 700, color: "#10b981", marginBottom: "2px" }}>
                            🕒 Disponibilidad del día ({disp.horasLibres} hrs libres de 11 hrs):
                          </div>
                          <div style={{ color: "#cbd5e1" }}>
                            {disp.ventanasLibres.length === 0
                              ? "Sin horas libres hoy (asignado de 07:00 a 18:00)"
                              : disp.ventanasLibres.map(v => v.texto).join(" · ")}
                          </div>
                        </div>
                      )}

                      {/* Bloques asignados */}
                      {bloquesEq.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {bloquesEq.map(b => {
                            const color = b.especialidades?.color || "#3b82f6";
                            const actText = b.actividad_especifica || b.actividades?.descripcion || "Sin actividad especificada";
                            return (
                              <div
                                key={b.id}
                                style={{
                                  background: `${color}15`,
                                  borderLeft: `4px solid ${color}`,
                                  borderRadius: "8px",
                                  padding: "10px 12px",
                                }}
                              >
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#fff", display: "flex", alignItems: "center", gap: "5px" }}>
                                    <Clock size={12} color={color} />
                                    Ocupado: {b.hora_inicio?.slice(0, 5)} – {b.hora_fin?.slice(0, 5)}
                                  </span>
                                  {b.especialidades?.nombre_oficial && (
                                    <span style={{
                                      fontSize: "10px", fontWeight: 800, color,
                                      background: `${color}25`, padding: "2px 8px", borderRadius: "100px",
                                    }}>
                                      {b.especialidades.nombre_oficial}
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0" }}>
                                  👷 {b.supervisor?.nombre_completo || "Sin supervisor"}
                                </div>
                                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "4px", lineHeight: 1.4 }}>
                                  📌 {actText}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ══════════ VISTA 3: POR SUPERVISOR ══════════ */}
          {vista === "supervisores" && (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
              gap: "16px",
            }}>
              {gruposPorSupervisor.length === 0 ? (
                <div style={{ gridColumn: "1 / -1", padding: "48px 20px", textAlign: "center", color: "#64748b", background: "#111c2d", borderRadius: "14px" }}>
                  No hay supervisores con bloques asignados para esta fecha.
                </div>
              ) : (
                gruposPorSupervisor.map(grupo => (
                  <div
                    key={grupo.id}
                    style={{
                      background: "#111c2d",
                      border: `1px solid ${grupo.color}40`,
                      borderRadius: "14px",
                      padding: "16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "10px" }}>
                      <div style={{
                        width: "38px", height: "38px", borderRadius: "50%",
                        background: `${grupo.color}25`, border: `2px solid ${grupo.color}`,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: "13px", fontWeight: 800, color: grupo.color,
                      }}>
                        {grupo.nombre.split(" ").map(n => n[0]).slice(0, 2).join("")}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff" }}>{grupo.nombre}</div>
                        {grupo.especialidad && (
                          <div style={{ fontSize: "11px", fontWeight: 700, color: grupo.color }}>{grupo.especialidad}</div>
                        )}
                      </div>
                      <span style={{
                        fontSize: "11px", fontWeight: 800, color: grupo.color,
                        background: `${grupo.color}20`, padding: "3px 8px", borderRadius: "6px",
                      }}>
                        {grupo.bloques.length} eq.
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {grupo.bloques.map(b => (
                        <div
                          key={b.id}
                          style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.07)",
                            borderRadius: "8px",
                            padding: "10px 12px",
                          }}
                        >
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                            <span style={{ fontSize: "13px", fontWeight: 800, color: "#10b981" }}>
                              🚜 {b.equipos?.codigo_interno} {b.equipos?.patente ? `(${b.equipos.patente})` : ""}
                            </span>
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#cbd5e1" }}>
                              {b.hora_inicio?.slice(0, 5)} – {b.hora_fin?.slice(0, 5)}
                            </span>
                          </div>
                          <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                            {b.equipos?.descripcion_equipo}
                          </div>
                          {(b.actividad_especifica || b.actividades?.descripcion) && (
                            <div style={{ fontSize: "11px", color: "#e2e8f0", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                              📌 {b.actividad_especifica || b.actividades?.descripcion}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </main>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          .spin { animation: spin 1s linear infinite; }
        `}</style>
      </div>
    </>
  );
}
