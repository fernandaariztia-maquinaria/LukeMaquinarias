-- Migración: Tabla de viajes individuales de telemetría SKYNAV
-- Esquema: maquinaria (Regla del proyecto: NO usar public)

CREATE TABLE IF NOT EXISTS maquinaria.telemetria_viajes (
  id BIGSERIAL PRIMARY KEY,
  equipo_id UUID REFERENCES maquinaria.equipos(id) ON DELETE SET NULL,
  identificador_skynav TEXT NOT NULL,
  patente TEXT,
  nombre_skynav TEXT,
  tipo_skynav TEXT,
  subtipo_skynav TEXT,
  evento TEXT NOT NULL DEFAULT 'Viaje',
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fin TIME,
  tiempo_min NUMERIC(10, 2) DEFAULT 0,
  km_recorridos NUMERIC(10, 2) DEFAULT 0,
  litros_combustible NUMERIC(10, 2) DEFAULT 0,
  litros_can NUMERIC(10, 2) DEFAULT 0,
  litros_gps NUMERIC(10, 2) DEFAULT 0,
  origen_km TEXT DEFAULT 'GPS',
  origen_combustible TEXT DEFAULT 'GPS',
  rut_conductor TEXT,
  nombre_conductor TEXT,
  lugar_inicio TEXT,
  lugar_fin TEXT,
  geocerca_inicio TEXT,
  geocerca_fin TEXT,
  latitud_inicio NUMERIC(11, 7),
  longitud_inicio NUMERIC(11, 7),
  latitud_fin NUMERIC(11, 7),
  longitud_fin NUMERIC(11, 7),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_telemetria_viaje UNIQUE (identificador_skynav, fecha, hora_inicio, evento)
);

CREATE INDEX IF NOT EXISTS idx_telemetria_viajes_fecha ON maquinaria.telemetria_viajes(fecha);
CREATE INDEX IF NOT EXISTS idx_telemetria_viajes_equipo_fecha ON maquinaria.telemetria_viajes(equipo_id, fecha);
CREATE INDEX IF NOT EXISTS idx_telemetria_viajes_patente ON maquinaria.telemetria_viajes(patente);

GRANT ALL ON TABLE maquinaria.telemetria_viajes TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE maquinaria.telemetria_viajes_id_seq TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
