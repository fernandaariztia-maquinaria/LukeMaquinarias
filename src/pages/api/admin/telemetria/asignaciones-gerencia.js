import { createAdminClient } from "../../../../lib/supabase-server";
import { normalizarPatente } from "../../../../lib/telemetriaUtils";

const CLAVE_CONFIG = "telemetria_asignaciones_gerencia";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  // Helper para leer asignaciones desde configuracion_bot
  async function leerAsignaciones() {
    const { data, error } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .select("valor")
      .eq("clave", CLAVE_CONFIG)
      .maybeSingle();

    if (error) {
      console.error("[asignaciones-gerencia] Error al leer configuracion_bot:", error);
      return [];
    }

    if (!data?.valor) return [];
    try {
      const parsed = JSON.parse(data.valor);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  // Helper para guardar asignaciones en configuracion_bot
  async function guardarAsignaciones(lista) {
    const jsonStr = JSON.stringify(lista);
    const { data, error } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .upsert(
        { clave: CLAVE_CONFIG, valor: jsonStr, updated_at: new Date().toISOString() },
        { onConflict: "clave" }
      )
      .select();

    if (error) {
      throw new Error(`Error al persistir asignaciones: ${error.message}`);
    }
    return data;
  }

  // 1. GET: Retorna la lista completa de asignaciones de camionetas a gerentes/jefaturas
  if (req.method === "GET") {
    try {
      const asignaciones = await leerAsignaciones();
      return res.status(200).json({ success: true, data: asignaciones });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 2. POST: Registra o actualiza una asignación
  if (req.method === "POST") {
    try {
      const {
        id,
        patente,
        codigo_interno = "",
        nombre_responsable,
        rut_responsable = "S/R",
        cargo = "Gerente / Jefatura",
        proyecto_id = null,
        proyecto_nombre = "",
        notas = "",
        activo = true,
      } = req.body || {};

      if (!patente || !patente.trim()) {
        return res.status(400).json({ success: false, error: "La patente del vehículo es requerida." });
      }
      if (!nombre_responsable || !nombre_responsable.trim()) {
        return res.status(400).json({ success: false, error: "El nombre del gerente o jefatura es requerido." });
      }

      const listaActual = await leerAsignaciones();
      const patClean = normalizarPatente(patente);

      const nuevaAsignacion = {
        id: id || `asig_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        patente: patente.trim().toUpperCase(),
        patente_normalizada: patClean,
        codigo_interno: codigo_interno.trim().toUpperCase(),
        nombre_responsable: nombre_responsable.trim(),
        rut_responsable: rut_responsable.trim(),
        cargo: cargo.trim(),
        proyecto_id: proyecto_id || null,
        proyecto_nombre: proyecto_nombre.trim(),
        notas: notas.trim(),
        activo: Boolean(activo),
        updated_at: new Date().toISOString(),
      };

      // Si ya existe por patente o ID, actualizar
      const indiceExistente = listaActual.findIndex(
        (a) => (id && a.id === id) || normalizarPatente(a.patente) === patClean
      );

      let listaActualizada;
      if (indiceExistente >= 0) {
        listaActualizada = [...listaActual];
        listaActualizada[indiceExistente] = {
          ...listaActual[indiceExistente],
          ...nuevaAsignacion,
        };
      } else {
        listaActualizada = [nuevaAsignacion, ...listaActual];
      }

      await guardarAsignaciones(listaActualizada);

      return res.status(200).json({
        success: true,
        message: "Asignación de camioneta guardada exitosamente.",
        asignacion: nuevaAsignacion,
        data: listaActualizada,
      });
    } catch (err) {
      console.error("[asignaciones-gerencia POST] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // 3. DELETE: Elimina una asignación por ID o por patente
  if (req.method === "DELETE") {
    try {
      const { id, patente } = req.body || req.query || {};
      if (!id && !patente) {
        return res.status(400).json({ success: false, error: "Debe especificar el id o patente a eliminar." });
      }

      const listaActual = await leerAsignaciones();
      const patClean = patente ? normalizarPatente(patente) : null;

      const listaFiltrada = listaActual.filter((a) => {
        if (id && a.id === id) return false;
        if (patClean && normalizarPatente(a.patente) === patClean) return false;
        return true;
      });

      await guardarAsignaciones(listaFiltrada);

      return res.status(200).json({
        success: true,
        message: "Asignación eliminada correctamente.",
        data: listaFiltrada,
      });
    } catch (err) {
      console.error("[asignaciones-gerencia DELETE] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}

