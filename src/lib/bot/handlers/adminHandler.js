import { enviarMensajeWhatsApp, guardarMensajeChat, cargarHistorialGemini } from "../services/messageService";
import { formatFechaHoraChile } from "../../timeUtils";

export async function handleAdminFlow(ctx, res) {
  const { supabase, personal, phoneClean, jid, message, audio, geminiKey } = ctx;

  console.log(`[adminHandler] 👑 Interacción de Administrador/Supervisor (${personal.nombre_completo})`);

  // 1. Cargar herramientas dinámicas desde Supabase (esquema maquinaria)
  let dbTools = [];
  try {
    const { data: loadedTools } = await supabase
      .from("bot_tools_dinamicas")
      .select("nombre_funcion, descripcion, esquema_json, codigo_javascript");
    if (loadedTools) dbTools = loadedTools;
  } catch (err) {
    console.error("[adminHandler] Error cargando herramientas dinámicas:", err.message);
  }

  // 2. Definir esquemas de herramientas básicas
  const basicTools = [
    {
      name: "silenciar_usuario_por_desviacion",
      description: "Silencia o bloquea al usuario actual si sus mensajes se desvían de forma de forma insistente del propósito operacional del bot.",
      parameters: {
        type: "OBJECT",
        properties: {
          motivo: { type: "STRING", description: "Breve motivo del silencio." }
        },
        required: ["motivo"]
      }
    }
  ];

  const adminTools = [
    {
      name: "aprobar_registro_personal",
      description: "Aprueba una solicitud pendiente en 'registros_pendientes' y crea/reactiva el registro en 'personal'. SIEMPRE usa esta herramienta para aprobar registros -- NUNCA generes una herramienta dinámica con 'crear_herramienta_dinamica' para esto: esta valida el RUT, traspasa el WhatsApp automáticamente desde la solicitud, y envía la confirmación de bienvenida al usuario por WhatsApp.",
      parameters: {
        type: "OBJECT",
        properties: {
          registro_id: { type: "STRING", description: "UUID de la solicitud en registros_pendientes." },
          rut: { type: "STRING", description: "RUT de la persona (ej: 12.345.678-9). Obligatorio -- si no lo tienes, pídeselo al administrador antes de llamar a esta herramienta." },
          rol_final: { type: "STRING", description: "Rol final a otorgar: Operador, Supervisor, Rigger o Jefe de Area. Si no se especifica, se usa el rol originalmente solicitado. Si el administrador pide otorgar Supervisor o Jefe de Area y no coincide con lo solicitado originalmente, confírmalo explícitamente con él antes de llamar a esta herramienta." },
          proyecto_id: { type: "STRING", description: "UUID del proyecto a asignar. Opcional -- si no se especifica, se usa el proyecto ya asociado a la solicitud (si existe)." }
        },
        required: ["registro_id", "rut"]
      }
    },
    {
      name: "rechazar_registro_personal",
      description: "Rechaza una solicitud pendiente en 'registros_pendientes' y notifica el motivo al usuario por WhatsApp.",
      parameters: {
        type: "OBJECT",
        properties: {
          registro_id: { type: "STRING", description: "UUID de la solicitud en registros_pendientes." },
          motivo: { type: "STRING", description: "Motivo del rechazo a comunicar al usuario." }
        },
        required: ["registro_id"]
      }
    },
    {
      name: "crear_herramienta_dinamica",
      description: "Crea y registra una nueva herramienta de consulta dinámica cuando el supervisor solicite un reporte, listado o búsqueda específica de datos de maquinaria, personal o reportes que no exista en el catálogo de herramientas. Debes proporcionarle el código JavaScript asíncrono compatible con Supabase ('supabase') y argumentos ('args') desestructurados en la primera línea, y el esquema JSON de parámetros.",
      parameters: {
        type: "OBJECT",
        properties: {
          nombre_funcion: {
            type: "STRING",
            description: "Nombre único de la función en snake_case (ej. 'obtener_operadores_proyecto'). Debe empezar con 'obtener_' o 'consultar_'."
          },
          descripcion: {
            type: "STRING",
            description: "Descripción clara de lo que hace la función y qué datos retorna."
          },
          codigo_javascript: {
            type: "STRING",
            description: "Código JS asíncrono compatible con Node.js que realice la consulta a Supabase usando 'supabase' y 'args'."
          },
          esquema_json: {
            type: "OBJECT",
            description: "Esquema JSON del parámetro parameters de la función."
          }
        },
        required: ["nombre_funcion", "descripcion", "codigo_javascript", "esquema_json"]
      }
    }
  ];

  // Evitar declaraciones duplicadas filtrando nombres de funciones que ya existen en basicTools o adminTools
  const fixedToolNames = new Set([...basicTools, ...adminTools].map(t => t.name));
  
  const dynamicDeclarations = dbTools
    .filter(t => !fixedToolNames.has(t.nombre_funcion))
    .map(t => {
      const parameters = t.esquema_json.parameters || t.esquema_json;
      return {
        name: t.nombre_funcion,
        description: t.description || t.descripcion,
        parameters: parameters
      };
    });

  const tools = [
    {
      functionDeclarations: [
        ...basicTools,
        ...adminTools,
        ...dynamicDeclarations
      ]
    }
  ];

  // 3. Prompt del sistema con mapa del mundo
  const mapaDelMundo = {
    proyectos: { id: "UUID", nombre_proyecto: "TEXT", codigo_cc: "TEXT", ubicacion: "TEXT", activa: "BOOLEAN" },
    personal: { id: "UUID", rut: "TEXT", nombre_completo: "TEXT", whatsapp: "TEXT", email: "TEXT (login a la consola web, null = sin acceso web)", rol: "Supervisor | Operador | Rigger | Jefe de Area | Administrador", turno_tipo: "TEXT", jornada_tipo: "Dia | Noche", proyecto_actual_id: "UUID REFERENCES proyectos", especialidad_id: "UUID REFERENCES especialidades(id)", activo: "BOOLEAN" },
    especialidades: { id: "UUID", nombre_oficial: "TEXT UNIQUE", descripcion: "TEXT", color: "TEXT (hex)" },
    tareas_programadas: { id: "UUID", especialidad_id: "UUID REFERENCES especialidades(id)", nombre: "TEXT", descripcion: "TEXT", codigo: "TEXT", activa: "BOOLEAN", orden: "INTEGER", es_libre: "BOOLEAN" },
    equipos: { 
      id: "UUID", 
      codigo_interno: "TEXT", 
      descripcion_equipo: "TEXT", 
      proveedor: "TEXT", 
      proyecto_actual_id: "UUID REFERENCES proyectos", 
      estado_actual: "Equipo Operativo | Disponible | En Colacion | Detenido por Falla", 
      pauta_preventiva_activa: "TEXT",
      patente: "TEXT",
      marca: "TEXT",
      modelo: "TEXT",
      numero_serial: "TEXT",
      tipo: "TEXT",
      categoria: "TEXT",
      anio_fabricacion: "INTEGER",
      latitud_actual: "NUMERIC",
      longitud_actual: "NUMERIC",
      ultima_ubicacion_fecha: "TIMESTAMP",
      combustible_nivel_porcentaje: "NUMERIC",
      clasificacion_comercial: "TEXT",
      arriendo_cliente: "TEXT",
      arriendo_fecha_inicio: "DATE",
      arriendo_fecha_fin: "DATE",
      tipo_seguimiento: "estandar | vehiculo | camion (vehiculo = se controla por km/odometro, los demas por horas/horometro)",
      ultimo_horometro: "NUMERIC",
      ultimo_odometro: "NUMERIC",
      pm1_umbral: "NUMERIC (horas o km, ver tipo_seguimiento)",
      pm2_umbral: "NUMERIC",
      pm3_umbral: "NUMERIC",
      pm4_umbral: "NUMERIC",
      tolerancia_pm: "NUMERIC",
      usa_plataforma: "BOOLEAN (default true; false = el bot no pregunta estado de plataforma Cargada/Limpia al cerrar jornada, ej. gruas)"
    },
    mantenciones_ejecutadas: { id: "UUID", equipo_id: "UUID REFERENCES equipos(id)", tipo_pm: "PM1 | PM2 | PM3 | PM4", fecha: "DATE", lectura_al_momento: "NUMERIC (horometro u odometro al momento de la PM)", responsable_id: "UUID REFERENCES personal(id)", notas: "TEXT" },
    reportes_diarios: { id: "UUID", equipo_id: "UUID", operador_id: "UUID", supervisor_id: "UUID", fecha: "DATE", horometro_inicio: "NUMERIC", horometro_final: "NUMERIC", horas_trabajadas: "NUMERIC", petroleo_litros: "NUMERIC", estado_final: "TEXT", pdf_url: "TEXT" },
    eventos_jornada: { id: "UUID", reporte_id: "UUID", estado_hito: "Trabajando | Disponible | En Colacion | Detenido por Falla", especialidad_id: "UUID", actividad_id: "UUID REFERENCES actividades(id)", hora_evento: "TIMESTAMP", nota_transcripcion: "TEXT" },
    bot_tools_dinamicas: { id: "UUID", nombre_funcion: "TEXT UNIQUE", descripcion: "TEXT", codigo_javascript: "TEXT", esquema_json: "JSONB" },
    registros_pendientes: { id: "UUID", whatsapp: "TEXT", nombre_completo: "TEXT", rol_solicitado: "Operador | Supervisor | Rigger | Jefe de Area", proyecto_id: "UUID REFERENCES proyectos(id)", estado: "esperando_nombre | esperando_rol | pendiente | aprobado | rechazado", nota_rechazo: "TEXT" },
    actividades: { id: "UUID", fecha: "DATE", proyecto_id: "UUID REFERENCES proyectos(id)", especialidad_id: "UUID REFERENCES especialidades(id)", tarea_programada_id: "UUID REFERENCES tareas_programadas(id)", descripcion: "TEXT (null si viene de tarea_programada_id)", programada: "BOOLEAN", cantidad_planificada: "NUMERIC", unidad: "TEXT", cantidad_ejecutada: "NUMERIC" },
    planificacion_bloques_pod: { id: "UUID", fecha: "DATE", equipo_id: "UUID REFERENCES equipos(id)", hora_inicio: "TIME", hora_fin: "TIME", especialidad_id: "UUID REFERENCES especialidades(id)", supervisor_id: "UUID REFERENCES personal(id)", actividad_especifica: "TEXT", actividad_id: "UUID REFERENCES actividades(id)", creado_at: "TIMESTAMP" },
    mensajes_chat: { id: "UUID", whatsapp_remitente: "TEXT (numero de whatsapp del usuario, sin '+', cruzar con personal.whatsapp)", reporte_id: "UUID REFERENCES reportes_diarios(id), nullable", rol: "user | model (user = lo que escribio/dijo la persona, model = lo que respondio el bot)", tipo_mensaje: "texto | audio | imagen", contenido: "TEXT (texto del mensaje o transcripcion del audio)", created_at: "TIMESTAMP" },
    sesiones_whatsapp: { id: "UUID", whatsapp_remitente: "TEXT UNIQUE", reporte_activo_id: "UUID REFERENCES reportes_diarios(id), nullable", estado_espera: "TEXT (si no es null, la persona tiene una conversacion/jornada en curso ahora mismo)", updated_at: "TIMESTAMP" }
  };

  const obraAsignadaInfo = personal.proyectos
    ? `Proyecto / Faena actual: "${personal.proyectos.nombre_proyecto}" (Centro de Costos / Contrato / Código CC: "${personal.proyectos.codigo_cc}")`
    : 'Ningún proyecto, obra, faena o contrato asignado actualmente.';

  const promptSistemaAdmin = `
Eres jAIme, tu asistente virtual de Eimisa.
Fecha y hora actual: ${formatFechaHoraChile()}
Interactúas con un supervisor o jefe de área. Sus datos actuales son:
- ID (personal.id): ${personal.id}
- Nombre: ${personal.nombre_completo}
- Rol: ${personal.rol}
- WhatsApp: ${personal.whatsapp}
- ${obraAsignadaInfo}

Directrices de Comportamiento:
1. Responde de forma atenta, sumamente profesional, clara y concisa en español.
2. Identifícate de manera simple como "jAIme, tu asistente virtual de Eimisa" SOLO en la primera interacción o saludo inicial, o si te lo preguntan. NUNCA repitas este saludo en cada mensaje de una conversación fluida, ni lo agregues como firma fija en cada respuesta.
3. Prohibido reportar el flujo técnico interno: NUNCA le digas al usuario "He registrado la herramienta...", "Un momento por favor mientras consulto la base de datos...", "He creado la función..." u otras explicaciones de tus herramientas internas. Simplemente ejecuta la herramienta dinámica/SQL de forma silenciosa e invisible para el usuario y responde de inmediato directamente con la información o datos solicitados.
4. Entiende que los términos "obra", "proyecto", "faena" y "contrato" son sinónimos y se mapean directamente a los registros de la tabla 'proyectos'.
5. La asociación del personal (incluido el supervisor que habla contigo) con un proyecto se define mediante el campo 'proyecto_actual_id' de la tabla 'personal' (que referencia a 'proyectos.id').
6. Si te pregunta sobre su propio rol o qué proyecto/obra/faena/contrato tiene asociado, respóndele directamente usando los datos actuales proporcionados arriba. Si pregunta de forma general por "el proyecto" de un equipo específico u otra entidad, no lo confundas con el proyecto del supervisor: realiza la consulta adecuada en la base de datos.
6b. Si te pregunta qué día u hora es, respóndele directamente con la fecha y hora actual indicada arriba (ya está en huso horario de Chile, no hace falta convertirla). Úsala también para interpretar referencias relativas como "ayer", "esta semana" o "el mes pasado" al construir consultas SQL con fechas.
7. Tienes acceso completo a consultas SQL asíncronas dinámicas de la base de datos de Supabase.
7b. Para aprobar o rechazar una solicitud de registro pendiente (tabla 'registros_pendientes'), usa SIEMPRE las herramientas fijas "aprobar_registro_personal" / "rechazar_registro_personal" — nunca improvises SQL con "crear_herramienta_dinamica" para esto. Si falta el RUT, pídeselo al administrador antes de llamar a la herramienta. Si te piden otorgar el rol Supervisor o Jefe de Area y no coincide con lo que la persona solicitó originalmente, confírmalo explícitamente con el administrador antes de aprobar — son roles de mayor confianza y no deben asignarse a la ligera.
8. Si te pide un reporte, listado o cruce de datos personalizado que NO exista en tu catálogo de herramientas dinámicas, DEBES programar la consulta y registrar la herramienta llamando a "crear_herramienta_dinamica" en silencio, y luego responder con los resultados.
9. NOTAS DE DATOS Y COLUMNAS:
   - **HISTORIAL DE INTERACCIONES CON EL BOT:** La tabla 'mensajes_chat' registra CADA mensaje que cualquier persona (operador, supervisor, jefe de área, administrador) ha intercambiado contigo o con el resto del sistema, incluyendo los tuyos propios ('rol'='model'). La tabla 'sesiones_whatsapp' indica si alguien tiene una conversación o jornada abierta en este momento. Si te preguntan si una persona "ha interactuado contigo", "qué le respondiste a X", "muéstrame los últimos mensajes de X" o similar, SIEMPRE consulta 'mensajes_chat' (cruzando 'whatsapp_remitente' con 'personal.whatsapp' por nombre) antes de responder que no tienes esa información — si hay filas, sí interactuó.
   - **IDENTIFICACIÓN DE EQUIPOS POR PATENTE:** Muchos operadores y supervisores reconocen un equipo por su patente (columna 'patente' en 'equipos') en vez de su código interno, y a veces de forma coloquial mencionando solo los últimos dígitos (ej. "la camioneta 25" porque su patente termina en "25", o "el camión que termina en 87"). Si no puedes resolver un equipo por 'codigo_interno' exacto, intenta: (a) 'patente' exacta (ILIKE), (b) 'patente' ILIKE '%<dígitos_o_texto_mencionado>' (termina en), combinando con 'categoria'/'tipo'/'descripcion_equipo' ILIKE cuando el usuario mencione el tipo de vehículo (ej. "camioneta") para acotar la búsqueda. Si más de un equipo calza, muéstraselos y pide que aclare cuál corresponde en vez de asumir.
   - El año de fabricación de los equipos y su antigüedad se consultan en el campo 'anio_fabricacion' (escrito con 'n', no con 'ñ'). Mapea siempre las preguntas sobre "año de fabricación" a la columna 'anio_fabricacion'.
   - La columna 'pauta_preventiva_activa' (TEXT) en la tabla 'equipos' almacena pautas de seguridad, inspecciones críticas o mantenimiento preventivo actualmente activas para cada equipo. Si el supervisor te solicita agregar una pauta de seguridad o revisión a un grupo de equipos (por ejemplo, "revisar las tuercas de las ruedas a todas las camionetas"), crea y ejecuta inmediatamente una herramienta dinámica que realice un UPDATE en la tabla 'equipos' para establecer 'pauta_preventiva_activa' con la pauta proporcionada en todos los equipos que correspondan (ej. WHERE categoria = 'VEHÍCULOS MENORES' o tipo = 'CAMIONETAS'). Confirma el éxito de la operación al supervisor una vez realizada.
   - **NIVEL DE COMBUSTIBLE:** La columna 'combustible_nivel_porcentaje' (NUMERIC) en la tabla 'equipos' almacena el porcentaje de combustible del estanque (ej: 100, 80, 50, etc.). Si el supervisor te solicita registrar, actualizar o cambiar el nivel de combustible de un equipo (ej. 'Actualiza el combustible de caal-0002 esta al 100%'), crea y ejecuta inmediatamente una herramienta dinámica que actualice la columna 'combustible_nivel_porcentaje' al valor numérico indicado para dicho equipo (ej. WHERE codigo_interno = 'CAAL-0002'). Responde confirmando que el combustible ha sido actualizado al porcentaje indicado.
   - **CONTROL DE ARRIENDOS:** Si te pregunta sobre a quién está arrendado un equipo o por cuánto tiempo, consulta las columnas 'arriendo_cliente' (TEXT), 'arriendo_fecha_inicio' (DATE) y 'arriendo_fecha_fin' (DATE) de la tabla 'equipos'. Si te solicita registrar o actualizar el arriendo (ej. 'Asigna el arriendo de CMPT-0015 al cliente Constructora Alfa desde hoy hasta fin de mes'), crea y ejecuta una herramienta que realice un UPDATE en estas columnas, asegurándote de cambiar la clasificación comercial ('clasificacion_comercial') a 'DISPONIBLE PARA ARRIENDO'.
   - **PLANIFICACIÓN MATUTINA / SALA POD:** Si el supervisor te solicita registrar o programar una asignación o bloqueo de equipo para mañana o una fecha específica (por ejemplo, "mañana el camión pluma CAPL-0029 tiene mantención todo el día" o "el equipo X tiene taller de 08:00 a 12:00 mañana"), debes crear y ejecutar una herramienta dinámica que primero haga un INSERT en la tabla 'actividades' (fecha, especialidad_id, tarea_programada_id: null, descripcion: la actividad, programada: true) y luego un INSERT en 'planificacion_bloques_pod' usando el 'id' de la actividad recién creada en su columna 'actividad_id', además de la 'actividad_especifica' de texto de siempre.
     - Si el supervisor dice "todo el día", el rango de horas debe ser desde '07:00:00' hasta '18:00:00'.
     - Para programar "Mantención" (Preventiva/Programada), usa el ID de supervisor virtual '11111111-1111-1111-1111-111111111111' y la descripción/actividad_especifica "Mantenimiento Preventivo".
     - Para programar "Taller" o "Reparación", usa el ID de supervisor virtual '22222222-2222-2222-2222-222222222222' y la descripción/actividad_especifica "Taller / Reparación".
     - En ambos casos de mantenimiento/reparación, busca el ID de especialidad cuyo nombre sea 'Mantenimiento' e insértalo en 'especialidad_id' (tanto en 'actividades' como en 'planificacion_bloques_pod').
     - Asegúrate de resolver primero el UUID de 'equipo_id' buscando por el código interno provisto (ej: 'CAPL-0029').
   - **CONSULTA DE EQUIPOS POD ASIGNADOS:** Si el supervisor te pregunta "qué equipos tengo mañana", "tengo equipos asociados", "cuál es mi planificación" o cualquier variante sobre sus asignaciones en la Sala POD, DEBES consultar la tabla 'planificacion_bloques_pod' DIRECTAMENTE filtrando por 'supervisor_id' = '${personal.id}' (el ID del supervisor que te habla, ya disponible en contexto) y 'fecha' = la fecha consultada. NO filtres a través de la tabla 'actividades' ni por 'proyecto_id' porque los bloques nuevos pueden no tener actividad asignada aún. Incluye el JOIN con 'equipos(codigo_interno, descripcion_equipo, patente)' y 'especialidades(nombre_oficial)' para dar contexto. Nota: los bloques con supervisor_id '11111111-1111-1111-1111-111111111111' son de Mantenimiento y '22222222-2222-2222-2222-222222222222' son de Taller — no pertenecen al supervisor real.
   - **AGREGAR TAREA AL CATÁLOGO:** Si el supervisor, jefe de área o administrador te pide agregar una nueva tarea o actividad al catálogo de una especialidad (por texto o por audio, ej. "agrega la tarea Instalación de vigas eje 5 a Piping" o "suma una tarea de inspección de mangueras a Mantenimiento"), crea y ejecuta inmediatamente una herramienta dinámica que:
     - Resuelva primero el 'especialidad_id' buscando por nombre en 'especialidades' (ilike, ej. '%Piping%').
     - Calcule 'orden' como el siguiente disponible para esa especialidad (MAX(orden)+1, o 1 si no hay tareas previas).
     - Haga un INSERT en 'tareas_programadas' con 'nombre' (el texto de la tarea, capitalizado de forma legible), 'especialidad_id', 'activa: true', 'es_libre: false', 'orden'.
     - Confirma al usuario el nombre de la tarea agregada y la especialidad a la que quedó asociada.
   - **PERFIL DE MANTENCIÓN (PM1-PM4):** Si te piden configurar los umbrales de mantención de un equipo o de toda una categoría/tipo (ej. "a todos los camiones aljibe configúrales PM1 en 250 horas, PM2 500, PM3 1000, PM4 2000, tolerancia 50"), crea y ejecuta una herramienta dinámica que haga un UPDATE en 'equipos' sobre las columnas 'pm1_umbral', 'pm2_umbral', 'pm3_umbral', 'pm4_umbral' y 'tolerancia_pm' (todas NUMERIC, en horas si el equipo se controla por horómetro o en km si 'tipo_seguimiento' es 'vehiculo'), filtrando por 'categoria' o 'tipo' según corresponda. Confirma cuántos equipos quedaron actualizados.
   - **CARACTERÍSTICAS OPERACIONALES DEL EQUIPO:** Si te piden que un equipo o una categoría completa no maneje cierta característica (ej. "las grúas no manejan estado de plataforma", "el CAPL-0029 no necesita control de plataforma", "cambia el CAAL-0002 a tipo vehículo"), crea y ejecuta una herramienta dinámica que haga un UPDATE en 'equipos' sobre 'usa_plataforma' (BOOLEAN) y/o 'tipo_seguimiento' ('estandar'|'camion'|'vehiculo'), filtrando por 'categoria', 'tipo' o 'codigo_interno' según corresponda. Confirma cuántos equipos quedaron actualizados.
   - **REGISTRAR PM EJECUTADA:** Si te informan que se ejecutó una mantención (ej. "se hizo la PM2 al CAAL-0002 hoy, quedó en 550 horas"), crea y ejecuta una herramienta dinámica que haga un INSERT en 'mantenciones_ejecutadas' con 'equipo_id' (resuelto por 'codigo_interno'), 'tipo_pm' ('PM1'|'PM2'|'PM3'|'PM4'), 'fecha' (hoy si no se especifica, formato YYYY-MM-DD), 'lectura_al_momento' (el valor de horómetro/km indicado) y 'responsable_id' (el id de 'personal' de quien te escribe, ya disponible en el contexto). Confirma el registro al usuario.

CRÍTICO - ESQUEMA DE BASE DE DATOS:
Todas las tablas pertenecen al esquema 'maquinaria'.
El cliente 'supabase' inyectado en tus herramientas ya está configurado internamente para usar el esquema 'maquinaria' por defecto. Por lo tanto, en tus códigos JavaScript debes consultar las tablas directamente sin prefijar el esquema (ej. escribe supabase.from("equipos") and NO supabase.from("maquinaria.equipos")).

Usa este mapa de tablas para estructurar tus códigos de herramientas dinámicas:
${JSON.stringify(mapaDelMundo, null, 2)}

Directrices al programar 'codigo_javascript' para "crear_herramienta_dinamica":
- Desestructura SIEMPRE los parámetros de entrada desde el objeto 'args' en la primera línea.
- Realiza la consulta a Supabase usando 'supabase' (ej. await supabase.from("equipos").select(...)).
- Usa comparaciones difusas con '.ilike("columna", \`%\${param}%\`)' para búsquedas de texto.
- Retorna el resultado (el array de filas o valor único).
- Ejemplo:
  const { nombre } = args;
  const { data, error } = await supabase.from("personal").select("nombre_completo, whatsapp").ilike("nombre_completo", \`%\${nombre}%\`);
  if (error) throw error;
  return data;
`;

  // Cargar historial previo de la conversación para no perder el contexto
  const historialPrevio = await cargarHistorialGemini(supabase, phoneClean, 12);

  let currentParts = [];
  if (audio && audio.data) {
    currentParts.push({
      inlineData: {
        mimeType: audio.mimeType || "audio/ogg",
        data: audio.data
      }
    });
  }
  currentParts.push({ text: message || "Analiza el audio e interactúa con el supervisor." });

  let contents = [
    ...historialPrevio,
    { role: "user", parts: currentParts }
  ];

  try {
    const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    let responseText = "";
    let runLoop = true;
    let iteracion = 0;
    const maxIteraciones = 4;
    
    let currentContents = [...contents];

    while (runLoop && iteracion < maxIteraciones) {
      iteracion++;
      
      const reqBody = {
        contents: currentContents,
        tools,
        systemInstruction: { parts: [{ text: promptSistemaAdmin }] }
      };

      const resGemini = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(reqBody)
        }
      );

      if (!resGemini.ok) {
        throw new Error(`Gemini API error: ${resGemini.status} - ${await resGemini.text()}`);
      }

      const dataGemini = await resGemini.json();
      const candidate = dataGemini.candidates?.[0];
      const resParts = candidate?.content?.parts || [];

      const functionCalls = resParts.filter(p => p.functionCall);
      const textParts = resParts.filter(p => p.text);

      if (textParts.length > 0) {
        responseText = textParts.map(p => p.text).join("\n");
      }

      if (functionCalls.length > 0) {
        console.log(`[adminHandler] [Iteración ${iteracion}] ⚡ Gemini solicitó ejecutar ${functionCalls.length} funciones.`);
        const functionResponses = [];

        // Refrescar dbTools en cada iteración en caso de que se haya creado una herramienta
        let activeDbTools = [];
        try {
          const { data: loadedTools } = await supabase
            .from("bot_tools_dinamicas")
            .select("nombre_funcion, descripcion, esquema_json, codigo_javascript");
          if (loadedTools) activeDbTools = loadedTools;
        } catch (err) {
          console.error("Error recargando herramientas dinámicas:", err.message);
        }

        for (const call of functionCalls) {
          const { name, args } = call.functionCall;
          let dbResult = "";

          try {
            if (name === "silenciar_usuario_por_desviacion") {
              dbResult = "Silenciado con éxito.";
            }
            else if (name === "aprobar_registro_personal") {
              const { registro_id, rut, rol_final, proyecto_id } = args;

              if (!rut || !rut.trim()) {
                dbResult = "Error: el RUT es obligatorio para aprobar un registro.";
              } else {
                const { data: registro, error: errGet } = await supabase
                  .from("registros_pendientes")
                  .select("*")
                  .eq("id", registro_id)
                  .maybeSingle();

                if (errGet || !registro) {
                  dbResult = "Error: no se encontró la solicitud de registro indicada.";
                } else {
                  const cleanRut = rut.trim();
                  const rolFinal = rol_final || registro.rol_solicitado || "Operador";
                  const proyectoFinal = proyecto_id || registro.proyecto_id || null;

                  const { data: existente } = await supabase
                    .from("personal")
                    .select("id")
                    .eq("rut", cleanRut)
                    .maybeSingle();

                  let errUpsert;
                  if (existente) {
                    const { error } = await supabase.from("personal").update({
                      nombre_completo: registro.nombre_completo,
                      whatsapp: registro.whatsapp,
                      rol: rolFinal,
                      activo: true,
                      proyecto_actual_id: proyectoFinal
                    }).eq("id", existente.id);
                    errUpsert = error;
                  } else {
                    const { error } = await supabase.from("personal").insert({
                      rut: cleanRut,
                      nombre_completo: registro.nombre_completo,
                      whatsapp: registro.whatsapp,
                      rol: rolFinal,
                      activo: true,
                      proyecto_actual_id: proyectoFinal
                    });
                    errUpsert = error;
                  }

                  if (errUpsert) {
                    dbResult = `Error al guardar personal: ${errUpsert.message}`;
                  } else {
                    await supabase.from("registros_pendientes").update({
                      estado: "aprobado",
                      rol_solicitado: rolFinal
                    }).eq("id", registro_id);

                    const mensajeBienvenida = `👷‍♂️ *¡Tu solicitud ha sido Aprobada!* 🎉\n\nHola *${registro.nombre_completo}*, el Administrador ha aprobado tu registro como *${rolFinal}* en LukeEquipos.\n\nPara iniciar tu jornada diaria, por favor escanea el código QR del equipo o escribe:\n\n*REPORTE:CODIGO_EQUIPO*\n\nEjemplo: REPORTE:EIMI00387`;
                    await enviarMensajeWhatsApp(null, registro.whatsapp, mensajeBienvenida, false, geminiKey);

                    dbResult = `Éxito: ${registro.nombre_completo} aprobado como ${rolFinal}${proyectoFinal ? ", proyecto asignado" : ", sin proyecto asignado"}. Se envió confirmación por WhatsApp.`;
                  }
                }
              }
            }
            else if (name === "rechazar_registro_personal") {
              const { registro_id, motivo } = args;
              const { data: registro, error: errGet } = await supabase
                .from("registros_pendientes")
                .select("*")
                .eq("id", registro_id)
                .maybeSingle();

              if (errGet || !registro) {
                dbResult = "Error: no se encontró la solicitud de registro indicada.";
              } else {
                const notaFinal = motivo || "No cumple con los requisitos de la faena.";
                await supabase.from("registros_pendientes").update({
                  estado: "rechazado",
                  nota_rechazo: notaFinal
                }).eq("id", registro_id);

                const mensajeRechazo = `❌ *Solicitud de Registro Rechazada*\n\nHola *${registro.nombre_completo || "Usuario"}*, tu solicitud de registro en LukeEquipos ha sido rechazada por el Administrador.\n\n*Motivo:* ${notaFinal}\n\nSi deseas volver a solicitar el registro, puedes responder a este chat indicando tu *Nombre Completo*.`;
                await enviarMensajeWhatsApp(null, registro.whatsapp, mensajeRechazo, false, geminiKey);

                dbResult = `Éxito: solicitud de ${registro.nombre_completo || registro.whatsapp} rechazada y notificada.`;
              }
            }
            else if (name === "crear_herramienta_dinamica") {
              const { nombre_funcion, descripcion, codigo_javascript, esquema_json } = args;
              console.log(`[adminHandler] 🛠️ Registrando nueva herramienta dinámica: ${nombre_funcion}`);

              const { error: insertErr } = await supabase
                .from("bot_tools_dinamicas")
                .upsert([{
                  nombre_funcion,
                  descripcion,
                  codigo_javascript,
                  esquema_json
                }], { onConflict: "nombre_funcion" });

              if (insertErr) {
                dbResult = `Error al registrar: ${insertErr.message}`;
              } else {
                dbResult = `Éxito: Herramienta "${nombre_funcion}" registrada exitosamente. Ya está lista para ser llamada con los argumentos adecuados.`;
              }
            } 
            else if (activeDbTools.some(t => t.nombre_funcion === name)) {
              const targetTool = activeDbTools.find(t => t.nombre_funcion === name);
              console.log(`[adminHandler] ⚡ Ejecutando herramienta dinámica: ${name} con args:`, JSON.stringify(args));

              try {
                const fn = new Function("supabase", "args", `
                  return (async () => {
                    ${targetTool.codigo_javascript}
                  })();
                `);
                const timeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error("Timeout de ejecución excedido (5s)")), 5000)
                );
                const resFn = await Promise.race([
                  fn(supabase, args),
                  timeoutPromise
                ]);
                dbResult = JSON.stringify(resFn);
              } catch (execErr) {
                dbResult = `Error de ejecución: ${execErr.message}`;
              }
            } else {
              dbResult = `Error: La herramienta "${name}" no está registrada en el sistema.`;
            }
          } catch (errCall) {
            dbResult = `Error en llamada de herramienta: ${errCall.message}`;
          }

          functionResponses.push({
            functionResponse: {
              name: name,
              response: { result: dbResult }
            }
          });
        }

        currentContents.push(candidate.content);
        currentContents.push({ role: "function", parts: functionResponses });

        // Actualizar catálogo de herramientas
        try {
          const { data: updatedDbTools } = await supabase
            .from("bot_tools_dinamicas")
            .select("nombre_funcion, descripcion, esquema_json");
          if (updatedDbTools) {
            const newDynamicDeclarations = updatedDbTools.map(t => ({
              name: t.nombre_funcion,
              description: t.description || t.descripcion,
              parameters: t.esquema_json.parameters || t.esquema_json
            }));
            tools[0].functionDeclarations = [
              ...basicTools,
              ...adminTools,
              ...newDynamicDeclarations
            ];
          }
        } catch (err) {
          console.error("Error actualizando catálogo de herramientas dinámicas en bucle:", err.message);
        }

        runLoop = true;
      } else {
        runLoop = false;
      }
    }

    // Guardar la interacción actual en la base de datos de chat
    await guardarMensajeChat(supabase, phoneClean, "user", message || "[Audio de supervisor]", audio ? "audio" : "texto");
    if (responseText) {
      await guardarMensajeChat(supabase, phoneClean, "model", responseText, "texto");
      await enviarMensajeWhatsApp(jid, phoneClean, responseText, !!audio, geminiKey);
    }
    return res.status(200).json({ success: true, responseText });

  } catch (geminiErr) {
    console.error("[adminHandler] Error chateando con Supervisor, usando motor de respuesta directa:", geminiErr.message);
    try {
      const fallbackText = await responderConsultaSupervisorFallback(supabase, personal, message);
      await guardarMensajeChat(supabase, phoneClean, "user", message || "[Audio de supervisor]", audio ? "audio" : "texto");
      await guardarMensajeChat(supabase, phoneClean, "model", fallbackText, "texto");
      await enviarMensajeWhatsApp(jid, phoneClean, fallbackText, !!audio, geminiKey);
      return res.status(200).json({ success: true, responseText: fallbackText, fallback: true });
    } catch (fbErr) {
      console.error("[adminHandler] Error en fallback de supervisor:", fbErr.message);
      await enviarMensajeWhatsApp(jid, phoneClean, "Hola, tuve un inconveniente temporal al consultar la base de datos. Por favor intenta nuevamente en unos segundos.", !!audio, geminiKey);
      return res.status(200).json({ success: false, error: geminiErr.message });
    }
  }
}

