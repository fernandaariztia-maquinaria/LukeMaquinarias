import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { 
  Plus, 
  Trash2, 
  Save, 
  Truck, 
  Clock, 
  User, 
  Building2, 
  ArrowLeft,
  CheckCircle2, 
  AlertCircle,
  Loader2,
  FileSpreadsheet
} from "lucide-react";
import { formatEquipoLabel } from "../../lib/equipoLabel";

// Catálogo de disciplinas y subactividades según especificación de faena (Imagen adjunta)
const DISCIPLINAS_ESTANDAR = [
  {
    key: "OOCC",
    label: "OOCC",
    subactividades: ["Moldaje", "Fierro", "Hormigón", "Prefabricados Hormigón"]
  },
  {
    key: "Estructura",
    label: "Estructura",
    subactividades: ["Mont Estructura", "Revestimiento"]
  },
  {
    key: "Piping",
    label: "Piping",
    subactividades: ["Soportes", "Spools/ductos"]
  },
  {
    key: "Mecanica",
    label: "Mecánica",
    subactividades: ["Equipos Mecánicos"]
  },
  {
    key: "Caldereria",
    label: "Calderería",
    subactividades: ["Componentes Calderería"]
  },
  {
    key: "Electrico",
    label: "Eléctrico",
    subactividades: ["Equipos Eléctricos"]
  }
];

