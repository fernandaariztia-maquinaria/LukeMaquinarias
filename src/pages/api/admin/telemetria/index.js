import { createAdminClient } from "../../../../lib/supabase-server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const {
    action,
    fecha,
    desde,
    hasta,
    equipo_id,
    patente,
    origen,
    search,
    limit = 100,
    offset = 0,
  } = req.query;

  try {
    // 1. Obtener todas las fechas distintas guardadas en la base de datos
    const { data: fechasRaw } = await supabase
      .schema("maquinaria")
      .from("telemetria_fechas_disponibles")
      .select("fecha");

    const fechasUnicas = (fechasRaw || []).map((f) => f.fecha);
    const fechaMin = fechasUnicas[fechasUnicas.length - 1] || "2026-10-01";
    const fechaMax = fechasUnicas[0] || new Date().toISOString().slice(0, 10);

    if (action === "fechas_disponibles") {
      return res.status(200).json({
        success: true,
        fechas: fechasUnicas,
        min: fechaMin,
        max: fechaMax,
      });
    }

    // Normalizar fechas para filtros
    const filtroDesde = fecha || desde || null;
    const filtroHasta = fecha || hasta || null;

    // 2. Calcular KPIs exactos instantáneamente mediante la función RPC
    const { data: kpisRpc, error: errRpc } = await supabase
      .schema("maquinaria")
      .rpc("get_telemetria_kpis", {
        p_desde: filtroDesde,
        p_hasta: filtroHasta,
        p_patente: patente || null,
        p_origen: origen || null,
        p_search: search || null,
      });

    let kpis = {
      total_viajes: 0,
      total_km: 0,
      total_km_can: 0,
      total_km_gps: 0,
      total_horas: 0,
      total_combustible_litros: 0,
      total_combustible_can: 0,
      total_combustible_gps: 0,
    };

    if (kpisRpc && kpisRpc.length > 0) {
      const row = kpisRpc[0];
      kpis = {
        total_viajes: Number(row.total_viajes) || 0,
        total_km: Number(row.total_km) || 0,
        total_km_can: Number(row.total_km_can) || 0,
        total_km_gps: Number(row.total_km_gps) || 0,
        total_horas: Number(row.total_horas) || 0,
        total_combustible_litros: Number(row.total_combustible) || 0,
        total_combustible_can: Number(row.total_combustible_can) || 0,
        total_combustible_gps: Number(row.total_combustible_gps) || 0,
      };
    }

    // 3. Consulta de viajes paginados
    let query = supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .select(
        `
        *,
        equipo:equipos!telemetria_viajes_equipo_id_fkey(
          id, codigo_interno, patente, descripcion_equipo, tipo, categoria
        )
      `
      );

    if (fecha) {
      query = query.eq("fecha", fecha);
    } else {
      if (desde) query = query.gte("fecha", desde);
      if (hasta) query = query.lte("fecha", hasta);
    }

    if (equipo_id) {
      query = query.eq("equipo_id", equipo_id);
    }

    if (patente) {
      query = query.ilike("patente", `%${patente}%`);
    }

    if (origen) {
      if (origen.toUpperCase() === "CAN") {
        query = query.or("origen_km.eq.CAN,origen_combustible.eq.CAN,litros_can.gt.0");
      } else if (origen.toUpperCase() === "GPS") {
        query = query.and("origen_km.eq.GPS,origen_combustible.eq.GPS,litros_can.eq.0");
      }
    }

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      query = query.or(
        `patente.ilike.${term},nombre_conductor.ilike.${term},rut_conductor.ilike.${term},lugar_inicio.ilike.${term},lugar_fin.ilike.${term},nombre_skynav.ilike.${term}`
      );
    }

    const nLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const nOffset = Math.max(Number(offset) || 0, 0);

    query = query
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .range(nOffset, nOffset + nLimit - 1);

    const { data: viajes, error: errViajes } = await query;
    if (errViajes) throw errViajes;

    return res.status(200).json({
      success: true,
      total: kpis.total_viajes,
      limit: nLimit,
      offset: nOffset,
      fechas_disponibles: fechasUnicas,
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      kpis,
      data: viajes || [],
    });
  } catch (err) {
    console.error("[API telemetria/index GET] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
