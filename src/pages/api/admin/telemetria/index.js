import { createAdminClient } from "../../../../lib/supabase-server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const {
    fecha,
    desde,
    hasta,
    equipo_id,
    patente,
    search,
    limit = 50,
    offset = 0,
  } = req.query;

  try {
    let query = supabase
      .schema("maquinaria")
      .from("telemetria_diaria")
      .select(
        `
        *,
        equipo:equipos!telemetria_diaria_equipo_id_fkey(
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

    if (search && search.trim() !== "") {
      const term = `%${search.trim()}%`;
      query = query.or(
        `patente.ilike.${term},nombre_skynav.ilike.${term},identificador_skynav.ilike.${term},lugar_ultimo.ilike.${term}`
      );
    }

    query = query
      .order("fecha", { ascending: false })
      .order("km_recorridos", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    const { data, count, error } = await query;
    if (error) throw error;

    // Calcular KPIs resumen de los datos obtenidos
    let totalKm = 0;
    let totalKmCan = 0;
    let totalKmGps = 0;
    let totalHorasMotor = 0;
    let totalHorasRalenti = 0;
    let totalCombustible = 0;
    let totalCombustibleCan = 0;
    let totalCombustibleGps = 0;
    let totalExcesosVelocidad = 0;

    (data || []).forEach((r) => {
      const km = Number(r.km_recorridos) || 0;
      const comb = Number(r.combustible_litros) || 0;
      const canLit = Number(r.litros_can) || 0;
      const gpsLit = Number(r.litros_gps) || 0;

      totalKm += km;
      if (r.origen_km === "CAN" || r.origen_combustible === "CAN" || r.combustible_origen === "CAN") {
        totalKmCan += km;
      } else {
        totalKmGps += km;
      }

      totalHorasMotor += Number(r.horas_motor) || 0;
      totalHorasRalenti += Number(r.horas_ralenti) || 0;
      totalCombustible += comb;
      totalCombustibleCan += canLit > 0 ? canLit : (r.origen_combustible === "CAN" ? comb : 0);
      totalCombustibleGps += gpsLit > 0 ? gpsLit : (r.origen_combustible === "GPS" ? comb : 0);
      totalExcesosVelocidad += Number(r.eventos_exceso_velocidad) || 0;
    });

    return res.status(200).json({
      success: true,
      total: count,
      kpis: {
        total_km: Math.round(totalKm * 10) / 10,
        total_km_can: Math.round(totalKmCan * 10) / 10,
        total_km_gps: Math.round(totalKmGps * 10) / 10,
        total_horas_motor: Math.round(totalHorasMotor * 10) / 10,
        total_horas_ralenti: Math.round(totalHorasRalenti * 10) / 10,
        total_combustible_litros: Math.round(totalCombustible * 10) / 10,
        total_combustible_can: Math.round(totalCombustibleCan * 10) / 10,
        total_combustible_gps: Math.round(totalCombustibleGps * 10) / 10,
        total_excesos_velocidad: totalExcesosVelocidad,
      },
      data: data || [],
    });
  } catch (err) {
    console.error("[API telemetria/index GET] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

