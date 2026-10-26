-- ============================================================
-- MIGRACIÓN: Tipología Operador, Estados Ampliados de Faena,
-- Detalle de Combustible y Matriz de Actividades EIMIPLANNER 3WL
-- Esquema: maquinaria (Base de Datos Compartida Supabase)
-- ============================================================

-- 1. Ampliar tabla personal con tipología de equipos y soporte multiespecialidad
ALTER TABLE maquinaria.personal
  ADD COLUMN IF NOT EXISTS tipologia_equipo TEXT,
  ADD COLUMN IF NOT EXISTS especialidades_adicionales UUID[];

COMMENT ON COLUMN maquinaria.personal.tipologia_equipo
  IS 'Tipología de equipo asociada al operador (ej: Retroexcavadora, Camión Pluma, Excavadora, Grúa, etc.)';

COMMENT ON COLUMN maquinaria.personal.especialidades_adicionales
  IS 'Array de especialidades para supervisores multiespecialidad';

-- 2. Ampliar tabla equipos con tipologia homologada
ALTER TABLE maquinaria.equipos
  ADD COLUMN IF NOT EXISTS tipologia TEXT;

-- Actualizar CHECK constraint de equipos.estado_actual para admitir todos los estados de la faena
ALTER TABLE maquinaria.equipos
  DROP CONSTRAINT IF EXISTS equipos_estado_actual_check;

ALTER TABLE maquinaria.equipos
  ADD CONSTRAINT equipos_estado_actual_check
  CHECK (
    estado_actual IN (
      'Equipo Operativo',
      'Disponible',
      'En Colacion',
      'Detenido por Falla',
      'Equipo Fuera de Servicio (Panne)',
      'Equipo Disponible sin Operador',
      'Equipo traslado',
      'Equipo en Mantención Programada',
      'Equipo Desvinculado pero en Obra',
      'Equipo Desvinculado',
      'Equipo en Proceso de Acreditación',
      'Equipo en Proceso de Armado',
      'Ralenti',
      'Esperando',
      'Trabajando'
    )
  );

-- 3. Actualizar CHECK constraint de eventos_jornada.estado_hito
ALTER TABLE maquinaria.eventos_jornada
  DROP CONSTRAINT IF EXISTS eventos_jornada_estado_hito_check;

ALTER TABLE maquinaria.eventos_jornada
  ADD CONSTRAINT eventos_jornada_estado_hito_check
  CHECK (
    estado_hito IN (
      'Trabajando',
      'Disponible',
      'En Colacion',
      'Detenido por Falla',
      'Ralenti',
      'Esperando',
      'Equipo Operativo',
      'Equipo Fuera de Servicio (Panne)',
      'Equipo Disponible sin Operador',
      'Equipo traslado',
      'Equipo en Mantención Programada',
      'Equipo Desvinculado pero en Obra',
      'Equipo Desvinculado',
      'Equipo en Proceso de Acreditación',
      'Equipo en Proceso de Armado'
    )
  );

-- 4. Ampliar reportes_diarios para detalle de combustible y labores
ALTER TABLE maquinaria.reportes_diarios
  ADD COLUMN IF NOT EXISTS combustible_inicio_valor NUMERIC,
  ADD COLUMN IF NOT EXISTS combustible_inicio_unidad TEXT, -- 'litros', 'estanque', 'decimal'
  ADD COLUMN IF NOT EXISTS combustible_final_valor NUMERIC,
  ADD COLUMN IF NOT EXISTS combustible_final_unidad TEXT,
  ADD COLUMN IF NOT EXISTS combustible_cargado_litros NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS labores_resumen TEXT;

-- 5. Ampliar tabla actividades con métricas operacionales 3WL (imagen supervisor)
ALTER TABLE maquinaria.actividades
  ADD COLUMN IF NOT EXISTS id_3wl TEXT,
  ADD COLUMN IF NOT EXISTS izajes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS horometro_horas NUMERIC,
  ADD COLUMN IF NOT EXISTS subactividad TEXT,
  ADD COLUMN IF NOT EXISTS categoria_disciplina TEXT,
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES maquinaria.personal(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS equipo_id UUID REFERENCES maquinaria.equipos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bloque_id UUID REFERENCES maquinaria.planificacion_bloques_pod(id) ON DELETE SET NULL;

COMMENT ON COLUMN maquinaria.actividades.id_3wl
  IS 'Código o identificador de la tarea en EIMIPLANNER 3WL';

COMMENT ON COLUMN maquinaria.actividades.izajes
  IS 'Número de maniobras de izaje realizadas para esta tarea';

COMMENT ON COLUMN maquinaria.actividades.horometro_horas
  IS 'Horas de horómetro destinadas a esta labor específica';

COMMENT ON COLUMN maquinaria.actividades.subactividad
  IS 'Subactividad seleccionada (ej: Moldaje, Fierro, Hormigón, Spools, Soportes, etc.)';

COMMENT ON COLUMN maquinaria.actividades.categoria_disciplina
  IS 'Disciplina de la tarea (Carga/Descarga, OOCC, Estructura, Piping, Mecánica, Calderería, Eléctrico, etc.)';

NOTIFY pgrst, 'reload schema';
