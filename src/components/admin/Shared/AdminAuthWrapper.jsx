import React, { useState, useEffect } from "react";
import Head from "next/head";
import { Lock, Loader2, Key, Mail } from "lucide-react";
import { createBrowserClient } from "../../../lib/supabase-client";

const STORAGE_KEY_USER = "luke_user";

export default function AdminAuthWrapper({ children }) {
  const [supabase] = useState(() => createBrowserClient());
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [forgotMsg, setForgotMsg] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const STORAGE_KEY_PROYECTO_FILTRO = "luke_filtro_proyecto_id";

  const resolveUserIdentity = async (userEmail) => {
    const cleanEmail = userEmail.trim().toLowerCase();
    
    // Recuperar proyecto guardado previamente por el admin en localStorage
    let savedProjId = null;
    let savedProj = null;
    if (typeof window !== "undefined") {
      try {
        savedProjId = localStorage.getItem(STORAGE_KEY_PROYECTO_FILTRO);
        if (savedProjId) {
          const { data: projData } = await supabase
            .from("proyectos")
            .select("*")
            .eq("id", savedProjId)
            .maybeSingle();
          if (projData) savedProj = projData;
        }
      } catch (e) {
        console.error("Error recuperando proyecto guardado:", e);
      }
    }

    // 1. Caso especial: cristianluke@gmail.com siempre es Administrador General
    if (cleanEmail === "cristianluke@gmail.com") {
      try {
        const { data: persona } = await supabase
          .from("personal")
          .select("*, proyectos(*)")
          .eq("email", cleanEmail)
          .maybeSingle();

        const projIdFinal = savedProjId || persona?.proyecto_actual_id || null;
        const projFinal = savedProj || persona?.proyectos || null;

        return {
          id: persona?.id || "admin-root",
          nombre_completo: persona?.nombre_completo || "Administrador General",
          rol: "Administrador",
          proyecto_actual_id: projIdFinal,
          proyecto: projFinal,
          email: cleanEmail
        };
      } catch {
        return {
          id: "admin-root",
          nombre_completo: "Administrador General",
          rol: "Administrador",
          proyecto_actual_id: savedProjId || null,
          proyecto: savedProj || null,
          email: cleanEmail
        };
      }
    }

    // 2. Otros usuarios: buscar en la tabla personal por email
    try {
      const { data: persona } = await supabase
        .from("personal")
        .select("*, proyectos(*)")
        .eq("email", cleanEmail)
        .maybeSingle();

      if (persona && persona.activo) {
        const esAdmin = persona.rol === "Administrador";
        const projIdFinal = (esAdmin && savedProjId) ? savedProjId : (persona.proyecto_actual_id || null);
        const projFinal = (esAdmin && savedProj) ? savedProj : (persona.proyectos || null);

        return {
          id: persona.id,
          nombre_completo: persona.nombre_completo,
          rol: persona.rol, // Puede ser Supervisor, Operador, Administrador, etc.
          proyecto_actual_id: projIdFinal,
          proyecto: projFinal,
          email: cleanEmail
        };
      }
    } catch (err) {
      console.error("Error al buscar identidad por correo:", err);
    }
    
    return null;
  };

  useEffect(() => {
    // Verificar sesión existente en Supabase Auth
    async function checkSession() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const userEmail = session.user.email;
          const user = await resolveUserIdentity(userEmail);
          if (user) {
            setIsAuthenticated(true);
            setCurrentUser(user);
            localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
          } else {
            setLoginError("Tu correo no está registrado en el sistema de personal. Contacta al administrador.");
            await supabase.auth.signOut();
            setIsAuthenticated(false);
            setCurrentUser(null);
            localStorage.removeItem(STORAGE_KEY_USER);
          }
        }
      } catch (err) {
        console.error("Error al obtener la sesión de Supabase:", err);
      } finally {
        setCheckingAuth(false);
      }
    }
    checkSession();

    // Escuchar cambios de estado en Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      try {
        if (session) {
          const userEmail = session.user.email;
          const user = await resolveUserIdentity(userEmail);
          if (user) {
            setIsAuthenticated(true);
            setCurrentUser(prev => {
              // Si ya había un proyecto seleccionado en memoria, preservarlo
              const projId = prev?.proyecto_actual_id || user.proyecto_actual_id;
              const proj = prev?.proyecto || user.proyecto;
              const merged = { ...user, proyecto_actual_id: projId, proyecto: proj };
              localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(merged));
              return merged;
            });
          } else {
            setLoginError("Tu correo no está registrado en el sistema de personal. Contacta al administrador.");
            setIsAuthenticated(false);
            setCurrentUser(null);
            localStorage.removeItem(STORAGE_KEY_USER);
          }
        } else {
          setIsAuthenticated(false);
          setCurrentUser(null);
          localStorage.removeItem(STORAGE_KEY_USER);
        }
      } finally {
        setCheckingAuth(false);
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, [supabase]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    
    if (!email || !password) {
      setLoginError("Por favor ingrese correo y contraseña");
      return;
    }

    setCheckingAuth(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password
      });

      if (error) {
        setLoginError(error.message || "Error al iniciar sesión");
        setCheckingAuth(false);
      } else {
        // La suscripción onAuthStateChange se encargará de resolver el usuario
      }
    } catch (err) {
      setLoginError("Ocurrió un error inesperado al conectar con Supabase");
      setCheckingAuth(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotMsg("");
    if (!email || !email.trim()) {
      setForgotMsg("Ingresa tu correo arriba y luego presiona el link de recuperación.");
      return;
    }
    setSendingReset(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/reset-password`
      });
      setForgotMsg(error ? `Error: ${error.message}` : "Si el correo está registrado, te enviamos un link para restablecer tu contraseña.");
    } catch (err) {
      setForgotMsg("Ocurrió un error al solicitar la recuperación.");
    } finally {
      setSendingReset(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(STORAGE_KEY_USER);
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  const handleChangeUser = () => {
    // Para cambiar de usuario, simplemente cerramos la sesión y dejamos que se vuelvan a autenticar
    handleSignOut();
  };

  // ──── Estilos compartidos ────
  const cardStyle = {
    position: "relative", zIndex: 10,
    maxWidth: "420px", width: "100%",
    background: "rgba(18, 30, 54, 0.90)",
    backdropFilter: "blur(18px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: "20px",
    padding: "40px 32px",
    boxShadow: "0 24px 50px rgba(0, 0, 0, 0.6)",
    textAlign: "center",
  };

  const inputSt = {
    width: "100%", background: "#090f1d",
    border: "1px solid #1c2e52", borderRadius: "8px",
    color: "white", padding: "12px 14px 12px 40px",
    fontSize: "14px", outline: "none",
    boxSizing: "border-box", transition: "all 0.2s",
  };

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a1120", color: "#64748b", fontFamily: "sans-serif" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#ff303e" }} />
      </div>
    );
  }

  // ──── Paso 1: Login ────
  if (!isAuthenticated) {
    return (
      <>
        <Head>
          <title>Iniciar Sesión — LukeEquipos</title>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
        </Head>
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(circle at center, #121e36, #090f1e)",
          fontFamily: "'Poppins', sans-serif", color: "white", padding: "24px",
        }}>
          <div style={{ position: "absolute", width: "350px", height: "350px", background: "rgba(255, 48, 62, 0.12)", borderRadius: "50%", filter: "blur(90px)", pointerEvents: "none", zIndex: 0 }} />

          <div style={cardStyle}>
            <div style={{ marginBottom: "28px" }}>
              <img src="https://www.eimontajes.com/wp-content/uploads/2025/09/logo-eimisa.svg" alt="EIMISA" style={{ width: "160px", height: "auto", margin: "0 auto", display: "block" }} />
              <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", marginTop: "12px", fontFamily: "monospace" }}>
                EIMISA · Gestión de Flota & Faenas
              </div>
            </div>

            <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "white" }}>Acceso Restringido</h2>
            <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "26px", lineHeight: 1.5 }}>
              Ingrese sus credenciales de Supabase Auth para acceder a las funciones del sistema.
            </p>

            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ position: "relative", textAlign: "left" }}>
                <input
                  type="email"
                  placeholder="Correo electrónico"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={inputSt}
                  onFocus={e => { e.target.style.borderColor = "#ff303e"; e.target.style.boxShadow = "0 0 0 2px rgba(255, 48, 62, 0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#1c2e52"; e.target.style.boxShadow = "none"; }}
                />
                <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "flex", alignItems: "center" }}>
                  <Mail size={16} />
                </div>
              </div>

              <div style={{ position: "relative", textAlign: "left" }}>
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={inputSt}
                  onFocus={e => { e.target.style.borderColor = "#ff303e"; e.target.style.boxShadow = "0 0 0 2px rgba(255, 48, 62, 0.2)"; }}
                  onBlur={e => { e.target.style.borderColor = "#1c2e52"; e.target.style.boxShadow = "none"; }}
                />
                <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "flex", alignItems: "center" }}>
                  <Lock size={16} />
                </div>
              </div>

              {loginError && (
                <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "6px", padding: "8px 12px", color: "#ef4444", fontSize: "12px", fontWeight: 600, textAlign: "left" }}>
                  ⚠️ {loginError}
                </div>
              )}

              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg, #ff303e 0%, #c21a25 100%)", border: "none",
                  color: "white", borderRadius: "8px", padding: "12px 20px",
                  fontSize: "14px", fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                  boxShadow: "0 4px 14px rgba(255, 48, 62, 0.3)", transition: "transform 0.1s, box-shadow 0.2s",
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 18px rgba(255, 48, 62, 0.45)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow = "0 4px 14px rgba(255, 48, 62, 0.3)"}
              >
                <Key size={14} />
                <span>Ingresar</span>
              </button>

              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset}
                style={{
                  background: "none", border: "none", color: "#94a3b8",
                  fontSize: "12px", cursor: "pointer", textDecoration: "underline",
                  padding: 0, marginTop: "-4px", alignSelf: "center"
                }}
              >
                {sendingReset ? "Enviando…" : "¿Olvidaste tu contraseña?"}
              </button>

              {forgotMsg && (
                <div style={{ fontSize: "12px", color: "#94a3b8", textAlign: "left", lineHeight: 1.4 }}>
                  {forgotMsg}
                </div>
              )}
            </form>
          </div>
        </div>
      </>
    );
  }

  // ──── Autenticado: pasar currentUser como prop a los children ────
  return (
    <>
      {React.Children.map(children, child =>
        React.isValidElement(child)
          ? React.cloneElement(child, { currentUser, setCurrentUser, onChangeUser: handleChangeUser, onSignOut: handleSignOut })
          : child
      )}
    </>
  );
}
