-- ============================================================
-- MIGRACIÓN: Módulo de Telemetría SKYNAV (GPS, Odómetro, Horómetro y Combustible)
-- LukeMontaje - Schema maquinaria
-- ============================================================

-- 1. Asegurar columnas de telemetría en maquinaria.equipos
ALTER TABLE maquinaria.equipos 
ADD COLUMN IF NOT EXISTS telemetria_activa BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS skynav_identificador TEXT,
ADD COLUMN IF NOT EXISTS odometro_telemetria NUMERIC,
ADD COLUMN IF NOT EXISTS horometro_telemetria NUMERIC,
ADD COLUMN IF NOT EXISTS combustible_nivel_telemetria NUMERIC;

-- Índices de búsqueda
CREATE INDEX IF NOT EXISTS idx_equipos_patente ON maquinaria.equipos (patente);
CREATE INDEX IF NOT EXISTS idx_equipos_codigo_interno ON maquinaria.equipos (codigo_interno);
CREATE INDEX IF NOT EXISTS idx_equipos_skynav_identificador ON maquinaria.equipos (skynav_identificador);

-- 2. Tabla de Histórico Diario de Telemetría (acumulador permanente sin límite de 31 días)
CREATE TABLE IF NOT EXISTS maquinaria.telemetria_diaria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id UUID REFERENCES maquinaria.equipos(id) ON DELETE SET NULL,
    identificador_skynav TEXT NOT NULL, -- Patente o Código reportado por SKYNAV
    patente TEXT,
    nombre_skynav TEXT,
    tipo_skynav TEXT,
    subtipo_skynav TEXT,
    fecha DATE NOT NULL,
    km_recorridos NUMERIC DEFAULT 0,
    horas_motor NUMERIC DEFAULT 0, -- Horas activas (Viaje + Encendido + Ralentí + Trabajando + Exceso Velocidad)
    horas_ralenti NUMERIC DEFAULT 0, -- Horas en ralentí
    horas_viaje NUMERIC DEFAULT 0, -- Horas en viaje/traslado
    horas_trabajando NUMERIC DEFAULT 0, -- Horas trabajando
    combustible_litros NUMERIC DEFAULT 0,
    litros_can NUMERIC DEFAULT 0,
    litros_gps NUMERIC DEFAULT 0,
    combustible_origen TEXT,
    origen_combustible TEXT,
    origen_km TEXT DEFAULT 'GPS',
    latitud_ultima DOUBLE PRECISION,
    longitud_ultima DOUBLE PRECISION,
    lugar_ultimo TEXT,
    geocerca_ultima TEXT,
    eventos_exceso_velocidad INTEGER DEFAULT 0,
    conductores TEXT[] DEFAULT '{}',
    total_eventos INTEGER DEFAULT 0,
    raw_resumen JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
    CONSTRAINT telemetria_diaria_identificador_fecha_unique UNIQUE (identificador_skynav, fecha)
);

CREATE INDEX IF NOT EXISTS idx_telemetria_diaria_fecha ON maquinaria.telemetria_diaria (fecha DESC);
CREATE INDEX IF NOT EXISTS idx_telemetria_diaria_equipo_id ON maquinaria.telemetria_diaria (equipo_id);
CREATE INDEX IF NOT EXISTS idx_telemetria_diaria_patente ON maquinaria.telemetria_diaria (patente);

-- 3. Tabla de Auditoría de Sincronizaciones SKYNAV
CREATE TABLE IF NOT EXISTS maquinaria.telemetria_sincronizaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha_desde DATE NOT NULL,
    fecha_hasta DATE NOT NULL,
    registros_crudos INTEGER DEFAULT 0,
    unidades_procesadas INTEGER DEFAULT 0,
    unidades_mapeadas INTEGER DEFAULT 0,
    unidades_sin_mapear INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'EXITO' CHECK (estado IN ('EN_PROCESO', 'EXITO', 'ERROR')),
    error_mensaje TEXT,
    iniciado_por TEXT DEFAULT 'MANUAL',
    duracion_ms INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- RLS
ALTER TABLE maquinaria.telemetria_diaria ENABLE ROW LEVEL SECURITY;
ALTER TABLE maquinaria.telemetria_sincronizaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lectura telemetria_diaria autenticados" ON maquinaria.telemetria_diaria
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lectura telemetria_diaria anon" ON maquinaria.telemetria_diaria
    FOR SELECT TO anon USING (true);

CREATE POLICY "Gestion telemetria_diaria service_role" ON maquinaria.telemetria_diaria
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Lectura telemetria_sincronizaciones" ON maquinaria.telemetria_sincronizaciones
    FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "Gestion telemetria_sincronizaciones service_role" ON maquinaria.telemetria_sincronizaciones
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Permisos para roles Supabase
GRANT USAGE ON SCHEMA maquinaria TO anon, authenticated, service_role;
GRANT ALL ON TABLE maquinaria.telemetria_diaria TO anon, authenticated, service_role;
GRANT ALL ON TABLE maquinaria.telemetria_sincronizaciones TO anon, authenticated, service_role;

