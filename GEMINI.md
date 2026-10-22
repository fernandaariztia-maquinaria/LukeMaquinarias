# Reglas del Proyecto LukeMaquinarias / LukeEquipos

## Esquema en Base de Datos Compartida (Supabase)
- Nuestros datos se almacenan en el esquema **`maquinaria`** de Supabase.
- El esquema **`public`** es de otro proyecto (LukeDelivery), **NO USAR**.
- Todas las consultas, clientes de Supabase, migraciones o scripts deben especificar explícitamente el esquema `maquinaria`:
  ```javascript
  supabase.schema('maquinaria').from('...')
  ```
