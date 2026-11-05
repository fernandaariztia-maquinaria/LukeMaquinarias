-- Migración: Historial de fallas de equipos y cuantificación de horas de detención
-- Esquema: maquinaria

CREATE TABLE IF NOT EXISTS maquinaria.historial_fallas_equipos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipo_id UUID NOT NULL REFERENCES maquinaria.equipos(id) ON DELETE CASCADE,
    reporte_id UUID REFERENCES maquinaria.reportes_diarios(id) ON DELETE SET NULL,
    operador_id UUID REFERENCES maquinaria.personal(id) ON DELETE SET NULL,
    hora_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
    hora_fin TIMESTAMPTZ,
    horas_detencion NUMERIC(6,2),
    motivo_falla TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierta', -- 'abierta', 'resuelta'
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fallas_equipo ON maquinaria.historial_fallas_equipos(equipo_id);
CREATE INDEX IF NOT EXISTS idx_fallas_reporte ON maquinaria.historial_fallas_equipos(reporte_id);
CREATE INDEX IF NOT EXISTS idx_fallas_estado ON maquinaria.historial_fallas_equipos(estado);

-- Agregar columnas a reportes_diarios para observaciones y horas de detención
ALTER TABLE maquinaria.reportes_diarios 
    ADD COLUMN IF NOT EXISTS observaciones TEXT,
    ADD COLUMN IF NOT EXISTS horas_detencion NUMERIC(6,2) DEFAULT 0;
