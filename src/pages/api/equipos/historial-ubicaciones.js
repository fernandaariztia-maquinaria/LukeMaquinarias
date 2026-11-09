import { createAdminClient } from "../../../lib/supabase-server";
import {
  calcularDias,
  leerHistorialConfig,
  guardarHistorialConfig,
  registrarCambioUbicacion,
} from "../../../lib/historialUbicacionesHelper";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  // ── GET: Obtener historial por equipo o completo ────────────────────────────
  if (req.method === "GET") {
    const { equipo_id } = req.query;

    try {
      let registros = [];
      let usoTablaDedicada = true;

      const { data: rowsTable, error: errTable } = await supabase
        .schema("maquinaria")
        .from("historial_ubicaciones_equipos")
        .select("*")
        .order("fecha_inicio", { ascending: false });

      if (errTable) {
        usoTablaDedicada = false;
        registros = await leerHistorialConfig(supabase);
      } else {
        registros = rowsTable || [];
      }

      if (equipo_id) {
        registros = registros.filter((r) => r.equipo_id === equipo_id);
      }

      // Si no hay registros aún pero el equipo tiene proyecto asignado en tabla equipos,
      // generamos una asignación inicial activa de referencia
      if (registros.length === 0 && equipo_id) {
        const { data: eq } = await supabase
          .schema("maquinaria")
          .from("equipos")
          .select("id, codigo_interno, patente, created_at, proyecto_actual_id, proyectos(id, nombre_proyecto, codigo_cc)")
          .eq("id", equipo_id)
          .maybeSingle();

        if (eq?.proyecto_actual_id && eq.proyectos) {
          const fIni = eq.created_at ? eq.created_at.slice(0, 10) : new Date().toISOString().slice(0, 10);
          const autoReg = {
            id: `auto_${eq.id}_init`,
            equipo_id: eq.id,
            proyecto_id: eq.proyectos.id,
            proyecto_nombre: eq.proyectos.nombre_proyecto,
            proyecto_cc: eq.proyectos.codigo_cc || "",
            fecha_inicio: fIni,
            fecha_fin_estimada: null,
            fecha_fin_real: null,
            estado: "ACTIVA",
            dias_reales: calcularDias(fIni, null),
            motivo_traslado: "Asignación inicial registrada",
            registrado_por: "Sistema",
            created_at: eq.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          registros = [autoReg];

          if (usoTablaDedicada) {
            await supabase.schema("maquinaria").from("historial_ubicaciones_equipos").insert({
              equipo_id: autoReg.equipo_id,
              proyecto_id: autoReg.proyecto_id,
              proyecto_nombre: autoReg.proyecto_nombre,
              proyecto_cc: autoReg.proyecto_cc,
              fecha_inicio: autoReg.fecha_inicio,
              estado: "ACTIVA",
              motivo_traslado: autoReg.motivo_traslado,
              registrado_por: autoReg.registrado_por,
            });
          } else {
            const all = await leerHistorialConfig(supabase);
            all.unshift(autoReg);
            await guardarHistorialConfig(supabase, all);
          }
        }
      }

      const enriched = registros.map((r) => ({
        ...r,
        dias_reales: calcularDias(r.fecha_inicio, r.fecha_fin_real),
      }));

      return res.status(200).json({
        success: true,
        data: enriched,
      });
    } catch (err) {
      console.error("[API historial-ubicaciones GET] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST: Registrar nueva asignación o cambio de obra ───────────────────────
  if (req.method === "POST") {
    const {
      equipo_id,
      proyecto_id,
      proyecto_nombre,
      proyecto_cc,
      fecha_inicio,
      fecha_fin_estimada,
      fecha_salida_anterior,
      motivo_traslado,
      registrado_por,
    } = req.body;

    if (!equipo_id) {
      return res.status(400).json({ success: false, error: "Falta el id del equipo (equipo_id)" });
    }

    try {
      await registrarCambioUbicacion(supabase, {
        equipo_id,
        proyecto_id,
        proyecto_nombre,
        proyecto_cc,
        fecha_inicio,
        fecha_fin_estimada,
        fecha_salida_anterior,
        motivo_traslado,
        registrado_por,
      });

      // Sincronizar campo proyecto_actual_id en la tabla equipos
      await supabase
        .schema("maquinaria")
        .from("equipos")
        .update({
          proyecto_actual_id: proyecto_id || null,
        })
        .eq("id", equipo_id);

      return res.status(200).json({
        success: true,
        message: proyecto_id
          ? "Asignación registrada exitosamente en el historial"
          : "Equipo desasignado exitosamente, fecha de salida registrada",
      });
    } catch (err) {
      console.error("[API historial-ubicaciones POST] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── PUT: Modificar un registro puntual del historial ────────────────────────
  if (req.method === "PUT") {
    const { id, fecha_inicio, fecha_fin_estimada, fecha_fin_real, motivo_traslado, estado } = req.body;
    if (!id) return res.status(400).json({ success: false, error: "Falta id del registro" });

    try {
      const { error: errTest } = await supabase
        .schema("maquinaria")
        .from("historial_ubicaciones_equipos")
        .select("id")
        .limit(1);

      if (!errTest) {
        const updates = {};
        if (fecha_inicio !== undefined) updates.fecha_inicio = fecha_inicio;
        if (fecha_fin_estimada !== undefined) updates.fecha_fin_estimada = fecha_fin_estimada;
        if (fecha_fin_real !== undefined) updates.fecha_fin_real = fecha_fin_real;
        if (motivo_traslado !== undefined) updates.motivo_traslado = motivo_traslado;
        if (estado !== undefined) updates.estado = estado;
        updates.updated_at = new Date().toISOString();

        const { error } = await supabase
          .schema("maquinaria")
          .from("historial_ubicaciones_equipos")
          .update(updates)
          .eq("id", id);

        if (error) throw error;
      } else {
        const list = await leerHistorialConfig(supabase);
        const found = list.find((item) => item.id === id);
        if (found) {
          if (fecha_inicio !== undefined) found.fecha_inicio = fecha_inicio;
          if (fecha_fin_estimada !== undefined) found.fecha_fin_estimada = fecha_fin_estimada;
          if (fecha_fin_real !== undefined) found.fecha_fin_real = fecha_fin_real;
          if (motivo_traslado !== undefined) found.motivo_traslado = motivo_traslado;
          if (estado !== undefined) found.estado = estado;
          found.dias_reales = calcularDias(found.fecha_inicio, found.fecha_fin_real);
          found.updated_at = new Date().toISOString();
          await guardarHistorialConfig(supabase, list);
        }
      }

      return res.status(200).json({ success: true, message: "Registro actualizado exitosamente" });
    } catch (err) {
      console.error("[API historial-ubicaciones PUT] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── DELETE: Eliminar un registro puntual del historial ─────────────────────
  if (req.method === "DELETE") {
    const { id } = req.body || req.query;
    if (!id) return res.status(400).json({ success: false, error: "Falta id" });

    try {
      const { error: errTest } = await supabase
        .schema("maquinaria")
        .from("historial_ubicaciones_equipos")
        .select("id")
        .limit(1);

      if (!errTest) {
        await supabase
          .schema("maquinaria")
          .from("historial_ubicaciones_equipos")
          .delete()
          .eq("id", id);
      } else {
        let list = await leerHistorialConfig(supabase);
        list = list.filter((item) => item.id !== id);
        await guardarHistorialConfig(supabase, list);
      }

      return res.status(200).json({ success: true, message: "Registro eliminado exitosamente" });
    } catch (err) {
      console.error("[API historial-ubicaciones DELETE] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Método no permitido" });
}
