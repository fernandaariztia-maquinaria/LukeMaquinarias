-- Migración: agregar especialidad oficial 'Mecánicos' (montaje mecánico)
-- Diferenciada de 'Mantenimiento' y de estados de falla/panne de equipos.

INSERT INTO maquinaria.especialidades (nombre_oficial, descripcion, color)
SELECT 'Mecánicos', 'Montaje mecánico, instalación y alineamiento de equipos mecánicos', '#6366f1'
WHERE NOT EXISTS (
  SELECT 1 FROM maquinaria.especialidades
  WHERE lower(nombre_oficial) IN ('mecánicos', 'mecanicos', 'mecánica', 'mecanica')
);
