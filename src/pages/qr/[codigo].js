import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { 
  User, 
  Camera, 
  FileText, 
  MapPin, 
  ArrowRight, 
  Loader2, 
  MessageSquare, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  RefreshCw, 
  Cpu,
  Zap
} from "lucide-react";
import { formatEquipoLabel } from "../../lib/equipoLabel";

// Función para formatear el RUT chileno dinámicamente (ej: 12.345.678-K)
function formatRut(value) {
  if (!value) return "";
  // Limpiar caracteres que no sean números ni la letra K, limitado a 9 caracteres de largo
  const clean = value.replace(/[^0-9kK]/g, "").slice(0, 9);
  
  if (clean.length <= 1) {
    return clean;
  }
  
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  
  let formattedBody = "";
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formattedBody = body.charAt(i) + formattedBody;
    count++;
    if (count === 3 && i > 0) {
      formattedBody = "." + formattedBody;
      count = 0;
    }
  }
  
  return `${formattedBody}-${dv}`;
}

export default function QrLanding() {
  const router = useRouter();
  const { codigo } = router.query;

  // Estados de control de flujo
  const [identificador, setIdentificador] = useState("");
  const [isIdentified, setIsIdentified] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [authError, setAuthError] = useState("");

  // Datos obtenidos del servidor
  const [loadingData, setLoadingData] = useState(true);
  const [equipo, setEquipo] = useState(null);
  const [operador, setOperador] = useState(null);
  const [reportes, setReportes] = useState([]);
  const [botPhone, setBotPhone] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Estados de interacción
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [ubicacionCargando, setUbicacionCargando] = useState(false);
  const [ubicacionOk, setUbicacionOk] = useState(false);
  const [coords, setCoords] = useState(null);
  const fileInputRef = useRef(null);

  // Estados de check-in web consolidado
  const [lecturaActual, setLecturaActual] = useState("");
  const [destinoRuta, setDestinoRuta] = useState("");
  const [pautaConfirmada, setPautaConfirmada] = useState(false);
  const [errorMessageLocal, setErrorMessageLocal] = useState("");
  const [checkinSuccess, setCheckinSuccess] = useState(false);
  const [showBypassGps, setShowBypassGps] = useState(false);
  const [combustibleNivel, setCombustibleNivel] = useState(100);
  const [capacidadEstanque, setCapacidadEstanque] = useState("");
  const [estadoEquipo, setEstadoEquipo] = useState("Equipo Operativo");

  // Estados de integración POD del día siguiente
  const [podBloque, setPodBloque] = useState(null);
  const [confirmandoPod, setConfirmandoPod] = useState(false);
  const [podConfirmadoLocal, setPodConfirmadoLocal] = useState(false);

  // Consultar datos iniciales del equipo y bot al montar
  useEffect(() => {
    if (!router.isReady || !codigo) return;

    const init = async () => {
      // 1. Cargar datos del equipo y del botPhone iniciales
      try {
        const res = await fetch(`/api/qr-landing-data?codigo=${codigo}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setEquipo(data.equipo);
          setBotPhone(data.botPhone);
          if (data.equipo && data.equipo.combustible_nivel_porcentaje != null) {
            setCombustibleNivel(data.equipo.combustible_nivel_porcentaje);
          }
        }
      } catch (err) {
        console.error("Error cargando datos iniciales del equipo:", err);
      }

      // 2. Verificar si hay sesión en localStorage
      const storedId = localStorage.getItem("luke_operador_identificador");
      if (storedId) {
        setIdentificador(storedId);
        // No marcamos isIdentified en true inmediatamente para evitar que React
        // intente renderizar la vista de check-in antes de que fetchLandingData 
        // cargue la información del operador (evita race conditions y crashes).
        fetchLandingData(storedId);
      } else {
        setLoadingData(false);
      }
    };

    init();
  }, [router.isReady, codigo]);

  // Consultar datos de la landing page
  const fetchLandingData = async (userId) => {
    setLoadingData(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/qr-landing-data?codigo=${codigo}&identificador=${userId}`);
      const data = await res.json();

      if (res.ok && data.success) {
        setEquipo(data.equipo);
        setBotPhone(data.botPhone);
         if (data.equipo && data.equipo.combustible_nivel_porcentaje != null) {
          setCombustibleNivel(data.equipo.combustible_nivel_porcentaje);
        }
        
        // Cargar bloque POD si existe
        if (data.podBloque) {
          setPodBloque(data.podBloque);
          setPodConfirmadoLocal(!!data.podBloque.confirmado_at);
        } else {
          setPodBloque(null);
          setPodConfirmadoLocal(false);
        }
        
        if (data.operador) {
          setOperador(data.operador);
          setReportes(data.reportes || []);
          setIsIdentified(true);
          localStorage.setItem("luke_operador_identificador", userId);
        } else {
          // El operador no fue encontrado
          setAuthError("Operador no registrado o inactivo en la base de datos.");
          setIsIdentified(false);
          localStorage.removeItem("luke_operador_identificador");
        }
      } else {
        setErrorMsg(data.message || "Error al obtener datos del equipo");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de red al conectar con el servidor.");
    } finally {
      setLoadingData(false);
    }
  };

  // Manejar el submit del login
  const handleIdentify = async (e) => {
    e.preventDefault();
    if (!identificador.trim()) return;

    setIdentifying(true);
    setAuthError("");
    try {
      // Intentar cargar los datos para validar al operador
      await fetchLandingData(identificador.trim());
    } catch (err) {
      setAuthError("Error al validar tus credenciales.");
    } finally {
      setIdentifying(false);
    }
  };

  // Desvincular operador en este dispositivo (Cerrar sesión en localStorage)
  const handleLogout = () => {
    localStorage.removeItem("luke_operador_identificador");
    setOperador(null);
    setReportes([]);
    setIsIdentified(false);
    setIdentificador("");
    setUbicacionOk(false);
    setCoords(null);
    setPodBloque(null);
    setPodConfirmadoLocal(false);
  };

  // Confirmar asignación POD
  const handleConfirmarAsignacion = async () => {
    if (!podBloque || !operador || !equipo) return;
    setConfirmandoPod(true);
    setErrorMessageLocal("");
    try {
      const res = await fetch("/api/pod/confirmar-asignacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bloque_id: podBloque.id,
          operador_id: operador.id,
          equipo_id: equipo.id
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPodConfirmadoLocal(true);
      } else {
        setErrorMessageLocal(data.error || "No se pudo confirmar la asignación.");
      }
    } catch (e) {
      setErrorMessageLocal("Error de red al confirmar asignación.");
    } finally {
      setConfirmandoPod(false);
    }
  };

  // Activar captura de foto (Cámara frontal)
  const triggerCamera = () => {
    fileInputRef.current?.click();
  };

  // Procesar subida de foto
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !operador) return;

    setSubiendoFoto(true);
    const reader = new FileReader();

    reader.onload = async (event) => {
      const base64String = event.target?.result;
      if (!base64String) {
        setSubiendoFoto(false);
        return;
      }

      try {
        const res = await fetch("/api/personal/upload-foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            personalId: operador.id,
            imageBase64: base64String
          })
        });

        const json = await res.json();
        if (json.success && json.foto_url) {
          // Actualización optimista de la UI
          setOperador(prev => ({ ...prev, foto_url: json.foto_url }));
        } else {
          alert("Error al subir foto: " + (json.error || json.message));
        }
      } catch (err) {
        console.error(err);
        alert("Ocurrió un error al subir la fotografía.");
      } finally {
        setSubiendoFoto(false);
      }
    };

    reader.readAsDataURL(file);
  };

  // Ejecutar el check-in físico enviando la ubicación al servidor
  const performCheckin = async (lat = null, lng = null) => {
    if (!equipo || !operador) return;

    const requiereSeguimiento = equipo.seguimiento_completo !== false;
    const esVehiculo = equipo.tipo_seguimiento === "vehiculo";
    
    let valorLecturaNum = 0;
    if (requiereSeguimiento) {
      valorLecturaNum = parseFloat(lecturaActual) || 0;
    }

    setUbicacionCargando(true);
    setErrorMessageLocal("");

    try {
      const res = await fetch("/api/equipos/checkin-web", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipoId: equipo.id,
          operadorId: operador.id,
          valorLectura: valorLecturaNum,
          latitud: lat,
          longitud: lng,
          pautaConfirmada: equipo.pauta_preventiva_activa ? true : false,
          destinoRuta: esVehiculo ? destinoRuta : null,
          combustibleNivel: combustibleNivel,
          capacidadEstanque: equipo.capacidad_estanque_litros ? parseInt(equipo.capacidad_estanque_litros) : (capacidadEstanque ? parseInt(capacidadEstanque) : null),
          estadoEquipo: estadoEquipo
        })
      });

      const json = await res.json();
      if (json.success) {
        setCheckinSuccess(true);
        setUbicacionOk(true);
        // Redirigir a WhatsApp
        const messageText = `REPORTE:${equipo.codigo_interno}`;
        const cleanPhone = botPhone.replace(/[^0-9]/g, "");
        window.location.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(messageText)}`;
      } else {
        setErrorMessageLocal(json.message || "Error al procesar el check-in en el servidor.");
      }
    } catch (err) {
      console.error(err);
      setErrorMessageLocal("Error de red al conectar con el servidor.");
    } finally {
      setUbicacionCargando(false);
    }
  };

  // Procesar check-in consolidado desde la Web
  const handleCheckinWeb = async (e) => {
    e.preventDefault();
    if (!equipo || !operador) return;

    const requiereSeguimiento = equipo.seguimiento_completo !== false;
    const esVehiculo = equipo.tipo_seguimiento === "vehiculo";
    const ultimaLectura = (esVehiculo ? equipo.ultimo_odometro : equipo.ultimo_horometro) || 0;
    
    // Validar lectura inicial
    let valorLecturaNum = 0;
    if (requiereSeguimiento) {
      if (!lecturaActual) {
        setErrorMessageLocal(`Por favor ingresa el ${esVehiculo ? "odómetro" : "horómetro"} inicial.`);
        return;
      }
      valorLecturaNum = parseFloat(lecturaActual);
      if (isNaN(valorLecturaNum) || valorLecturaNum < 0) {
        setErrorMessageLocal("Ingresa un valor numérico válido.");
        return;
      }
      if (valorLecturaNum < ultimaLectura) {
        setErrorMessageLocal(`La lectura no puede ser menor al último registro (${ultimaLectura.toLocaleString("es-CL")} ${esVehiculo ? "km" : "hrs"}).`);
        return;
      }
    }

    // Validar pauta preventiva
    if (equipo.pauta_preventiva_activa && !pautaConfirmada) {
      setErrorMessageLocal("Debes confirmar la pauta de seguridad para iniciar tu jornada.");
      return;
    }


    setErrorMessageLocal("");
    setUbicacionCargando(true);
    setShowBypassGps(false);

    if (!navigator.geolocation) {
      setErrorMessageLocal("Tu dispositivo o navegador no soporta geolocalización. Puedes continuar omitiendo el GPS.");
      setUbicacionCargando(false);
      setShowBypassGps(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        setCoords({ latitude, longitude });
        await performCheckin(latitude, longitude);
      },
      (error) => {
        console.error("Geolocation error:", error);
        setUbicacionCargando(false);
        setShowBypassGps(true);
        let errorTxt = "No se pudo obtener la geolocalización.";
        if (error.code === error.PERMISSION_DENIED) {
          errorTxt = "Permiso de GPS denegado. Concede permisos de ubicación en tu navegador para continuar con GPS, o haz clic en el botón de abajo para continuar sin ubicación.";
        } else if (error.code === error.TIMEOUT) {
          errorTxt = "La obtención de ubicación tardó demasiado (Timeout). Puedes reintentar, o hacer clic abajo para continuar sin ubicación.";
        } else {
          errorTxt = "No se pudo obtener la geolocalización. Puedes continuar sin ubicación haciendo clic abajo.";
        }
        setErrorMessageLocal(errorTxt);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  // Spinner de carga inicial
  if (loadingData && !equipo) {
    return (
      <div className="main-loading animate-fade-in">
        <Loader2 className="spinner" size={40} />
        <p>Cargando datos del equipo...</p>
        <style jsx>{`
          .main-loading {
            min-height: 100vh;
            background: #0a1120;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
            font-family: sans-serif;
            gap: 16px;
          }
          .spinner { animation: spin 1s linear infinite; color: #ff303e; }
          @keyframes spin { 100% { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  // Si hay error en la carga de datos del equipo
  if (errorMsg) {
    return (
      <div className="main-error">
        <AlertCircle size={48} color="#ef4444" />
        <h2>Error al escanear QR</h2>
        <p>{errorMsg}</p>
        <style jsx>{`
          .main-error {
            min-height: 100vh;
            background: #0a1120;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            color: #f8fafc;
            text-align: center;
            padding: 24px;
            gap: 16px;
            font-family: sans-serif;
          }
          p { color: #94a3b8; max-width: 400px; }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{equipo ? `${formatEquipoLabel(equipo)} — LukeEquipos` : "LukeEquipos"}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>

      <div className="landing-layout">
        {/* Orbes decorativos */}
        <div className="orb orb-1"></div>
        <div className="orb orb-2"></div>

        <div className="landing-card">
          {/* Header */}
          <header className="app-header">
            <div className="brand-badge">
              <Cpu size={14} color="#ff303e" />
              <span>LukeEquipos</span>
            </div>
            {isIdentified && operador && (
              <button className="logout-btn" onClick={handleLogout}>
                Cerrar Sesión
              </button>
            )}
          </header>

          {/* ========================================================== */}
          {/* PASO A: IDENTIFICACIÓN DEL OPERADOR */}
          {/* ========================================================== */}
          {!isIdentified ? (
            <div className="form-section animate-fade-in">
              <h2>Validación de Operador</h2>
              <p className="section-desc">
                Antes de iniciar turno en <strong>{equipo?.descripcion_equipo} ({formatEquipoLabel(equipo)})</strong>, por favor identifícate.
              </p>

              {authError && (
                <div className="alert-error-wrapper">
                  <div className="alert alert-error">
                    <AlertCircle size={16} />
                    <span>{authError}</span>
                  </div>
                  <div className="registro-nuevo-box">
                    <p>¿Eres un operador nuevo en LukeEquipos?</p>
                    <a 
                      href={`https://wa.me/${botPhone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        (() => {
                          const partes = ["REGISTRO:NUEVO"];
                          if (equipo?.codigo_interno) partes.push(`EQ_${equipo.codigo_interno}`);
                          if (identificador) partes.push(`RUT_${identificador.trim()}`);
                          return partes.join("_");
                        })()
                      )}`}
                      className="registro-link"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <MessageSquare size={14} className="mr-2" />
                      <span>Registrarse por WhatsApp</span>
                    </a>
                  </div>
                </div>
              )}

              <form onSubmit={handleIdentify}>
                <div className="input-group">
                  <label htmlFor="operador-id">Ingresa tu RUT</label>
                  <input
                    id="operador-id"
                    type="text"
                    placeholder="Ej: 12.345.678-K"
                    value={identificador}
                    onChange={(e) => setIdentificador(formatRut(e.target.value))}
                    required
                  />
                </div>

                <button type="submit" className="submit-btn" disabled={identifying}>
                  {identifying ? (
                    <>
                      <Loader2 className="spinner" size={16} />
                      <span>Validando...</span>
                    </>
                  ) : (
                    <>
                      <span>Continuar</span>
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* ========================================================== */
            /* PASO B: PANTALLA PRINCIPAL CON GEOLOCALIZACIÓN Y FOTO */
            /* ========================================================== */
            <div className="dashboard-section animate-fade-in">
              {/* Tarjeta de Operador */}
              <div className="user-profile-box">
                <div className="avatar-wrapper">
                  {operador?.foto_url ? (
                    <img src={operador.foto_url} alt={operador.nombre_completo} className="avatar-img" />
                  ) : (
                    <div className="avatar-placeholder">
                      <User size={36} color="#64748b" />
                    </div>
                  )}
                  <button 
                    className={`edit-photo-badge ${subiendoFoto ? "loading" : ""}`}
                    onClick={triggerCamera}
                    disabled={subiendoFoto}
                  >
                    {subiendoFoto ? <Loader2 className="spinner" size={14} /> : <Camera size={14} />}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: "none" }} 
                    accept="image/*" 
                    capture="user"
                    onChange={handlePhotoUpload} 
                  />
                </div>
                <div className="user-info">
                  <h3>{operador?.nombre_completo || "Cargando operador..."}</h3>
                  <p>{operador?.rol || "Operador de Maquinaria"}</p>
                  {!operador?.foto_url && operador && (
                    <span className="photo-warning">⚠️ Falta registrar foto de perfil</span>
                  )}
                </div>
              </div>

              {/* Tarjeta de Equipo */}
              <div className="item-detail-box">
                <div className="item-icon-wrapper">
                  <Cpu size={20} color="#ff303e" />
                </div>
                <div className="item-metadata">
                  <div className="item-code">{formatEquipoLabel(equipo)}</div>
                  <div className="item-title">{equipo.descripcion_equipo}</div>
                  <div className="item-project">📍 CC: {equipo.proyectos?.codigo_cc} — {equipo.proyectos?.nombre_proyecto || "En Taller"}</div>
                </div>
              </div>

              {/* Historial de Reportes en PDF */}
              <div className="pdf-history-section">
                <h4>📄 Tus Reportes PDF de Días Anteriores</h4>
                {reportes.length > 0 ? (
                  <div className="pdf-list">
                    {reportes.map((rep) => (
                      <a 
                        key={rep.id} 
                        href={`${process.env.NEXT_PUBLIC_BASE_URL || ""}${rep.pdf_url}`} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="pdf-item-link"
                      >
                        <div className="pdf-info">
                          <span className="pdf-date">
                            {new Date(rep.fecha).toLocaleDateString("es-CL", { timeZone: "UTC" })}
                          </span>
                          <span className="pdf-machine">{formatEquipoLabel(rep.equipos)}</span>
                        </div>
                        <Download size={14} className="download-icon" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="no-pdf-txt">No se encontraron reportes PDF consolidados de tus turnos anteriores.</p>
                )}
              </div>

              {/* Banner / Card de Asignación POD del día */}
              {podBloque && (
                <div style={{
                  background: podConfirmadoLocal ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" : "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05))",
                  border: podConfirmadoLocal ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(245,158,11,0.4)",
                  borderRadius: "14px", padding: "16px", marginBottom: "20px",
                  display: "flex", flexDirection: "column", gap: "10px",
                  boxShadow: podConfirmadoLocal ? "0 4px 20px rgba(16,185,129,0.06)" : "0 4px 20px rgba(245,158,11,0.06)",
                  position: "relative",
                  overflow: "hidden"
                }} className="animate-fade-in">
                  <div style={{
                    position: "absolute", top: "0", left: "0", width: "4px", height: "100%",
                    background: podConfirmadoLocal ? "#10b981" : "#f59e0b"
                  }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "10px", color: podConfirmadoLocal ? "#10b981" : "#f59e0b", fontWeight: 800, letterSpacing: "1px", textTransform: "uppercase" }}>
                      {podConfirmadoLocal ? "✅ ASIGNACIÓN CONFIRMADA" : "⚠️ ASIGNADO EN POD HOY"}
                    </span>
                    {podBloque.especialidad && (
                      <span style={{
                        background: `${podBloque.color || '#6b7280'}20`,
                        border: `1px solid ${podBloque.color || '#6b7280'}50`,
                        color: podBloque.color || '#cbd5e1',
                        borderRadius: "6px", padding: "2px 8px", fontSize: "10px", fontWeight: 700
                      }}>
                        {podBloque.especialidad}
                      </span>
                    )}
                  </div>
                  
                  <div style={{ fontSize: "13px", color: "#f8fafc", lineHeight: 1.4 }}>
                    Este equipo fue solicitado en la planificación para:<br />
                    👤 Supervisor: <strong style={{ color: "white" }}>{podBloque.supervisor_nombre}</strong><br />
                    ⏰ Bloque: <strong style={{ color: "white" }}>{podBloque.hora_inicio} a {podBloque.hora_fin} hrs</strong>
                  </div>

                  {!podConfirmadoLocal ? (
                    <button
                      type="button"
                      onClick={handleConfirmarAsignacion}
                      disabled={confirmandoPod}
                      style={{
                        background: "linear-gradient(135deg, #f59e0b, #d97706)",
                        border: "none", borderRadius: "10px", color: "white",
                        padding: "10px 14px", fontSize: "13px", fontWeight: 700,
                        cursor: "pointer", transition: "all 0.2s",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "8px"
                      }}
                      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-1px)"}
                      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
                    >
                      {confirmandoPod ? (
                        <>
                          <Loader2 className="spinner" size={14} style={{ animation: "spin 1s linear infinite" }} />
                          <span>Confirmando...</span>
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          <span>Confirmar y Empezar Check-in</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div style={{ fontSize: "11px", color: "#10b981", fontWeight: 600 }}>
                      Tu supervisor ya recibió una notificación de tu check-in por WhatsApp.
                    </div>
                  )}
                </div>
              )}

              {/* Formulario de Check-in Web Consolidado */}
              <form onSubmit={handleCheckinWeb} className="checkin-web-form">
                
                {/* 1. Si requiere seguimiento de odómetro/horómetro */}
                {equipo.seguimiento_completo !== false && (
                  <div className="reading-validation-box">
                    {equipo.tipo_seguimiento === "vehiculo" ? (
                      <>
                        <div className="digital-odometer cian">
                          <div className="odometer-label">ÚLTIMO ODÓMETRO REGISTRADO</div>
                          <div className="odometer-value-display">
                            {(equipo.ultimo_odometro || 0).toLocaleString("es-CL")} <span className="unit">KM</span>
                          </div>
                        </div>
                        
                        <div className="input-group mt-4">
                          <label htmlFor="reading-input">Ingresa el Kilometraje (Odómetro) Inicial</label>
                          <input
                            id="reading-input"
                            type="number"
                            step="any"
                            placeholder={`Ej: ${(equipo.ultimo_odometro || 0) + 10}`}
                            value={lecturaActual}
                            onChange={(e) => setLecturaActual(e.target.value)}
                            required
                          />
                        </div>

                        <div className="input-group mt-3">
                          <label htmlFor="route-input">Destino de la Ruta</label>
                          <input
                            id="route-input"
                            type="text"
                            placeholder="Ej: Sector Norte, Oficinas, Faena..."
                            value={destinoRuta}
                            onChange={(e) => setDestinoRuta(e.target.value)}
                            required
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="digital-odometer green">
                          <div className="odometer-label">ÚLTIMO HORÓMETRO REGISTRADO</div>
                          <div className="odometer-value-display">
                            {(equipo.ultimo_horometro || 0).toLocaleString("es-CL")} <span className="unit">HRS</span>
                          </div>
                        </div>

                        <div className="input-group mt-4">
                          <label htmlFor="reading-input">Ingresa el Horómetro Inicial</label>
                          <input
                            id="reading-input"
                            type="number"
                            step="any"
                            placeholder={`Ej: ${((equipo.ultimo_horometro || 0) + 1).toFixed(1)}`}
                            value={lecturaActual}
                            onChange={(e) => setLecturaActual(e.target.value)}
                            required
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 1.5 Si la capacidad del estanque es desconocida, solicitarla de manera opcional */}
                {equipo.capacidad_estanque_litros === null && (
                  <div className="reading-validation-box mt-3" style={{ background: "rgba(30, 41, 59, 0.2)", border: "1px solid #1e293b", padding: "14px", borderRadius: "8px" }}>
                    <div style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", marginBottom: "8px" }}>
                      ⛽ CAPACIDAD DEL ESTANQUE (OPCIONAL)
                    </div>
                    <div className="input-group">
                      <label htmlFor="estanque-input">Capacidad del estanque en litros (si la conoces)</label>
                      <input
                        id="estanque-input"
                        type="number"
                        placeholder="Ej: 150, 200, 350..."
                        value={capacidadEstanque}
                        onChange={(e) => setCapacidadEstanque(e.target.value)}
                        style={{
                          width: "100%", background: "var(--bg-input, #090f1d)", border: "1px solid var(--border-input, #1e293b)",
                          borderRadius: "8px", color: "var(--color-input-text, #f8fafc)", padding: "9px 12px",
                          fontSize: "13px", outline: "none", boxSizing: "border-box", fontFamily: "inherit"
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Selector interactivo de Nivel de Combustible */}
                <div className="fuel-selector-box mt-4 animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ color: "#94a3b8", fontSize: "11px", fontWeight: 700, letterSpacing: "1px" }}>
                      ⛽ ESTANQUE DE COMBUSTIBLE INICIAL
                    </span>
                    <span style={{ 
                      color: combustibleNivel <= 20 ? "#ef4444" : combustibleNivel <= 50 ? "#eab308" : "#22c55e", 
                      fontSize: "15px", 
                      fontWeight: 800, 
                      fontFamily: "monospace",
                      textShadow: `0 0 6px ${combustibleNivel <= 20 ? "#ef4444" : combustibleNivel <= 50 ? "#eab308" : "#22c55e"}`
                    }}>
                      {combustibleNivel}%
                    </span>
                  </div>

                  <div style={{
                    background: "#090f1d",
                    border: "1px solid #1e293b",
                    borderRadius: "8px",
                    padding: "8px 12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "12px",
                    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.8)",
                  }}>
                    <div style={{ display: "flex", gap: "4px", flex: 1 }}>
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const bloquePorcentaje = (idx + 1) * 10;
                        const activo = bloquePorcentaje <= combustibleNivel;
                        
                        let colorLed = "#22c55e";
                        if (bloquePorcentaje <= 20) colorLed = "#ef4444";
                        else if (bloquePorcentaje <= 50) colorLed = "#eab308";

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setCombustibleNivel(bloquePorcentaje)}
                            style={{
                              flex: 1,
                              height: "28px",
                              borderRadius: "3px",
                              background: activo ? colorLed : "#1e293b",
                              border: "none",
                              boxShadow: activo ? `0 0 6px ${colorLed}` : "none",
                              transition: "all 0.2s ease",
                              opacity: activo ? 1 : 0.15,
                              cursor: "pointer",
                              padding: 0
                            }}
                            title={`Seleccionar ${bloquePorcentaje}%`}
                          />
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ color: "#64748b", fontSize: "10px", textAlign: "center" }}>
                    Toca la barra en el nivel que corresponda para actualizar el estanque.
                  </div>
                </div>

                {/* 2. Pauta preventiva obligatoria */}
                {equipo.pauta_preventiva_activa && (
                  <div className="pauta-preventiva-box mt-4 animate-fade-in">
                    <div className="pauta-header">
                      <AlertCircle size={16} className="pauta-icon" />
                      <span>PAUTA DE SEGURIDAD HOY</span>
                    </div>
                    <div className="pauta-content">
                      "{equipo.pauta_preventiva_activa}"
                    </div>
                    <div className="pauta-checkbox-wrapper">
                      <label className="checkbox-container">
                        <input
                          type="checkbox"
                          checked={pautaConfirmada}
                          onChange={(e) => setPautaConfirmada(e.target.checked)}
                          required
                        />
                        <span className="checkmark"></span>
                        <span className="checkbox-text">Confirmo que realicé la inspección y el equipo cumple con esta pauta.</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Selector de Estado del Equipo (Dropdown oficial de la faena) */}
                <div className="input-group mt-4" style={{ textAlign: "left" }}>
                  <label htmlFor="estado-equipo-select" style={{ display: "block", color: "#94a3b8", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", marginBottom: "6px" }}>
                    Seleccione el estado correspondiente
                  </label>
                  <select
                    id="estado-equipo-select"
                    value={estadoEquipo}
                    onChange={(e) => setEstadoEquipo(e.target.value)}
                    style={{
                      width: "100%",
                      background: "var(--bg-input, #090f1d)",
                      border: "1px solid var(--border-input, #1e293b)",
                      borderRadius: "8px",
                      color: "var(--color-input-text, #f8fafc)",
                      padding: "9px 12px",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      cursor: "pointer"
                    }}
                  >
                    <option value="Equipo Operativo">Equipo Operativo</option>
                    <option value="Equipo Fuera de Servicio (Panne)">Equipo Fuera de Servicio (Panne)</option>
                    <option value="Equipo Disponible sin Operador">Equipo Disponible sin Operador</option>
                    <option value="Equipo traslado">Equipo traslado</option>
                    <option value="Equipo en Mantención Programada">Equipo en Mantención Programada</option>
                    <option value="Equipo Desvinculado pero en Obra">Equipo Desvinculado pero en Obra</option>
                    <option value="Equipo Desvinculado">Equipo Desvinculado</option>
                    <option value="Equipo en Proceso de Acreditación">Equipo en Proceso de Acreditación</option>
                    <option value="Equipo en Proceso de Armado">Equipo en Proceso de Armado</option>
                  </select>
                </div>

                {/* 3. Mensajes de error locales */}
                {errorMessageLocal && (
                  <div className="alert alert-error mt-4">
                    <AlertCircle size={16} />
                    <span>{errorMessageLocal}</span>
                  </div>
                )}

                {/* 4. Botón Único de Envío */}
                <button
                  type="submit"
                  className={`submit-btn mt-4 ${ubicacionCargando ? "loading" : ""}`}
                  disabled={ubicacionCargando}
                >
                  {ubicacionCargando ? (
                    <>
                      <Loader2 className="spinner animate-spin mr-2" size={16} />
                      <span>Validando y Registrando...</span>
                    </>
                  ) : checkinSuccess ? (
                    <>
                      <CheckCircle size={16} className="mr-2" />
                      <span>¡Turno Registrado! Abriendo WhatsApp...</span>
                    </>
                  ) : (
                    <>
                      <span>Iniciar Turno y Abrir WhatsApp</span>
                      <ArrowRight size={16} className="ml-2" />
                    </>
                  )}
                </button>

                {showBypassGps && !checkinSuccess && (
                  <button
                    type="button"
                    onClick={() => performCheckin(null, null)}
                    className="submit-btn mt-2 bypass-btn"
                    style={{
                      background: "transparent",
                      border: "1px dashed #ef4444",
                      color: "#fca5a5"
                    }}
                  >
                    <span>Omitir GPS e Iniciar Turno</span>
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>

      <style jsx global>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Poppins', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #0a1120;
          color: #f8fafc;
          min-height: 100vh;
          overflow-x: hidden;
        }

        .landing-layout {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          position: relative;
          background: radial-gradient(circle at top, #101c33, #0a1120);
        }

        /* Orbes degradados en background */
        .orb {
          position: absolute;
          width: 280px;
          height: 280px;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.12;
          pointer-events: none;
          z-index: 0;
        }
        .orb-1 {
          top: -20px;
          left: -20px;
          background: #ff303e;
        }
        .orb-2 {
          bottom: -20px;
          right: -20px;
          background: #38bdf8;
        }

        /* Tarjeta principal Glassmorphism */
        .landing-card {
          position: relative;
          z-index: 10;
          max-width: 440px;
          width: 100%;
          background: rgba(30, 41, 59, 0.65);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
        }

        /* Header */
        .app-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .brand-badge {
          display: flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 48, 62, 0.08);
          border: 1px solid rgba(255, 48, 62, 0.2);
          border-radius: 8px;
          padding: 4px 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.5px;
          color: #ff303e;
        }

        .logout-btn {
          background: transparent;
          border: none;
          color: #64748b;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          transition: color 0.2s;
          padding: 4px 8px;
        }
        .logout-btn:hover {
          color: #f8fafc;
        }

        /* Títulos */
        h2 {
          font-size: 20px;
          font-weight: 800;
          color: white;
          margin-bottom: 8px;
          letter-spacing: -0.5px;
        }

        .section-desc {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
          margin-bottom: 20px;
        }

        /* Alertas */
        .alert {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 16px;
        }

        .alert-error {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.2);
          color: #fca5a5;
        }

        .alert-error-wrapper {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .registro-nuevo-box {
          background: rgba(37, 99, 235, 0.05);
          border: 1px dashed rgba(37, 99, 235, 0.2);
          border-radius: 8px;
          padding: 14px;
          text-align: center;
        }

        .registro-nuevo-box p {
          font-size: 12px;
          color: #94a3b8;
          margin-bottom: 10px;
        }

        .registro-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #2563eb;
          color: white;
          text-decoration: none;
          padding: 8px 16px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 700;
          transition: background 0.2s, transform 0.1s;
        }

        .registro-link:hover {
          background: #1d4ed8;
          transform: translateY(-0.5px);
        }

        .registro-link.disabled {
          background: #1e293b !important;
          border: 1px solid rgba(255,255,255,0.05) !important;
          color: #475569 !important;
          cursor: not-allowed !important;
          opacity: 0.65;
          transform: none !important;
        }

        .mr-2 {
          margin-right: 6px;
        }

        /* Formularios */
        .input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
          margin-bottom: 18px;
          text-align: left;
        }

        .input-group label {
          font-size: 12px;
          font-weight: 600;
          color: #94a3b8;
        }

        .input-group input {
          background: #0f172a;
          border: 1px solid #1c2e52;
          border-radius: 8px;
          color: white;
          padding: 12px 14px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
          font-family: inherit;
        }

        .input-group input:focus {
          border-color: #ff303e;
        }

        .submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #ff303e, #c21a25);
          color: white;
          border: none;
          border-radius: 10px;
          padding: 12px;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .submit-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(255, 48, 62, 0.3);
        }

        /* Perfil de Operador Dashboard */
        .user-profile-box {
          display: flex;
          align-items: center;
          gap: 16px;
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.05);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 16px;
          text-align: left;
        }

        .avatar-wrapper {
          position: relative;
          width: 60px;
          height: 60px;
          flex-shrink: 0;
        }

        .avatar-img {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid #2563eb;
          box-shadow: 0 0 10px rgba(37, 99, 235, 0.3);
        }

        .avatar-placeholder {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: #1e293b;
          border: 2px dashed #475569;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .edit-photo-badge {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: #2563eb;
          color: white;
          border: 2px solid #0f172a;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.2s, transform 0.2s;
        }
        .edit-photo-badge:hover {
          background: #1d4ed8;
          transform: scale(1.05);
        }

        .user-info h3 {
          font-size: 15px;
          font-weight: 700;
          color: white;
          margin-bottom: 2px;
        }

        .user-info p {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          font-weight: 600;
          letter-spacing: 0.5px;
        }

        .photo-warning {
          display: inline-block;
          font-size: 10px;
          color: #f59e0b;
          font-weight: 700;
          margin-top: 4px;
        }

        /* Detalle del Equipo Dashboard */
        .item-detail-box {
          display: flex;
          align-items: center;
          gap: 14px;
          background: rgba(255, 48, 62, 0.04);
          border: 1px solid rgba(255, 48, 62, 0.12);
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 20px;
          text-align: left;
        }

        .item-icon-wrapper {
          width: 36px;
          height: 36px;
          background: rgba(255, 48, 62, 0.08);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .item-code {
          font-size: 11px;
          font-weight: 700;
          color: #ff303e;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .item-title {
          font-size: 14px;
          font-weight: 700;
          color: white;
          margin-top: 1px;
        }

        .item-project {
          font-size: 11px;
          color: #64748b;
          margin-top: 3px;
        }

        /* Historial de reportes PDF */
        .pdf-history-section {
          text-align: left;
          margin-bottom: 24px;
        }

        .pdf-history-section h4 {
          font-size: 12px;
          font-weight: 700;
          color: #cbd5e1;
          margin-bottom: 10px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pdf-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 150px;
          overflow-y: auto;
          padding-right: 4px;
        }

        /* Personalización de scrollbar */
        .pdf-list::-webkit-scrollbar {
          width: 4px;
        }
        .pdf-list::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }

        .pdf-item-link {
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 8px;
          padding: 10px 14px;
          text-decoration: none;
          transition: background 0.2s, border-color 0.2s;
        }
        .pdf-item-link:hover {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
        }

        .pdf-date {
          font-size: 13px;
          font-weight: 600;
          color: #cbd5e1;
        }

        .pdf-machine {
          font-size: 11px;
          color: #64748b;
          font-weight: 700;
          margin-left: 8px;
          background: rgba(255,255,255,0.05);
          padding: 2px 6px;
          border-radius: 4px;
        }

        .download-icon {
          color: #2563eb;
        }

        .no-pdf-txt {
          font-size: 12px;
          color: #64748b;
          font-style: italic;
          padding: 8px 0;
        }

        /* Formulario de Check-in Web */
        .checkin-web-form {
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* Tableros Digitales Estilo Automotriz Glowing */
        .digital-odometer {
          background: #060c18;
          border-radius: 14px;
          padding: 16px;
          text-align: center;
          position: relative;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.05);
          box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.8);
        }

        .digital-odometer::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 50%;
          background: linear-gradient(to bottom, rgba(255, 255, 255, 0.05), transparent);
          pointer-events: none;
        }

        .odometer-label {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 1.5px;
          color: #64748b;
          margin-bottom: 6px;
        }

        .odometer-value-display {
          font-family: 'Courier New', Courier, monospace;
          font-size: 28px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .digital-odometer.green {
          border-color: rgba(16, 185, 129, 0.3);
          box-shadow: 0 0 15px rgba(16, 185, 129, 0.05), inset 0 2px 8px rgba(0, 0, 0, 0.8);
        }
        .digital-odometer.green .odometer-value-display {
          color: #10b981;
          text-shadow: 0 0 10px rgba(16, 185, 129, 0.5);
        }

        .digital-odometer.cian {
          border-color: rgba(6, 182, 212, 0.3);
          box-shadow: 0 0 15px rgba(6, 182, 212, 0.05), inset 0 2px 8px rgba(0, 0, 0, 0.8);
        }
        .digital-odometer.cian .odometer-value-display {
          color: #06b6d4;
          text-shadow: 0 0 10px rgba(6, 182, 212, 0.5);
        }

        .unit {
          font-size: 14px;
          font-weight: 500;
          opacity: 0.7;
          margin-left: 2px;
        }

        /* Pauta de Seguridad Hoy */
        .pauta-preventiva-box {
          background: rgba(245, 158, 11, 0.03);
          border: 1px solid rgba(245, 158, 11, 0.15);
          border-radius: 12px;
          padding: 16px;
        }

        .pauta-header {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 700;
          color: #f59e0b;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .pauta-content {
          font-size: 13px;
          line-height: 1.5;
          color: #e2e8f0;
          font-style: italic;
          margin-bottom: 14px;
          padding-left: 4px;
          border-left: 2px solid rgba(245, 158, 11, 0.3);
        }

        /* Checkbox Custom Estilizado */
        .pauta-checkbox-wrapper {
          display: flex;
          align-items: flex-start;
        }

        .checkbox-container {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          cursor: pointer;
          font-size: 12px;
          color: #cbd5e1;
          line-height: 1.4;
          user-select: none;
        }

        .checkbox-container input {
          margin-top: 2px;
          cursor: pointer;
          accent-color: #f59e0b;
        }

        .checkbox-text {
          font-weight: 500;
        }

        /* Animaciones */
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .spinner {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }

        /* Selector de combustible */
        .fuel-selector-box {
          background: rgba(9, 15, 29, 0.8);
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 14px;
          box-shadow: inset 0 2px 8px rgba(0,0,0,0.6);
        }

        .mt-4 { margin-top: 16px; }
        .mt-3 { margin-top: 12px; }
        .mt-2 { margin-top: 8px; }
        .ml-2 { margin-left: 6px; }

        /* Onda del líquido del tanque */
        @keyframes wave {
          0%, 100% { transform: translateX(0) scaleY(1); }
          50% { transform: translateX(10%) scaleY(1.3); }
        }

        /* Pulso de combustible crítico */
        @keyframes fuelPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </>
  );
}
