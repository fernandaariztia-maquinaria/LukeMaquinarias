import { horasTranscurridas } from "../../timeUtils.js";
import { ejecutarCierreAutomatico12Horas } from "./cierreAutomaticoService.js";

export async function obtenerSesionActiva(supabase, phoneClean) {
  const { data: sesion } = await supabase
    .schema("maquinaria")
    .from("sesiones_whatsapp")
    .select("*, reportes_diarios(*)")
    .eq("whatsapp_remitente", phoneClean)
    .maybeSingle();

  if (!sesion) return null;

  const hoyChile = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const fechaReporte = sesion.reportes_diarios?.fecha || null;
  const estadoFinal = sesion.reportes_diarios?.estado_final || null;
  const createdAtRep = sesion.reportes_diarios?.created_at;

  // REGLA 2.4: Si han transcurrido 12 horas desde el inicio de la jornada, cerrar automáticamente
  if (createdAtRep) {
    const horasDesdeInicio = horasTranscurridas(createdAtRep);
    if (horasDesdeInicio >= 12) {
      console.log(`[sessionService] ⏰ Jornada superó límite de 12 horas (${horasDesdeInicio.toFixed(1)} hrs). Ejecutando cierre automático para ${phoneClean}...`);
      const { data: personal } = await supabase
        .schema("maquinaria")
        .from("personal")
        .select("*")
        .eq("id", sesion.reportes_diarios.operador_id)
        .maybeSingle();

      if (personal) {
        await ejecutarCierreAutomatico12Horas(
          supabase,
          sesion,
          sesion.reportes_diarios,
          personal,
          `${phoneClean}@s.whatsapp.net`,
          phoneClean,
          process.env.GEMINI_API_KEY
        );
      } else {
        await supabase.schema("maquinaria").from("sesiones_whatsapp").delete().eq("id", sesion.id);
      }
      return null;
    }
  }

  // Si el reporte ya está cerrado o es de un día anterior con más de 14 horas de inactividad, limpiar sesión fantasma
  const updatedAtMs = sesion.updated_at ? new Date(sesion.updated_at).getTime() : 0;
  const horasInactivo = updatedAtMs ? (Date.now() - updatedAtMs) / (1000 * 60 * 60) : 999;
  if (estadoFinal === "Cerrado" || (fechaReporte && fechaReporte < hoyChile && horasInactivo > 14)) {
    await supabase.schema("maquinaria").from("sesiones_whatsapp").delete().eq("id", sesion.id);
    return null;
  }

  return sesion;
}
