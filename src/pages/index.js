import React from "react";
import Head from "next/head";
import Link from "next/link";

export default function Home() {
  return (
    <>
      <Head>
        <title>Luke Equipos – Sistema de Gestión Interno</title>
        <meta name="description" content="Plataforma interna para la gestión de equipos y maquinaria." />
      </Head>
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        background: "#0a1120",
        color: "#f8fafc",
        fontFamily: "'Poppins', sans-serif",
        padding: "2rem",
      }}>
        <h1 style={{ fontSize: "3rem", marginBottom: "1rem" }}>
          Bienvenido al Sistema de Gestión de Equipos
        </h1>
        <p style={{ fontSize: "1.2rem", textAlign: "center", maxWidth: "600px" }}>
          .
        </p>
        <Link href="/admin-maquinaria" passHref>
          <a style={{
            marginTop: "2rem",
            padding: "0.75rem 1.5rem",
            background: "linear-gradient(135deg, #2563eb, #1d4ed8)",
            color: "white",
            borderRadius: "8px",
            textDecoration: "none",
            fontWeight: 600,
          }}>
            Ir al Área de Gestión
          </a>
        </Link>
      </div>
    </>
  );
}
