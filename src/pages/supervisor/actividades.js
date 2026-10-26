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
  ChevronDown,
  ChevronUp
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

  // Conteo total de ítems activos
  const totalItemsRegistrados = (cargaDescargaActiva ? lineasCargaDescarga.filter(l => l.id_3wl || l.cantidad).length : 0)
    + Object.values(subactividadesData).filter(s => s.checked).length
    + tareasNoProgramadas.filter(t => t.descripcion?.trim()).length;

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
      setErrorMsg("Ingresa al menos una línea con datos antes de guardar.");
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
        setSuccessMsg("¡Actividades guardadas y vinculadas exitosamente!");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrorMsg(json.error || "Ocurrió un error al guardar.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mobile-loading">
        <Loader2 className="spinner" size={36} />
        <p>Cargando actividades 3WL...</p>
        <style jsx>{`
          .mobile-loading {
            min-height: 100vh;
            background: #090e17;
            color: #94a3b8;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Poppins', sans-serif;
            gap: 12px;
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
    <div className="app-shell">
      <Head>
        <title>Actividades 3WL | Supervisor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      {/* HEADER MÓVIL / TABLET FIJO */}
      <header className="mobile-header">
        <div className="header-container">
          <button onClick={() => router.back()} className="icon-btn" aria-label="Volver">
            <ArrowLeft size={20} />
          </button>
          
          <div className="header-titles">
            <h1 className="header-main-title">Actividades 3WL</h1>
            <span className="header-equipo-badge">
              <Truck size={12} />
              {equipo ? `${formatEquipoLabel(equipo)}` : "Equipo de Faena"}
            </span>
          </div>

          <button onClick={handleGuardar} disabled={saving} className="header-save-btn">
            {saving ? <Loader2 size={16} className="spinner" /> : <Save size={16} />}
            <span className="save-btn-txt">{saving ? "..." : "Guardar"}</span>
          </button>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="mobile-main">
        {/* Notificaciones */}
        {successMsg && (
          <div className="banner-alert success">
            <CheckCircle2 size={18} className="alert-ico" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="banner-alert error">
            <AlertCircle size={18} className="alert-ico" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* TARJETA DE RESUMEN OPERACIONAL COMPACTA PARA MÓVIL */}
        <section className="summary-pill-card">
          <div className="pill-item">
            <div className="pill-icon blue">
              <Truck size={16} />
            </div>
            <div className="pill-texts">
              <span className="pill-label">Equipo</span>
              <strong className="pill-val">{equipo?.descripcion_equipo || "—"}</strong>
            </div>
          </div>

          <div className="pill-divider" />

          <div className="pill-item">
            <div className="pill-icon amber">
              <User size={16} />
            </div>
            <div className="pill-texts">
              <span className="pill-label">Supervisor</span>
              <strong className="pill-val">{supervisor?.nombre_completo?.split(" ")[0] || "Asignado"}</strong>
            </div>
          </div>

          <div className="pill-divider" />

          <div className="pill-item">
            <div className="pill-icon emerald">
              <Clock size={16} />
            </div>
            <div className="pill-texts">
              <span className="pill-label">Horario</span>
              <strong className="pill-val">
                {bloque ? `${bloque.hora_inicio?.slice(0, 5)} - ${bloque.hora_fin?.slice(0, 5)}` : "Turno"}
              </strong>
            </div>
          </div>
        </section>

        {/* 1. SECCIÓN CARGA / DESCARGA */}
        <section className="card-section">
          <div className="section-top-bar" onClick={() => setCargaDescargaActiva(!cargaDescargaActiva)}>
            <label className="toggle-label-wrap" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={cargaDescargaActiva}
                onChange={(e) => setCargaDescargaActiva(e.target.checked)}
                className="custom-checkbox"
              />
              <span className="section-heading">Carga/Descarga</span>
            </label>
            <span className="tag-pill">Izajes & Horómetro</span>
          </div>

          {cargaDescargaActiva && (
            <div className="section-content">
              <div className="cards-list">
                {lineasCargaDescarga.map((linea, index) => (
                  <div key={linea.id} className="item-card">
                    <div className="item-card-header">
                      <div className="input-group 3wl-input-group">
                        <span className="group-prefix">Id 3WL:</span>
                        <input
                          type="text"
                          placeholder="Ej: ELE-01"
                          value={linea.id_3wl}
                          onChange={(e) => handleUpdateLineaCarga(linea.id, "id_3wl", e.target.value)}
                          className="input-cell id3wl"
                        />
                      </div>
                      
                      {lineasCargaDescarga.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLineaCarga(linea.id)}
                          className="trash-touch-btn"
                          title="Eliminar"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>

                    <div className="mobile-grid-inputs">
                      {/* Cantidad y Unidad */}
                      <div className="input-cell-pair">
                        <span className="cell-label">Cantidad</span>
                        <div className="pair-controls">
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            placeholder="0.00"
                            value={linea.cantidad}
                            onChange={(e) => handleUpdateLineaCarga(linea.id, "cantidad", e.target.value)}
                            className="input-cell number-cell"
                          />
                          <select
                            value={linea.unidad}
                            onChange={(e) => handleUpdateLineaCarga(linea.id, "unidad", e.target.value)}
                            className="select-cell"
                          >
                            <option value="Ton">Ton</option>
                            <option value="m3">m3</option>
                            <option value="m2">m2</option>
                            <option value="un">un</option>
                            <option value="kg">kg</option>
                          </select>
                        </div>
                      </div>

                      {/* Izajes y Horómetro */}
                      <div className="input-cell-pair">
                        <span className="cell-label">Izajes / Horómetro</span>
                        <div className="pair-controls">
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Izajes"
                            value={linea.izajes}
                            onChange={(e) => handleUpdateLineaCarga(linea.id, "izajes", e.target.value)}
                            className="input-cell number-cell"
                          />
                          <div className="horo-wrapper">
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0.0"
                              value={linea.horometro}
                              onChange={(e) => handleUpdateLineaCarga(linea.id, "horometro", e.target.value)}
                              className="input-cell number-cell horo"
                            />
                            <span className="unit-suffix">hrs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button type="button" onClick={handleAddLineaCarga} className="mobile-add-btn">
                <Plus size={16} />
                <span>Agregar línea de izaje</span>
              </button>
            </div>
          )}
        </section>

        {/* 2. SECCIÓN DISCIPLINAS Y ESPECIALIDADES (ACCORDION) */}
        <section className="card-section">
          <div className="section-top-bar static">
            <div className="title-with-icon">
              <Building2 size={18} color="#38bdf8" />
              <h2 className="section-heading">Disciplinas Operacionales</h2>
            </div>
            <span className="tag-pill">Toca para desplegar</span>
          </div>

          <div className="disciplines-accordion">
            {DISCIPLINAS_ESTANDAR.map((disc) => {
              const isOpen = disciplinasCheck[disc.key];
              const subCount = disc.subactividades.filter(s => subactividadesData[s]?.checked).length;

              return (
                <div key={disc.key} className={`accordion-panel ${isOpen ? "open" : ""}`}>
                  <div className="panel-header" onClick={() => toggleDisciplina(disc.key)}>
                    <label className="panel-toggle" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isOpen}
                        onChange={() => toggleDisciplina(disc.key)}
                        className="custom-checkbox"
                      />
                      <span className="discipline-label">{disc.label}</span>
                    </label>

                    <div className="panel-meta">
                      {subCount > 0 && (
                        <span className="active-badge">{subCount} activa{subCount > 1 ? "s" : ""}</span>
                      )}
                      <button type="button" className="chevron-btn">
                        {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </button>
                    </div>
                  </div>

                  {isOpen && (
                    <div className="panel-body">
                      {disc.subactividades.map((subName) => {
                        const subData = subactividadesData[subName] || { checked: false };
                        const isChecked = !!subData.checked;

                        return (
                          <div key={subName} className={`sub-item-block ${isChecked ? "selected" : ""}`}>
                            <div className="sub-toggle-row" onClick={() => toggleSubactividad(subName, disc.label)}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleSubactividad(subName, disc.label)}
                                className="custom-checkbox sub"
                              />
                              <span className={`sub-name ${isChecked ? "active" : ""}`}>{subName}</span>
                            </div>

                            {isChecked && (
                              <div className="sub-matrix-inputs">
                                <div className="sub-input-row">
                                  <div className="input-group full">
                                    <span className="group-prefix">Id 3WL:</span>
                                    <input
                                      type="text"
                                      placeholder="Código 3WL"
                                      value={subData.id_3wl || ""}
                                      onChange={(e) => updateSubactividad(subName, "id_3wl", e.target.value)}
                                      className="input-cell id3wl"
                                    />
                                  </div>
                                </div>

                                <div className="mobile-grid-inputs">
                                  <div className="input-cell-pair">
                                    <span className="cell-label">Cantidad & Medida</span>
                                    <div className="pair-controls">
                                      <input
                                        type="number"
                                        step="any"
                                        inputMode="decimal"
                                        placeholder="0"
                                        value={subData.cantidad || ""}
                                        onChange={(e) => updateSubactividad(subName, "cantidad", e.target.value)}
                                        className="input-cell number-cell"
                                      />
                                      <select
                                        value={subData.unidad || "Ton"}
                                        onChange={(e) => updateSubactividad(subName, "unidad", e.target.value)}
                                        className="select-cell"
                                      >
                                        <option value="Ton">Ton</option>
                                        <option value="m3">m3</option>
                                        <option value="m2">m2</option>
                                        <option value="un">un</option>
                                        <option value="ml">ml</option>
                                      </select>
                                    </div>
                                  </div>

                                  <div className="input-cell-pair">
                                    <span className="cell-label">Izajes / Horómetro</span>
                                    <div className="pair-controls">
                                      <input
                                        type="number"
                                        inputMode="numeric"
                                        placeholder="Izajes"
                                        value={subData.izajes || ""}
                                        onChange={(e) => updateSubactividad(subName, "izajes", e.target.value)}
                                        className="input-cell number-cell"
                                      />
                                      <div className="horo-wrapper">
                                        <input
                                          type="number"
                                          step="any"
                                          inputMode="decimal"
                                          placeholder="0.0"
                                          value={subData.horometro || ""}
                                          onChange={(e) => updateSubactividad(subName, "horometro", e.target.value)}
                                          className="input-cell number-cell horo"
                                        />
                                        <span className="unit-suffix">hrs</span>
                                      </div>
                                    </div>
                                  </div>
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
        </section>

        {/* 3. SECCIÓN TAREAS NO PROGRAMADAS */}
        <section className="card-section">
          <div className="section-top-bar static">
            <div>
              <h2 className="section-heading">Tareas No Programadas</h2>
              <span className="sub-helper">Labores fuera de programa</span>
            </div>
            <button type="button" onClick={handleAddNoProgramada} className="mobile-add-btn amber-small">
              <Plus size={14} />
              <span>Agregar</span>
            </button>
          </div>

          <div className="section-content">
            {tareasNoProgramadas.length === 0 ? (
              <p className="empty-message">No se han registrado tareas fuera de programa para este turno.</p>
            ) : (
              <div className="cards-list">
                {tareasNoProgramadas.map((t) => (
                  <div key={t.id} className="item-card no-prog">
                    <div className="item-card-header">
                      <input
                        type="text"
                        placeholder="Descripción de la labor reactiva..."
                        value={t.descripcion}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "descripcion", e.target.value)}
                        className="input-cell full-desc"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveNoProgramada(t.id)}
                        className="trash-touch-btn"
                        title="Eliminar"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="mobile-grid-inputs">
                      <div className="input-cell-pair">
                        <span className="cell-label">Cantidad & Medida</span>
                        <div className="pair-controls">
                          <input
                            type="number"
                            step="any"
                            inputMode="decimal"
                            placeholder="0"
                            value={t.cantidad}
                            onChange={(e) => handleUpdateNoProgramada(t.id, "cantidad", e.target.value)}
                            className="input-cell number-cell"
                          />
                          <select
                            value={t.unidad}
                            onChange={(e) => handleUpdateNoProgramada(t.id, "unidad", e.target.value)}
                            className="select-cell"
                          >
                            <option value="Ton">Ton</option>
                            <option value="m3">m3</option>
                            <option value="m2">m2</option>
                            <option value="un">un</option>
                            <option value="hrs">hrs</option>
                          </select>
                        </div>
                      </div>

                      <div className="input-cell-pair">
                        <span className="cell-label">Izajes / Horómetro</span>
                        <div className="pair-controls">
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Izajes"
                            value={t.izajes}
                            onChange={(e) => handleUpdateNoProgramada(t.id, "izajes", e.target.value)}
                            className="input-cell number-cell"
                          />
                          <div className="horo-wrapper">
                            <input
                              type="number"
                              step="any"
                              inputMode="decimal"
                              placeholder="0.0"
                              value={t.horometro}
                              onChange={(e) => handleUpdateNoProgramada(t.id, "horometro", e.target.value)}
                              className="input-cell number-cell horo"
                            />
                            <span className="unit-suffix">hrs</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* BARRA FLOTANTE FIJA INFERIOR PARA MÓVIL */}
      <footer className="sticky-mobile-footer">
        <div className="footer-inner">
          <div className="footer-count">
            <span className="count-dot" />
            <span className="count-txt">
              {totalItemsRegistrados > 0 
                ? `${totalItemsRegistrados} labor${totalItemsRegistrados > 1 ? "es" : ""} lista${totalItemsRegistrados > 1 ? "s" : ""}` 
                : "Sin labores aún"}
            </span>
          </div>

          <button onClick={handleGuardar} disabled={saving} className="btn-confirm-sticky">
            {saving ? <Loader2 size={18} className="spinner" /> : <Save size={18} />}
            <span>{saving ? "Guardando..." : "Confirmar y Guardar"}</span>
          </button>
        </div>
      </footer>

      <style jsx>{`
        /* ESTILOS BASE MOBILE-FIRST & TABLET */
        .app-shell {
          min-height: 100vh;
          background: #080d16;
          color: #f8fafc;
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
          padding-bottom: 90px;
          -webkit-tap-highlight-color: transparent;
        }

        /* HEADER FIJO */
        .mobile-header {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(11, 19, 32, 0.96);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
        }
        .header-container {
          max-width: 720px;
          margin: 0 auto;
          padding: 10px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .icon-btn {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          background: #162233;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          flex-shrink: 0;
        }
        .icon-btn:active {
          background: #23354f;
          transform: scale(0.96);
        }
        .header-titles {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }
        .header-main-title {
          font-size: 15px;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .header-equipo-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: #fbbf24;
          font-weight: 600;
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .header-save-btn {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 8px 14px;
          border-radius: 10px;
          font-weight: 600;
          font-size: 13px;
          display: flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          box-shadow: 0 2px 10px rgba(37, 99, 235, 0.35);
          flex-shrink: 0;
          min-height: 38px;
        }
        .header-save-btn:active {
          transform: scale(0.97);
        }
        .header-save-btn:disabled {
          opacity: 0.6;
        }

        /* MAIN */
        .mobile-main {
          max-width: 720px;
          margin: 0 auto;
          padding: 14px 12px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        /* BANNER ALERTS */
        .banner-alert {
          padding: 10px 14px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 12px;
          font-weight: 500;
        }
        .banner-alert.success {
          background: rgba(16, 185, 129, 0.15);
          border: 1px solid rgba(16, 185, 129, 0.35);
          color: #6ee7b7;
        }
        .banner-alert.error {
          background: rgba(244, 63, 94, 0.15);
          border: 1px solid rgba(244, 63, 94, 0.35);
          color: #fda4af;
        }

        /* SUMMARY PILL CARD */
        .summary-pill-card {
          background: #0f1927;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
        }
        .pill-item {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
          flex: 1;
        }
        .pill-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .pill-icon.blue { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
        .pill-icon.amber { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .pill-icon.emerald { background: rgba(16, 185, 129, 0.2); color: #34d399; }
        .pill-texts {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .pill-label {
          font-size: 9px;
          color: #64748b;
          text-transform: uppercase;
          font-weight: 700;
        }
        .pill-val {
          font-size: 11px;
          font-weight: 700;
          color: #ffffff;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .pill-divider {
          width: 1px;
          height: 24px;
          background: rgba(255, 255, 255, 0.08);
          flex-shrink: 0;
        }

        /* CARD SECTIONS */
        .card-section {
          background: #0f1927;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
        }
        .section-top-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.07);
          cursor: pointer;
        }
        .section-top-bar.static {
          cursor: default;
        }
        .toggle-label-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .section-heading {
          font-size: 14px;
          font-weight: 700;
          color: #ffffff;
        }
        .title-with-icon {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tag-pill {
          font-size: 10px;
          color: #94a3b8;
          background: #182638;
          padding: 3px 8px;
          border-radius: 6px;
          font-weight: 600;
        }
        .sub-helper {
          font-size: 10px;
          color: #64748b;
          display: block;
        }
        .section-content {
          padding-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        /* CUSTOM CHECKBOX */
        .custom-checkbox {
          width: 20px;
          height: 20px;
          border-radius: 5px;
          accent-color: #3b82f6;
          cursor: pointer;
        }
        .custom-checkbox.sub {
          width: 18px;
          height: 18px;
        }

        /* ITEM CARDS */
        .cards-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .item-card {
          background: #09101b;
          border: 1px solid rgba(255, 255, 255, 0.07);
          border-radius: 12px;
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .item-card.no-prog {
          border-color: rgba(245, 158, 11, 0.25);
        }
        .item-card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .trash-touch-btn {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(244, 63, 94, 0.1);
          color: #f43f5e;
          border: none;
          border-radius: 8px;
          cursor: pointer;
        }
        .trash-touch-btn:active {
          background: rgba(244, 63, 94, 0.25);
        }

        /* INPUT GROUPS & CELLS */
        .input-group {
          display: flex;
          align-items: center;
          background: #142032;
          border: 1px solid #283950;
          border-radius: 8px;
          padding: 0 8px;
          height: 38px;
        }
        .input-group.full {
          width: 100%;
        }
        .group-prefix {
          font-size: 11px;
          color: #94a3b8;
          font-weight: 600;
          margin-right: 6px;
          white-space: nowrap;
        }
        .input-cell {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 13px;
          font-family: inherit;
          outline: none;
          height: 100%;
          width: 100%;
        }
        .input-cell.id3wl {
          font-weight: 600;
          color: #60a5fa;
        }
        .input-cell.full-desc {
          background: #142032;
          border: 1px solid #283950;
          border-radius: 8px;
          padding: 8px 10px;
          height: 38px;
          font-size: 12px;
          color: #ffffff;
        }

        /* MOBILE 2-COLUMN INPUT GRID */
        .mobile-grid-inputs {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        @media (max-width: 400px) {
          .mobile-grid-inputs {
            grid-template-columns: 1fr;
          }
        }
        .input-cell-pair {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .cell-label {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
          text-transform: uppercase;
        }
        .pair-controls {
          display: flex;
          align-items: center;
          gap: 4px;
          background: #142032;
          border: 1px solid #283950;
          border-radius: 8px;
          padding: 0 6px;
          height: 38px;
        }
        .input-cell.number-cell {
          background: transparent;
          border: none;
          color: #ffffff;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          width: 100%;
          min-width: 0;
        }
        .select-cell {
          background: #1c2b42;
          border: 1px solid #334866;
          color: #cbd5e1;
          font-size: 11px;
          font-weight: 600;
          border-radius: 6px;
          padding: 3px 6px;
          outline: none;
          cursor: pointer;
        }
        .horo-wrapper {
          display: flex;
          align-items: center;
          gap: 2px;
          width: 100%;
          min-width: 0;
        }
        .unit-suffix {
          font-size: 10px;
          color: #64748b;
          font-weight: 600;
        }

        /* BOTONES DE AGREGAR */
        .mobile-add-btn {
          width: 100%;
          min-height: 42px;
          background: rgba(59, 130, 246, 0.12);
          border: 1px dashed rgba(59, 130, 246, 0.4);
          color: #60a5fa;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          margin-top: 4px;
        }
        .mobile-add-btn:active {
          background: rgba(59, 130, 246, 0.25);
        }
        .mobile-add-btn.amber-small {
          width: auto;
          min-height: 32px;
          padding: 4px 10px;
          font-size: 11px;
          border-style: solid;
          background: rgba(245, 158, 11, 0.15);
          border-color: rgba(245, 158, 11, 0.35);
          color: #fbbf24;
          margin-top: 0;
        }

        /* ACCORDION DISCIPLINAS */
        .disciplines-accordion {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 10px;
        }
        .accordion-panel {
          background: #09101b;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 12px;
          overflow: hidden;
          transition: border-color 0.2s;
        }
        .accordion-panel.open {
          border-color: rgba(59, 130, 246, 0.35);
        }
        .panel-header {
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          min-height: 48px;
        }
        .panel-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          cursor: pointer;
        }
        .discipline-label {
          font-size: 13px;
          font-weight: 700;
          color: #ffffff;
        }
        .panel-meta {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .active-badge {
          background: rgba(16, 185, 129, 0.2);
          color: #34d399;
          border: 1px solid rgba(16, 185, 129, 0.35);
          font-size: 10px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 12px;
        }
        .chevron-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .panel-body {
          padding: 0 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .sub-item-block {
          background: #0f1927;
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 10px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .sub-item-block.selected {
          border-color: rgba(59, 130, 246, 0.25);
          background: #111d2e;
        }
        .sub-toggle-row {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          min-height: 32px;
        }
        .sub-name {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .sub-name.active {
          color: #ffffff;
          font-weight: 700;
        }
        .sub-matrix-inputs {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-top: 4px;
        }
        .empty-message {
          font-size: 11px;
          color: #64748b;
          font-style: italic;
          padding: 6px 0;
        }

        /* STICKY FOOTER FIJO PARA MÓVIL */
        .sticky-mobile-footer {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 50;
          background: rgba(11, 19, 32, 0.95);
          backdrop-filter: blur(16px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding: 10px 14px;
          padding-bottom: max(10px, env(safe-area-inset-bottom));
          box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
        }
        .footer-inner {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .footer-count {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .count-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 8px #10b981;
        }
        .count-txt {
          font-size: 12px;
          font-weight: 600;
          color: #cbd5e1;
        }
        .btn-confirm-sticky {
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          color: white;
          border: none;
          padding: 12px 20px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 15px rgba(37, 99, 235, 0.4);
          min-height: 46px;
        }
        .btn-confirm-sticky:active {
          transform: scale(0.98);
        }
        .btn-confirm-sticky:disabled {
          opacity: 0.6;
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
