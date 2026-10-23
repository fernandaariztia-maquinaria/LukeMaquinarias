import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Lock, Loader2, Key } from "lucide-react";
import { createBrowserClient } from "../lib/supabase-client";

export default function ResetPassword() {
  const router = useRouter();
  const [supabase] = useState(() => createBrowserClient());
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [doneMsg, setDoneMsg] = useState("");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });

    // Si la sesión de recuperación ya se estableció antes de montar el listener
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => subscription?.unsubscribe();
  }, [supabase]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!password || password.length < 6) {
      setErrorMsg("La contraseña debe tener al menos 6 caracteres");
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden");
      return;
    }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setErrorMsg(error.message || "Ocurrió un error al actualizar la contraseña");
      return;
    }

    setDoneMsg("Contraseña actualizada. Redirigiendo…");
    setTimeout(() => router.replace("/admin-maquinaria"), 1500);
  };

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

  return (
    <>
      <Head>
        <title>Restablecer Contraseña — LukeEquipos</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      </Head>
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "radial-gradient(circle at center, #121e36, #090f1e)",
        fontFamily: "'Poppins', sans-serif", color: "white", padding: "24px",
      }}>
        <div style={{ position: "absolute", width: "350px", height: "350px", background: "rgba(255, 48, 62, 0.12)", borderRadius: "50%", filter: "blur(90px)", pointerEvents: "none", zIndex: 0 }} />

        <div style={cardStyle}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, marginBottom: "8px", color: "white" }}>Restablecer Contraseña</h2>

          {!ready ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "16px 0" }}>
              <Loader2 className="animate-spin" size={28} style={{ color: "#ff303e" }} />
              <p style={{ fontSize: "13px", color: "#94a3b8" }}>Validando el link de recuperación…</p>
            </div>
          ) : doneMsg ? (
            <p style={{ fontSize: "13px", color: "#4ade80", marginTop: "16px" }}>{doneMsg}</p>
          ) : (
            <>
              <p style={{ fontSize: "13px", color: "#94a3b8", marginBottom: "26px", lineHeight: 1.5 }}>
                Ingresa tu nueva contraseña para la consola web.
              </p>

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div style={{ position: "relative", textAlign: "left" }}>
                  <input
                    type="password"
                    placeholder="Nueva contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={inputSt}
                  />
                  <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "flex", alignItems: "center" }}>
                    <Lock size={16} />
                  </div>
                </div>

                <div style={{ position: "relative", textAlign: "left" }}>
                  <input
                    type="password"
                    placeholder="Confirmar contraseña"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    style={inputSt}
                  />
                  <div style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", color: "#64748b", display: "flex", alignItems: "center" }}>
                    <Lock size={16} />
                  </div>
                </div>

                {errorMsg && (
                  <div style={{ background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.2)", borderRadius: "6px", padding: "8px 12px", color: "#ef4444", fontSize: "12px", fontWeight: 600, textAlign: "left" }}>
                    ⚠️ {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    background: "linear-gradient(135deg, #ff303e 0%, #c21a25 100%)", border: "none",
                    color: "white", borderRadius: "8px", padding: "12px 20px",
                    fontSize: "14px", fontWeight: 700, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
                    boxShadow: "0 4px 14px rgba(255, 48, 62, 0.3)",
                  }}
                >
                  <Key size={14} />
                  <span>{saving ? "Guardando…" : "Actualizar Contraseña"}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}
