-- Función RPC para calcular KPIs exactos de telemetría de forma instantánea
-- Esquema: maquinaria (Regla del proyecto: NO usar public)

CREATE OR REPLACE FUNCTION maquinaria.get_telemetria_kpis(
  p_desde DATE DEFAULT NULL,
  p_hasta DATE DEFAULT NULL,
  p_patente TEXT DEFAULT NULL,
  p_origen TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  total_viajes BIGINT,
  total_km NUMERIC,
  total_km_can NUMERIC,
  total_km_gps NUMERIC,
  total_horas NUMERIC,
  total_combustible NUMERIC,
  total_combustible_can NUMERIC,
  total_combustible_gps NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_viajes,
    COALESCE(ROUND(SUM(km_recorridos), 1), 0) AS total_km,
    COALESCE(ROUND(SUM(CASE WHEN origen_km = 'CAN' OR origen_combustible = 'CAN' OR litros_can > 0 THEN km_recorridos ELSE 0 END), 1), 0) AS total_km_can,
    COALESCE(ROUND(SUM(CASE WHEN (origen_km = 'GPS' AND (origen_combustible = 'GPS' OR origen_combustible IS NULL) AND (litros_can = 0 OR litros_can IS NULL)) THEN km_recorridos ELSE 0 END), 1), 0) AS total_km_gps,
    COALESCE(ROUND(SUM(tiempo_min / 60.0), 1), 0) AS total_horas,
    COALESCE(ROUND(SUM(litros_combustible), 1), 0) AS total_combustible,
    COALESCE(ROUND(SUM(CASE WHEN litros_can > 0 THEN litros_can WHEN origen_combustible = 'CAN' THEN litros_combustible ELSE 0 END), 1), 0) AS total_combustible_can,
    COALESCE(ROUND(SUM(CASE WHEN litros_gps > 0 THEN litros_gps WHEN origen_combustible = 'GPS' THEN litros_combustible ELSE 0 END), 1), 0) AS total_combustible_gps
  FROM maquinaria.telemetria_viajes
  WHERE
    (p_desde IS NULL OR fecha >= p_desde)
    AND (p_hasta IS NULL OR fecha <= p_hasta)
    AND (p_patente IS NULL OR p_patente = '' OR patente ILIKE '%' || p_patente || '%')
    AND (p_origen IS NULL OR p_origen = '' OR 
         (p_origen = 'CAN' AND (origen_km = 'CAN' OR origen_combustible = 'CAN' OR litros_can > 0)) OR
         (p_origen = 'GPS' AND origen_km = 'GPS' AND (origen_combustible = 'GPS' OR origen_combustible IS NULL) AND (litros_can = 0 OR litros_can IS NULL)))
    AND (p_search IS NULL OR p_search = '' OR (
      patente ILIKE '%' || p_search || '%' OR
      nombre_conductor ILIKE '%' || p_search || '%' OR
      rut_conductor ILIKE '%' || p_search || '%' OR
      lugar_inicio ILIKE '%' || p_search || '%' OR
      lugar_fin ILIKE '%' || p_search || '%' OR
      nombre_skynav ILIKE '%' || p_search || '%'
    ));
END;
$$ LANGUAGE plpgsql STABLE;

GRANT EXECUTE ON FUNCTION maquinaria.get_telemetria_kpis TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

