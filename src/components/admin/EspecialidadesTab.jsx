import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, X, Tag, List, Upload, FileSpreadsheet, Check, HelpCircle, Loader2, RefreshCw, Search, Building2 } from "lucide-react";
import FormRow from "./Shared/FormRow";

const inputStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-input)",
  borderRadius: "var(--border-radius-sm)", color: "var(--color-input-text)", padding: "9px 12px",
  fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

export default function EspecialidadesTab({ hookProps }) {
  const { especialidades, showMsg, saving, setSaving } = hookProps;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    nombre_oficial: "",
    descripcion: "",
    color: "#3b82f6"
  });

  // Estados de Tareas Programadas / Actividades EIMIPLANNER
  const [selectedEsp, setSelectedEsp] = useState(null); // especialidad seleccionada para tareas
  const [tareasList, setTareasList] = useState([]);      // lista de tareas de la esp seleccionada
  const [loadingTareas, setLoadingTareas] = useState(false);
  const [syncingEimiplanner, setSyncingEimiplanner] = useState(false);
  const [filtroTarea, setFiltroTarea] = useState("");
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [formTarea, setFormTarea] = useState({
    nombre: "",
    codigo: "",
    orden: 0
  });

  // Cargar tareas al seleccionar especialidad
  const cargarTareas = async (espId) => {
    if (!espId) return;
    setLoadingTareas(true);
    try {
      const r = await fetch(`/api/admin/tareas-programadas?especialidad_id=${espId}`);
      const json = await r.json();
      if (json.success) setTareasList(json.data || []);
    } catch (e) {
      showMsg("❌ Error al cargar tareas", false);
    } finally {
      setLoadingTareas(false);
    }
  };

  useEffect(() => {
    if (selectedEsp) cargarTareas(selectedEsp.id);
  }, [selectedEsp]);

  // Sincronizar actividades directamente desde EIMIPLANNER (Spence 418)
  const handleSyncEimiplanner = async () => {
    setSyncingEimiplanner(true);
    try {
      const res = await fetch("/api/admin/tareas-programadas?action=sync_eimiplanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "418" })
      });
      const data = await res.json();
      if (data.success) {
        showMsg(`✅ Sincronizadas ${data.sync?.totalProcesadas || 0} actividades de EIMIPLANNER Spence (418)`);
        if (selectedEsp) cargarTareas(selectedEsp.id);
      } else {
        showMsg(`❌ Error al sincronizar: ${data.error}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSyncingEimiplanner(false);
    }
  };

  // Filtrado reactivo de actividades
  const tareasFiltradas = useMemo(() => {
    if (!filtroTarea.trim()) return tareasList;
    const query = filtroTarea.toLowerCase();
    return tareasList.filter(t =>
      (t.nombre && t.nombre.toLowerCase().includes(query)) ||
      (t.codigo && t.codigo.toLowerCase().includes(query)) ||
      (t.descripcion && t.descripcion.toLowerCase().includes(query))
    );
  }, [tareasList, filtroTarea]);

  // Crear tarea individual
  const handleCrearTarea = async () => {
    if (!formTarea.nombre.trim()) {
      showMsg("❌ El nombre de la tarea es obligatorio", false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/tareas-programadas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: formTarea.nombre.trim(),
          codigo: formTarea.codigo.trim() || null,
          orden: parseInt(formTarea.orden) || 0,
          especialidad_id: selectedEsp.id
        })
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Tarea programada registrada");
        setFormTarea({ nombre: "", codigo: "", orden: 0 });
        cargarTareas(selectedEsp.id);
      } else {
        showMsg(`❌ Error: ${json.error}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Eliminar tarea (soft delete / desactivar)
  const handleEliminarTarea = async (id) => {
    if (!window.confirm("¿Está seguro de desactivar esta tarea programada?")) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/admin/tareas-programadas?id=${id}`, {
        method: "DELETE"
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Tarea programada desactivada");
        cargarTareas(selectedEsp.id);
      } else {
        showMsg(`❌ Error: ${json.error}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Procesar carga masiva CSV
  const handleImportarCSV = async () => {
    if (!bulkCsv.trim()) {
      showMsg("❌ El contenido CSV está vacío", false);
      return;
    }
    setSaving(true);
    try {
      const lineas = bulkCsv.split("\n");
      if (lineas.length < 2) throw new Error("CSV inválido. Debe tener al menos una cabecera y una fila.");

      // Cabecera: nombre, codigo, orden
      const cabecera = lineas[0].split(",").map(h => h.trim().toLowerCase());
      const idxNombre = cabecera.indexOf("nombre");
      const idxCodigo = cabecera.indexOf("codigo");
      const idxOrden = cabecera.indexOf("orden");

      if (idxNombre === -1) {
        throw new Error("La cabecera debe incluir la columna 'nombre'. Ejemplo: nombre,codigo,orden");
      }

      const tareas = [];
      for (let i = 1; i < lineas.length; i++) {
        const linea = lineas[i].trim();
        if (!linea) continue;
        const celdas = linea.split(",");
        const nombre = celdas[idxNombre]?.trim();
        if (!nombre) continue;

        const codigo = idxCodigo !== -1 ? celdas[idxCodigo]?.trim() : null;
        const ordenVal = idxOrden !== -1 ? parseInt(celdas[idxOrden]) : 0;

        tareas.push({
          nombre,
          codigo,
          orden: isNaN(ordenVal) ? 0 : ordenVal,
          especialidad_id: selectedEsp.id
        });
      }

      if (tareas.length === 0) throw new Error("No se encontraron filas de tareas válidas para importar.");

      const r = await fetch("/api/admin/tareas-programadas?bulk=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tareas })
      });
      const json = await r.json();
      if (json.success) {
        showMsg(`✅ Importación exitosa: ${json.insertadas} tareas agregadas.`);
        setBulkCsv("");
        setShowBulkForm(false);
        cargarTareas(selectedEsp.id);
      } else {
        showMsg(`❌ Error en carga: ${json.error}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  const COLORES_PREDEFINIDOS = [
    "#3b82f6", // Piping / Azul
    "#10b981", // Estructuras / Verde
    "#f59e0b", // Obras Civiles / Amarillo
    "#ef4444", // Electricidad / Rojo
    "#8b5cf6", // Instrumentación / Morado
    "#ec4899", // Izaje Especial / Rosado
    "#f97316", // Mantenimiento / Naranja
    "#06b6d4", // Cyan
    "#6b7280"  // Gris
  ];

  const handleCrear = async () => {
    if (!form.nombre_oficial.trim()) {
      showMsg("❌ El nombre de la disciplina es obligatorio", false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/especialidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre_oficial: form.nombre_oficial.trim(),
          descripcion: form.descripcion.trim(),
          color: form.color
        })
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Disciplina registrada con éxito");
        setForm({ nombre_oficial: "", descripcion: "", color: "#3b82f6" });
        setShowForm(false);
        especialidades.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateColor = async (id, nuevoColor) => {
    try {
      const r = await fetch("/api/especialidades", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, color: nuevoColor })
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Color actualizado");
        especialidades.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    }
  };

  const handleEliminar = async (id) => {
    if (!window.confirm("¿Está seguro de que desea eliminar esta disciplina? Los trabajadores y equipos perderán su asignación de color.")) {
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`/api/especialidades?id=${id}`, {
        method: "DELETE"
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Disciplina eliminada");
        especialidades.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>Gestión de Disciplinas</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: showForm ? "rgba(0,0,0,0.08)" : "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
            border: showForm ? "1px solid var(--border-container)" : "none",
            color: "white", borderRadius: "8px", padding: "6px 14px",
            cursor: "pointer", fontWeight: 700, fontSize: "12px",
            display: "flex", alignItems: "center", gap: "6px",
            transition: "all 0.2s"
          }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Ocultar Formulario" : "Agregar Disciplina"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--bg-container)", border: "1px solid var(--border-container)", borderRadius: "var(--border-radius-base)", boxShadow: "0 4px 20px rgba(0,0,0,0.02)", padding: "20px", marginBottom: "24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text-muted)" }}>+ CREAR NUEVA DISCIPLINA / ESPECIALIDAD</h3>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
            <FormRow label="Nombre Disciplina *">
              <input style={inputStyle} placeholder="Ej: Piping, Instrumentación"
                value={form.nombre_oficial}
                onChange={e => setForm(p => ({ ...p, nombre_oficial: e.target.value }))} />
            </FormRow>
            <FormRow label="Descripción">
              <input style={inputStyle} placeholder="Breve detalle de la especialidad..."
                value={form.descripcion}
                onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
            </FormRow>
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", textTransform: "uppercase", display: "block", marginBottom: "8px" }}>
              Color Identificador (para el Plan POD)
            </label>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
              {COLORES_PREDEFINIDOS.map(c => (
                <button
                  key={c}
                  onClick={() => setForm(p => ({ ...p, color: c }))}
                  style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    backgroundColor: c, border: form.color === c ? "2px solid var(--color-text)" : "2px solid transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "transform 0.1s"
                  }}
                  title={c}
                />
              ))}
              <div style={{ display: "flex", gap: "8px", alignItems: "center", marginLeft: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Personalizado:</span>
                <input
                  type="color"
                  value={form.color}
                  onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                  style={{ width: "32px", height: "28px", border: "none", cursor: "pointer", background: "transparent" }}
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleCrear}
            disabled={saving}
            style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))", border: "none", color: "white", borderRadius: "8px", padding: "9px 20px", cursor: "pointer", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <Plus size={14} /> {saving ? "Guardando…" : "Registrar Disciplina"}
          </button>
        </div>
      )}

      <div style={{ background: "var(--bg-container)", border: "1px solid var(--border-container)", borderRadius: "var(--border-radius-base)", boxShadow: "0 4px 20px rgba(0,0,0,0.02)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-container)", background: "var(--bg-sidebar)" }}>
              {["Disciplina / Especialidad", "Descripción", "Color Identificador", "Tareas", "Acciones"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(especialidades.data || []).map((esp) => (
              <tr key={esp.id} style={{ borderBottom: "1px solid var(--border-container)" }}>
                <td style={{ padding: "12px 16px", color: "var(--color-text)", fontWeight: 700, fontSize: "13px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Tag size={14} style={{ color: esp.color || "#6b7280" }} />
                    {esp.nombre_oficial}
                  </div>
                </td>
                <td style={{ padding: "12px 16px", color: "var(--color-text-muted)", fontSize: "13px" }}>
                  {esp.descripcion || "—"}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <div style={{ width: "16px", height: "16px", borderRadius: "50%", backgroundColor: esp.color || "#6b7280" }} />
                    <input
                      type="color"
                      value={esp.color || "#6b7280"}
                      onChange={e => handleUpdateColor(esp.id, e.target.value)}
                      style={{ border: "none", cursor: "pointer", background: "transparent", width: "24px", height: "20px" }}
                      title="Cambiar color rápido"
                    />
                    <span style={{ fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)" }}>
                      {esp.color || "#6b7280"}
                    </span>
                  </div>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => setSelectedEsp(selectedEsp?.id === esp.id ? null : esp)}
                    style={{
                      background: selectedEsp?.id === esp.id ? "rgba(16, 185, 129, 0.15)" : "transparent",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "#10b981", borderRadius: "6px", padding: "6px 12px",
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px",
                      fontSize: "12px", fontWeight: 700, transition: "all 0.15s"
                    }}
                  >
                    <List size={12} /> Tareas rápidas
                  </button>
                </td>
                <td style={{ padding: "12px 16px" }}>
                  <button
                    onClick={() => handleEliminar(esp.id)}
                    style={{
                      background: "transparent", border: "1px solid rgba(239, 68, 68, 0.2)",
                      color: "#ef4444", borderRadius: "6px", padding: "6px 10px",
                      cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px",
                      fontSize: "12px", fontWeight: 600, transition: "all 0.15s"
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.05)"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                  >
                    <Trash2 size={12} /> Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {(especialidades.data || []).length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "32px", textAlign: "center", color: "#64748b", fontSize: "13px" }}>
                  Cargando disciplinas o no hay registros aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── SECCIÓN: GESTIÓN DE ACTIVIDADES EIMIPLANNER ── */}
      {selectedEsp && (
        <div style={{
          marginTop: "24px", background: "var(--bg-container)", border: "1px solid rgba(16, 185, 129, 0.3)",
          borderRadius: "var(--border-radius-base)", padding: "24px",
          boxShadow: "0 10px 30px rgba(16, 185, 129, 0.04)"
        }} className="animate-fade-in">
          
          {/* Header Gestión Actividades EIMIPLANNER */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px", borderBottom: "1px solid var(--border-container)", paddingBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <Tag size={16} style={{ color: selectedEsp.color || "#6b7280" }} />
                  Actividades EIMIPLANNER: {selectedEsp.nombre_oficial}
                </h3>
                <span style={{
                  background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)",
                  borderRadius: "12px", padding: "2px 8px", fontSize: "11px", fontWeight: 700, color: "#10b981",
                  display: "inline-flex", alignItems: "center", gap: "4px"
                }}>
                  <Building2 size={11} /> Obra Spence EIMI00418
                </span>
              </div>
              <p style={{ margin: "4px 0 0", fontSize: "12px", color: "var(--color-text-muted)" }}>
                Actividades operativas del Lookahead de EIMIPLANNER para su asignación en la <strong>Sala POD</strong> y consulta por WhatsApp.
              </p>
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                onClick={handleSyncEimiplanner}
                disabled={syncingEimiplanner}
                style={{
                  background: "linear-gradient(135deg, #10b981, #059669)",
                  border: "none", color: "white", borderRadius: "8px", padding: "7px 14px",
                  cursor: syncingEimiplanner ? "not-allowed" : "pointer", fontWeight: 700, fontSize: "12px",
                  display: "flex", alignItems: "center", gap: "6px", boxShadow: "0 2px 8px rgba(16,185,129,0.25)"
                }}
              >
                <RefreshCw size={13} style={{ animation: syncingEimiplanner ? "spin 1s linear infinite" : "none" }} />
                {syncingEimiplanner ? "Sincronizando..." : "Sincronizar EIMIPLANNER"}
              </button>

              <button
                onClick={() => setShowManualForm(!showManualForm)}
                style={{
                  background: showManualForm ? "rgba(0,0,0,0.08)" : "var(--bg-input)",
                  border: "1px solid var(--border-input)",
                  color: "var(--color-text)", borderRadius: "8px", padding: "7px 12px",
                  cursor: "pointer", fontWeight: 600, fontSize: "11px",
                  display: "flex", alignItems: "center", gap: "6px"
                }}
              >
                <Plus size={13} /> {showManualForm ? "Ocultar manual" : "Agregar manual / CSV"}
              </button>

              <button
                onClick={() => setSelectedEsp(null)}
                style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "6px" }}
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Barra de Búsqueda y Filtro Rápido */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: "260px", maxWidth: "420px" }}>
              <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-muted)" }} />
              <input
                type="text"
                placeholder="Buscar por actividad o código WBS..."
                value={filtroTarea}
                onChange={e => setFiltroTarea(e.target.value)}
                style={{ ...inputStyle, paddingLeft: "32px", fontSize: "12px" }}
              />
              {filtroTarea && (
                <button
                  onClick={() => setFiltroTarea("")}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "2px" }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            <div style={{ fontSize: "12px", color: "var(--color-text-muted)", fontWeight: 600 }}>
              {filtroTarea ? `Mostrando ${tareasFiltradas.length} de ${tareasList.length} actividades` : `${tareasList.length} actividades disponibles para Sala POD`}
            </div>
          </div>

          {/* Formulario Manual / CSV (Opcional colapsable) */}
          {showManualForm && (
            <div style={{ background: "rgba(0,0,0,0.02)", border: "1px dashed var(--border-container)", borderRadius: "10px", padding: "16px", marginBottom: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--color-text)" }}>
                  {showBulkForm ? "Carga Masiva de Tareas CSV" : "Nueva Tarea Manual"}
                </span>
                <button
                  onClick={() => setShowBulkForm(!showBulkForm)}
                  style={{ background: "none", border: "none", color: "#10b981", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                >
                  <FileSpreadsheet size={12} /> {showBulkForm ? "Cambiar a individual" : "Cambiar a carga CSV"}
                </button>
              </div>

              {showBulkForm ? (
                <>
                  <p style={{ margin: "0 0 10px", fontSize: "11px", color: "var(--color-text-muted)", lineHeight: 1.4 }}>
                    Pega las tareas en formato CSV. Cabecera: <code style={{ fontFamily: "monospace", background: "rgba(0,0,0,0.05)", padding: "1px 4px", borderRadius: "3px" }}>nombre,codigo,orden</code>
                  </p>
                  <textarea
                    value={bulkCsv}
                    onChange={e => setBulkCsv(e.target.value)}
                    placeholder="nombre,codigo,orden&#10;Montaje soporte,WBS-01,1&#10;Prueba estanqueidad,WBS-02,2"
                    rows={4}
                    style={{ ...inputStyle, fontFamily: "monospace", resize: "vertical", marginBottom: "12px" }}
                  />
                  <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleImportarCSV}
                      disabled={saving}
                      style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))", border: "none", color: "white", borderRadius: "6px", padding: "6px 14px", cursor: "pointer", fontWeight: 700, fontSize: "12px" }}
                    >
                      Importar Tareas
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 140px 80px auto", gap: "10px", alignItems: "flex-end" }}>
                  <FormRow label="Nombre de Actividad *">
                    <input
                      style={inputStyle} value={formTarea.nombre}
                      onChange={e => setFormTarea(t => ({ ...t, nombre: e.target.value }))}
                      placeholder="Ej: Montaje de soporte especial"
                    />
                  </FormRow>
                  <FormRow label="Código WBS (Opcional)">
                    <input
                      style={inputStyle} value={formTarea.codigo}
                      onChange={e => setFormTarea(t => ({ ...t, codigo: e.target.value }))}
                      placeholder="Ej: EXE.CONS.PI..."
                    />
                  </FormRow>
                  <FormRow label="Orden">
                    <input
                      type="number" style={inputStyle} value={formTarea.orden}
                      onChange={e => setFormTarea(t => ({ ...t, orden: e.target.value }))}
                    />
                  </FormRow>
                  <button
                    onClick={handleCrearTarea}
                    disabled={saving}
                    style={{
                      height: "38px", background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
                      border: "none", color: "white", borderRadius: "8px", padding: "0 16px",
                      cursor: "pointer", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", gap: "6px"
                    }}
                  >
                    <Plus size={14} /> Guardar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Listado de Actividades EIMIPLANNER */}
          {loadingTareas ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", padding: "30px", color: "var(--color-text-muted)", fontSize: "13px" }}>
              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
              Cargando actividades de {selectedEsp.nombre_oficial}...
            </div>
          ) : tareasList.length === 0 ? (
            <div style={{ padding: "36px", border: "1px dashed var(--border-container)", borderRadius: "10px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
              <Building2 size={28} style={{ color: "var(--color-text-muted)", margin: "0 auto 8px", display: "block", opacity: 0.5 }} />
              No hay actividades registradas aún para <strong>{selectedEsp.nombre_oficial}</strong>.<br />
              <button
                onClick={handleSyncEimiplanner}
                disabled={syncingEimiplanner}
                style={{
                  marginTop: "12px", background: "rgba(16, 185, 129, 0.12)", border: "1px solid rgba(16, 185, 129, 0.3)",
                  color: "#10b981", borderRadius: "8px", padding: "8px 16px", fontWeight: 700, fontSize: "12px",
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px"
                }}
              >
                <RefreshCw size={13} style={{ animation: syncingEimiplanner ? "spin 1s linear infinite" : "none" }} />
                Sincronizar desde EIMIPLANNER Spence (418)
              </button>
            </div>
          ) : (
            <div style={{ border: "1px solid var(--border-container)", borderRadius: "10px", overflow: "hidden" }}>
              <div style={{ maxHeight: "420px", overflowY: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead style={{ position: "sticky", top: 0, background: "var(--bg-container)", zIndex: 1 }}>
                    <tr style={{ background: "rgba(0,0,0,0.03)", borderBottom: "1px solid var(--border-container)" }}>
                      <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--color-text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", width: "180px" }}>Código / WBS</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--color-text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase" }}>Actividad EIMIPLANNER</th>
                      <th style={{ padding: "10px 14px", textAlign: "left", color: "var(--color-text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", width: "180px" }}>Detalle</th>
                      <th style={{ padding: "10px 14px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", width: "90px" }}>Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tareasFiltradas.map(t => (
                      <tr key={t.id} style={{ borderBottom: "1px solid var(--border-container)", transition: "all 0.1s" }}>
                        <td style={{ padding: "10px 14px", fontSize: "11px", fontFamily: "monospace", fontWeight: 700, color: "#10b981" }}>
                          {t.codigo || "—"}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "13px", color: "var(--color-text)", fontWeight: 600 }}>
                          {t.nombre}
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {t.descripcion || "Actividad Lookahead"}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <button
                            onClick={() => handleEliminarTarea(t.id)}
                            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", display: "inline-flex", alignItems: "center", padding: "4px", fontSize: "12px" }}
                            title="Ocultar de Sala POD"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {tareasFiltradas.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ padding: "24px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "12px" }}>
                          No se encontraron actividades que coincidan con &ldquo;{filtroTarea}&rdquo;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
