export async function obtenerSesionActiva(supabase, phoneClean) {
  const { data: sesion } = await supabase
    .from("sesiones_whatsapp")
    .select("*, reportes_diarios(*)")
    .eq("whatsapp_remitente", phoneClean)
    .maybeSingle();

  if (!sesion) return null;

  const hoyChile = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const fechaReporte = sesion.reportes_diarios?.fecha || null;
  const estadoFinal = sesion.reportes_diarios?.estado_final || null;
  const updatedAtMs = sesion.updated_at ? new Date(sesion.updated_at).getTime() : 0;
  const horasInactivo = updatedAtMs ? (Date.now() - updatedAtMs) / (1000 * 60 * 60) : 999;

  // Si el reporte ya está cerrado o es de un día anterior con más de 14 horas de inactividad, limpiar sesión fantasma
  if (estadoFinal === "Cerrado" || (fechaReporte && fechaReporte < hoyChile && horasInactivo > 14)) {
    await supabase.from("sesiones_whatsapp").delete().eq("id", sesion.id);
    return null;
  }

  return sesion;
}
