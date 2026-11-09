import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  History, Calendar, Building2, MapPin, Clock, Plus, Trash2,
  Pencil, CheckCircle2, AlertCircle, X, ArrowRight, ShieldCheck,
  FileText, CornerDownRight, AlertTriangle
} from "lucide-react";
import { formatEquipoLabel } from "../../lib/equipoLabel";

export default function HistorialUbicacionesModal({
  equipo,
  proyectos = [],
  currentUser,
  onClose,
  onAsignacionCambiada,
}) {
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [exitoMsg, setExitoMsg] = useState("");

  // Estado para formulario de nuevo movimiento manual o edición
  const [modoForm, setModoForm] = useState(null); // null | "nuevo" | "editar"
  const [itemEditando, setItemEditando] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const hoyStr = new Date().toISOString().slice(0, 10);

  const [formMovimiento, setFormMovimiento] = useState({
    proyecto_id: "",
    fecha_inicio: hoyStr,
    fecha_fin_estimada: "",
    fecha_fin_real: "",
    fecha_salida_anterior: hoyStr,
    motivo_traslado: "",
    estado: "ACTIVA",
  });

  // Cargar historial del equipo desde la API
  const cargarHistorial = useCallback(async () => {
    if (!equipo?.id) return;
    setCargando(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/equipos/historial-ubicaciones?equipo_id=${equipo.id}`);
      const json = await res.json();
      if (json.success) {
        setHistorial(json.data || []);
      } else {
        setErrorMsg(json.error || "Error al cargar historial.");
      }
    } catch (err) {
      console.error("[HistorialUbicacionesModal] Error:", err);
      setErrorMsg("Error de conexión al cargar historial.");
    } finally {
      setCargando(false);
    }
  }, [equipo?.id]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  // Formatear fechas legibles dd/mm/yyyy
  const fmtFecha = (f) => {
    if (!f) return "—";
    const partes = f.slice(0, 10).split("-");
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return f;
  };

  // Asignación actualmente activa
  const asignacionActiva = useMemo(() => {
    return historial.find((h) => h.estado === "ACTIVA") || null;
  }, [historial]);

  // Total de días en la obra actual
  const diasEnObraActual = useMemo(() => {
    if (!asignacionActiva?.fecha_inicio) return 0;
    const d1 = new Date(`${asignacionActiva.fecha_inicio}T00:00:00`);
    const d2 = new Date();
    const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [asignacionActiva]);

  // Total de obras distintas en las que ha estado
  const totalObrasDistintas = useMemo(() => {
    const set = new Set();
    historial.forEach((h) => {
      if (h.proyecto_id) set.add(h.proyecto_id);
      else if (h.proyecto_nombre) set.add(h.proyecto_nombre);
    });
    return set.size;
  }, [historial]);

  // Abrir formulario para registrar nuevo traslado
  const abrirFormNuevo = () => {
    setFormMovimiento({
      proyecto_id: "",
      fecha_inicio: hoyStr,
      fecha_fin_estimada: "",
      fecha_fin_real: "",
      fecha_salida_anterior: hoyStr,
      motivo_traslado: "",
      estado: "ACTIVA",
    });
    setItemEditando(null);
    setModoForm("nuevo");
    setErrorMsg("");
    setExitoMsg("");
  };

  // Abrir formulario para editar un registro existente
  const abrirFormEditar = (item) => {
    setItemEditando(item);
    setFormMovimiento({
      proyecto_id: item.proyecto_id || "",
      fecha_inicio: item.fecha_inicio || hoyStr,
      fecha_fin_estimada: item.fecha_fin_estimada || "",
      fecha_fin_real: item.fecha_fin_real || "",
      fecha_salida_anterior: item.fecha_fin_real || hoyStr,
      motivo_traslado: item.motivo_traslado || "",
      estado: item.estado || "ACTIVA",
    });
    setModoForm("editar");
    setErrorMsg("");
    setExitoMsg("");
  };

  // Guardar nuevo traslado o actualización
  const handleGuardarMovimiento = async (e) => {
    e.preventDefault();
    if (!formMovimiento.fecha_inicio) {
      setErrorMsg("Debes indicar la fecha de inicio de la asignación.");
      return;
    }

    setGuardando(true);
    setErrorMsg("");
    setExitoMsg("");

    try {
      const proyFound = proyectos.find((p) => p.id === formMovimiento.proyecto_id);
      const proyNom = proyFound ? proyFound.nombre_proyecto : (formMovimiento.proyecto_id ? "Obra Asignada" : "Sin Asignar / En Patio");
      const proyCc = proyFound ? proyFound.codigo_cc || "" : "";

      if (modoForm === "nuevo") {
        const body = {
          equipo_id: equipo.id,
          proyecto_id: formMovimiento.proyecto_id || null,
          proyecto_nombre: proyNom,
          proyecto_cc: proyCc,
          fecha_inicio: formMovimiento.fecha_inicio,
          fecha_fin_estimada: formMovimiento.fecha_fin_estimada || null,
          fecha_salida_anterior: formMovimiento.fecha_salida_anterior || formMovimiento.fecha_inicio,
          motivo_traslado: formMovimiento.motivo_traslado.trim() || (formMovimiento.proyecto_id ? "Traslado / Asignación de obra" : "Desasignación / En patio"),
          registrado_por: currentUser?.nombre_completo || "Administrador",
        };

        const res = await fetch("/api/equipos/historial-ubicaciones", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "No se pudo registrar el movimiento.");

        setExitoMsg("✅ Movimiento de obra registrado exitosamente.");
      } else if (modoForm === "editar" && itemEditando) {
        const body = {
          id: itemEditando.id,
          fecha_inicio: formMovimiento.fecha_inicio,
          fecha_fin_estimada: formMovimiento.fecha_fin_estimada || null,
          fecha_fin_real: formMovimiento.fecha_fin_real || null,
          motivo_traslado: formMovimiento.motivo_traslado.trim(),
          estado: formMovimiento.estado,
        };

        const res = await fetch("/api/equipos/historial-ubicaciones", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || "No se pudo actualizar el registro.");

        setExitoMsg("✅ Registro de historial actualizado.");
      }

      setModoForm(null);
      await cargarHistorial();
      if (onAsignacionCambiada) onAsignacionCambiada();
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Error al guardar el movimiento.");
    } finally {
      setGuardando(false);
    }
  };

  // Eliminar un registro puntual
  const handleEliminarItem = async (id) => {
    if (!confirm("¿Estás seguro de eliminar este registro del historial?")) return;
    try {
      const res = await fetch("/api/equipos/historial-ubicaciones", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, equipo_id: equipo.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error al eliminar.");
      setExitoMsg("Registro eliminado.");
      await cargarHistorial();
      if (onAsignacionCambiada) onAsignacionCambiada();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      backgroundColor: "rgba(15, 23, 42, 0.75)",
      backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        backgroundColor: "#ffffff",
        width: "100%", maxWidth: "880px",
        maxHeight: "92vh",
        borderRadius: "16px",
        boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        display: "flex", flexDirection: "column",
        overflow: "hidden", border: "1.5px solid #cbd5e1",
      }}>
        {/* Cabecera del Modal */}
        <div style={{
          backgroundColor: "#0f172a", color: "#ffffff",
          padding: "18px 24px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid #334155",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{
              backgroundColor: "#0284c7", width: "40px", height: "40px",
              borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(2, 132, 199, 0.4)",
            }}>
              <History size={22} color="#ffffff" />
            </div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "17px", fontWeight: 800, letterSpacing: "-0.3px" }}>
                  Historial de Obras y Ubicaciones
                </span>
                <span style={{
                  backgroundColor: "#38bdf8", color: "#0f172a",
                  padding: "2px 8px", borderRadius: "6px", fontSize: "11px", fontWeight: 800,
                }}>
                  {formatEquipoLabel(equipo)}
                </span>
              </div>
              <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>
                {equipo.descripcion_equipo} {equipo.patente ? `· Patente: ${equipo.patente}` : ""}
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              backgroundColor: "rgba(255,255,255,0.1)",
              border: "none", color: "#ffffff",
              width: "32px", height: "32px", borderRadius: "8px",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.2)")}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)")}
          >
            <X size={18} />
          </button>
        </div>

        {/* Notificaciones */}
        {errorMsg && (
          <div style={{
            backgroundColor: "#fee2e2", borderBottom: "1px solid #fca5a5",
            padding: "10px 24px", color: "#b91c1c", fontSize: "13px", fontWeight: 600,
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <AlertCircle size={16} /> {errorMsg}
          </div>
        )}
        {exitoMsg && (
          <div style={{
            backgroundColor: "#ecfdf5", borderBottom: "1px solid #a7f3d0",
            padding: "10px 24px", color: "#047857", fontSize: "13px", fontWeight: 600,
            display: "flex", alignItems: "center", gap: "8px",
          }}>
            <CheckCircle2 size={16} /> {exitoMsg}
          </div>
        )}

        {/* Tarjetas KPI Superiores */}
        <div style={{
          backgroundColor: "#f8fafc", padding: "14px 24px",
          borderBottom: "1px solid #e2e8f0",
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "12px",
        }}>
          {/* Tarjeta Obra Actual */}
          <div style={{
            backgroundColor: "#ffffff", padding: "10px 14px", borderRadius: "10px",
            border: "1.5px solid #cbd5e1",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
              <MapPin size={13} color="#0284c7" />
              Obra Actual
            </div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a", marginTop: "4px" }}>
              {asignacionActiva?.proyecto_nombre || (equipo.proyectos?.nombre_proyecto || "Sin Asignar / En Patio")}
            </div>
            <div style={{ fontSize: "11px", color: "#0284c7", fontWeight: 700, marginTop: "2px" }}>
              {asignacionActiva?.proyecto_cc ? `Código: ${asignacionActiva.proyecto_cc}` : ""}
            </div>
          </div>

          {/* Tarjeta Días en Faena */}
          <div style={{
            backgroundColor: "#ffffff", padding: "10px 14px", borderRadius: "10px",
            border: "1.5px solid #cbd5e1",
          }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", display: "flex", alignItems: "center", gap: "5px" }}>
              <Clock size={13} color="#16a34a" />
              Permanencia Actual
            </div>
            <div style={{ fontSize: "14px", fontWeight: 800, color: "#16a34a", marginTop: "4px" }}>
              {asignacionActiva ? `${diasEnObraActual} días reales en faena` : "En Taller / Patio"}
            </div>
            <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>
              {asignacionActiva ? `Desde el ${fmtFecha(asignacionActiva.fecha_inicio)}` : "Disponible"}
            </div>
          </div>

          {/* Tarjeta Obras Históricas */}
          <div style={{
            backgroundColor: "#ffffff", padding: "10px 14px", borderRadius: "10px",
            border: "1.5px solid #cbd5e1", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                Total Faenas
              </div>
              <div style={{ fontSize: "18px", fontWeight: 800, color: "#0f172a", marginTop: "2px" }}>
                {totalObrasDistintas} <span style={{ fontSize: "12px", fontWeight: 500, color: "#64748b" }}>obras distintas</span>
              </div>
            </div>

            <button
              onClick={abrirFormNuevo}
              style={{
                backgroundColor: "#0284c7", color: "#ffffff",
                border: "none", padding: "8px 12px", borderRadius: "8px",
                fontSize: "12px", fontWeight: 700, cursor: "pointer",
                display: "inline-flex", alignItems: "center", gap: "6px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.3)",
              }}
            >
              <Plus size={15} /> Trasladar / Asignar
            </button>
          </div>
        </div>

        {/* Contenido Desplazable */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {/* Formulario Inline de Registro / Edición */}
          {modoForm && (
            <form
              onSubmit={handleGuardarMovimiento}
              style={{
                backgroundColor: "#f0f9ff",
                border: "2px solid #0284c7",
                borderRadius: "12px",
                padding: "16px 18px",
                marginBottom: "20px",
                display: "flex", flexDirection: "column", gap: "12px",
                boxShadow: "0 4px 12px rgba(2, 132, 199, 0.12)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid #bae6fd", paddingBottom: "8px" }}>
                <span style={{ fontSize: "14px", fontWeight: 800, color: "#0369a1", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Building2 size={16} />
                  {modoForm === "nuevo" ? "Registrar Traslado / Asignación de Obra" : "Modificar Registro de Asignación"}
                </span>
                <button
                  type="button"
                  onClick={() => setModoForm(null)}
                  style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}
                >
                  <X size={16} />
                </button>
              </div>

              {modoForm === "nuevo" && asignacionActiva && (
                <div style={{
                  backgroundColor: "#fef3c7", border: "1px solid #fde68a",
                  padding: "8px 12px", borderRadius: "6px", fontSize: "12px", color: "#92400e",
                  display: "flex", alignItems: "center", gap: "8px",
                }}>
                  <AlertTriangle size={15} color="#d97706" />
                  <span>
                    El equipo está actualmente en <strong>{asignacionActiva.proyecto_nombre}</strong>.
                    Al asignar la nueva obra se cerrará automáticamente la estadía anterior con la fecha de salida real indicada.
                  </span>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                {/* Selector de Obra Destino */}
                {modoForm === "nuevo" && (
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                      Nueva Obra / Faena Destino:
                    </label>
                    <select
                      value={formMovimiento.proyecto_id}
                      onChange={(e) => setFormMovimiento({ ...formMovimiento, proyecto_id: e.target.value })}
                      style={{
                        width: "100%", padding: "7px 10px", borderRadius: "6px",
                        border: "1.5px solid #0284c7", fontSize: "12px", fontWeight: 600,
                        backgroundColor: "#ffffff", color: "#0f172a", outline: "none",
                      }}
                    >
                      <option value="">-- Sin Asignar / En Patio o Taller --</option>
                      {proyectos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigo_cc ? `[${p.codigo_cc}] ` : ""}{p.nombre_proyecto}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Fecha Inicio de Asignación */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                    Fecha Inicio en la Obra:
                  </label>
                  <input
                    type="date"
                    required
                    value={formMovimiento.fecha_inicio}
                    onChange={(e) => setFormMovimiento({ ...formMovimiento, fecha_inicio: e.target.value })}
                    style={{
                      width: "100%", padding: "6px 8px", borderRadius: "6px",
                      border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600,
                      backgroundColor: "#ffffff", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Fecha Fin Estimada / Planificada */}
                <div>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                    Fecha Término Estimada (Planificada):
                  </label>
                  <input
                    type="date"
                    placeholder="Opcional"
                    value={formMovimiento.fecha_fin_estimada}
                    onChange={(e) => setFormMovimiento({ ...formMovimiento, fecha_fin_estimada: e.target.value })}
                    style={{
                      width: "100%", padding: "6px 8px", borderRadius: "6px",
                      border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600,
                      backgroundColor: "#ffffff", outline: "none", boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Fecha Salida Real de Obra Anterior (solo en nuevo traslado con obra previa) */}
                {modoForm === "nuevo" && asignacionActiva && (
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#b45309", marginBottom: "4px" }}>
                      Fecha Real de Salida de Obra Anterior:
                    </label>
                    <input
                      type="date"
                      value={formMovimiento.fecha_salida_anterior}
                      onChange={(e) => setFormMovimiento({ ...formMovimiento, fecha_salida_anterior: e.target.value })}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: "6px",
                        border: "1.5px solid #f59e0b", fontSize: "12px", fontWeight: 600,
                        backgroundColor: "#ffffff", outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}

                {/* Si está en edición, permitir cambiar fecha fin real directamente */}
                {modoForm === "editar" && (
                  <div>
                    <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                      Fecha Término Real (Salida de Obra):
                    </label>
                    <input
                      type="date"
                      value={formMovimiento.fecha_fin_real}
                      onChange={(e) => setFormMovimiento({ ...formMovimiento, fecha_fin_real: e.target.value })}
                      style={{
                        width: "100%", padding: "6px 8px", borderRadius: "6px",
                        border: "1px solid #cbd5e1", fontSize: "12px", fontWeight: 600,
                        backgroundColor: "#ffffff", outline: "none", boxSizing: "border-box",
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Motivo / Notas del Traslado */}
              <div>
                <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#1e293b", marginBottom: "4px" }}>
                  Motivo del Traslado / Observaciones:
                </label>
                <input
                  type="text"
                  placeholder="Ej: Movilización solicitada por operaciones, fin de etapa de montaje, etc."
                  value={formMovimiento.motivo_traslado}
                  onChange={(e) => setFormMovimiento({ ...formMovimiento, motivo_traslado: e.target.value })}
                  style={{
                    width: "100%", padding: "6px 10px", borderRadius: "6px",
                    border: "1px solid #cbd5e1", fontSize: "12px",
                    backgroundColor: "#ffffff", outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                <button
                  type="button"
                  onClick={() => setModoForm(null)}
                  style={{
                    padding: "6px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                    border: "1px solid #cbd5e1", backgroundColor: "#ffffff", color: "#475569", cursor: "pointer",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  style={{
                    padding: "6px 16px", borderRadius: "6px", fontSize: "12px", fontWeight: 700,
                    backgroundColor: "#0284c7", color: "#ffffff", border: "none", cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(2, 132, 199, 0.3)",
                  }}
                >
                  {guardando ? "Guardando..." : "Confirmar y Guardar Asignación"}
                </button>
              </div>
            </form>
          )}

          {/* Listado Cronológico de Asignaciones */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
            <span style={{ fontSize: "13px", fontWeight: 800, color: "#334155", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Línea de Tiempo de Movimientos ({historial.length})
            </span>
            <span style={{ fontSize: "11px", color: "#64748b" }}>
              Ordenado de la más reciente a la más antigua
            </span>
          </div>

          {cargando ? (
            <div style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
              Cargando historial de ubicaciones...
            </div>
          ) : historial.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "36px 20px", borderRadius: "12px",
              border: "2px dashed #cbd5e1", backgroundColor: "#f8fafc", color: "#64748b",
            }}>
              <History size={32} color="#94a3b8" style={{ margin: "0 auto 8px" }} />
              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "14px" }}>
                Sin historial previo registrado
              </div>
              <p style={{ fontSize: "12px", margin: "4px 0 12px" }}>
                Este equipo aún no registra traslados. Puedes registrar su primera asignación con el botón superior.
              </p>
              <button
                onClick={abrirFormNuevo}
                style={{
                  backgroundColor: "#0284c7", color: "#ffffff",
                  border: "none", padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 700, cursor: "pointer",
                }}
              >
                + Registrar Primera Asignación
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {historial.map((item, idx) => {
                const esActiva = item.estado === "ACTIVA";
                const dias = item.dias_reales !== undefined ? item.dias_reales : 0;

                return (
                  <div
                    key={item.id || idx}
                    style={{
                      backgroundColor: esActiva ? "#ffffff" : "#f8fafc",
                      border: esActiva ? "2px solid #10b981" : "1.5px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "14px 16px",
                      display: "flex", flexDirection: "column", gap: "8px",
                      boxShadow: esActiva ? "0 2px 8px rgba(16, 185, 129, 0.12)" : "none",
                    }}
                  >
                    {/* Fila 1: Obra y Estado */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{
                          backgroundColor: esActiva ? "#dcfce7" : "#e2e8f0",
                          color: esActiva ? "#15803d" : "#475569",
                          width: "28px", height: "28px", borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: "12px", fontWeight: 800,
                        }}>
                          {esActiva ? "📍" : "🏁"}
                        </div>
                        <div>
                          <span style={{ fontSize: "14px", fontWeight: 800, color: "#0f172a" }}>
                            {item.proyecto_nombre || "Sin Asignar / En Patio"}
                          </span>
                          {item.proyecto_cc && (
                            <span style={{
                              marginLeft: "6px", backgroundColor: "#e0f2fe", color: "#0369a1",
                              fontSize: "10px", fontWeight: 800, padding: "2px 6px", borderRadius: "4px",
                            }}>
                              {item.proyecto_cc}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{
                          backgroundColor: esActiva ? "#dcfce7" : "#f1f5f9",
                          color: esActiva ? "#15803d" : "#475569",
                          border: esActiva ? "1px solid #86efac" : "1px solid #cbd5e1",
                          padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: 800,
                          display: "inline-flex", alignItems: "center", gap: "4px",
                        }}>
                          {esActiva ? "🟢 ACTIVA EN FAENA" : "⚪ FINALIZADA"}
                        </span>

                        <button
                          onClick={() => abrirFormEditar(item)}
                          title="Editar fechas o notas de este registro"
                          style={{
                            background: "none", border: "none", color: "#64748b",
                            cursor: "pointer", padding: "4px", borderRadius: "4px",
                          }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleEliminarItem(item.id)}
                          title="Eliminar este registro"
                          style={{
                            background: "none", border: "none", color: "#ef4444",
                            cursor: "pointer", padding: "4px", borderRadius: "4px",
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Fila 2: Fechas y Permanencia Real */}
                    <div style={{
                      display: "flex", flexWrap: "wrap", alignItems: "center",
                      gap: "16px", fontSize: "12px", color: "#475569",
                      paddingTop: "6px", borderTop: "1px dashed #e2e8f0",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <Calendar size={13} color="#0284c7" />
                        <span><strong>Desde:</strong> {fmtFecha(item.fecha_inicio)}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                        <ArrowRight size={13} color="#64748b" />
                        <span>
                          <strong>Fecha Salida Real:</strong>{" "}
                          {item.fecha_fin_real ? (
                            <span style={{ color: "#b91c1c", fontWeight: 700 }}>{fmtFecha(item.fecha_fin_real)}</span>
                          ) : (
                            <span style={{ color: "#16a34a", fontWeight: 700 }}>Actualmente en Obra</span>
                          )}
                        </span>
                      </div>

                      {item.fecha_fin_estimada && (
                        <div style={{ fontSize: "11px", color: "#64748b" }}>
                          (Planificada originalmente hasta: {fmtFecha(item.fecha_fin_estimada)})
                        </div>
                      )}

                      <div style={{
                        marginLeft: "auto",
                        backgroundColor: esActiva ? "#eff6ff" : "#f1f5f9",
                        color: esActiva ? "#1d4ed8" : "#334155",
                        fontWeight: 700, padding: "2px 8px", borderRadius: "6px", fontSize: "11px",
                      }}>
                        ⏱️ {dias} {dias === 1 ? "día" : "días"} reales en faena
                      </div>
                    </div>

                    {/* Fila 3: Motivo / Observaciones */}
                    {item.motivo_traslado && (
                      <div style={{ fontSize: "12px", color: "#334155", backgroundColor: "rgba(0,0,0,0.02)", padding: "4px 8px", borderRadius: "4px" }}>
                        <span style={{ fontWeight: 600, color: "#64748b" }}>Observaciones / Motivo: </span>
                        {item.motivo_traslado}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pie del Modal */}
        <div style={{
          backgroundColor: "#f8fafc", borderTop: "1px solid #e2e8f0",
          padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: "11px", color: "#64748b" }}>
            Cada cambio de obra genera automáticamente un registro permanente con las fechas reales de inicio y salida.
          </span>
          <button
            onClick={onClose}
            style={{
              padding: "7px 18px", borderRadius: "8px", fontSize: "12px", fontWeight: 700,
              border: "1.5px solid #cbd5e1", backgroundColor: "#ffffff", color: "#0f172a", cursor: "pointer",
            }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
