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
    limit = 200,
    offset = 0,
  } = req.query;

  try {
    // 1. Si solicitan las fechas disponibles con datos guardados
    if (action === "fechas_disponibles") {
      const { data: fechasRaw, error: errFechas } = await supabase
        .schema("maquinaria")
        .from("telemetria_viajes")
        .select("fecha")
        .order("fecha", { ascending: false });

      if (errFechas) throw errFechas;

      const fechasUnicas = [...new Set((fechasRaw || []).map((f) => f.fecha))];
      return res.status(200).json({
        success: true,
        fechas: fechasUnicas,
        min: fechasUnicas[fechasUnicas.length - 1] || null,
        max: fechasUnicas[0] || null,
      });
    }

    // 2. Consulta de VIAJES individuales
    let query = supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .select(
        `
        *,
        equipo:equipos!telemetria_viajes_equipo_id_fkey(
          id, codigo_interno, patente, descripcion_equipo, tipo, categoria
        )
      `,
        { count: "exact" }
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

    query = query
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Calcular KPIs acumulados de los viajes obtenidos
    let totalKm = 0;
    let totalKmCan = 0;
    let totalKmGps = 0;
    let totalHoras = 0;
    let totalCombustible = 0;
    let totalCombustibleCan = 0;
    let totalCombustibleGps = 0;

    (data || []).forEach((r) => {
      const km = Number(r.km_recorridos) || 0;
      const comb = Number(r.litros_combustible) || 0;
      const canLit = Number(r.litros_can) || 0;
      const gpsLit = Number(r.litros_gps) || 0;
      const min = Number(r.tiempo_min) || 0;

      totalKm += km;
      if (r.origen_km === "CAN" || r.origen_combustible === "CAN" || canLit > 0) {
        totalKmCan += km;
      } else {
        totalKmGps += km;
      }

      totalHoras += min / 60;
      totalCombustible += comb;
      totalCombustibleCan += canLit > 0 ? canLit : (r.origen_combustible === "CAN" ? comb : 0);
      totalCombustibleGps += gpsLit > 0 ? gpsLit : (r.origen_combustible === "GPS" ? comb : 0);
    });

    // Obtener fechas disponibles (para que el frontend conozca el rango con datos)
    const { data: fechasDistintas } = await supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .select("fecha")
      .order("fecha", { ascending: false })
      .limit(300);

    const fechasUnicas = [...new Set((fechasDistintas || []).map((f) => f.fecha))];

    return res.status(200).json({
      success: true,
      total: count,
      fechas_disponibles: fechasUnicas,
      kpis: {
        total_viajes: count || (data || []).length,
        total_km: Math.round(totalKm * 10) / 10,
        total_km_can: Math.round(totalKmCan * 10) / 10,
        total_km_gps: Math.round(totalKmGps * 10) / 10,
        total_horas: Math.round(totalHoras * 10) / 10,
        total_combustible_litros: Math.round(totalCombustible * 10) / 10,
        total_combustible_can: Math.round(totalCombustibleCan * 10) / 10,
        total_combustible_gps: Math.round(totalCombustibleGps * 10) / 10,
      },
      data: data || [],
    });
  } catch (err) {
    console.error("[API telemetria/index GET] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