async function responderConsultaSupervisorFallback(supabase, personal, rawMessage = "") {
  const texto = String(rawMessage || "").trim();
  const lower = texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const hoyDate = new Date();
  const hoyChile = hoyDate.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
  const mananaDate = new Date(hoyDate.getTime() + 24 * 60 * 60 * 1000);
  const mananaChile = mananaDate.toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });

  const fmtDMY = (iso) => {
    if (!iso) return "";
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  };

  // 1. Consulta sobre qué puede preguntar / ayuda / menú
  if (/\b(que mas te puedo|que te puedo preguntar|que puedes hacer|ayuda|menu|comandos|funciones)\b/.test(lower)) {
    return [
      `👋 ¡Hola *${personal.nombre_completo}*! Soy *jAIme*, tu asistente virtual de LukeEquipos.`,
      ``,
      `Como *${personal.rol}*, puedes consultarme en cualquier momento por texto o audio:`,
      ``,
      `📅 *1. Tus tareas y equipos del día (Sala POD):*`,
      `• _"¿Qué tareas tengo hoy?"_`,
      `• _"¿Qué equipos tengo asignados mañana?"_`,
      ``,
      `🚜 *2. Estado de la flota y disponibilidad:*`,
      `• _"¿Cuál es el estado de los equipos?"_`,
      `• _"¿Qué equipos están disponibles o en panne?"_`,
      ``,
      `👷 *3. Operadores y jornadas en curso:*`,
      `• _"¿Quiénes están trabajando hoy?"_`,
      `• _"Resumen de reportes de hoy"_`,
      ``,
      `📋 *4. Catálogo de tareas de tu especialidad:*`,
      `• _"¿Qué tareas programadas tengo en mi especialidad?"_`,
      ``,
      `🌐 *Vista pública en vivo (sin login):*`,
      `https://equipos.lukeapp.cl/pod-publico`,
    ].join("\n");
  }

  // 2. Consulta de estado de equipos / flota
  if (/\b(estado de equipos|estado de la flota|equipos disponibles|equipos en panne|flota|disponibilidad de equipos)\b/.test(lower)) {
    let qEq = supabase.from("equipos").select("codigo_interno, descripcion_equipo, patente, estado_actual");
    if (personal.proyecto_actual_id) {
      qEq = qEq.eq("proyecto_actual_id", personal.proyecto_actual_id);
    }
    const { data: equipos } = await qEq.order("codigo_interno");
    const lista = equipos || [];
    const operativos = lista.filter(e => e.estado_actual === "Equipo Operativo" || e.estado_actual === "Trabajando");
    const disponibles = lista.filter(e => e.estado_actual === "Disponible");
    const colacion = lista.filter(e => e.estado_actual === "En Colacion");
    const falla = lista.filter(e => e.estado_actual && (e.estado_actual.includes("Falla") || e.estado_actual.includes("Panne")));

    const lines = [
      `🚜 *Resumen de Flota (${fmtDMY(hoyChile)})*`,
      `• Total equipos: *${lista.length}*`,
      `• 🟢 Operativos / Trabajando: *${operativos.length}*`,
      `• 🔵 Disponibles: *${disponibles.length}*`,
      `• 🟡 En Colación: *${colacion.length}*`,
      `• 🔴 Detenidos por Falla / Panne: *${falla.length}*`,
    ];

    if (falla.length > 0) {
      lines.push(``, `*Equipos en Falla/Panne:*`);
      for (const f of falla.slice(0, 8)) {
        lines.push(`• 🔴 *${f.codigo_interno}* — ${f.descripcion_equipo}`);
      }
    }

    lines.push(``, `🌐 *Ver detalle completo en vivo:* https://equipos.lukeapp.cl/pod-publico`);
    return lines.join("\n");
  }

  // 3. Consulta de operadores / jornadas activas hoy
  if (/\b(quien esta trabajando|quienes estan trabajando|operadores activos|reportes de hoy|jornadas de hoy)\b/.test(lower)) {
    const { data: reps } = await supabase
      .from("reportes_diarios")
      .select("horometro_inicio, horometro_final, estado_final, equipos(codigo_interno, descripcion_equipo), personal!reportes_diarios_operador_id_fkey(nombre_completo)")
      .eq("fecha", hoyChile)
      .order("created_at", { ascending: false });

    if (!reps || reps.length === 0) {
      return `📋 *Jornadas de Hoy (${fmtDMY(hoyChile)})*\n\nAún no se registran jornadas iniciadas el día de hoy.`;
    }

    const lines = [`👷 *Jornadas Registradas Hoy (${fmtDMY(hoyChile)}):*\n`];
    for (const r of reps.slice(0, 12)) {
      const estado = r.estado_final === "Cerrado" ? "🏁 Cerrado" : "🟢 En turno";
      lines.push(`• *${r.equipos?.codigo_interno || "Equipo"}* (${r.equipos?.descripcion_equipo || ""})\n  👤 ${r.personal?.nombre_completo || "Operador"} — ${estado}`);
    }
    return lines.join("\n");
  }

  // 4. Consulta de tareas / bloques asignados de hoy o mañana (o saludo general)
  const pideManana = /\b(manana)\b/.test(lower);
  const fechaConsulta = pideManana ? mananaChile : hoyChile;
  const labelDia = pideManana ? `mañana (${fmtDMY(mananaChile)})` : `hoy (${fmtDMY(hoyChile)})`;

  const { data: bloques } = await supabase
    .from("planificacion_bloques_pod")
    .select(`
      id, fecha, hora_inicio, hora_fin, actividad_especifica,
      equipos ( codigo_interno, descripcion_equipo, patente ),
      especialidades ( nombre_oficial )
    `)
    .eq("supervisor_id", personal.id)
    .eq("fecha", fechaConsulta)
    .order("hora_inicio");

  let tareasCatalogo = [];
  if (personal.especialidad_id) {
    const { data: tCat } = await supabase
      .from("tareas_programadas")
      .select("orden, nombre")
      .eq("especialidad_id", personal.especialidad_id)
      .eq("activa", true)
      .order("orden", { ascending: true });
    tareasCatalogo = tCat || [];
  }

  const lines = [
    `👋 ¡Hola *${personal.nombre_completo}*!`,
    ``,
    `📅 *Tu planificación y tareas para ${labelDia}:*`,
  ];

  if (!bloques || bloques.length === 0) {
    lines.push(`• No tienes bloques de equipos asignados en la Sala POD para ${labelDia}.`);
  } else {
    for (const b of bloques) {
      const ini = b.hora_inicio?.slice(0, 5) || "--:--";
      const fin = b.hora_fin?.slice(0, 5) || "--:--";
      const eqCodigo = b.equipos?.codigo_interno || "Equipo";
      const eqDesc = b.equipos?.descripcion_equipo || "";
      const esp = b.especialidades?.nombre_oficial || "";
      const act = b.actividad_especifica || "Pendiente de definir al iniciar turno";
      lines.push(
        ``,
        `🔧 *${ini}–${fin}* | *${eqCodigo}*`,
        `   🚜 ${eqDesc}`,
        `   🏗️ Especialidad: *${esp}*`,
        `   📌 Tarea: _${act}_`
      );
    }
  }

  if (tareasCatalogo.length > 0) {
    lines.push(``, `📋 *Tareas programadas de tu especialidad:*`);
    for (const t of tareasCatalogo.slice(0, 10)) {
      lines.push(`   ${t.orden}. ${t.nombre}`);
    }
  }

  lines.push(``, `💬 _Puedes preguntarme "¿Qué equipos tengo mañana?", "¿Cuál es el estado de los equipos?" o "¿Quiénes están trabajando hoy?"._`);
  return lines.join("\n");
}