export default function ActividadesSupervisorPage() {
  const router = useRouter();
  const { bloque_id, equipo_id, supervisor_id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const [bloque, setBloque] = useState(null);
  const [equipo, setEquipo] = useState(null);
  const [supervisor, setSupervisor] = useState(null);
  const [tareasEimi, setTareasEimi] = useState([]);

  // Estado para Carga/Descarga (sección superior de la imagen)
  const [cargaDescargaActiva, setCargaDescargaActiva] = useState(true);
  const [lineasCargaDescarga, setLineasCargaDescarga] = useState([
    { id: 1, id_3wl: "", cantidad: "", unidad: "Ton", izajes: "", horometro: "" }
  ]);

  // Estado para las disciplinas y sus subactividades seleccionadas
  const [disciplinasCheck, setDisciplinasCheck] = useState({
    OOCC: false,
    Estructura: false,
    Piping: false,
    Mecanica: false,
    Caldereria: false,
    Electrico: false,
  });

  const [subactividadesData, setSubactividadesData] = useState({});

  // Tareas no programadas adicionales
  const [tareasNoProgramadas, setTareasNoProgramadas] = useState([]);

  // Cargar datos iniciales
  useEffect(() => {
    if (!router.isReady) return;

    const fetchData = async () => {
      setLoading(true);
      setErrorMsg("");
      try {
        const queryParams = new URLSearchParams();
        if (bloque_id) queryParams.set("bloque_id", bloque_id);
        if (equipo_id) queryParams.set("equipo_id", equipo_id);
        if (supervisor_id) queryParams.set("supervisor_id", supervisor_id);

        const res = await fetch(`/api/supervisor/actividades?${queryParams.toString()}`);
        const json = await res.json();

        if (res.ok && json.success) {
          setBloque(json.data.bloque);
          setEquipo(json.data.equipo);
          setSupervisor(json.data.supervisor);
          setTareasEimi(json.data.tareas_eimi || []);

          // Si ya existen actividades guardadas, pre-poblarlas
          if (json.data.actividades_guardadas && json.data.actividades_guardadas.length > 0) {
            const guardadas = json.data.actividades_guardadas;
            
            const lineasCD = guardadas.filter(a => a.categoria_disciplina === "Carga/Descarga");
            if (lineasCD.length > 0) {
              setCargaDescargaActiva(true);
              setLineasCargaDescarga(lineasCD.map((l, idx) => ({
                id: idx + 1,
                id_3wl: l.id_3wl || "",
                cantidad: l.cantidad_ejecutada || "",
                unidad: l.unidad || "Ton",
                izajes: l.izajes || "",
                horometro: l.horometro_horas || ""
              })));
            }

            const subMap = {};
            const discMap = { ...disciplinasCheck };
            
            guardadas.forEach(a => {
              if (a.categoria_disciplina !== "Carga/Descarga" && a.categoria_disciplina !== "No Programada") {
                const discObj = DISCIPLINAS_ESTANDAR.find(d => d.label === a.categoria_disciplina);
                if (discObj) {
                  discMap[discObj.key] = true;
                }
                subMap[a.subactividad] = {
                  checked: true,
                  id_3wl: a.id_3wl || "",
                  cantidad: a.cantidad_ejecutada || "",
                  unidad: a.unidad || "Ton",
                  izajes: a.izajes || "",
                  horometro: a.horometro_horas || ""
                };
              }
            });

            setDisciplinasCheck(discMap);
            setSubactividadesData(subMap);

            const noProg = guardadas.filter(a => a.categoria_disciplina === "No Programada");
            if (noProg.length > 0) {
              setTareasNoProgramadas(noProg.map((np, idx) => ({
                id: idx + 1,
                descripcion: np.descripcion || "",
                cantidad: np.cantidad_ejecutada || "",
                unidad: np.unidad || "Ton",
                izajes: np.izajes || "",
                horometro: np.horometro_horas || ""
              })));
            }
          }
        } else {
          setErrorMsg(json.error || "No se pudo cargar la información del bloque.");
        }
      } catch (err) {
        console.error("Error al cargar actividades supervisor:", err);
        setErrorMsg("Error de conexión al cargar datos.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, bloque_id, equipo_id, supervisor_id]);

  // Manejo de Carga/Descarga
  const handleAddLineaCarga = () => {
    setLineasCargaDescarga(prev => [
      ...prev,
      { id: Date.now(), id_3wl: "", cantidad: "", unidad: "Ton", izajes: "", horometro: "" }
    ]);
  };

  const handleRemoveLineaCarga = (id) => {
    setLineasCargaDescarga(prev => prev.filter(l => l.id !== id));
  };

  const handleUpdateLineaCarga = (id, field, value) => {
    setLineasCargaDescarga(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  // Manejo de Disciplinas
  const toggleDisciplina = (discKey) => {
    setDisciplinasCheck(prev => ({ ...prev, [discKey]: !prev[discKey] }));
  };

  const toggleSubactividad = (subName, discLabel) => {
    setSubactividadesData(prev => {
      const current = prev[subName] || { checked: false, id_3wl: "", cantidad: "", unidad: "Ton", izajes: "", horometro: "" };
      return {
        ...prev,
        [subName]: {
          ...current,
          checked: !current.checked
        }
      };
    });
  };

  const updateSubactividad = (subName, field, value) => {
    setSubactividadesData(prev => {
      const current = prev[subName] || { checked: true, id_3wl: "", cantidad: "", unidad: "Ton", izajes: "", horometro: "" };
      return {
        ...prev,
        [subName]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  // Manejo de tareas no programadas
  const handleAddNoProgramada = () => {
    setTareasNoProgramadas(prev => [
      ...prev,
      { id: Date.now(), descripcion: "", cantidad: "", unidad: "Ton", izajes: "", horometro: "" }
    ]);
  };

  const handleRemoveNoProgramada = (id) => {
    setTareasNoProgramadas(prev => prev.filter(t => t.id !== id));
  };

  const handleUpdateNoProgramada = (id, field, value) => {
    setTareasNoProgramadas(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  // Guardar actividades
  const handleGuardar = async () => {
    setSaving(true);
    setSuccessMsg("");
    setErrorMsg("");

    const payloadActividades = [];

    // 1. Agregar Carga/Descarga si está activa
    if (cargaDescargaActiva) {
      for (const linea of lineasCargaDescarga) {
        if (linea.id_3wl || linea.cantidad || linea.izajes || linea.horometro) {
          payloadActividades.push({
            categoria_disciplina: "Carga/Descarga",
            subactividad: "Carga/Descarga General",
            descripcion: `Carga/Descarga ${linea.id_3wl ? `[3WL: ${linea.id_3wl}]` : ""}`,
            id_3wl: linea.id_3wl || null,
            cantidad_ejecutada: linea.cantidad || 0,
            unidad: linea.unidad || "Ton",
            izajes: linea.izajes || 0,
            horometro_horas: linea.horometro || 0,
            programada: true,
          });
        }
      }
    }

    // 2. Agregar Subactividades de Disciplinas
    for (const [subName, data] of Object.entries(subactividadesData)) {
      if (data.checked) {
        let discParentLabel = "General";
        for (const disc of DISCIPLINAS_ESTANDAR) {
          if (disc.subactividades.includes(subName)) {
            discParentLabel = disc.label;
            break;
          }
        }

        payloadActividades.push({
          categoria_disciplina: discParentLabel,
          subactividad: subName,
          descripcion: `${discParentLabel} - ${subName} ${data.id_3wl ? `[3WL: ${data.id_3wl}]` : ""}`,
          id_3wl: data.id_3wl || null,
          cantidad_ejecutada: data.cantidad || 0,
          unidad: data.unidad || "Ton",
          izajes: data.izajes || 0,
          horometro_horas: data.horometro || 0,
          programada: true,
        });
      }
    }

    // 3. Agregar Tareas No Programadas
    for (const np of tareasNoProgramadas) {
      if (np.descripcion?.trim()) {
        payloadActividades.push({
          categoria_disciplina: "No Programada",
          subactividad: "Fuera de Programa",
          descripcion: `[NO PROGRAMADA] ${np.descripcion.trim()}`,
          id_3wl: null,
          cantidad_ejecutada: np.cantidad || 0,
          unidad: np.unidad || "Ton",
          izajes: np.izajes || 0,
          horometro_horas: np.horometro || 0,
          programada: false,
        });
      }
    }

    if (payloadActividades.length === 0) {
      setErrorMsg("Debes ingresar al menos una labor o cantidad ejecutada antes de guardar.");
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/supervisor/actividades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloque_id: bloque?.id || bloque_id || null,
          equipo_id: equipo?.id || equipo_id || null,
          supervisor_id: supervisor?.id || supervisor_id || null,
          actividades: payloadActividades,
        })
      });

      const json = await res.json();
      if (res.ok && json.success) {
        setSuccessMsg("¡Actividades registradas exitosamente en la consola y vinculadas a la jornada!");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrorMsg(json.error || "Ocurrió un error al guardar las actividades.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de red al intentar guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <Loader2 className="spinner" size={38} />
        <p>Cargando matriz de actividades 3WL...</p>
        <style jsx>{`
          .loading-container {
            min-height: 100vh;
            background: #0b1320;
            color: #94a3b8;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Poppins', sans-serif;
            gap: 16px;
          }
          :global(.spinner) {
            animation: spin 1s linear infinite;
            color: #3b82f6;
          }
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="actividades-root">
      <Head>
        <title>Asignación de Actividades 3WL | LukeMaquinarias</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      {/* Header Superior */}
      <header className="header-bar">
        <div className="header-inner">
          <div className="header-left">
            <button onClick={() => router.back()} className="btn-back" title="Volver">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="header-title">
                <Truck size={20} color="#fbbf24" />
                Asignación de Actividades 3WL
              </h1>
              <p className="header-subtitle">
                {equipo ? `${equipo.descripcion_equipo} (${formatEquipoLabel(equipo)})` : "Equipo de Faena"}
              </p>
            </div>
          </div>

          <button onClick={handleGuardar} disabled={saving} className="btn-save">
            {saving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
            <span>{saving ? "Guardando..." : "Guardar"}</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        {/* Notificaciones */}
        {successMsg && (
          <div className="alert alert-success">
            <CheckCircle2 size={20} color="#10b981" />
            <p>{successMsg}</p>
          </div>
        )}

        {errorMsg && (
          <div className="alert alert-error">
            <AlertCircle size={20} color="#f43f5e" />
            <p>{errorMsg}</p>
          </div>
        )}

        {/* Tarjetas de Resumen Operacional */}
        <div className="summary-grid">
          <div className="summary-card">
            <div className="summary-icon blue">
              <Truck size={18} />
            </div>
            <div className="summary-info">
              <span className="summary-label">Equipo</span>
              <strong className="summary-val">{equipo?.descripcion_equipo || "—"}</strong>
              <small className="summary-sub">{formatEquipoLabel(equipo)}</small>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon amber">
              <User size={18} />
            </div>
            <div className="summary-info">
              <span className="summary-label">Supervisor</span>
              <strong className="summary-val">{supervisor?.nombre_completo || "Asignado"}</strong>
              <small className="summary-sub">{supervisor?.especialidades?.nombre_oficial || "Especialidad"}</small>
            </div>
          </div>

          <div className="summary-card">
            <div className="summary-icon emerald">
              <Clock size={18} />
            </div>
            <div className="summary-info">
              <span className="summary-label">Horario Asignado</span>
              <strong className="summary-val">
                {bloque ? `${bloque.hora_inicio?.slice(0, 5)} - ${bloque.hora_fin?.slice(0, 5)}` : "Turno Completo"}
              </strong>
              <small className="summary-sub">
                {bloque?.operador?.nombre_completo ? `Op: ${bloque.operador.nombre_completo}` : "Operador asignado"}
              </small>
            </div>
          </div>
        </div>

        {/* SECCIÓN 1: Carga / Descarga */}
        <section className="section-card">
          <div className="section-header">
            <label className="checkbox-toggle">
              <input
                type="checkbox"
                checked={cargaDescargaActiva}
                onChange={(e) => setCargaDescargaActiva(e.target.checked)}
              />
              <span className="toggle-label">Carga/Descarga</span>
            </label>
            <span className="section-badge">Matriz de Izaje & Horómetro</span>
          </div>

          {cargaDescargaActiva && (
            <div className="section-body">
              <div className="rows-container">
                {lineasCargaDescarga.map((linea) => (
                  <div key={linea.id} className="matrix-row">
                    <div className="field-group">
                      <label className="field-lbl">Id 3WL:</label>
                      <input
                        type="text"
                        placeholder="Ej: ELE-01"
                        value={linea.id_3wl}
                        onChange={(e) => handleUpdateLineaCarga(linea.id, "id_3wl", e.target.value)}
                        className="input-base input-code"
                      />
                    </div>

                    <div className="field-group">
                      <label className="field-lbl">Cantidad:</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={linea.cantidad}
                        onChange={(e) => handleUpdateLineaCarga(linea.id, "cantidad", e.target.value)}
                        className="input-base input-number"
                      />
                    </div>

                    <div className="field-group">
                      <select
                        value={linea.unidad}
                        onChange={(e) => handleUpdateLineaCarga(linea.id, "unidad", e.target.value)}
                        className="select-base"
                      >
                        <option value="Ton">Ton</option>
                        <option value="m3">m3</option>
                        <option value="m2">m2</option>
                        <option value="un">un</option>
                        <option value="kg">kg</option>
                      </select>
                    </div>

                    <div className="field-group">
                      <label className="field-lbl">Izajes:</label>
                      <input
                        type="number"
                        placeholder="0"
                        value={linea.izajes}
                        onChange={(e) => handleUpdateLineaCarga(linea.id, "izajes", e.target.value)}
                        className="input-base input-small"
                      />
                    </div>

                    <div className="field-group">
                      <label className="field-lbl">Horómetro:</label>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.0"
                        value={linea.horometro}
                        onChange={(e) => handleUpdateLineaCarga(linea.id, "horometro", e.target.value)}
                        className="input-base input-small"
                      />
                      <span className="unit-tag">(hrs)</span>
                    </div>

                    {lineasCargaDescarga.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveLineaCarga(linea.id)}
                        className="btn-trash"
                        title="Eliminar fila"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleAddLineaCarga} className="btn-add">
                <Plus size={14} />
                <span>Agregar línea</span>
              </button>
            </div>
          )}
        </section>

        {/* SECCIÓN 2: Disciplinas y Especialidades */}
        <section className="section-card">
          <div className="section-header">
            <div className="section-title-wrap">
              <Building2 size={18} color="#38bdf8" />
              <h2 className="section-title">Disciplinas y Especialidades Operacionales</h2>
            </div>
            <span className="section-hint">Selecciona para desplegar labores</span>
          </div>

          <div className="section-body">
            <div className="disciplines-list">
              {DISCIPLINAS_ESTANDAR.map((disc) => {
                const isOpen = disciplinasCheck[disc.key];

                return (
                  <div key={disc.key} className={`discipline-box ${isOpen ? "active" : ""}`}>
                    <label className="discipline-header">
                      <input
                        type="checkbox"
                        checked={isOpen}
                        onChange={() => toggleDisciplina(disc.key)}
                        className="checkbox-disc"
                      />
                      <span className="discipline-name">{disc.label}</span>
                    </label>

                    {isOpen && (
                      <div className="subactivities-container">
                        {disc.subactividades.map((subName) => {
                          const subData = subactividadesData[subName] || { checked: false };
                          const isSubChecked = !!subData.checked;

                          return (
                            <div key={subName} className="subactivity-item">
                              <label className="subactivity-header">
                                <input
                                  type="checkbox"
                                  checked={isSubChecked}
                                  onChange={() => toggleSubactividad(subName, disc.label)}
                                  className="checkbox-sub"
                                />
                                <span className={`subactivity-name ${isSubChecked ? "highlight" : ""}`}>
                                  {subName}
                                </span>
                              </label>

                              {isSubChecked && (
                                <div className="matrix-row sub-row">
                                  <div className="field-group">
                                    <label className="field-lbl">Id 3WL:</label>
                                    <input
                                      type="text"
                                      placeholder="3WL"
                                      value={subData.id_3wl || ""}
                                      onChange={(e) => updateSubactividad(subName, "id_3wl", e.target.value)}
                                      className="input-base input-code"
                                    />
                                  </div>

                                  <div className="field-group">
                                    <label className="field-lbl">Cant:</label>
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="0"
                                      value={subData.cantidad || ""}
                                      onChange={(e) => updateSubactividad(subName, "cantidad", e.target.value)}
                                      className="input-base input-number"
                                    />
                                  </div>

                                  <div className="field-group">
                                    <select
                                      value={subData.unidad || "Ton"}
                                      onChange={(e) => updateSubactividad(subName, "unidad", e.target.value)}
                                      className="select-base"
                                    >
                                      <option value="Ton">Ton</option>
                                      <option value="m3">m3</option>
                                      <option value="m2">m2</option>
                                      <option value="un">un</option>
                                      <option value="ml">ml</option>
                                    </select>
                                  </div>

                                  <div className="field-group">
                                    <label className="field-lbl">Izajes:</label>
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={subData.izajes || ""}
                                      onChange={(e) => updateSubactividad(subName, "izajes", e.target.value)}
                                      className="input-base input-small"
                                    />
                                  </div>

                                  <div className="field-group">
                                    <label className="field-lbl">Horómetro:</label>
                                    <input
                                      type="number"
                                      step="any"
                                      placeholder="0.0"
                                      value={subData.horometro || ""}
                                      onChange={(e) => updateSubactividad(subName, "horometro", e.target.value)}
                                      className="input-base input-small"
                                    />
                                    <span className="unit-tag">(hrs)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECCIÓN 3: Tareas No Programadas */}
        <section className="section-card">
          <div className="section-header">
            <div>
              <h2 className="section-title">Tareas No Programadas</h2>
              <p className="section-hint">Labores reactivas ejecutadas fuera del 3WL oficial</p>
            </div>
            <button type="button" onClick={handleAddNoProgramada} className="btn-add amber">
              <Plus size={14} />
              <span>Agregar no programada</span>
            </button>
          </div>

          <div className="section-body">
            {tareasNoProgramadas.length === 0 ? (
              <p className="empty-text">No se han registrado tareas fuera de programa para este turno.</p>
            ) : (
              <div className="rows-container">
                {tareasNoProgramadas.map((t) => (
                  <div key={t.id} className="no-prog-card">
                    <div className="no-prog-top">
                      <input
                        type="text"
                        placeholder="Describe la labor realizada no programada..."
                        value={t.descripcion}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "descripcion", e.target.value)}
                        className="input-base input-desc"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveNoProgramada(t.id)}
                        className="btn-trash"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="matrix-row">
                      <div className="field-group">
                        <label className="field-lbl">Cantidad:</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={t.cantidad}
                          onChange={(e) => handleUpdateNoProgramada(t.id, "cantidad", e.target.value)}
                          className="input-base input-number"
                        />
                      </div>

                      <div className="field-group">
                        <select
                          value={t.unidad}
                          onChange={(e) => handleUpdateNoProgramada(t.id, "unidad", e.target.value)}
                          className="select-base"
                        >
                          <option value="Ton">Ton</option>
                          <option value="m3">m3</option>
                          <option value="m2">m2</option>
                          <option value="un">un</option>
                          <option value="hrs">hrs</option>
                        </select>
                      </div>

                      <div className="field-group">
                        <label className="field-lbl">Izajes:</label>
                        <input
                          type="number"
                          placeholder="0"
                          value={t.izajes}
                          onChange={(e) => handleUpdateNoProgramada(t.id, "izajes", e.target.value)}
                          className="input-base input-small"
                        />
                      </div>

                      <div className="field-group">
                        <label className="field-lbl">Horómetro:</label>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.0"
                          value={t.horometro}
                          onChange={(e) => handleUpdateNoProgramada(t.id, "horometro", e.target.value)}
                          className="input-base input-small"
                        />
                        <span className="unit-tag">(hrs)</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Botón flotante inferior para guardar */}
        <div className="bottom-bar">
          <button onClick={handleGuardar} disabled={saving} className="btn-save-bottom">
            {saving ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
            <span>Guardar y Confirmar Actividades</span>
          </button>
        </div>
      </main>

      <style jsx>{`
        .actividades-root {
          min-height: 100vh;
          background: #090e17;
          color: #f1f5f9;
          font-family: 'Poppins', -apple-system, sans-serif;
          padding-bottom: 80px;
        }

        /* HEADER */
        .header-bar {
          background: rgba(15, 23, 42, 0.95);
          backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          position: sticky;
          top: 0;
          z-index: 40;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
        }
        .header-inner {
          max-width: 960px;
          margin: 0 auto;
          padding: 12px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .btn-back {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          border-radius: 10px;
          padding: 8px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s ease;
        }
        .btn-back:hover {
          background: #334155;
          color: #ffffff;
        }
        .header-title {
          font-size: 17px;
          font-weight: 700;
          color: #ffffff;
          display: flex;
          align-items: center;
          gap: 8px;
          letter-spacing: -0.3px;
        }
        .header-subtitle {
          font-size: 12px;
          color: #94a3b8;
          margin-top: 1px;
        }
        .btn-save {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 9px 18px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.35);
          transition: all 0.2s ease;
        }
        .btn-save:hover:not(:disabled) {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          transform: translateY(-1px);
        }
        .btn-save:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        /* MAIN */
        .main-content {
          max-width: 960px;
          margin: 0 auto;
          padding: 20px 16px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ALERTS */
        .alert {
          padding: 12px 16px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 13px;
          font-weight: 500;
        }
        .alert-success {
          background: rgba(16, 185, 129, 0.12);
          border: 1px solid rgba(16, 185, 129, 0.3);
          color: #6ee7b7;
        }
        .alert-error {
          background: rgba(244, 63, 94, 0.12);
          border: 1px solid rgba(244, 63, 94, 0.3);
          color: #fda4af;
        }

        /* SUMMARY GRID */
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 12px;
        }
        .summary-card {
          background: #111a28;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
        }
        .summary-icon {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .summary-icon.blue {
          background: rgba(59, 130, 246, 0.15);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.25);
        }
        .summary-icon.amber {
          background: rgba(245, 158, 11, 0.15);
          color: #fbbf24;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }
        .summary-icon.emerald {
          background: rgba(16, 185, 129, 0.15);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .summary-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .summary-label {
          font-size: 10px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
          letter-spacing: 0.5px;
        }
        .summary-val {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .summary-sub {
          font-size: 11px;
          color: #94a3b8;
        }

        /* SECTION CARDS */
        .section-card {
          background: #111a28;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          padding: 18px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        }
        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          margin-bottom: 16px;
        }
        .section-title-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .section-title {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
        }
        .section-badge {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
          background: #1a2536;
          padding: 3px 8px;
          border-radius: 6px;
        }
        .section-hint {
          font-size: 11px;
          color: #94a3b8;
        }

        /* CHECKBOXES & TOGGLES */
        .checkbox-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .checkbox-toggle input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #3b82f6;
          cursor: pointer;
        }
        .toggle-label {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
        }

        /* MATRIX ROWS */
        .rows-container {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .matrix-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          background: #0b121d;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 10px;
          padding: 10px 14px;
        }
        .sub-row {
          background: #0f1826;
          border-color: rgba(59, 130, 246, 0.15);
          margin-top: 6px;
        }
        .field-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .field-lbl {
          font-size: 12px;
          font-weight: 500;
          color: #94a3b8;
        }
        .input-base {
          background: #162233;
          border: 1px solid #2d3f58;
          color: #ffffff;
          padding: 6px 10px;
          border-radius: 8px;
          font-size: 12px;
          font-family: inherit;
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-base:focus {
          border-color: #3b82f6;
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .input-code {
          width: 110px;
        }
        .input-number {
          width: 80px;
        }
        .input-small {
          width: 65px;
        }
        .input-desc {
          flex: 1;
          width: 100%;
        }
        .select-base {
          background: #162233;
          border: 1px solid #2d3f58;
          color: #e2e8f0;
          padding: 6px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-family: inherit;
          outline: none;
          cursor: pointer;
        }
        .unit-tag {
          font-size: 11px;
          color: #64748b;
        }
        .btn-trash {
          background: transparent;
          border: none;
          color: #f43f5e;
          cursor: pointer;
          padding: 4px;
          border-radius: 6px;
          margin-left: auto;
          display: flex;
          align-items: center;
          transition: background 0.2s;
        }
        .btn-trash:hover {
          background: rgba(244, 63, 94, 0.15);
        }
        .btn-add {
          margin-top: 12px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.3);
          color: #60a5fa;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          transition: all 0.2s ease;
        }
        .btn-add:hover {
          background: rgba(59, 130, 246, 0.22);
          border-color: #3b82f6;
        }
        .btn-add.amber {
          background: rgba(245, 158, 11, 0.12);
          border-color: rgba(245, 158, 11, 0.3);
          color: #fbbf24;
          margin-top: 0;
        }
        .btn-add.amber:hover {
          background: rgba(245, 158, 11, 0.22);
          border-color: #f59e0b;
        }

        /* DISCIPLINES LIST */
        .disciplines-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .discipline-box {
          background: #0b121d;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          padding: 12px 16px;
          transition: border-color 0.2s;
        }
        .discipline-box.active {
          border-color: rgba(59, 130, 246, 0.35);
          background: #0c1421;
        }
        .discipline-header {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .checkbox-disc {
          width: 17px;
          height: 17px;
          accent-color: #3b82f6;
          cursor: pointer;
        }
        .discipline-name {
          font-size: 14px;
          font-weight: 700;
          color: #e2e8f0;
        }
        .subactivities-container {
          margin-top: 12px;
          padding-left: 24px;
          padding-top: 12px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .subactivity-item {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .subactivity-header {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
        }
        .checkbox-sub {
          width: 15px;
          height: 15px;
          accent-color: #3b82f6;
          cursor: pointer;
        }
        .subactivity-name {
          font-size: 13px;
          color: #94a3b8;
          font-weight: 500;
        }
        .subactivity-name.highlight {
          color: #ffffff;
          font-weight: 600;
        }

        /* NO PROGRAMADAS */
        .empty-text {
          font-size: 12px;
          color: #64748b;
          font-style: italic;
          padding: 8px 0;
        }
        .no-prog-card {
          background: #0b121d;
          border: 1px solid rgba(245, 158, 11, 0.2);
          border-radius: 12px;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .no-prog-top {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* BOTTOM BAR */
        .bottom-bar {
          display: flex;
          justify-content: flex-end;
          padding-top: 8px;
        }
        .btn-save-bottom {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 13px 28px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
          transition: all 0.2s ease;
          width: 100%;
          justify-content: center;
        }
        @media (min-width: 640px) {
          .btn-save-bottom {
            width: auto;
          }
        }
        .btn-save-bottom:hover:not(:disabled) {
          background: linear-gradient(135deg, #3b82f6, #2563eb);
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(37, 99, 235, 0.5);
        }
        .btn-save-bottom:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        :global(.spinner) {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
