-- Migración: Tabla de puntos y trazas de GPS (telemetria_posiciones)
-- Para almacenar recorridos continuos de la flota con alta resolución
-- Esquema: maquinaria (Regla del proyecto: NO usar public)

CREATE TABLE IF NOT EXISTS maquinaria.telemetria_posiciones (
  id BIGSERIAL PRIMARY KEY,
  equipo_id UUID REFERENCES maquinaria.equipos(id) ON DELETE SET NULL,
  patente TEXT NOT NULL,
  fecha_hora TIMESTAMPTZ NOT NULL,
  latitud NUMERIC(10, 7) NOT NULL,
  longitud NUMERIC(10, 7) NOT NULL,
  velocidad NUMERIC(6, 2) DEFAULT 0,
  rumbo NUMERIC(5, 2) DEFAULT 0,
  estado TEXT DEFAULT 'Viaje', -- 'Viaje', 'Ralenti', 'Encendido', 'Estacionado', 'Apagado'
  ignicion BOOLEAN DEFAULT true,
  odometro NUMERIC(12, 2),
  lugar TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_posicion UNIQUE (patente, fecha_hora, latitud, longitud)
);

CREATE INDEX IF NOT EXISTS idx_telemetria_posiciones_patente_fecha 
  ON maquinaria.telemetria_posiciones(patente, fecha_hora ASC);

CREATE INDEX IF NOT EXISTS idx_telemetria_posiciones_equipo_fecha 
  ON maquinaria.telemetria_posiciones(equipo_id, fecha_hora ASC);

CREATE INDEX IF NOT EXISTS idx_telemetria_posiciones_fecha 
  ON maquinaria.telemetria_posiciones(fecha_hora);

GRANT ALL ON TABLE maquinaria.telemetria_posiciones TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE maquinaria.telemetria_posiciones_id_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
