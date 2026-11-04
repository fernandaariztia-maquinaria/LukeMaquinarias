-- Vista para obtener rápidamente todas las fechas con viajes de telemetría disponibles
-- Esquema: maquinaria (Regla del proyecto: NO usar public)

CREATE OR REPLACE VIEW maquinaria.telemetria_fechas_disponibles AS
SELECT DISTINCT fecha FROM maquinaria.telemetria_viajes ORDER BY fecha DESC;

GRANT SELECT ON maquinaria.telemetria_fechas_disponibles TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

