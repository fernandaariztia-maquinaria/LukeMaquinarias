import { useState, useEffect, useCallback, useRef } from "react";
import { ESTADO_CONFIG } from "../Shared/constants";

// ================================================================
// HOOKS AUXILIARES DE API (INTERNOS)
// ================================================================
function useApi(endpoint, deps = []) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const r = await fetch(endpoint);
      const json = await r.json();
      setData(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => { fetch_(false); }, deps);
  return { data, loading, refresh: (silent = false) => fetch_(silent) };
}

function usePaginatedApi(endpoint, initialLimit = 15, deps = [], proyectoActivoId) {
  const [data, setData] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("limit", initialLimit.toString());
      if (search.trim() !== "") {
        url.searchParams.set("search", search.trim());
      }
      if (proyectoActivoId) {
        url.searchParams.set("proyecto_id", proyectoActivoId);
      }
      const r = await fetch(url.toString());
      const json = await r.json();
      setData(json.data || []);
      setCount(json.count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [endpoint, page, search, initialLimit, proyectoActivoId]);

  useEffect(() => {
    fetch_(false);
  }, [page, search, proyectoActivoId, ...deps]);

  // Resetear página a 1 cuando cambie la búsqueda
  useEffect(() => {
    setPage(1);
  }, [search]);

  return {
    data,
    count,
    loading,
    page,
    setPage,
    search,
    setSearch,
    refresh: (silent = false) => fetch_(silent),
    limit: initialLimit,
  };
}

