import React, { useState } from "react";

const WhatsAppIcon = ({ size = 18, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display: "block" }}>
    <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.28-2.42 5.84a8.18 8.18 0 0 1-5.82 2.41h-.01c-1.49 0-2.95-.39-4.23-1.13l-.3-.18-3.12.82.83-3.04-.2-.31a8.204 8.204 0 0 1-1.26-4.41c0-4.54 3.7-8.24 8.27-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.49-1.4-1.74-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43l-.48-.01c-.17 0-.44.06-.67.31-.23.25-.87.85-.87 2.08 0 1.22.89 2.41 1.01 2.58.13.17 1.76 2.68 4.26 3.76.6.26 1.06.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.07-.1-.23-.17-.48-.29z" />
  </svg>
);

export default function PersonalAvatar({ persona, rolEtiqueta, cfgBorder, mostrarTexto = true }) {
  const [isHovered, setIsHovered] = useState(false);
  const [imgError, setImgError] = useState(false);
  if (!persona) return null;

  const iniciales = persona.nombre_completo
    ? persona.nombre_completo
        .split(" ")
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "??";

  // URL de WhatsApp directa
  const whatsappUrl = persona.whatsapp
    ? `https://wa.me/${persona.whatsapp.replace(/\+/g, "").replace(/\s/g, "")}`
    : null;

  return (
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "8px",
        maxWidth: "100%",
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Círculo del avatar interactivo */}
      <div
        onClick={() => {
          if (whatsappUrl) window.open(whatsappUrl, "_blank");
        }}
        title={whatsappUrl ? `Contactar a ${persona.nombre_completo} por WhatsApp` : persona.nombre_completo}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          cursor: whatsappUrl ? "pointer" : "default",
          border: isHovered && whatsappUrl ? "2px solid #25D366" : `2px solid ${cfgBorder || "#94a3b8"}`,
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isHovered && whatsappUrl ? "#25D366" : "#f1f5f9",
          color: isHovered && whatsappUrl ? "#ffffff" : "#1e293b",
          boxShadow: isHovered
            ? "0 4px 10px rgba(37, 211, 102, 0.35)"
            : "0 1px 3px rgba(0, 0, 0, 0.08)",
          transform: isHovered ? "scale(1.08)" : "scale(1)",
          transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          flexShrink: 0,
        }}
      >
        {isHovered && whatsappUrl ? (
          <WhatsAppIcon size={18} color="#ffffff" />
        ) : persona.foto_url && !imgError ? (
          <img
            src={persona.foto_url}
            alt={persona.nombre_completo}
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px" }}>
            {iniciales}
          </span>
        )}
      </div>

      {/* Nombre y Cargo al lado de la foto */}
      {mostrarTexto && (
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, lineHeight: 1.25 }}>
          <span
            title={persona.nombre_completo}
            style={{
              fontSize: "12px",
              fontWeight: 700,
              color: "var(--color-text)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "150px",
            }}
          >
            {persona.nombre_completo}
          </span>
          {rolEtiqueta && (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 600,
                color: cfgBorder || "var(--color-text-muted)",
                letterSpacing: "0.2px",
              }}
            >
              {rolEtiqueta}
            </span>
          )}
        </div>
      )}

      {/* Tooltip con información y WhatsApp al pasar el mouse */}
      {isHovered && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0f172a",
            color: "#ffffff",
            padding: "5px 10px",
            borderRadius: "6px",
            fontSize: "11px",
            fontWeight: 600,
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
            pointerEvents: "none",
            zIndex: 100,
            lineHeight: 1.3,
          }}
        >
          <div>{persona.nombre_completo}</div>
          {rolEtiqueta && (
            <div style={{ fontSize: "9px", color: "#94a3b8", fontWeight: 500 }}>
              {rolEtiqueta} {whatsappUrl ? "• Clic para WhatsApp 💬" : ""}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "5px solid transparent",
              borderRight: "5px solid transparent",
              borderTop: "5px solid #0f172a",
            }}
          />
        </div>
      )}
    </div>
  );
}
