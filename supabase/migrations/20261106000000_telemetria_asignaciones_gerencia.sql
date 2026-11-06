-- Migración: Tabla de Asignaciones de Vehículos a Gerentes y Jefaturas
-- Esquema: maquinaria (Regla: NO usar public)

CREATE TABLE IF NOT EXISTS maquinaria.telemetria_asignaciones_gerencia (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  equipo_id UUID REFERENCES maquinaria.equipos(id) ON DELETE SET NULL,
  patente TEXT NOT NULL,
  codigo_interno TEXT,
  nombre_responsable TEXT NOT NULL,
  rut_responsable TEXT DEFAULT 'S/R',
  cargo TEXT DEFAULT 'Gerente / Jefatura',
  proyecto_id UUID REFERENCES maquinaria.proyectos(id) ON DELETE SET NULL,
  proyecto_nombre TEXT,
  notas TEXT,
  activo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_asignacion_patente UNIQUE (patente)
);

CREATE INDEX IF NOT EXISTS idx_asignaciones_gerencia_patente ON maquinaria.telemetria_asignaciones_gerencia(patente);

GRANT ALL ON TABLE maquinaria.telemetria_asignaciones_gerencia TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