function useReportesPaginado(initialLimit = 20, deps = [], proyectoActivoId) {
  const [data, setData] = useState([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [equipoId, setEquipoId] = useState("");
  const [operadorId, setOperadorId] = useState("");
  const [fecha, setFecha] = useState("");

  const fetch_ = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const url = new URL("/api/reportes", window.location.origin);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("limit", initialLimit.toString());
      if (equipoId) url.searchParams.set("equipo_id", equipoId);
      if (operadorId) url.searchParams.set("operador_id", operadorId);
      if (fecha) url.searchParams.set("fecha", fecha);
      if (proyectoActivoId) url.searchParams.set("proyecto_id", proyectoActivoId);

      const r = await fetch(url.toString());
      const json = await r.json();
      setData(json.data || []);
      setCount(json.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, equipoId, operadorId, fecha, initialLimit, proyectoActivoId]);

  useEffect(() => {
    fetch_(false);
  }, [page, equipoId, operadorId, fecha, proyectoActivoId, ...deps]);

  // Resetear página a 1 cuando cambien filtros
  useEffect(() => {
    setPage(1);
  }, [equipoId, operadorId, fecha]);

  return {
    data,
    count,
    loading,
    page,
    setPage,
    equipoId,
    setEquipoId,
    operadorId,
    setOperadorId,
    fecha,
    setFecha,
    refresh: (silent = false) => fetch_(silent),
    limit: initialLimit
  };
}

// ================================================================
// HOOK PRINCIPAL DE ADMINISTRACIÓN
// ================================================================
export function useAdminMaquinaria(proyectoActivoId, rolActual = null) {
  const [tab, setTab] = useState("monitor");
  const [pautaEquipo, setPautaEquipo] = useState(null);
  const [editEquipo, setEditEquipo] = useState(null);
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [filtroComercial, setFiltroComercial] = useState("TODOS");
  const [searchMonitor, setSearchMonitor] = useState("");
  const [agruparPorProyecto, setAgruparPorProyecto] = useState(false);
  const [soloCombustibleCritico, setSoloCombustibleCritico] = useState(false);
  const pollRef = useRef(null);

  // APIs y Datos
  const equiposCompleto = useApi(`/api/equipos${proyectoActivoId ? `?proyecto_id=${proyectoActivoId}` : ""}`, [tab, proyectoActivoId]);
  const equiposPaginado = usePaginatedApi("/api/equipos", 15, [tab], proyectoActivoId);
  const proyectosCompleto = useApi("/api/proyectos", [tab]);
  const proyectosPaginado = usePaginatedApi("/api/proyectos", 15, [tab]);
  const personalCompleto = useApi(`/api/personal${proyectoActivoId ? `?proyecto_id=${proyectoActivoId}` : ""}`, [tab, proyectoActivoId]);
  const personalPaginado = usePaginatedApi("/api/personal", 15, [tab], proyectoActivoId);
  const reportes = useReportesPaginado(20, [tab], proyectoActivoId);
  // Jefe de Area solo ve/gestiona las solicitudes de su propio proyecto; Administrador ve todas
  const registrosProyectoFiltro = rolActual === "Jefe de Area" ? proyectoActivoId : null;
  const registros = useApi(
    `/api/registros${registrosProyectoFiltro ? `?proyecto_id=${registrosProyectoFiltro}` : ""}`,
    [tab, registrosProyectoFiltro]
  );
  const especialidades = useApi("/api/especialidades", [tab]);

  // Polling periódico silencioso (cada 10s) para reflejar cambios en caliente (combustible, estado, etc.)
  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      if (tab === "monitor" || tab === "equipos") {
        equiposCompleto.refresh(true);
        if (tab === "equipos") equiposPaginado.refresh(true);
      } else if (tab === "reportes") {
        reportes.refresh(true);
      } else if (tab === "registros") {
        registros.refresh(true);
      }
    }, 10000);

    return () => clearInterval(timer);
  }, [tab, equiposCompleto.refresh, equiposPaginado.refresh, reportes.refresh, registros.refresh]);

  // Estados de edición para la pestaña de registros
  const [editRegistros, setEditRegistros] = useState({});
  const [rechazoId, setRechazoId] = useState(null);
  const [notaRechazo, setNotaRechazo] = useState("");

  // Formularios de Creación
  const [formEquipo, setFormEquipo] = useState({
    codigo_interno: "",
    descripcion_equipo: "",
    proveedor: "EIMISA",
    proyecto_actual_id: "",
    seguimiento_completo: true,
    clasificacion_comercial: "OPERATIVO - EN USO",
    arriendo_cliente: "",
    arriendo_fecha_inicio: "",
    arriendo_fecha_fin: ""
  });
  const [formProyecto, setFormProyecto] = useState({
    nombre_proyecto: "",
    codigo_cc: "",
    ubicacion: ""
  });
  const [formPersonal, setFormPersonal] = useState({
    rut: "",
    nombre_completo: "",
    whatsapp: "",
    rol: "Operador",
    turno_tipo: "14x14",
    jornada_tipo: "Dia",
    proyecto_actual_id: "",
    especialidad_id: "",
    foto_url: "",
    email: ""
  });

  const [formEspecialidad, setFormEspecialidad] = useState({
    nombre_oficial: "",
    descripcion: ""
  });

  // Formularios de Edición
  const [editingProyectoId, setEditingProyectoId] = useState(null);
  const [formEditProyecto, setFormEditProyecto] = useState({
    nombre_proyecto: "",
    codigo_cc: "",
    ubicacion: "",
    activa: true
  });
  const [editingPersonalId, setEditingPersonalId] = useState(null);
  const [formEditPersonal, setFormEditPersonal] = useState({
    nombre_completo: "",
    rut: "",
    whatsapp: "",
    rol: "Operador",
    proyecto_actual_id: "",
    especialidad_id: "",
    turno_tipo: "14x14",
    jornada_tipo: "Dia",
    foto_url: "",
    email: ""
  });

  const [botPhone, setBotPhone] = useState("");
  const [qrEquipo, setQrEquipo] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  // Cargar teléfono del bot
  useEffect(() => {
    const loadBotPhone = async () => {
      try {
        const r = await fetch("/api/config");
        const json = await r.json();
        if (json.success && json.valor) {
          setBotPhone(json.valor);
        } else {
          setBotPhone("56940470139");
        }
      } catch (e) {
        console.error("Error al cargar configuración del bot:", e);
        setBotPhone("56940470139");
      }
    };
    loadBotPhone();
  }, []);

  // Inicializar estados de edición cuando se cargan registros
  useEffect(() => {
    if (registros.data && registros.data.length > 0) {
      setEditRegistros(prev => {
        const next = { ...prev };
        registros.data.forEach(r => {
          if (!next[r.id]) {
            next[r.id] = {
              rut: r.rut || "",
              nombre_completo: r.nombre_completo || "",
              rol_solicitado: r.rol_solicitado || "Operador",
              proyecto_actual_id: r.proyecto_id || ""
            };
          } else {
            if (!next[r.id].rut && r.rut) next[r.id].rut = r.rut;
            if (!next[r.id].proyecto_actual_id && r.proyecto_id) next[r.id].proyecto_actual_id = r.proyecto_id;
          }
        });
        return next;
      });
    }
  }, [registros.data]);

  // Auto-polling del monitor cada 10s
  useEffect(() => {
    if (tab !== "monitor") return;
    pollRef.current = setInterval(() => equiposCompleto.refresh(true), 10000);
    return () => clearInterval(pollRef.current);
  }, [tab]);

  // Mostrar mensaje temporal (Toast)
  const showMsg = (text, ok = true) => {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3000);
  };

  // Guardar datos genericos (Creacion)
  const handleSubmit = async (endpoint, body, resetFn, refreshFn) => {
    setSaving(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Guardado con éxito");
        resetFn();
        refreshFn();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Guardar Proyecto
  const handleGuardarProyecto = async () => {
    if (!formEditProyecto.nombre_proyecto || !formEditProyecto.codigo_cc) {
      showMsg("❌ Nombre del proyecto y Centro de Costos son obligatorios", false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/proyectos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingProyectoId, ...formEditProyecto }),
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Proyecto actualizado con éxito");
        setEditingProyectoId(null);
        proyectosPaginado.refresh();
        proyectosCompleto.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Guardar Personal
  const handleGuardarPersonal = async () => {
    if (!formEditPersonal.nombre_completo || !formEditPersonal.rut || !formEditPersonal.whatsapp || !formEditPersonal.rol) {
      showMsg("❌ Nombre, RUT, WhatsApp y Rol son obligatorios", false);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        id: editingPersonalId,
        ...formEditPersonal,
        email: formEditPersonal.email?.trim() ? formEditPersonal.email.trim().toLowerCase() : null,
        especialidad_id: formEditPersonal.especialidad_id || null,
        proyecto_actual_id: formEditPersonal.proyecto_actual_id || null,
        foto_url: formEditPersonal.foto_url?.trim() || null
      };
      const r = await fetch("/api/personal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Personal actualizado con éxito");
        setEditingPersonalId(null);
        personalPaginado.refresh();
        personalCompleto.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Aprobar Registro de WhatsApp
  const handleAprobarRegistro = async (id) => {
    const editInfo = editRegistros[id];
    if (!editInfo?.rut || !editInfo.rut.trim()) {
      showMsg("❌ Debes ingresar un RUT válido", false);
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "aprobar",
          id,
          rut: editInfo.rut,
          nombre_completo: editInfo.nombre_completo,
          rol_solicitado: editInfo.rol_solicitado,
          proyecto_actual_id: editInfo.proyecto_actual_id || null,
          actor_rol: rolActual,
          actor_proyecto_id: proyectoActivoId || null
        })
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Solicitud aprobada con éxito");
        registros.refresh();
        personalPaginado.refresh();
        personalCompleto.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // Rechazar Registro de WhatsApp
  const handleRechazarRegistro = async () => {
    if (!rechazoId) return;
    setSaving(true);
    try {
      const r = await fetch("/api/registros", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rechazar",
          id: rechazoId,
          nota_rechazo: notaRechazo
        })
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Solicitud rechazada");
        setRechazoId(null);
        setNotaRechazo("");
        registros.refresh();
      } else {
        showMsg(`❌ Error: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (endpoint, id, refreshFn) => {
    if (!window.confirm("¿Está seguro de que desea eliminar este registro? Esta acción no se puede deshacer.")) {
      return;
    }
    setSaving(true);
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("id", id);
      const r = await fetch(url.toString(), {
        method: "DELETE",
      });
      const json = await r.json();
      if (json.success) {
        showMsg("✅ Eliminado con éxito");
        refreshFn();
      } else {
        showMsg(`❌ No se pudo eliminar: ${json.error || json.message}`, false);
      }
    } catch (e) {
      showMsg(`❌ ${e.message}`, false);
    } finally {
      setSaving(false);
    }
  };

  // ================================================================
  // FILTRADO Y COMPUTADOS EN MEMORIA (CALIENTE)
  // ================================================================
  const equiposFiltrados = equiposCompleto.data.filter(eq => {
    const cumpleCat = filtroCategoria === "TODAS" || eq.categoria === filtroCategoria;
    const cumpleEst = filtroEstado === "TODOS" || eq.estado_actual === filtroEstado;
    const cumpleComercial = filtroComercial === "TODOS" || (eq.clasificacion_comercial || "OPERATIVO - EN USO") === filtroComercial;
    
    // Filtro de combustible crítico
    let cumpleCombustible = true;
    if (soloCombustibleCritico) {
      const nivel = eq.combustible_nivel_porcentaje;
      if (nivel === null || nivel === undefined) {
        cumpleCombustible = false;
      } else {
        const esVehiculo = eq.tipo_seguimiento === 'vehiculo';
        if (esVehiculo) {
          cumpleCombustible = nivel <= 50;
        } else {
          cumpleCombustible = nivel <= 25;
        }
      }
    }
    
    const query = searchMonitor.trim().toLowerCase();
    const cumpleSearch = query === "" ||
      (eq.codigo_interno || "").toLowerCase().includes(query) ||
      (eq.descripcion_equipo || "").toLowerCase().includes(query) ||
      (eq.marca || "").toLowerCase().includes(query) ||
      (eq.modelo || "").toLowerCase().includes(query) ||
      (eq.patente || "").toLowerCase().includes(query) ||
      (eq.proveedor || "").toLowerCase().includes(query) ||
      (eq.proyectos?.nombre_proyecto || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.operador?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.supervisor?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.rigger?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.supervisor?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.especialidad?.nombre_oficial || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.actividad_especifica || "").toLowerCase().includes(query);

    return cumpleCat && cumpleEst && cumpleSearch && cumpleCombustible && cumpleComercial;
  });

  const equiposPorCategoria = equiposCompleto.data.filter(eq => {
    const cumpleCat = filtroCategoria === "TODAS" || eq.categoria === filtroCategoria;
    
    const query = searchMonitor.trim().toLowerCase();
    const cumpleSearch = query === "" ||
      (eq.codigo_interno || "").toLowerCase().includes(query) ||
      (eq.descripcion_equipo || "").toLowerCase().includes(query) ||
      (eq.marca || "").toLowerCase().includes(query) ||
      (eq.modelo || "").toLowerCase().includes(query) ||
      (eq.patente || "").toLowerCase().includes(query) ||
      (eq.proveedor || "").toLowerCase().includes(query) ||
      (eq.proyectos?.nombre_proyecto || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.operador?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.supervisor?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.reporte_hoy?.rigger?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.supervisor?.nombre_completo || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.especialidad?.nombre_oficial || "").toLowerCase().includes(query) ||
      (eq.pod_actual?.actividad_especifica || "").toLowerCase().includes(query);

    return cumpleCat && cumpleSearch;
  });

  const statsCounts = {
    "Equipo Operativo": equiposPorCategoria.filter(e => e.estado_actual === "Equipo Operativo").length,
    "Disponible": equiposPorCategoria.filter(e => e.estado_actual === "Disponible").length,
    "En Colacion": equiposPorCategoria.filter(e => e.estado_actual === "En Colacion").length,
    "Detenido por Falla": equiposPorCategoria.filter(e => e.estado_actual === "Detenido por Falla").length,
  };

  // Agrupamiento por proyecto
  let gruposProyectos = {};
  if (agruparPorProyecto) {
    equiposFiltrados.forEach(eq => {
      const projId = eq.proyecto_actual_id || "sin_proyecto";
      const projNombre = eq.proyectos?.nombre_proyecto || "Equipos sin Proyecto";
      const projCC = eq.proyectos?.codigo_cc || "—";
      
      if (!gruposProyectos[projId]) {
        gruposProyectos[projId] = {
          id: projId,
          nombre: projNombre,
          cc: projCC,
          equipos: []
        };
      }
      gruposProyectos[projId].equipos.push(eq);
    });
  }

  return {
    tab,
    setTab,
    pautaEquipo,
    setPautaEquipo,
    editEquipo,
    setEditEquipo,
    filtroCategoria,
    setFiltroCategoria,
    filtroEstado,
    setFiltroEstado,
    filtroComercial,
    setFiltroComercial,
    searchMonitor,
    setSearchMonitor,
    agruparPorProyecto,
    setAgruparPorProyecto,
    soloCombustibleCritico,
    setSoloCombustibleCritico,

    // APIs
    equiposCompleto,
    equiposPaginado,
    proyectosCompleto,
    proyectosPaginado,
    personalCompleto,
    personalPaginado,
    reportes,
    registros,
    rolActual,
    proyectoActivoId,

    // Estados adicionales
    editRegistros,
    setEditRegistros,
    rechazoId,
    setRechazoId,
    notaRechazo,
    setNotaRechazo,
    
    // Formularios
    formEquipo,
    setFormEquipo,
    formProyecto,
    setFormProyecto,
    formPersonal,
    setFormPersonal,
    
    editingProyectoId,
    setEditingProyectoId,
    formEditProyecto,
    setFormEditProyecto,
    
    editingPersonalId,
    setEditingPersonalId,
    formEditPersonal,
    setFormEditPersonal,

    botPhone,
    setBotPhone,
    qrEquipo,
    setQrEquipo,
    saving,
    setSaving,
    msg,
    showMsg,

    // Handlers
    handleSubmit,
    handleGuardarProyecto,
    handleGuardarPersonal,
    handleAprobarRegistro,
    handleRechazarRegistro,
    handleDelete,

    // Datos procesados
    equiposFiltrados,
    statsCounts,
    gruposProyectos,

    especialidades,
    formEspecialidad,
    setFormEspecialidad
  };
}
