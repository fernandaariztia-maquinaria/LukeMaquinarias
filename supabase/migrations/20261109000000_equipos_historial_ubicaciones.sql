-- Migración: Tabla de Historial de Ubicaciones y Asignaciones de Equipos por Obra
-- Esquema: maquinaria (Regla GEMINI.md: NUNCA usar public)

CREATE TABLE IF NOT EXISTS maquinaria.historial_ubicaciones_equipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id UUID NOT NULL REFERENCES maquinaria.equipos(id) ON DELETE CASCADE,
    proyecto_id UUID REFERENCES maquinaria.proyectos(id) ON DELETE SET NULL,
    proyecto_nombre TEXT NOT NULL,
    proyecto_cc TEXT,
    fecha_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_fin_estimada DATE,
    fecha_fin_real DATE,
    estado TEXT NOT NULL DEFAULT 'ACTIVA', -- 'ACTIVA', 'FINALIZADA', 'CANCELADA'
    dias_reales INTEGER DEFAULT 0,
    motivo_traslado TEXT,
    registrado_por TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historial_ub_equipo ON maquinaria.historial_ubicaciones_equipos(equipo_id);
CREATE INDEX IF NOT EXISTS idx_historial_ub_proyecto ON maquinaria.historial_ubicaciones_equipos(proyecto_id);
CREATE INDEX IF NOT EXISTS idx_historial_ub_estado ON maquinaria.historial_ubicaciones_equipos(estado);
CREATE INDEX IF NOT EXISTS idx_historial_ub_fecha ON maquinaria.historial_ubicaciones_equipos(fecha_inicio DESC);

GRANT ALL ON TABLE maquinaria.historial_ubicaciones_equipos TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
