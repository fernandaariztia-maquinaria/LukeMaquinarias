import React, { useState, useRef, useEffect } from "react";
import { Plus, Pencil, QrCode, Save, X, Camera, Loader2, Trash2, MoreVertical, History, Calendar, Clock, MapPin, Building2, CheckCircle2, AlertCircle } from "lucide-react";
import FormRow from "./Shared/FormRow";
import { ESTADO_CONFIG } from "./Shared/constants";
import QrEquipoModal from "./Shared/QrEquipoModal";
import SearchableSelect from "./Shared/SearchableSelect";
import { formatEquipoLabel } from "../../lib/equipoLabel";
import HistorialUbicacionesModal from "./HistorialUbicacionesModal";

const inputStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-input)",
  borderRadius: "var(--border-radius-sm)", color: "var(--color-input-text)", padding: "9px 12px",
  fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const selectStyle = { ...inputStyle, cursor: "pointer" };

// ================================================================
// COMPONENTE: Buscador e Paginador (Reutilizables localmente)
// ================================================================
function Buscador({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", marginBottom: "16px", display: "flex", alignItems: "center" }}>
      <div style={{ position: "absolute", left: "12px", color: "var(--color-text-muted)", display: "flex", alignItems: "center", pointerEvents: "none" }}>
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
      </div>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        style={{
          width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-input)", borderRadius: "var(--border-radius-sm)", color: "var(--color-input-text)", padding: "10px 12px 10px 38px",
          fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          transition: "all 0.2s",
        }}
        onFocus={e => {
          e.target.style.borderColor = "var(--color-primary)";
          e.target.style.boxShadow = "0 0 0 2px rgba(16, 185, 129, 0.2)";
        }}
        onBlur={e => {
          e.target.style.borderColor = "var(--border-input)";
          e.target.style.boxShadow = "none";
        }}
      />
      {value && (
        <button
          onClick={() => onChange({ target: { value: "" } })}
          style={{
            position: "absolute", right: "12px", background: "none", border: "none",
            color: "var(--color-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0
          }}
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function Paginador({ api, label }) {
  const totalPages = Math.ceil(api.count / api.limit);
  const fromRecord = api.count === 0 ? 0 : (api.page - 1) * api.limit + 1;
  const toRecord = Math.min(api.page * api.limit, api.count);

  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "16px", background: "var(--bg-sidebar)", borderTop: "1px solid var(--border-sidebar)", borderBottomLeftRadius: "var(--border-radius-base)", borderBottomRightRadius: "var(--border-radius-base)",
      fontSize: "13px", color: "var(--color-text-muted)"
    }}>
      <div>
        Mostrando <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{fromRecord}-{toRecord}</span> de <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{api.count}</span> {label}
      </div>
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={() => api.setPage(p => Math.max(p - 1, 1))}
            disabled={api.page === 1}
            style={{
              background: api.page === 1 ? "rgba(0, 0, 0, 0.05)" : "rgba(16, 185, 129, 0.1)", border: "1px solid " + (api.page === 1 ? "var(--border-container)" : "var(--color-primary)"), color: api.page === 1 ? "var(--color-text-muted)" : "var(--color-primary-hover)",
              borderRadius: "6px", padding: "6px 12px", cursor: api.page === 1 ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "12px", opacity: api.page === 1 ? 0.5 : 1, transition: "all 0.2s"
            }}
          >
            Anterior
          </button>
          <span style={{ color: "var(--color-text)", fontWeight: 600, padding: "0 8px" }}>
            Pág. {api.page} de {totalPages}
          </span>
          <button
            onClick={() => api.setPage(p => Math.min(p + 1, totalPages))}
            disabled={api.page >= totalPages}
            style={{
              background: api.page >= totalPages ? "rgba(0, 0, 0, 0.05)" : "rgba(16, 185, 129, 0.1)", border: "1px solid " + (api.page >= totalPages ? "var(--border-container)" : "var(--color-primary)"), color: api.page >= totalPages ? "var(--color-text-muted)" : "var(--color-primary-hover)",
              borderRadius: "6px", padding: "6px 12px", cursor: api.page >= totalPages ? "not-allowed" : "pointer",
              fontWeight: 600, fontSize: "12px", opacity: api.page >= totalPages ? 0.5 : 1, transition: "all 0.2s"
            }}
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}

// ================================================================
// MODAL DE EDICIÓN COMPLETA DE EQUIPO
// ================================================================
export function EditarEquipoModal({ equipo, proyectos, onClose, onSave }) {
  const [formData, setFormData] = useState({
    codigo_interno: equipo?.codigo_interno || "",
    descripcion_equipo: equipo?.descripcion_equipo || "",
    proveedor: equipo?.proveedor || "EIMISA",
    proyecto_actual_id: equipo?.proyecto_actual_id || "",
    estado_actual: equipo?.estado_actual || "Disponible",
    pauta_preventiva_activa: equipo?.pauta_preventiva_activa || "",
    patente: equipo?.patente || "",
    marca: equipo?.marca || "",
    modelo: equipo?.modelo || "",
    numero_serial: equipo?.numero_serial || "",
    tipo: equipo?.tipo || "",
    categoria: equipo?.categoria || "MAQUINARIA PESADA",
    anio_fabricacion: equipo?.anio_fabricacion !== null && equipo?.anio_fabricacion !== undefined ? equipo.anio_fabricacion.toString() : "",
    seguimiento_completo: equipo?.seguimiento_completo !== false,
    imagen_url: equipo?.imagen_url || "",
    combustible_nivel_porcentaje: equipo?.combustible_nivel_porcentaje !== null && equipo?.combustible_nivel_porcentaje !== undefined ? equipo.combustible_nivel_porcentaje.toString() : "100",
    clasificacion_comercial: equipo?.clasificacion_comercial || "OPERATIVO - EN USO",
    arriendo_cliente: equipo?.arriendo_cliente || "",
    arriendo_fecha_inicio: equipo?.arriendo_fecha_inicio || "",
    arriendo_fecha_fin: equipo?.arriendo_fecha_fin || "",
    capacidad_estanque_litros: equipo?.capacidad_estanque_litros !== null && equipo?.capacidad_estanque_litros !== undefined ? equipo.capacidad_estanque_litros.toString() : "",
    pm1_umbral: equipo?.pm1_umbral !== null && equipo?.pm1_umbral !== undefined ? equipo.pm1_umbral.toString() : "",
    pm2_umbral: equipo?.pm2_umbral !== null && equipo?.pm2_umbral !== undefined ? equipo.pm2_umbral.toString() : "",
    pm3_umbral: equipo?.pm3_umbral !== null && equipo?.pm3_umbral !== undefined ? equipo.pm3_umbral.toString() : "",
    pm4_umbral: equipo?.pm4_umbral !== null && equipo?.pm4_umbral !== undefined ? equipo.pm4_umbral.toString() : "",
    tolerancia_pm: equipo?.tolerancia_pm !== null && equipo?.tolerancia_pm !== undefined ? equipo.tolerancia_pm.toString() : "",
    tipo_seguimiento: equipo?.tipo_seguimiento || "estandar",
    usa_plataforma: equipo?.usa_plataforma !== false,
  });
  const [saving, setSaving] = useState(false);
  const [subiendoFondo, setSubiendoFondo] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [seccionActiva, setSeccionActiva] = useState("general");
  const fileInputRef = useRef(null);

  const hoyStr = new Date().toISOString().slice(0, 10);
  const [trasladoData, setTrasladoData] = useState({
    fecha_inicio_asignacion: hoyStr,
    fecha_fin_estimada: "",
    fecha_salida_anterior: hoyStr,
    motivo_traslado: "",
  });
  const [modalHistorialAbierto, setModalHistorialAbierto] = useState(false);
  const [historialCargado, setHistorialCargado] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  // Recargar historial del equipo cuando se abre la pestaña de historial
  useEffect(() => {
    if (seccionActiva === "historial" && equipo?.id) {
      setCargandoHistorial(true);
      fetch(`/api/equipos/historial-ubicaciones?equipo_id=${equipo.id}`)
        .then((r) => r.json())
        .then((res) => {
          if (res.success) setHistorialCargado(res.data || []);
        })
        .catch(console.error)
        .finally(() => setCargandoHistorial(false));
    }
  }, [seccionActiva, equipo?.id]);

  const handleUploadFondo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSubiendoFondo(true);
    setErrorMsg("");
    const reader = new FileReader();

    reader.onload = async (event) => {
      const base64String = event.target?.result;
      if (!base64String) {
        setSubiendoFondo(false);
        return;
      }

      try {
        const res = await fetch("/api/equipos/upload-imagen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            equipoId: equipo.id,
            imageBase64: base64String
          })
        });

        const json = await res.json();
        if (json.success && json.imagen_url) {
          setFormData(prev => ({ ...prev, imagen_url: json.imagen_url }));
        } else {
          setErrorMsg("Error al subir imagen: " + (json.error || json.message));
        }
      } catch (err) {
        console.error(err);
        setErrorMsg("Ocurrió un error al subir la fotografía.");
      } finally {
        setSubiendoFondo(false);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!formData.codigo_interno.trim() || !formData.descripcion_equipo.trim()) {
      setErrorMsg("Código Interno y Descripción son requeridos");
      return;
    }
    setSaving(true);
    setErrorMsg("");
    try {
      const proyOrig = equipo?.proyecto_actual_id || null;
      const proyNuevo = formData.proyecto_actual_id === "" ? null : formData.proyecto_actual_id;
      const obraCambio = proyOrig !== proyNuevo;

      let historial_traslado = null;
      if (obraCambio) {
        const pFound = (proyectos || []).find((p) => p.id === proyNuevo);
        historial_traslado = {
          proyecto_id: proyNuevo,
          proyecto_nombre: pFound ? pFound.nombre_proyecto : (proyNuevo ? "Obra Asignada" : "Sin Asignar / En Patio"),
          proyecto_cc: pFound?.codigo_cc || "",
          fecha_inicio: trasladoData.fecha_inicio_asignacion || hoyStr,
          fecha_fin_estimada: trasladoData.fecha_fin_estimada || null,
          fecha_salida_anterior: trasladoData.fecha_salida_anterior || hoyStr,
          motivo_traslado: trasladoData.motivo_traslado.trim() || (proyNuevo ? "Cambio de obra desde Edición de Equipo" : "Desasignación / En Patio"),
          registrado_por: "Administrador (Edición de Equipo)",
        };
      }

      const body = {
        id: equipo.id,
        codigo_interno: formData.codigo_interno.trim(),
        descripcion_equipo: formData.descripcion_equipo.trim(),
        proveedor: formData.proveedor.trim(),
        proyecto_actual_id: proyNuevo,
        estado_actual: formData.estado_actual,
        pauta_preventiva_activa: formData.pauta_preventiva_activa.trim() || null,
        patente: formData.patente.trim() || null,
        marca: formData.marca.trim() || null,
        modelo: formData.modelo.trim() || null,
        numero_serial: formData.numero_serial.trim() || null,
        tipo: formData.tipo.trim() || null,
        categoria: formData.categoria,
        anio_fabricacion: formData.anio_fabricacion.trim() !== "" ? parseInt(formData.anio_fabricacion) : null,
        seguimiento_completo: formData.seguimiento_completo,
        imagen_url: formData.imagen_url.trim() || null,
        combustible_nivel_porcentaje: formData.combustible_nivel_porcentaje.trim() !== "" ? parseFloat(formData.combustible_nivel_porcentaje) : 100,
        clasificacion_comercial: formData.clasificacion_comercial,
        arriendo_cliente: formData.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" ? (formData.arriendo_cliente.trim() || null) : null,
        arriendo_fecha_inicio: formData.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" ? (formData.arriendo_fecha_inicio || null) : null,
        arriendo_fecha_fin: formData.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" ? (formData.arriendo_fecha_fin || null) : null,
        capacidad_estanque_litros: formData.capacidad_estanque_litros.trim() !== "" ? parseInt(formData.capacidad_estanque_litros) : null,
        pm1_umbral: formData.pm1_umbral.trim() !== "" ? parseFloat(formData.pm1_umbral) : null,
        pm2_umbral: formData.pm2_umbral.trim() !== "" ? parseFloat(formData.pm2_umbral) : null,
        pm3_umbral: formData.pm3_umbral.trim() !== "" ? parseFloat(formData.pm3_umbral) : null,
        pm4_umbral: formData.pm4_umbral.trim() !== "" ? parseFloat(formData.pm4_umbral) : null,
        tolerancia_pm: formData.tolerancia_pm.trim() !== "" ? parseFloat(formData.tolerancia_pm) : null,
        tipo_seguimiento: formData.tipo_seguimiento,
        usa_plataforma: formData.usa_plataforma,
        historial_traslado,
      };

      const r = await fetch("/api/equipos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (json.success) {
        onSave();
      } else {
        setErrorMsg(json.error || json.message || "Error al guardar");
      }
    } catch (e) {
      setErrorMsg(e.message || "Error de conexión");
    } finally {
      setSaving(false);
    }
  };

  const CATEGORIAS_MAESTRAS = ["GRÚAS", "CAMIONES", "MAQUINARIA PESADA", "MAQUINARIA SEMIPESADA", "VEHÍCULOS MENORES", "EQUIPOS MENORES"];

  const SECCIONES = [
    { id: "general", label: "General" },
    { id: "comercial", label: "Estado y Comercial" },
    { id: "historial", label: "Historial de Obras" },
    { id: "mantencion", label: "Mantención y Bot" },
    { id: "imagen", label: "Imagen" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center",
      zIndex: 1000, padding: "20px",
    }}>
      <div style={{
        background: "var(--bg-container)", border: "1px solid var(--border-container)",
        borderRadius: "var(--border-radius-base)", boxShadow: "0 10px 40px rgba(0,0,0,0.08)", padding: "24px", width: "100%", maxWidth: "860px",
        maxHeight: "90vh", display: "flex", flexDirection: "column", boxSizing: "border-box"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", flexShrink: 0 }}>
          <div>
            <div style={{ color: "var(--color-text)", fontWeight: 800, fontSize: "18px" }}>Editar Maquinaria / Equipo</div>
            <div style={{ color: "var(--color-text-muted)", fontSize: "12px", marginTop: "2px" }}>
              Modifique los metadatos técnicos y operacionales del equipo.
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", color: "#c21a25", borderRadius: "8px", padding: "10px 14px", fontSize: "13px", marginBottom: "16px", fontWeight: 600, flexShrink: 0 }}>
            ⚠️ {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", gap: "4px", marginBottom: "18px", borderBottom: "1px solid var(--border-container)", flexShrink: 0 }}>
          {SECCIONES.map(s => {
            const active = seccionActiva === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSeccionActiva(s.id)}
                style={{
                  padding: "9px 14px",
                  background: "none",
                  border: "none",
                  borderBottom: active ? "2px solid var(--color-primary)" : "2px solid transparent",
                  color: active ? "var(--color-primary-hover)" : "var(--color-text-muted)",
                  fontWeight: active ? 700 : 600,
                  fontSize: "13px",
                  cursor: "pointer",
                  marginBottom: "-1px",
                  transition: "color 0.15s, border-color 0.15s",
                }}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div style={{ overflowY: "auto", flex: 1, paddingRight: "4px" }}>

        {seccionActiva === "general" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px", marginBottom: "18px" }}>
          <FormRow label="Código Interno *">
            <input style={inputStyle} value={formData.codigo_interno}
              onChange={e => setFormData(p => ({ ...p, codigo_interno: e.target.value }))} />
          </FormRow>
          <FormRow label="Descripción *">
            <input style={inputStyle} value={formData.descripcion_equipo}
              onChange={e => setFormData(p => ({ ...p, descripcion_equipo: e.target.value }))} />
          </FormRow>
          <FormRow label="Patente">
            <input style={inputStyle} placeholder="Ej: AB-CD-12" value={formData.patente}
              onChange={e => setFormData(p => ({ ...p, patente: e.target.value }))} />
          </FormRow>
          <FormRow label="Marca">
            <input style={inputStyle} placeholder="Ej: Caterpillar" value={formData.marca}
              onChange={e => setFormData(p => ({ ...p, marca: e.target.value }))} />
          </FormRow>
          <FormRow label="Modelo">
            <input style={inputStyle} placeholder="Ej: 320D L" value={formData.modelo}
              onChange={e => setFormData(p => ({ ...p, modelo: e.target.value }))} />
          </FormRow>
          <FormRow label="Número de Serie / Chasis">
            <input style={inputStyle} placeholder="Ej: CAT0320DL..." value={formData.numero_serial}
              onChange={e => setFormData(p => ({ ...p, numero_serial: e.target.value }))} />
          </FormRow>
          <FormRow label="Tipo de Equipo">
            <input style={inputStyle} placeholder="Ej: Excavadora Oruga" value={formData.tipo}
              onChange={e => setFormData(p => ({ ...p, tipo: e.target.value }))} />
          </FormRow>
          <FormRow label="Categoría Maestra">
            <select style={selectStyle} value={formData.categoria}
              onChange={e => setFormData(p => ({ ...p, categoria: e.target.value }))}>
              {CATEGORIAS_MAESTRAS.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </FormRow>
          <FormRow label="Año Fabricación">
            <input style={inputStyle} type="number" placeholder="Ej: 2018" value={formData.anio_fabricacion}
              onChange={e => setFormData(p => ({ ...p, anio_fabricacion: e.target.value }))} />
          </FormRow>
          <FormRow label="Proveedor">
            <input style={inputStyle} value={formData.proveedor}
              onChange={e => setFormData(p => ({ ...p, proveedor: e.target.value }))} />
          </FormRow>
        </div>
        )}

        {seccionActiva === "comercial" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "18px" }}>
          <FormRow label="Proyecto / Obra Asociada">
            <SearchableSelect
              options={[
                { value: "", label: "Sin asignar / En Taller" },
                ...(proyectos || []).map(p => ({
                  value: p.id,
                  label: `${p.codigo_cc} — ${p.nombre_proyecto}`
                }))
              ]}
              value={formData.proyecto_actual_id || ""}
              onChange={val => setFormData(p => ({ ...p, proyecto_actual_id: val }))}
            />
          </FormRow>
          <FormRow label="Estado Operacional Actual">
            <select style={selectStyle} value={formData.estado_actual}
              onChange={e => setFormData(p => ({ ...p, estado_actual: e.target.value }))}>
              <option value="Equipo Operativo">Operativo</option>
              <option value="Disponible">Disponible (Sin operador)</option>
              <option value="En Colacion">En Colación</option>
              <option value="Detenido por Falla">Detenido por Falla (Taller)</option>
            </select>
          </FormRow>

          {/* Panel interactivo de Fechas de Traslado si cambió la obra asignada */}
          {(() => {
            const proyOrigId = equipo?.proyecto_actual_id || "";
            const proyNuevoId = formData.proyecto_actual_id || "";
            const obraCambio = proyOrigId !== proyNuevoId;

            if (!obraCambio) return null;

            const proyOrigObj = (proyectos || []).find((p) => p.id === proyOrigId);
            const proyNuevoObj = (proyectos || []).find((p) => p.id === proyNuevoId);
            const nombreOrig = proyOrigObj ? proyOrigObj.nombre_proyecto : (proyOrigId ? "Obra previa" : "Sin Asignar / En Patio");
            const nombreNuevo = proyNuevoObj ? proyNuevoObj.nombre_proyecto : (proyNuevoId ? "Nueva Obra" : "Sin Asignar / En Patio");

            return (
              <div style={{
                gridColumn: "1 / -1",
                background: "rgba(2, 132, 199, 0.06)",
                border: "1.5px solid #0284c7",
                borderRadius: "10px",
                padding: "16px 18px",
                marginTop: "4px",
                boxShadow: "0 2px 10px rgba(2, 132, 199, 0.08)",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 800, fontSize: "14px", color: "#0284c7" }}>
                    <History size={17} />
                    <span>Registro de Fechas y Trazabilidad de Traslado</span>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: 700, backgroundColor: "#0284c7", color: "#ffffff", padding: "2px 10px", borderRadius: "12px" }}>
                    Cambio de Ubicación Detectado
                  </span>
                </div>

                <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginBottom: "14px", lineHeight: "1.4" }}>
                  Se está moviendo el equipo desde <strong>{nombreOrig}</strong> hacia <strong>{nombreNuevo}</strong>.
                  Indique las fechas reales para registrar el histórico exacto de días trabajados.
                </div>

                <div style={{ display: "grid", gridTemplateColumns: proyOrigId && proyNuevoId ? "1fr 1fr 1fr" : "1fr 1fr", gap: "12px" }}>
                  {/* Si tenía obra anterior: consultar fecha real de salida */}
                  {proyOrigId && (
                    <div style={{ background: "rgba(239, 68, 68, 0.04)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "8px", padding: "10px 12px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "#dc2626", marginBottom: "4px" }}>
                        Fecha Real de Salida de Obra Anterior *
                      </label>
                      <input
                        type="date"
                        style={{ ...inputStyle, borderColor: "rgba(239, 68, 68, 0.5)", fontWeight: 600 }}
                        value={trasladoData.fecha_salida_anterior}
                        onChange={(e) => setTrasladoData((p) => ({ ...p, fecha_salida_anterior: e.target.value }))}
                      />
                      <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", lineHeight: "1.3" }}>
                        Cierra la estadía en <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{nombreOrig}</span> con los días exactos que operó.
                      </div>
                    </div>
                  )}

                  {/* Si entra a una nueva obra: consultar fecha de inicio y término estimado */}
                  {proyNuevoId && (
                    <>
                      <div style={{ background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "8px", padding: "10px 12px" }}>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--color-primary-hover)", marginBottom: "4px" }}>
                          Fecha Inicio en Nueva Obra *
                        </label>
                        <input
                          type="date"
                          style={{ ...inputStyle, borderColor: "rgba(16, 185, 129, 0.5)", fontWeight: 600 }}
                          value={trasladoData.fecha_inicio_asignacion}
                          onChange={(e) => setTrasladoData((p) => ({ ...p, fecha_inicio_asignacion: e.target.value }))}
                        />
                        <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", lineHeight: "1.3" }}>
                          Día desde el cual el equipo entra a operar en <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{nombreNuevo}</span>.
                        </div>
                      </div>

                      <div style={{ background: "var(--bg-sidebar)", border: "1px solid var(--border-sidebar)", borderRadius: "8px", padding: "10px 12px" }}>
                        <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--color-text)", marginBottom: "4px" }}>
                          Fecha Término Estimada (Opcional)
                        </label>
                        <input
                          type="date"
                          style={inputStyle}
                          value={trasladoData.fecha_fin_estimada}
                          onChange={(e) => setTrasladoData((p) => ({ ...p, fecha_fin_estimada: e.target.value }))}
                        />
                        <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "4px", lineHeight: "1.3" }}>
                          Plazo proyectado. Si se retira antes, se ajustará con la fecha real de retiro.
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ marginTop: "12px" }}>
                  <label style={{ display: "block", fontSize: "11px", fontWeight: 700, color: "var(--color-text-muted)", marginBottom: "4px" }}>
                    Motivo o Comentario del Traslado (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: Cambio de faena por finalización de fase de movimiento de tierras..."
                    style={inputStyle}
                    value={trasladoData.motivo_traslado}
                    onChange={(e) => setTrasladoData((p) => ({ ...p, motivo_traslado: e.target.value }))}
                  />
                </div>
              </div>
            );
          })()}

          <FormRow label="Clasificación Comercial">
            <select style={selectStyle} value={formData.clasificacion_comercial}
              onChange={e => setFormData(p => ({ ...p, clasificacion_comercial: e.target.value }))}>
              <option value="OPERATIVO - EN USO">Operativo - En Uso</option>
              <option value="DISPONIBLE PARA ARRIENDO">Disponible para Arriendo</option>
              <option value="VENTA">Venta</option>
              <option value="EN PREPARACION OBRA">En Preparación Obra</option>
              <option value="FUERA DE SERVICIO - REPARACION - MANTENCION">Fuera de Servicio - Reparación / Mantención</option>
              <option value="EN IMPORTACION">En Importación</option>
            </select>
          </FormRow>
          <FormRow label="Capacidad Estanque (Litros)">
            <input style={inputStyle} type="number" placeholder="Ej: 150, 200, 350..."
              value={formData.capacidad_estanque_litros || ""}
              onChange={e => setFormData(p => ({ ...p, capacidad_estanque_litros: e.target.value }))} />
          </FormRow>
          {formData.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" && (
            <>
              <FormRow label="Cliente / Obra de Arriendo">
                <input
                  style={inputStyle}
                  placeholder="Ej: Constructora Alfa S.A."
                  value={formData.arriendo_cliente}
                  onChange={e => setFormData(p => ({ ...p, arriendo_cliente: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Fecha Inicio Arriendo">
                <input
                  type="date"
                  style={inputStyle}
                  value={formData.arriendo_fecha_inicio}
                  onChange={e => setFormData(p => ({ ...p, arriendo_fecha_inicio: e.target.value }))}
                />
              </FormRow>
              <FormRow label="Fecha Fin Arriendo">
                <input
                  type="date"
                  style={inputStyle}
                  value={formData.arriendo_fecha_fin}
                  onChange={e => setFormData(p => ({ ...p, arriendo_fecha_fin: e.target.value }))}
                />
              </FormRow>
            </>
          )}
          <FormRow label="Nivel de Combustible (%)">
            <input
              style={inputStyle}
              type="number"
              min="0"
              max="100"
              placeholder="Ej: 80"
              value={formData.combustible_nivel_porcentaje}
              onChange={e => setFormData(p => ({ ...p, combustible_nivel_porcentaje: e.target.value }))}
            />
          </FormRow>
        </div>
        )}

        {seccionActiva === "historial" && (
        <div style={{ marginBottom: "18px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--color-text)", display: "flex", alignItems: "center", gap: "8px" }}>
                <History size={16} color="#0284c7" />
                Historial de Faenas y Ubicaciones
              </div>
              <div style={{ fontSize: "12px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                Registro permanente de cada obra en que ha operado este equipo, con fechas reales de permanencia.
              </div>
            </div>

            <button
              type="button"
              onClick={() => setModalHistorialAbierto(true)}
              style={{
                background: "#0284c7",
                border: "none",
                borderRadius: "8px",
                color: "#ffffff",
                padding: "8px 14px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 2px 6px rgba(2, 132, 199, 0.25)",
              }}
            >
              <Plus size={14} /> Registrar / Editar Traslados
            </button>
          </div>

          {cargandoHistorial ? (
            <div style={{ padding: "30px", textAlign: "center", color: "var(--color-text-muted)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
              <Loader2 className="animate-spin" size={16} />
              <span>Cargando historial de obras...</span>
            </div>
          ) : historialCargado.length === 0 ? (
            <div style={{
              background: "var(--bg-sidebar)",
              border: "1px dashed var(--border-sidebar)",
              borderRadius: "10px",
              padding: "28px",
              textAlign: "center",
              color: "var(--color-text-muted)",
              fontSize: "13px",
            }}>
              <Building2 size={32} style={{ margin: "0 auto 8px auto", opacity: 0.4 }} />
              <div>No hay traslados históricos registrados aún para este equipo.</div>
              <div style={{ fontSize: "11px", marginTop: "4px" }}>
                Al asignarle una obra o cambiarla en la pestaña "Estado y Comercial", se creará automáticamente el registro.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {historialCargado.map((h, idx) => {
                const esActiva = h.estado === "ACTIVA";
                const fmt = (str) => {
                  if (!str) return "—";
                  const p = str.slice(0, 10).split("-");
                  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : str;
                };

                return (
                  <div
                    key={h.id || idx}
                    style={{
                      background: esActiva ? "rgba(16, 185, 129, 0.05)" : "var(--bg-sidebar)",
                      border: esActiva ? "1.5px solid #10b981" : "1px solid var(--border-sidebar)",
                      borderRadius: "10px",
                      padding: "12px 16px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <Building2 size={16} color={esActiva ? "#10b981" : "var(--color-text-muted)"} />
                        <span style={{ fontWeight: 800, fontSize: "13px", color: "var(--color-text)" }}>
                          {h.proyecto_cc ? `[${h.proyecto_cc}] ` : ""}{h.proyecto_nombre || "Sin Asignar"}
                        </span>
                      </div>

                      <span
                        style={{
                          fontSize: "10px",
                          fontWeight: 800,
                          padding: "3px 8px",
                          borderRadius: "12px",
                          background: esActiva ? "#10b981" : "rgba(148, 163, 184, 0.2)",
                          color: esActiva ? "#ffffff" : "var(--color-text-muted)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                        }}
                      >
                        {esActiva ? "🟢 ACTIVA EN FAENA" : "⚪ FINALIZADA"}
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "8px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>Inicio: </span>
                        <span style={{ color: "var(--color-text)" }}>{fmt(h.fecha_inicio)}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>{esActiva ? "Fin Estimada: " : "Salida Real: "}</span>
                        <span style={{ color: "var(--color-text)" }}>{fmt(esActiva ? h.fecha_fin_estimada : (h.fecha_fin_real || h.fecha_fin_estimada))}</span>
                      </div>
                      <div>
                        <span style={{ fontWeight: 600 }}>Días en Faena: </span>
                        <span style={{ color: esActiva ? "var(--color-primary-hover)" : "var(--color-text)", fontWeight: 700 }}>
                          {h.dias_reales ?? 0} días
                        </span>
                      </div>
                    </div>

                    {h.motivo_traslado && (
                      <div style={{ fontSize: "11px", color: "var(--color-text-muted)", borderTop: "1px dashed var(--border-sidebar)", paddingTop: "6px" }}>
                        <em>Motivo: {h.motivo_traslado}</em>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        )}

        {seccionActiva === "mantencion" && (
        <div style={{ marginBottom: "18px" }}>
          <FormRow label="Seguimiento de Horas por Especialidad/Operador">
            <select style={selectStyle} value={formData.seguimiento_completo.toString()}
              onChange={e => setFormData(p => ({ ...p, seguimiento_completo: e.target.value === "true" }))}>
              <option value="true">Sí (Flujo Completo con Operador, Horómetro y Especialidades)</option>
              <option value="false">No (Sin enlace a Operador, ej: Torres de Iluminación)</option>
            </select>
          </FormRow>

          <FormRow label="Características Operacionales">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "4px" }}>Tipo de seguimiento</div>
                <select
                  style={selectStyle}
                  value={formData.tipo_seguimiento}
                  onChange={e => setFormData(p => ({ ...p, tipo_seguimiento: e.target.value }))}
                >
                  <option value="estandar">Estándar (horómetro, con especialidad)</option>
                  <option value="camion">Camión (horómetro, sin especialidad)</option>
                  <option value="vehiculo">Vehículo (kilometraje)</option>
                </select>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--color-text)", cursor: "pointer", marginTop: "14px" }}>
                <input
                  type="checkbox"
                  checked={formData.usa_plataforma}
                  onChange={e => setFormData(p => ({ ...p, usa_plataforma: e.target.checked }))}
                />
                Usa control de plataforma (Cargada/Limpia)
              </label>
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "6px" }}>
              Define qué le pregunta el bot a este equipo al iniciar/cerrar jornada. Desmarca "plataforma" para equipos donde no aplica (ej. grúas).
            </div>
          </FormRow>

          <FormRow label="Perfil de Mantención (PM1-PM4)">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "10px" }}>
              {["pm1_umbral", "pm2_umbral", "pm3_umbral", "pm4_umbral", "tolerancia_pm"].map((campo, idx) => (
                <div key={campo}>
                  <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginBottom: "4px" }}>
                    {idx < 4 ? `PM${idx + 1}` : "Tolerancia"}
                  </div>
                  <input
                    style={inputStyle}
                    type="number"
                    placeholder={idx < 4 ? "Ej: 250" : "Ej: 50"}
                    value={formData[campo]}
                    onChange={e => setFormData(p => ({ ...p, [campo]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "6px" }}>
              En horas (horómetro) o km (odómetro), según el tipo de seguimiento del equipo. Déjalo vacío si este equipo no participa del cálculo de mantención.
            </div>
          </FormRow>

          <FormRow label="Pauta Preventiva Activa">
            <textarea
              value={formData.pauta_preventiva_activa}
              onChange={e => setFormData(p => ({ ...p, pauta_preventiva_activa: e.target.value }))}
              placeholder="Instrucciones especiales para el operador al iniciar jornada..."
              style={{
                width: "100%", minHeight: "70px", background: "var(--bg-input)", border: "1px solid var(--border-input)", borderRadius: "var(--border-radius-sm)", color: "var(--color-input-text)", padding: "12px", fontSize: "13px",
                resize: "vertical", outline: "none", fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </FormRow>
        </div>
        )}

        {seccionActiva === "imagen" && (
        <div style={{ marginBottom: "18px" }}>
          <FormRow label="Fotografía de Fondo del Equipo">
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <input
                  style={inputStyle}
                  placeholder="Pegue la URL de la imagen aquí o suba un archivo..."
                  value={formData.imagen_url}
                  onChange={e => setFormData(p => ({ ...p, imagen_url: e.target.value }))}
                />
              </div>
              <div>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  accept="image/*"
                  onChange={handleUploadFondo}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={subiendoFondo}
                  style={{
                    background: "#2563eb", border: "none", borderRadius: "8px",
                    color: "white", padding: "10px 16px", fontWeight: 600,
                    fontSize: "13px", cursor: "pointer", display: "flex",
                    alignItems: "center", gap: "8px", transition: "background 0.2s"
                  }}
                >
                  {subiendoFondo ? (
                    <>
                      <Loader2 className="spinner animate-spin" size={14} />
                      <span>Subiendo...</span>
                    </>
                  ) : (
                    <>
                      <Camera size={14} />
                      <span>Subir Imagen</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            {formData.imagen_url && (
              <div style={{ marginTop: "10px", position: "relative", width: "100%", height: "140px", borderRadius: "8px", overflow: "hidden", border: "1px solid #1c2e52" }}>
                <img
                  src={formData.imagen_url}
                  alt="Previsualización de fondo"
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
                <button
                  type="button"
                  onClick={() => setFormData(p => ({ ...p, imagen_url: "" }))}
                  style={{
                    position: "absolute", top: "8px", right: "8px",
                    background: "rgba(239, 68, 68, 0.9)", border: "none",
                    borderRadius: "50%", width: "24px", height: "24px",
                    color: "white", display: "flex", alignItems: "center",
                    justifyContent: "center", cursor: "pointer", fontSize: "12px",
                    fontWeight: 700
                  }}
                  title="Eliminar imagen"
                >
                  ✕
                </button>
              </div>
            )}
          </FormRow>
        </div>
        )}

        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", paddingTop: "16px", marginTop: "4px", borderTop: "1px solid var(--border-container)", flexShrink: 0 }}>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid #1c2e52",
            color: "var(--color-text-muted)", borderRadius: "8px", padding: "10px 20px",
            cursor: "pointer", fontSize: "13px", fontWeight: 600,
          }}>
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving} style={{
            background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%)", border: "none",
            color: "white", borderRadius: "8px", padding: "10px 24px",
            cursor: "pointer", fontSize: "13px", fontWeight: 700,
            display: "flex", alignItems: "center", gap: "6px",
          }}>
            <Save size={14} /> {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>

      {modalHistorialAbierto && (
        <HistorialUbicacionesModal
          equipo={equipo}
          proyectos={proyectos}
          onClose={() => setModalHistorialAbierto(false)}
          onAsignacionCambiada={() => {
            if (equipo?.id) {
              fetch(`/api/equipos/historial-ubicaciones?equipo_id=${equipo.id}`)
                .then((r) => r.json())
                .then((res) => {
                  if (res.success) setHistorialCargado(res.data || []);
                })
                .catch(console.error);
            }
            onSave();
          }}
        />
      )}
    </div>
  );
}

// ================================================================
// PANEL PRINCIPAL DE GESTIÓN DE EQUIPOS
// ================================================================
export default function EquiposTab({ hookProps }) {
  const {
    equiposPaginado,
    equiposCompleto,
    proyectosCompleto,
    formEquipo,
    setFormEquipo,
    botPhone,
    setBotPhone,
    editEquipo,
    setEditEquipo,
    qrEquipo,
    setQrEquipo,
    saving,
    showMsg,
    handleSubmit,
    handleDelete
  } = hookProps;

  const [showForm, setShowForm] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [historialEquipo, setHistorialEquipo] = useState(null);

  const equiposAgrupados = React.useMemo(() => {
    const groups = {};
    (equiposPaginado.data || []).forEach(eq => {
      const pName = eq.proyectos?.nombre_proyecto || "Sin Asignar / En Patio";
      if (!groups[pName]) groups[pName] = [];
      groups[pName].push(eq);
    });
    return groups;
  }, [equiposPaginado.data]);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 800 }}>Gestión de Equipos</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          style={{
            background: showForm ? "rgba(0,0,0,0.08)" : "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))",
            border: showForm ? "1px solid var(--border-container)" : "none",
            color: "white", borderRadius: "8px", padding: "6px 14px",
            cursor: "pointer", fontWeight: 700, fontSize: "12px",
            display: "flex", alignItems: "center", gap: "6px",
            boxShadow: "none",
            transition: "all 0.2s"
          }}
        >
          {showForm ? <X size={14} /> : <Plus size={14} />}
          {showForm ? "Ocultar Formulario" : "Agregar Equipo"}
        </button>
      </div>

      {/* Formulario nuevo equipo */}
      {showForm && (
        <div style={{ background: "var(--bg-container)", border: "1px solid var(--border-container)", borderRadius: "var(--border-radius-base)", padding: "20px", marginBottom: "24px", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--color-text-muted)" }}>
              + REGISTRAR NUEVO EQUIPO
            </h3>
            <button
              onClick={() => setShowForm(false)}
              style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", alignItems: "center", padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}>
            <FormRow label="Código Interno *">
              <input style={inputStyle} placeholder="EIMI00387"
                value={formEquipo.codigo_interno}
                onChange={e => setFormEquipo(p => ({ ...p, codigo_interno: e.target.value }))} />
            </FormRow>
            <FormRow label="Descripción *">
              <input style={inputStyle} placeholder="Liebherr LR 1300"
                value={formEquipo.descripcion_equipo}
                onChange={e => setFormEquipo(p => ({ ...p, descripcion_equipo: e.target.value }))} />
            </FormRow>
            <FormRow label="Proveedor">
              <input style={inputStyle} placeholder="EIMISA"
                value={formEquipo.proveedor}
                onChange={e => setFormEquipo(p => ({ ...p, proveedor: e.target.value }))} />
            </FormRow>
            <FormRow label="Proyecto Actual">
              <SearchableSelect
                options={[
                  { value: "", label: "Sin asignar" },
                  ...(proyectosCompleto?.data || []).map(o => ({
                    value: o.id,
                    label: `${o.codigo_cc} — ${o.nombre_proyecto}`
                  }))
                ]}
                value={formEquipo.proyecto_actual_id || ""}
                onChange={val => setFormEquipo(p => ({ ...p, proyecto_actual_id: val }))}
              />
            </FormRow>
            <FormRow label="Seguimiento de Horas por Especialidad/Operador">
              <select style={selectStyle}
                value={(formEquipo.seguimiento_completo !== false).toString()}
                onChange={e => setFormEquipo(p => ({ ...p, seguimiento_completo: e.target.value === "true" }))}>
                <option value="true">Sí (Flujo Completo con Operador, Horómetro y Especialidades)</option>
                <option value="false">No (Sin enlace a Operador, ej: Torres de Iluminación)</option>
              </select>
            </FormRow>
            <FormRow label="Clasificación Comercial">
              <select style={selectStyle}
                value={formEquipo.clasificacion_comercial || "OPERATIVO - EN USO"}
                onChange={e => setFormEquipo(p => ({ ...p, clasificacion_comercial: e.target.value }))}>
                <option value="OPERATIVO - EN USO">Operativo - En Uso</option>
                <option value="DISPONIBLE PARA ARRIENDO">Disponible para Arriendo</option>
                <option value="VENTA">Venta</option>
                <option value="EN PREPARACION OBRA">En Preparación Obra</option>
                <option value="FUERA DE SERVICIO - REPARACION - MANTENCION">Fuera de Servicio - Reparación / Mantención</option>
                <option value="EN IMPORTACION">En Importación</option>
              </select>
            </FormRow>
            <FormRow label="Capacidad Estanque (Litros)">
              <input style={inputStyle} type="number" placeholder="Ej: 150, 200, 350..."
                value={formEquipo.capacidad_estanque_litros || ""}
                onChange={e => setFormEquipo(p => ({ ...p, capacidad_estanque_litros: e.target.value }))} />
            </FormRow>
            {formEquipo.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO" && (
              <>
                <FormRow label="Cliente / Obra de Arriendo">
                  <input style={inputStyle} placeholder="Ej: Constructora Alfa S.A."
                    value={formEquipo.arriendo_cliente || ""}
                    onChange={e => setFormEquipo(p => ({ ...p, arriendo_cliente: e.target.value }))} />
                </FormRow>
                <FormRow label="Fecha Inicio Arriendo">
                  <input type="date" style={inputStyle}
                    value={formEquipo.arriendo_fecha_inicio || ""}
                    onChange={e => setFormEquipo(p => ({ ...p, arriendo_fecha_inicio: e.target.value }))} />
                </FormRow>
                <FormRow label="Fecha Fin Arriendo">
                  <input type="date" style={inputStyle}
                    value={formEquipo.arriendo_fecha_fin || ""}
                    onChange={e => setFormEquipo(p => ({ ...p, arriendo_fecha_fin: e.target.value }))} />
                </FormRow>
              </>
            )}
          </div>
          <button
            onClick={() => handleSubmit("/api/equipos", formEquipo, () => setFormEquipo({ codigo_interno: "", descripcion_equipo: "", proveedor: "EIMISA", proyecto_actual_id: "", seguimiento_completo: true, clasificacion_comercial: "OPERATIVO - EN USO", arriendo_cliente: "", arriendo_fecha_inicio: "", arriendo_fecha_fin: "", capacidad_estanque_litros: "" }), () => { equiposPaginado.refresh(); equiposCompleto.refresh(); })}
            disabled={saving}
            style={{
              background: "linear-gradient(135deg, var(--color-primary), var(--color-primary-hover))", border: "none",
              color: "white", borderRadius: "8px", padding: "9px 20px",
              cursor: "pointer", fontWeight: 700, fontSize: "13px",
              display: "flex", alignItems: "center", gap: "6px", marginTop: "4px",
            }}
          >
            <Plus size={14} /> {saving ? "Guardando…" : "Registrar Equipo"}
          </button>
        </div>
      )}

      {/* Buscador de Equipos */}
      <Buscador
        value={equiposPaginado.search}
        onChange={e => equiposPaginado.setSearch(e.target.value)}
        placeholder="Buscar equipos por código, descripción, marca, modelo, patente, etc..."
      />

      {/* Tabla equipos */}
      <div style={{ background: "var(--bg-container)", border: "1px solid var(--border-container)", borderRadius: "var(--border-radius-base)", overflow: "visible", boxShadow: "0 4px 20px rgba(0,0,0,0.02)" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr style={{ background: "var(--bg-sidebar)" }}>
              {["Código", "Descripción", "Estado", "Clasif. Comercial", "Combustible", "Acciones"].map((h, idx, arr) => (
                <th key={h} style={{
                  padding: "12px 16px",
                  textAlign: "left",
                  color: "var(--color-text-muted)",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  borderBottom: "1px solid var(--border-container)",
                  borderTopLeftRadius: idx === 0 ? "var(--border-radius-base)" : "0",
                  borderTopRightRadius: idx === arr.length - 1 ? "var(--border-radius-base)" : "0"
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(equiposAgrupados).map(([proyecto, items]) => (
              <React.Fragment key={proyecto}>
                <tr style={{ background: "var(--bg-sidebar)" }}>
                  <td colSpan={6} style={{ padding: "8px 16px", color: "var(--color-primary-hover)", fontWeight: 700, fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid var(--border-container)" }}>
                    📍 {proyecto} ({items.length} {items.length === 1 ? "equipo" : "equipos"})
                  </td>
                </tr>
                {items.map((eq, i) => {
                  const cfg = ESTADO_CONFIG[eq.estado_actual] || ESTADO_CONFIG["Disponible"];
                  return (
                    <tr key={eq.id} style={{ background: i % 2 === 0 ? "transparent" : "rgba(16, 185, 129, 0.02)" }}>
                      <td style={{ padding: "12px 16px", color: "#ff303e", fontWeight: 700, fontSize: "13px", borderBottom: "1px solid var(--border-container)" }}>{formatEquipoLabel(eq)}</td>
                      <td style={{ padding: "12px 16px", color: "var(--color-text)", fontSize: "13px", borderBottom: "1px solid var(--border-container)" }}>{eq.descripcion_equipo}</td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-container)" }}>
                    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: "12px", padding: "3px 10px", fontSize: "11px", fontWeight: 700 }}>
                      {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-container)" }}>
                    {(() => {
                      const esArriendo = eq.clasificacion_comercial === "DISPONIBLE PARA ARRIENDO";
                      const estaArrendado = esArriendo && eq.arriendo_cliente && eq.arriendo_cliente.trim() !== "";
                      
                      let bg = "var(--bg-sidebar)";
                      let color = "var(--color-text-muted)";
                      let border = "1px solid var(--border-sidebar)";
                      let label = eq.clasificacion_comercial || "OPERATIVO - EN USO";

                      if (eq.clasificacion_comercial === "VENTA") {
                        bg = "rgba(59, 130, 246, 0.12)";
                        color = "#2563eb";
                        border = "1px solid rgba(59, 130, 246, 0.25)";
                        label = "💲 VENTA";
                      } else if (esArriendo) {
                        if (estaArrendado) {
                          bg = "rgba(249, 115, 22, 0.12)";
                          color = "#ea580c";
                          border = "1px solid rgba(249, 115, 22, 0.25)";
                          label = "🤝 ARRENDADO";
                        } else {
                          bg = "rgba(16, 185, 129, 0.12)";
                          color = "#059669";
                          border = "1px solid rgba(16, 185, 129, 0.25)";
                          label = "🔑 EN PATIO";
                        }
                      } else if (eq.clasificacion_comercial === "OPERATIVO - EN USO") {
                        bg = "rgba(16, 185, 129, 0.12)";
                        color = "#059669";
                        border = "1px solid rgba(16, 185, 129, 0.25)";
                        label = "👷 EN USO";
                      } else if (eq.clasificacion_comercial === "EN PREPARACION OBRA") {
                        bg = "rgba(217, 119, 6, 0.12)";
                        color = "#d97706";
                        border = "1px solid rgba(217, 119, 6, 0.25)";
                        label = "⚙️ PREPARACIÓN";
                      } else if (eq.clasificacion_comercial === "FUERA DE SERVICIO - REPARACION - MANTENCION") {
                        bg = "rgba(194, 26, 37, 0.12)";
                        color = "#c21a25";
                        border = "1px solid rgba(194, 26, 37, 0.25)";
                        label = "🔧 MANTENCION";
                      } else if (eq.clasificacion_comercial === "EN IMPORTACION") {
                        bg = "rgba(99, 102, 241, 0.12)";
                        color = "#4f46e5";
                        border = "1px solid rgba(99, 102, 241, 0.25)";
                        label = "🚢 IMPORTACIÓN";
                      }

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          <div>
                            <span style={{
                              background: bg,
                              color: color,
                              border: border,
                              borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 700,
                              display: "inline-block"
                            }}>
                              {label}
                            </span>
                          </div>
                          {estaArrendado && (
                            <div style={{ fontSize: "11px", color: "var(--color-text)", lineHeight: 1.2 }}>
                              <span style={{ color: "var(--color-text-muted)" }}>Cliente: </span>{eq.arriendo_cliente}
                              {(eq.arriendo_fecha_inicio || eq.arriendo_fecha_fin) && (
                                <div style={{ fontSize: "10px", color: "var(--color-text-muted)", marginTop: "2px" }}>
                                  {(() => {
                                    const fmt = (d) => {
                                      if (!d) return "—";
                                      const p = d.split("-");
                                      return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
                                    };
                                    return `📅 ${fmt(eq.arriendo_fecha_inicio)} al ${fmt(eq.arriendo_fecha_fin)}`;
                                  })()}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border-container)" }}>
                    {(() => {
                      const nivel = eq.combustible_nivel_porcentaje;
                      if (nivel === undefined || nivel === null) return <span style={{ color: "#475569", fontSize: "12px" }}>—</span>;
                      
                      const esCritico = nivel <= 25;
                      const colorCombustible = nivel >= 50 ? "#22c55e" : nivel > 25 ? "#eab308" : "#ef4444";
                      
                      return (
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "120px" }}>
                          <div style={{ flex: 1, height: "6px", background: "var(--bg-input)", borderRadius: "3px", overflow: "hidden", border: "1px solid var(--border-input)" }}>
                            <div className={esCritico ? "animate-pulse-fuel" : ""} style={{
                              width: `${nivel}%`,
                              height: "100%",
                              background: colorCombustible,
                              boxShadow: esCritico ? `0 0 6px ${colorCombustible}` : "none",
                              transition: "width 0.3s ease",
                            }} />
                          </div>
                          <span style={{ fontSize: "11px", fontWeight: 700, color: esCritico ? "#ef4444" : "var(--color-text-muted)" }}>{nivel}%</span>
                        </div>
                      );
                    })()}
                  </td>
                  <td style={{ padding: "12px 16px", position: "relative", borderBottom: "1px solid var(--border-container)", zIndex: activeMenuId === eq.id ? 10 : "auto" }}>
                    <button
                      onClick={() => setActiveMenuId(activeMenuId === eq.id ? null : eq.id)}
                      style={{
                        background: "var(--bg-sidebar)", border: "1px solid var(--border-sidebar)",
                        color: "var(--color-text-muted)", borderRadius: "6px", padding: "6px 8px",
                        cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center"
                      }}
                    >
                      <MoreVertical size={16} />
                    </button>
                    {activeMenuId === eq.id && (
                      <>
                        <div 
                          style={{ position: "fixed", inset: 0, zIndex: 998 }} 
                          onClick={() => setActiveMenuId(null)} 
                        />
                        <div style={{
                          position: "absolute",
                          right: "16px",
                          top: "40px",
                          background: "var(--bg-container, #1e293b)",
                          border: "1px solid var(--border-container, #334155)",
                          borderRadius: "8px",
                          boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
                          zIndex: 999,
                          display: "flex",
                          flexDirection: "column",
                          gap: "4px",
                          padding: "6px",
                          minWidth: "120px"
                        }}>
                          <button
                            onClick={() => { setEditEquipo(eq); setActiveMenuId(null); }}
                            style={{
                              background: "transparent", border: "none",
                              color: "var(--color-text)", borderRadius: "6px", padding: "8px 12px",
                              fontSize: "12px", fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: "8px", width: "100%",
                              textAlign: "left"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <Pencil size={12} color="var(--color-primary)" />
                            <span>Editar</span>
                          </button>
                          <button
                            onClick={() => { setHistorialEquipo(eq); setActiveMenuId(null); }}
                            style={{
                              background: "transparent", border: "none",
                              color: "var(--color-text)", borderRadius: "6px", padding: "8px 12px",
                              fontSize: "12px", fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: "8px", width: "100%",
                              textAlign: "left"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(2, 132, 199, 0.1)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <History size={12} color="#0284c7" />
                            <span>Historial de Obras</span>
                          </button>
                          <button
                            onClick={() => { setQrEquipo(eq); setActiveMenuId(null); }}
                            style={{
                              background: "transparent", border: "none",
                              color: "var(--color-text)", borderRadius: "6px", padding: "8px 12px",
                              fontSize: "12px", fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: "8px", width: "100%",
                              textAlign: "left"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <QrCode size={12} />
                            <span>Código QR</span>
                          </button>
                          <hr style={{ border: "none", borderTop: "1px solid var(--border-container, #334155)", margin: "4px 0" }} />
                          <button
                            onClick={() => { handleDelete("/api/equipos", eq.id, () => { equiposPaginado.refresh(); equiposCompleto.refresh(); }); setActiveMenuId(null); }}
                            style={{
                              background: "transparent", border: "none",
                              color: "#ef4444", borderRadius: "6px", padding: "8px 12px",
                              fontSize: "12px", fontWeight: 600, cursor: "pointer",
                              display: "flex", alignItems: "center", gap: "8px", width: "100%",
                              textAlign: "left"
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)"}
                            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                          >
                            <Trash2 size={12} />
                            <span>Eliminar</span>
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </React.Fragment>
        ))}
            {equiposPaginado.data.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "32px", textAlign: "center", color: "var(--color-text-muted)", fontSize: "13px" }}>
                  No hay equipos registrados o no coinciden con la búsqueda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Paginador api={equiposPaginado} label="equipos" />
      </div>

      {editEquipo && (
        <EditarEquipoModal
          equipo={editEquipo}
          proyectos={proyectosCompleto.data}
          onClose={() => setEditEquipo(null)}
          onSave={() => {
            setEditEquipo(null);
            equiposPaginado.refresh();
            equiposCompleto.refresh();
            showMsg("✅ Equipo actualizado con éxito");
          }}
        />
      )}

      {qrEquipo && (
        <QrEquipoModal
          equipo={qrEquipo}
          botPhone={botPhone}
          onClose={() => setQrEquipo(null)}
        />
      )}

      {historialEquipo && (
        <HistorialUbicacionesModal
          equipo={historialEquipo}
          proyectos={proyectosCompleto?.data || []}
          onClose={() => setHistorialEquipo(null)}
          onAsignacionCambiada={() => {
            equiposPaginado.refresh();
            equiposCompleto.refresh();
          }}
        />
      )}
    </>
  );
}
