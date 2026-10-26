import React, { useState, useEffect } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { 
  CheckSquare, 
  Square, 
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
  // Estructura: { [subactividadKey]: { checked: boolean, id_3wl: string, cantidad: string, unidad: string, izajes: string, horometro: string } }
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
        const data = await res.json();

        if (res.ok && data.success) {
          setBloque(data.bloque);
          setEquipo(data.equipo || data.bloque?.equipos);
          setSupervisor(data.supervisor || data.bloque?.supervisor);
          setTareasEimi(data.tareas_eimiplanner || []);

          // Si hay tareas EIMIPLANNER, pre-asignar el primer 3WL a la primera línea
          if (data.tareas_eimiplanner?.length > 0) {
            const firstTask = data.tareas_eimiplanner[0];
            setLineasCargaDescarga([
              { 
                id: 1, 
                id_3wl: firstTask.codigo || firstTask.id, 
                cantidad: "", 
                unidad: "Ton", 
                izajes: "", 
                horometro: "" 
              }
            ]);
          }
        } else {
          setErrorMsg(data.error || "Error al cargar tareas de especialidad.");
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Error de red al conectar con el servidor.");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [router.isReady, bloque_id, equipo_id, supervisor_id]);

  // Manejo de líneas Carga/Descarga
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

  // Manejo de disciplinas padre
  const toggleDisciplina = (key) => {
    setDisciplinasCheck(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Manejo de subactividades
  const toggleSubactividad = (subName, disciplinaKey) => {
    setSubactividadesData(prev => {
      const current = prev[subName];
      if (current?.checked) {
        return {
          ...prev,
          [subName]: { ...current, checked: false }
        };
      } else {
        return {
          ...prev,
          [subName]: {
            checked: true,
            disciplina: disciplinaKey,
            id_3wl: "",
            cantidad: "",
            unidad: "Ton",
            izajes: "",
            horometro: ""
          }
        };
      }
    });
  };

  const updateSubactividad = (subName, field, value) => {
    setSubactividadesData(prev => ({
      ...prev,
      [subName]: { ...prev[subName], [field]: value }
    }));
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

  // Guardar todas las actividades
  const handleGuardar = async () => {
    setSaving(true);
    setErrorMsg("");
    setSuccessMsg("");

    const payloadActividades = [];

    // 1. Agregar Carga/Descarga si está activa
    if (cargaDescargaActiva) {
      for (const l of lineasCargaDescarga) {
        if (l.cantidad || l.horometro || l.id_3wl) {
          payloadActividades.push({
            categoria_disciplina: "Carga/Descarga",
            subactividad: "Carga/Descarga",
            descripcion: `Carga/Descarga 3WL: ${l.id_3wl || "General"}`,
            id_3wl: l.id_3wl || null,
            cantidad_ejecutada: l.cantidad || 0,
            unidad: l.unidad || "Ton",
            izajes: l.izajes || 0,
            horometro_horas: l.horometro || 0,
            programada: true,
          });
        }
      }
    }

    // 2. Agregar Subactividades marcadas
    for (const [subName, data] of Object.entries(subactividadesData)) {
      if (data?.checked) {
        payloadActividades.push({
          categoria_disciplina: data.disciplina || "Especialidad",
          subactividad: subName,
          descripcion: `${data.disciplina} - ${subName}${data.id_3wl ? ` [3WL: ${data.id_3wl}]` : ""}`,
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
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
        <p className="text-slate-300 font-medium">Cargando tareas del EIMIPLANNER 3WL...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-16 font-sans">
      <Head>
        <title>Actividades Supervisor | LukeMaquinarias</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </Head>

      {/* Header Superior */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => router.back()} 
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-amber-400" />
                Asignación de Actividades 3WL
              </h1>
              <p className="text-xs text-slate-400">
                {equipo ? `${equipo.descripcion_equipo} (${formatEquipoLabel(equipo)})` : "Equipo de Faena"}
              </p>
            </div>
          </div>

          <button
            onClick={handleGuardar}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-semibold text-xs sm:text-sm shadow transition-all disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Guardar</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pt-6 space-y-6">

        {/* Notificaciones */}
        {successMsg && (
          <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 p-4 rounded-xl flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <p className="text-sm font-medium">{successMsg}</p>
          </div>
        )}

        {errorMsg && (
          <div className="bg-rose-950/80 border border-rose-500/50 text-rose-200 p-4 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
        )}

        {/* Tarjeta de Resumen Operacional */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wider font-semibold">Equipo</p>
              <p className="text-white font-bold text-sm truncate">{equipo?.descripcion_equipo || "—"}</p>
              <p className="text-slate-400">{formatEquipoLabel(equipo)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <User className="w-4 h-4" />
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wider font-semibold">Supervisor</p>
              <p className="text-white font-bold text-sm">{supervisor?.nombre_completo || "Asignado"}</p>
              <p className="text-slate-400">{supervisor?.especialidades?.nombre_oficial || "Especialidad"}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-slate-400 uppercase tracking-wider font-semibold">Horario Asignado</p>
              <p className="text-white font-bold text-sm">
                {bloque ? `${bloque.hora_inicio?.slice(0, 5)} - ${bloque.hora_fin?.slice(0, 5)}` : "Turno Completo"}
              </p>
              <p className="text-slate-400">{bloque?.operador?.nombre_completo ? `Op: ${bloque.operador.nombre_completo}` : "Operador asignado"}</p>
            </div>
          </div>
        </div>

        {/* Sección: Carga/Descarga (Fiel a la foto adjunta) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm sm:text-base text-white">
              <input
                type="checkbox"
                checked={cargaDescargaActiva}
                onChange={(e) => setCargaDescargaActiva(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
              />
              <span>Carga/Descarga</span>
            </label>
            <span className="text-xs text-slate-400 font-medium">Matriz de Izaje & Horómetro</span>
          </div>

          {cargaDescargaActiva && (
            <div className="space-y-3 pt-1">
              {lineasCargaDescarga.map((linea, index) => (
                <div key={linea.id} className="flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                  {/* Id 3WL */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-medium">Id 3WL:</span>
                    <input
                      type="text"
                      placeholder="Ej: 3WL-102"
                      value={linea.id_3wl}
                      onChange={(e) => handleUpdateLineaCarga(linea.id, "id_3wl", e.target.value)}
                      className="w-24 sm:w-28 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Cantidad */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-medium">Cantidad:</span>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={linea.cantidad}
                      onChange={(e) => handleUpdateLineaCarga(linea.id, "cantidad", e.target.value)}
                      className="w-16 sm:w-20 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Unidad de Medida */}
                  <div className="flex items-center gap-1 text-xs">
                    <select
                      value={linea.unidad}
                      onChange={(e) => handleUpdateLineaCarga(linea.id, "unidad", e.target.value)}
                      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    >
                      <option value="Ton">Ton</option>
                      <option value="m3">m3</option>
                      <option value="m2">m2</option>
                      <option value="un">un</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>

                  {/* Izajes */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-medium">Izajes:</span>
                    <input
                      type="number"
                      placeholder="0"
                      value={linea.izajes}
                      onChange={(e) => handleUpdateLineaCarga(linea.id, "izajes", e.target.value)}
                      className="w-14 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  {/* Horómetro */}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-400 font-medium">Horómetro:</span>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.0"
                      value={linea.horometro}
                      onChange={(e) => handleUpdateLineaCarga(linea.id, "horometro", e.target.value)}
                      className="w-16 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                    />
                    <span className="text-slate-500 text-[11px]">(hrs)</span>
                  </div>

                  {/* Eliminar línea */}
                  {lineasCargaDescarga.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLineaCarga(linea.id)}
                      className="text-red-400 hover:text-red-300 p-1 transition-colors ml-auto"
                      title="Eliminar fila"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddLineaCarga}
                className="mt-2 text-xs font-semibold text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Agregar línea
              </button>
            </div>
          )}
        </section>

        {/* Sección: Disciplinas y Subactividades (OOCC, Estructura, Piping, Mecánica, Calderería, Eléctrico) */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="font-bold text-sm sm:text-base text-white flex items-center gap-2">
              <Building2 className="w-4 h-4 text-blue-400" />
              Disciplinas y Especialidades Operacionales
            </h2>
            <span className="text-xs text-slate-400">Selecciona para desplegar labores</span>
          </div>

          <div className="space-y-4">
            {DISCIPLINAS_ESTANDAR.map((disc) => {
              const isOpen = disciplinasCheck[disc.key];

              return (
                <div key={disc.key} className="border border-slate-800/80 rounded-lg p-3 bg-slate-950/40">
                  {/* Encabezado disciplina */}
                  <label className="flex items-center gap-2.5 cursor-pointer font-bold text-sm text-slate-200 hover:text-white transition-colors">
                    <input
                      type="checkbox"
                      checked={isOpen}
                      onChange={() => toggleDisciplina(disc.key)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
                    />
                    <span>{disc.label}</span>
                  </label>

                  {/* Subactividades de la disciplina */}
                  {isOpen && (
                    <div className="mt-3 pl-6 space-y-3 pt-2 border-t border-slate-800/60">
                      {disc.subactividades.map((subName) => {
                        const subData = subactividadesData[subName] || { checked: false };
                        const isSubChecked = !!subData.checked;

                        return (
                          <div key={subName} className="space-y-2">
                            <label className="flex items-center gap-2 cursor-pointer text-xs sm:text-sm text-slate-300 hover:text-white">
                              <input
                                type="checkbox"
                                checked={isSubChecked}
                                onChange={() => toggleSubactividad(subName, disc.label)}
                                className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700"
                              />
                              <span className={isSubChecked ? "font-semibold text-white" : ""}>{subName}</span>
                            </label>

                            {/* Inputs detallados si la subactividad está activa */}
                            {isSubChecked && (
                              <div className="ml-5 flex flex-wrap items-center gap-2 sm:gap-3 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-xs">
                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400">Id 3WL:</span>
                                  <input
                                    type="text"
                                    placeholder="3WL"
                                    value={subData.id_3wl || ""}
                                    onChange={(e) => updateSubactividad(subName, "id_3wl", e.target.value)}
                                    className="w-20 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400">Cant:</span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0"
                                    value={subData.cantidad || ""}
                                    onChange={(e) => updateSubactividad(subName, "cantidad", e.target.value)}
                                    className="w-16 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <select
                                    value={subData.unidad || "Ton"}
                                    onChange={(e) => updateSubactividad(subName, "unidad", e.target.value)}
                                    className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-slate-200 text-xs outline-none"
                                  >
                                    <option value="Ton">Ton</option>
                                    <option value="m3">m3</option>
                                    <option value="m2">m2</option>
                                    <option value="un">un</option>
                                    <option value="ml">ml</option>
                                  </select>
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400">Izajes:</span>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    value={subData.izajes || ""}
                                    onChange={(e) => updateSubactividad(subName, "izajes", e.target.value)}
                                    className="w-14 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </div>

                                <div className="flex items-center gap-1">
                                  <span className="text-slate-400">Horómetro:</span>
                                  <input
                                    type="number"
                                    step="any"
                                    placeholder="0.0"
                                    value={subData.horometro || ""}
                                    onChange={(e) => updateSubactividad(subName, "horometro", e.target.value)}
                                    className="w-16 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-white text-xs outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <span className="text-slate-500 text-[11px]">(hrs)</span>
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

        {/* Sección: Tareas NO Programadas */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h2 className="font-bold text-sm sm:text-base text-white">Tareas No Programadas</h2>
              <p className="text-xs text-slate-400">Labores reactivas ejecutadas fuera del 3WL oficial</p>
            </div>
            <button
              type="button"
              onClick={handleAddNoProgramada}
              className="text-xs font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar no programada
            </button>
          </div>

          {tareasNoProgramadas.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-2">
              No se han agregado tareas fuera de programa para este turno.
            </p>
          ) : (
            <div className="space-y-3">
              {tareasNoProgramadas.map((t) => (
                <div key={t.id} className="bg-slate-950/60 p-3 rounded-lg border border-amber-500/20 space-y-2 text-xs">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Describe la labor realizada no programada..."
                      value={t.descripcion}
                      onChange={(e) => handleUpdateNoProgramada(t.id, "descripcion", e.target.value)}
                      className="flex-1 px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded text-white text-xs outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveNoProgramada(t.id)}
                      className="text-red-400 hover:text-red-300 p-1"
                      title="Eliminar"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Cantidad:</span>
                      <input
                        type="number"
                        step="any"
                        placeholder="0"
                        value={t.cantidad}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "cantidad", e.target.value)}
                        className="w-16 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-white text-xs outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <select
                        value={t.unidad}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "unidad", e.target.value)}
                        className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-slate-200 text-xs outline-none"
                      >
                        <option value="Ton">Ton</option>
                        <option value="m3">m3</option>
                        <option value="m2">m2</option>
                        <option value="un">un</option>
                        <option value="hrs">hrs</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Izajes:</span>
                      <input
                        type="number"
                        placeholder="0"
                        value={t.izajes}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "izajes", e.target.value)}
                        className="w-14 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-white text-xs outline-none"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">Horómetro:</span>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.0"
                        value={t.horometro}
                        onChange={(e) => handleUpdateNoProgramada(t.id, "horometro", e.target.value)}
                        className="w-16 px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-white text-xs outline-none"
                      />
                      <span className="text-slate-500 text-[11px]">(hrs)</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Botón flotante inferior para guardar */}
        <div className="pt-4 flex justify-end">
          <button
            onClick={handleGuardar}
            disabled={saving}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg transition-all disabled:opacity-50 text-sm"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            <span>Guardar y Confirmar Actividades</span>
          </button>
        </div>

      </main>
    </div>
  );
}
