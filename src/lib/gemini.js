/**
 * Motor de IA Gemini para LukeMontaje
 * Usa REST directo (mismo patrón que LukeDelivery, sin SDK npm)
 * Funciones:
 *  - procesarAudioOperador: Audio base64 → JSON de hito operacional
 *  - analizarImagenEvidencia: Imagen base64 → análisis técnico de evidencia
 *  - analizarIntencionHistorica: Texto/audio → clasificación intención PDF histórico
 *  - procesarMensajeConContexto: Historial de chat → respuesta con memoria conversacional
 */

import { GoogleGenAI } from "@google/genai";
import { formatFechaHoraChile } from "./timeUtils";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// ================================================================
// FUNCIÓN: Chat con memoria conversacional completa
// Recibe historial ordenado cronológicamente y lo pasa a la API nativa
// ================================================================
export async function procesarMensajeConContexto(historialConversacion, listaEspecialidades, contexto = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const listadoEsp = Array.isArray(listaEspecialidades)
    ? listaEspecialidades.map(e => `- ID: ${e.id} | Nombre: ${e.nombre_oficial}`).join("\n")
    : "";

  const systemInstruction = `Eres Jaime, el asistente inteligente de operaciones para el proyecto LukeMontaje (LukeEquipos) en una faena industrial chilena.
Tu tarea es asistir al operador de maquinaria pesada, procesar su mensaje y extraer los datos estructurados para el sistema.

Fecha y hora actual: ${formatFechaHoraChile()}
${contexto.descripcion_equipo && contexto.codigo_equipo ? `Equipo asignado actualmente al operador: ${contexto.descripcion_equipo} (${contexto.codigo_equipo})` : ""}
${contexto.estado_sesion === "CHECKIN" && contexto.pauta_del_dia ? `Pauta preventiva del día fijada por el supervisor: "${contexto.pauta_del_dia}"` : ""}
${contexto.horometro_inicio ? `Horómetro de inicio registrado: ${contexto.horometro_inicio}` : ""}
${contexto.estado_sesion ? `Estado actual de la sesión: ${contexto.estado_sesion}` : ""}
${contexto.seguimiento_completo !== undefined ? `Seguimiento completo de horas/especialidad/operador/rigger: ${contexto.seguimiento_completo}` : ""}

Lista oficial de especialidades:
${listadoEsp}

REGLAS ESTRICTAS DE INTERACCIÓN Y RESPUESTA:
1. Identidad: Eres Jaime. Sé cordial, profesional, directo y usa modismos técnicos de la faena chilena.
2. Tono formal y neutral de género: Dirígete al operador de forma respetuosa y formal. NUNCA uses la palabra "compadre", "compañero" u otros términos informales que asuman género o familiaridad excesiva. Usa un trato formal neutro (por ejemplo: "Le confirmo...", "Por favor indique...", o refiérete por su nombre de pila si lo conoces).
3. Reglas de Flujo (seguimiento_completo):
   - Si seguimiento_completo es false (por ejemplo, Torres de Iluminación): el equipo NO requiere Rigger ni especialidades operacionales de montaje. NO debes preguntar por especialidad ni Rigger, ni asociar especialidades en el JSON (deja 'especialidad_id' y 'especialidad_detectada' como null).
   - Si seguimiento_completo es true (o no se especifica): es un equipo estándar que sí requiere seguimiento detallado de especialidad y operador. Si el estado_sesion es 'CHECKIN' y no se detecta especialidad en el mensaje del operador, pregúntale explícitamente y con respeto con qué especialidad trabajará hoy o si se encuentra disponible.
4. Evita saludar constantemente: NO vuelvas a saludar (ej: "Hola", "Buenos días", "Buenas tardes") en tus respuestas si en el historial de chat ya existe un saludo inicial o si es un mensaje de seguimiento. Sé directo en confirmar el registro del hito de manera ágil.
5. Reglas de Mapeo Semántico:
   - "cañoneros", "viejos de las líneas", "tuberías", "cañerías", "líneas" → especialidad 'Piping'
   - "fierreros", "montadores", "estructuras", "vigas" → especialidad 'Estructuras'
   - Mapeo de Estados de Faena y Operacionales:
     * "operativo", "máquina lista", "trabajando normal" → 'Equipo Operativo' o 'Trabajando'
     * "panne", "pana", "avería", "roto", "fuera de servicio", "falla" → 'Equipo Fuera de Servicio (Panne)' o 'Detenido por Falla'
     * "sin operador", "libre sin chofer", "falta operador" → 'Equipo Disponible sin Operador'
     * "en traslado", "trasladando", "traslado a otro frente", "cama baja" → 'Equipo traslado'
     * "en mantención", "en taller", "pauta de mantención", "cambio de filtros/aceite" → 'Equipo en Mantención Programada'
     * "desvinculado pero en obra", "baja pero en faena" → 'Equipo Desvinculado pero en Obra'
     * "desvinculado", "fuera de faena", "devuelto" → 'Equipo Desvinculado'
     * "acreditación", "pase de ingreso", "proceso de acreditación" → 'Equipo en Proceso de Acreditación'
     * "armado", "en montaje de equipo", "armando" → 'Equipo en Proceso de Armado'
     * "ralentí", "ralenti", "motor encendido esperando", "en marcha lenta" → 'Ralenti'
     * "esperando", "en espera", "esperando rigger", "esperando frente" → 'Esperando' o 'Disponible'
     * "colación", "almuerzo", "hora de almuerzo", "colacion" → 'En Colacion'
     * "cierre", "terminamos", "fin de jornada", "horómetro final", "cerrando" → tipo_evento 'CIERRE'
   - Mapeo y Detección de Combustible (Flexible: Litros, Fracciones de Estanque o Decimales):
     * Fracciones / Porcentajes de estanque:
       - "lleno" / "a full" / "100%" / "1" / "1.0" → combustible_nivel_porcentaje = 100, combustible_unidad = 'estanque'
       - "tres cuartos" / "3/4" / "75%" / "0.75" → combustible_nivel_porcentaje = 75, combustible_unidad = 'estanque'
       - "medio estanque" / "a la mitad" / "1/2" / "50%" / "0.5" → combustible_nivel_porcentaje = 50, combustible_unidad = 'estanque'
       - "un cuarto" / "1/4" / "25%" / "0.25" → combustible_nivel_porcentaje = 25, combustible_unidad = 'estanque'
       - "reserva" / "luz de reserva" / "10%" / "0.1" → combustible_nivel_porcentaje = 10, combustible_unidad = 'estanque'
     * Litros directos: si menciona explícitamente "litros" (ej: "180 litros", "cargué 120 litros"), extrae el valor numérico en 'petroleo_litros' o 'combustible_valor_original' con combustible_unidad = 'litros'.
     * REGLA DE UNIDAD DE MEDIDA DE COMBUSTIBLE: Si el operador entrega un dato numérico de combustible pero no especifica la unidad de medida (por ejemplo dice solo "combustible 50" o "le puse 80" sin aclarar si son litros, cuartos o porcentaje), indícale amablemente en 'mensaje_conversacional_bot': "¿Me confirma si ese valor de combustible (${valor}) corresponde a litros o a fracción/porcentaje de estanque (ej: 1/4, 1/2, 3/4, full)?".
   - Descripción de Labores Realizadas:
     * Si el operador describe las labores efectuadas durante el día o en el cierre (ej: "estuve cargando camiones tolva con la gente de OOCC y luego zanjas con Piping"), extrae un resumen limpio y técnico en el campo 'labores_descripcion'.
   - Números hablados como horómetros: "dos mil trescientos" = 2300, "tres mil" = 3000
   - IMPORTANTE (Carga de Combustible): Frases como "sin combustible", "no cargué combustible", "sin petróleo", "sin carga" al referirse al cierre significan únicamente que los litros de combustible cargados son 0 (petroleo_litros = 0). NUNCA interpretes estas frases como una falla del equipo o como estado "Detenido por Falla". Solo marca falla ('es_falla_critica: true' o estado 'Detenido por Falla') si el operador reporta una avería mecánica, pana, rotura o desperfecto físico.
   - IMPORTANTE: Si el operador corrige un dato anterior (ej: "me equivoqué, era doce mil trescientos cincuenta"), usa el NUEVO valor corregido.
6. Regla de Pauta Preventiva (pauta_del_dia):
   - Solo aplica si el estado_sesion es 'CHECKIN' y se proporciona 'pauta_del_dia' en el contexto. El operador debe confirmar explícitamente haber cumplido, revisado o realizado la inspección de la pauta.
   - Si el operador confirma haber revisado la pauta de hoy, establece 'pauta_confirmada' en true.
   - Si hay una pauta activa pero el operador no hace mención alguna a su cumplimiento en su mensaje, establece 'pauta_confirmada' en false, y en 'mensaje_conversacional_bot' solicítale cortésmente que confirme si realizó la revisión de seguridad antes de continuar.
7. REGLA CRÍTICA - Nivel de Combustible NO es Cierre de Jornada:
   - Si el operador menciona únicamente el nivel, porcentaje o cantidad de combustible, SIN pedir explícitamente cerrar la jornada, terminar el turno, o despedirse, clasifica el mensaje como hito INTERMEDIO.
   - SOLO clasifica como tipo_evento "CIERRE" si el operador dice explícitamente que termina la jornada, que ya es hora de salida, que deja el equipo, o que cierra el turno.

Responde ÚNICAMENTE con un JSON válido. Esquema:
{
  "tipo_evento": "CHECKIN | Trabajando | Disponible | En Colacion | Detenido por Falla | Ralenti | Esperando | Equipo Operativo | Equipo Fuera de Servicio (Panne) | Equipo Disponible sin Operador | Equipo traslado | Equipo en Mantención Programada | Equipo Desvinculado pero en Obra | Equipo Desvinculado | Equipo en Proceso de Acreditación | Equipo en Proceso de Armado | CIERRE",
  "especialidad_id": "UUID_o_null",
  "especialidad_detectada": "Nombre_oficial_o_null",
  "horometro_inicial": numero_o_null,
  "horometro_final": numero_o_null,
  "combustible_nivel_porcentaje": numero_o_null,
  "combustible_inicio_valor": numero_o_null,
  "combustible_inicio_unidad": "litros | estanque | decimal | null",
  "capacidad_estanque_litros": numero_o_null,
  "petroleo_litros": numero_o_null,
  "horometro_carga_combustible": numero_o_null,
  "labores_descripcion": "Resumen técnico de labores y especialidades con que trabajó, o null",
  "es_falla_critica": true_o_false,
  "detalles_texto": "Transcripción resumida del operador",
  "pauta_confirmada": true_o_false,
  "mensaje_conversacional_bot": "Confirmación cordial en español de faena chilena, o consulta de unidad de medida de combustible si fue ambiguo"
}`;

  const payload = {
    contents: historialConversacion,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error procesando mensaje: ${res.status} - ${err}`);
  }

  const data = await res.json();
  console.log("[Gemini Debug] Objeto data completo:", JSON.stringify(data, null, 2));
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";

  try {
    return JSON.parse(rawText);
  } catch (parseErr) {
    console.error("[Gemini Debug] Error parseando JSON. Texto crudo recibido:", rawText);
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerErr) {
        console.error("[Gemini Debug] Falló también el parseo del match regex. Match:", match[0]);
      }
    }
    throw new Error(`[Gemini] JSON inválido en procesarMensajeConContexto: ${rawText.slice(0, 200)} | Error: ${parseErr.message}`);
  }
}

// ================================================================
// FUNCIÓN PRINCIPAL: Procesar audio de operador
// Detecta checkin, hitos intermedios y cierre de jornada
// ================================================================
export async function procesarAudioOperador(audioBase64, mimeType, especialidades, contexto = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const listaEspecialidades = especialidades
    .map(e => `- ID: ${e.id} | Nombre: ${e.nombre_oficial}`)
    .join("\n");

  const tipoSeg = contexto.tipo_seguimiento || 'estandar';

  // ── Prompt adaptado según tipo de equipo ──────────────────────────────
  let promptSistema;

  if (tipoSeg === 'camion') {
    // Camiones de trabajo: sin Rigger ni especialidad, solo horómetro + estado
    promptSistema = `Eres el asistente de extracción de datos para LukeEquipos.
Procesas el audio del CONDUCTOR de un camión de trabajo (pluma, aljibe, tolva, plano, tracto, rampla).
Este equipo NO requiere Rigger ni especialidades de montaje.

Contexto actual:
- Fecha y hora actual: ${formatFechaHoraChile()}
${contexto.descripcion_equipo && contexto.codigo_equipo ? `- Equipo asignado actualmente: ${contexto.descripcion_equipo} (${contexto.codigo_equipo})` : ""}
${contexto.estado_sesion ? `- Estado de sesión: ${contexto.estado_sesion}` : ''}
${contexto.horometro_inicio ? `- Horómetro de inicio: ${contexto.horometro_inicio}` : ''}
${contexto.estado_sesion === 'CHECKIN' && contexto.pauta_del_dia ? `- Pauta preventiva de seguridad para hoy: "${contexto.pauta_del_dia}"` : ''}

Reglas:
- Extrae horómetro_inicial en check-in ("horómetro veinte mil" = 20000)
- Extrae horómetro_final en cierre
- Detecta: "colación" → 'En Colacion', "disponible/esperando" → 'Disponible', "falla/problema" → 'Detenido por Falla' (solo si reporta avería/pana, no por decir 'sin carga de combustible'), "cerrando/fin" → 'CIERRE'
- IMPORTANTE: Frases como "sin combustible", "no cargué combustible" o "sin carga" significan petroleo_litros = 0. NUNCA las interpretes como falla o estado 'Detenido por Falla'.
- Mapeo de Nivel de Combustible: Mapea frases sobre el nivel o porcentaje del estanque de combustible a un valor numérico entero en el campo 'combustible_nivel_porcentaje':
  * "Estanque lleno" / "A full" / "Tanque completo" / "lleno" / "100%" -> 100
  * "Tres cuartos" / "3/4" / "75%" -> 75
  * "Medio estanque" / "A la mitad" / "1/2" / "50%" -> 50
  * "Un cuarto" / "1/4" / "Le queda poquito" / "25%" -> 25
  * "En la reserva" / "Prendió la luz" / "Casi seco" / "reserva" / "10%" -> 10
  Si no se menciona el nivel de combustible, ponlo como null.
- Mapeo de Capacidad del Estanque: Si el conductor menciona la capacidad máxima del estanque (en litros) (ej: "estanque de 150 litros", "capacidad de 200", "el estanque hace 120 litros"), extrae el valor numérico entero en el campo 'capacidad_estanque_litros'. Si no se menciona, ponlo como null.
- NO preguntes por especialidad ni Rigger jamás
- Tono formal y respetuoso, sin "compadre"
- Si no declara horómetro en check-in, pregúntalo de forma directa
- Regla de Pauta Preventiva (pauta_del_dia):
  - Si se proporciona pauta preventiva para hoy, verifica si el conductor confirma haber cumplido, revisado o realizado la inspección de la pauta.
  - Si el conductor confirma haber revisado la pauta de hoy, establece 'pauta_confirmada' in true.
  - Si hay una pauta activa pero el conductor no hace mención alguna a su cumplimiento en el audio, establece 'pauta_confirmada' in false, y en 'mensaje_conversacional_bot' solicítale cortésmente que confirme si realizó la revisión de seguridad antes de continuar (mencionando la pauta de forma breve).
  - Si no hay pauta preventiva, establece 'pauta_confirmada' in true.
- REGLA CRÍTICA - Nivel de Combustible NO es Cierre de Jornada:
  * Si el conductor menciona únicamente el nivel, porcentaje o cantidad del combustible (ej: "nivel de combustible al 85%", "estanque lleno", "cargamos al 100%"), SIN pedir cerrar la jornada o terminar el turno, clasifica el mensaje como hito INTERMEDIO (tipo_evento "Trabajando"), deja horometro_final en null, y registra combustible_nivel_porcentaje.
  * SOLO clasifica como "CIERRE" si el conductor dice explícitamente que termina/cierra la jornada.
- REGLAS DE RESPUESTAS A CONSULTAS COMUNES (Y EVITACIÓN DE JERGA TÉCNICA):
  * Evita el uso de terminología técnica interna o jerga de base de datos en el campo 'mensaje_conversacional_bot'. NUNCA uses "estado INTERMEDIO", "estado CHECKIN", "tipo_evento", "CHECKIN", "INTERMEDIO", "CIERRE", "UUID" en tus respuestas.
  * Si el conductor consulta sobre el estado de su sesión (ej. "¿estoy en sesión?"), respóndele de manera amigable confirmando que su jornada está activa para su camión asignado actual.
  * Si el conductor consulta sobre qué máquina o camión tiene asignado, indícales el nombre y código del equipo de su contexto (ej. "${contexto.descripcion_equipo || "el asignado"} con código ${contexto.codigo_equipo || ""}").
  * Si pregunta qué hitos puede reportar, lístale de manera amigable y conversacional las opciones aplicables.

Respuesta ÚNICAMENTE en JSON válido:
{
  "tipo_evento": "CHECKIN | Trabajando | Disponible | En Colacion | Detenido por Falla | CIERRE",
  "especialidad_id": null,
  "especialidad_detectada": null,
  "horometro_inicial": numero_o_null,
  "horometro_final": numero_o_null,
  "combustible_nivel_porcentaje": numero_o_null,
  "capacidad_estanque_litros": numero_o_null,
  "petroleo_litros": numero_o_null,
  "horometro_carga_combustible": numero_o_null,
  "es_falla_critica": false,
  "detalles_texto": "Transcripción resumida",
  "pauta_confirmada": true_o_false,
  "mensaje_conversacional_bot": "Confirmación breve al conductor en español, o solicitud de pauta si pauta_confirmada es false"
}`;
  } else {
    // Flujo estándar (grúas, maquinaria pesada/semipesada)
    promptSistema = `Eres el asistente de extracción de datos para el proyecto LukeEquipos.
Tu tarea es procesar la transcripción del operador de maquinaria pesada y mapear sus acciones a las tablas del sistema.

Lista oficial de especialidades:
${listaEspecialidades}

Reglas de Mapeo Semántico ESTRICTAS:
- Si seguimiento_completo es false: equipo que NO maneja Rigger ni especialidades. Pon 'especialidad_id' y 'especialidad_detectada' como null.
- Si seguimiento_completo es true: se requiere Rigger y especialidades. Si no indica especialidad ni disponible, solicítala respetuosamente.
- Tono formal y neutral de género. NUNCA uses "compadre".
- "cañoneros", "líneas", "tuberías" → 'Piping'
- "fierreros", "montadores", "estructuras" → 'Estructuras'
- "colación" → 'En Colacion' | "disponible/esperando" → 'Disponible' | "falla" → 'Detenido por Falla' (solo por pana o avería física, no por decir 'sin carga de combustible') | "cierre/fin" → 'CIERRE'
- Mapeo de Estados de Faena y Operacionales:
  * "operativo", "trabajando normal" → 'Equipo Operativo' o 'Trabajando'
  * "panne", "pana", "avería", "roto", "fuera de servicio", "falla" → 'Equipo Fuera de Servicio (Panne)' o 'Detenido por Falla'
  * "sin operador", "libre sin chofer", "falta chofer" → 'Equipo Disponible sin Operador'
  * "en traslado", "trasladando", "traslado" → 'Equipo traslado'
  * "en mantención", "en taller", "pauta de mantención" → 'Equipo en Mantención Programada'
  * "desvinculado pero en obra" → 'Equipo Desvinculado pero en Obra'
  * "desvinculado" → 'Equipo Desvinculado'
  * "acreditación", "pase de ingreso" → 'Equipo en Proceso de Acreditación'
  * "armado", "armando equipo", "en montaje" → 'Equipo en Proceso de Armado'
  * "ralentí", "ralenti", "en marcha lenta" → 'Ralenti'
  * "esperando", "en espera", "esperando rigger" → 'Esperando' o 'Disponible'
  * "colación", "almuerzo" → 'En Colacion'
  * "cierre", "terminamos", "fin de jornada", "horómetro final" → tipo_evento 'CIERRE'
- Mapeo y Detección de Combustible (Flexible: Litros, Fracciones de Estanque o Decimales):
  * Fracciones / Porcentajes de estanque:
    - "lleno" / "a full" / "100%" / "1" / "1.0" → combustible_nivel_porcentaje = 100, combustible_unidad = 'estanque'
    - "tres cuartos" / "3/4" / "75%" / "0.75" → combustible_nivel_porcentaje = 75, combustible_unidad = 'estanque'
    - "medio estanque" / "a la mitad" / "1/2" / "50%" / "0.5" → combustible_nivel_porcentaje = 50, combustible_unidad = 'estanque'
    - "un cuarto" / "1/4" / "25%" / "0.25" → combustible_nivel_porcentaje = 25, combustible_unidad = 'estanque'
    - "reserva" / "luz de reserva" / "10%" / "0.1" → combustible_nivel_porcentaje = 10, combustible_unidad = 'estanque'
  * Litros directos: si menciona explícitamente "litros", extrae el valor en 'petroleo_litros' o 'combustible_inicio_valor' con combustible_unidad = 'litros'.
  * UNIDAD DE MEDIDA AMBIGUA: Si el operador entrega un número de combustible sin unidad clara (ej: "combustible 40"), indícale amablemente en 'mensaje_conversacional_bot': "¿Me confirma si ese valor de combustible (${valor}) corresponde a litros o a fracción/porcentaje de estanque (ej: 1/4, 1/2, 3/4, full)?".
- Descripción de Labores Realizadas:
  * Si el operador describe qué hizo durante el día o al cierre y con qué especialidades trabajó, extrae un resumen técnico en 'labores_descripcion'.
- IMPORTANTE (Carga de Combustible): Frases como "sin combustible", "no cargué combustible", "sin petróleo" o "sin carga" al referirse al cierre significan petroleo_litros = 0. NUNCA las interpretes como falla o estado 'Detenido por Falla'.
- Números hablados: "dos mil trescientos" = 2300
- Regla de Pauta Preventiva (pauta_del_dia):
  - Solo aplica si el estado_sesion es 'CHECKIN' y se proporciona pauta preventiva para hoy, verifica si el operador confirma haber cumplido, revisado o realizado la inspección de la pauta.
  - Si el operador confirma haber revisado la pauta de hoy, establece 'pauta_confirmada' en true.
  - Si hay una pauta activa pero el operador no hace mención alguna a su cumplimiento en el audio, establece 'pauta_confirmada' en false, y en 'mensaje_conversacional_bot' solicítale cortésmente que confirme si realizó la revisión de seguridad antes de continuar (mencionando la pauta de forma breve).
  - Si el estado_sesion NO es 'CHECKIN' o no hay pauta preventiva, establece 'pauta_confirmada' en true.
- REGLA CRÍTICA - Nivel de Combustible NO es Cierre de Jornada:
  * Si el operador menciona únicamente el nivel, porcentaje o cantidad del combustible del estanque (ej: "el nivel de combustible es 85 porciento", "estanque al 80%", "cargamos combustible al 100%", "tanque lleno"), SIN pedir explícitamente cerrar la jornada, terminar el turno ni despedirse, clasifica el mensaje como un hito INTERMEDIO (tipo_evento "Trabajando"), deja horometro_final en null, y registra combustible_nivel_porcentaje con el valor correspondiente.
  * SOLO clasifica como "CIERRE" si el operador dice explícitamente que termina/cierra la jornada o que ya terminó su turno.

Contexto actual:
- Fecha y hora actual: ${formatFechaHoraChile()}
${contexto.descripcion_equipo && contexto.codigo_equipo ? `- Equipo asignado actualmente: ${contexto.descripcion_equipo} (${contexto.codigo_equipo})` : ""}
${contexto.estado_sesion ? `- Estado de sesión: ${contexto.estado_sesion}` : ''}
${contexto.horometro_inicio ? `- Horómetro de inicio: ${contexto.horometro_inicio}` : ''}
${contexto.seguimiento_completo !== undefined ? `- seguimiento_completo: ${contexto.seguimiento_completo}` : ''}
${contexto.estado_sesion === 'CHECKIN' && contexto.pauta_del_dia ? `- Pauta preventiva de seguridad para hoy: "${contexto.pauta_del_dia}"` : ''}

IMPORTANTE: Responde ÚNICAMENTE con un JSON válido, sin texto adicional, sin markdown.

Esquema de retorno:
{
  "tipo_evento": "CHECKIN | Trabajando | Disponible | En Colacion | Detenido por Falla | Ralenti | Esperando | Equipo Operativo | Equipo Fuera de Servicio (Panne) | Equipo Disponible sin Operador | Equipo traslado | Equipo en Mantención Programada | Equipo Desvinculado pero en Obra | Equipo Desvinculado | Equipo en Proceso de Acreditación | Equipo en Proceso de Armado | CIERRE",
  "especialidad_id": "UUID_o_null",
  "especialidad_detectada": "Nombre_o_null",
  "horometro_inicial": numero_o_null,
  "horometro_final": numero_o_null,
  "combustible_nivel_porcentaje": numero_o_null,
  "combustible_inicio_valor": numero_o_null,
  "combustible_inicio_unidad": "litros | estanque | decimal | null",
  "capacidad_estanque_litros": numero_o_null,
  "petroleo_litros": numero_o_null,
  "horometro_carga_combustible": numero_o_null,
  "labores_descripcion": "Resumen técnico de labores y especialidades con que trabajó, o null",
  "es_falla_critica": true_o_false,
  "detalles_texto": "Transcripción resumida",
  "pauta_confirmada": true_o_false,
  "mensaje_conversacional_bot": "Confirmación cordial o solicitud de unidad de combustible"
}`;
  }

  const payload = {
    contents: [
      {
        parts: [
          { text: promptSistema },
          {
            inlineData: {
              mimeType: mimeType || "audio/ogg; codecs=opus",
              data: audioBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error procesando audio: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!rawText) throw new Error("[Gemini] Respuesta vacía");

  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`[Gemini] JSON inválido: ${rawText.slice(0, 200)}`);
  }
}

// ================================================================
// FUNCIÓN: Procesar audio de VEHÍCULO (camionetas, furgones, minibuses)
// Extrae kilometraje (odómetro) y destino/ruta en lugar de horómetro
// ================================================================
export async function procesarAudioVehiculo(audioBase64, mimeType, contexto = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const promptSistema = `Eres el asistente de control de flota vehicular para LukeEquipos.
Procesas el audio del CONDUCTOR o SUPERVISOR que toma un vehículo (camioneta, furgón o minibús) en faena.
Este vehículo NO tiene horómetro ni especialidades. Se registra por KILOMETRAJE y DESTINO.

Contexto actual:
- Fecha y hora actual: ${formatFechaHoraChile()}
${contexto.descripcion_equipo && contexto.codigo_equipo ? `- Vehículo asignado actualmente: ${contexto.descripcion_equipo} (${contexto.codigo_equipo})` : ""}
${contexto.estado_sesion ? `- Estado de sesión: ${contexto.estado_sesion}` : ''}
${contexto.km_inicio ? `- Kilometraje de inicio registrado: ${contexto.km_inicio} km` : ''}
${contexto.estado_sesion === 'CHECKIN' && contexto.pauta_del_dia ? `- Pauta preventiva de seguridad para hoy: "${contexto.pauta_del_dia}"` : ''}

Reglas de extracción:
- Detecta km/odómetro ("ochenta y cuatro mil trescientos" = 84300, "84.320" = 84320)
- Detecta destino o ruta mencionada ("voy a Caspana", "sector norte", "faena Atacama")
- Check-in: extrae km_inicial y destino
- Cierre: extrae km_final
- "colación" → estado 'En Colacion'
- "disponible" → estado 'Disponible'
- "falla/problema/accidente" → estado 'Detenido por Falla' (solo por desperfectos, no por decir 'sin carga de combustible')
- IMPORTANTE: Frases como "sin combustible", "no cargué combustible" o "sin carga" significan petroleo_litros = 0. NUNCA las interpretes como falla.
- Mapeo de Nivel de Combustible: Mapea frases sobre el nivel o porcentaje del estanque de combustible a un valor numérico entero en el campo 'combustible_nivel_porcentaje':
  * "Estanque lleno" / "A full" / "Tanque completo" / "lleno" / "100%" -> 100
  * "Tres cuartos" / "3/4" / "75%" -> 75
  * "Medio estanque" / "A la mitad" / "1/2" / "50%" -> 50
  * "Un cuarto" / "1/4" / "Le queda poquito" / "25%" -> 25
  * "En la reserva" / "Prendió la luz" / "Casi seco" / "reserva" / "10%" -> 10
  Si no se menciona el nivel de combustible, ponlo como null.
- Mapeo de Capacidad del Estanque: Si el conductor menciona la capacidad máxima del estanque (en litros) (ej: "estanque de 150 litros", "capacidad de 200", "el estanque hace 120 litros"), extrae el valor numérico entero en el campo 'capacidad_estanque_litros'. Si no se menciona, ponlo como null.
- "cierre/terminé/devolví" → tipo_evento 'CIERRE'
- Si no menciona km en check-in, solicítalo de forma directa y cordial
- Tono formal y respetuoso. Sin "compadre".
- Regla de Pauta Preventiva (pauta_del_dia):
  - Solo aplica si el estado_sesion es 'CHECKIN' y se proporciona pauta preventiva para hoy, verifica si el conductor confirma haber cumplido, revisado o realizado la inspección de la pauta.
  - Si el conductor confirma haber revisado la pauta de hoy, establece 'pauta_confirmada' en true.
  - Si hay una pauta activa pero el conductor no hace mención alguna a su cumplimiento en el audio, establece 'pauta_confirmada' en false, y en 'mensaje_conversacional_bot' solicítale cortésmente que confirme si realizó la revisión de seguridad antes de continuar (mencionando la pauta de forma breve).
  - Si el estado_sesion NO es 'CHECKIN' o no hay pauta preventiva, establece 'pauta_confirmada' en true.
- REGLA CRÍTICA - Nivel de Combustible NO es Cierre de Jornada:
  * Si el conductor menciona únicamente el nivel, porcentaje o cantidad del combustible (ej: "nivel de combustible al 85%", "estanque lleno", "cargamos al 100%"), SIN pedir cerrar la jornada o terminar el turno, clasifica el mensaje como hito INTERMEDIO (tipo_evento "En Ruta" o el estado actual correspondiente), deja km_final en null, y registra combustible_nivel_porcentaje.
  * SOLO clasifica como "CIERRE" si el conductor dice explícitamente que termina/cierra la jornada o devuelve el vehículo.
- REGLAS DE RESPUESTAS A CONSULTAS COMUNES (Y EVITACIÓN DE JERGA TÉCNICA):
  * Evita el uso de terminología técnica interna o jerga de base de datos en el campo 'mensaje_conversacional_bot'. NUNCA uses "estado INTERMEDIO", "estado CHECKIN", "tipo_evento", "CHECKIN", "INTERMEDIO", "CIERRE", "UUID" en tus respuestas.
  * Si el conductor consulta sobre el estado de su sesión (ej. "¿estoy en sesión?"), respóndele de manera amigable confirmando que su jornada está activa para su vehículo asignado actual.
  * Si el conductor consulta sobre qué vehículo tiene asignado, indícale el nombre y código del vehículo de su contexto (ej. "${contexto.descripcion_equipo || "el asignado"} con código ${contexto.codigo_equipo || ""}").
  * Si pregunta qué hitos puede reportar, lístale de manera amigable y conversacional las opciones aplicables.

Respuesta ÚNICAMENTE en JSON válido:
{
  "tipo_evento": "CHECKIN | En Ruta | En Colacion | Disponible | Detenido por Falla | CIERRE",
  "km_inicial": numero_o_null,
  "km_final": numero_o_null,
  "destino_ruta": "texto_o_null",
  "combustible_nivel_porcentaje": numero_o_null,
  "capacidad_estanque_litros": numero_o_null,
  "es_falla_critica": true_o_false,
  "detalles_texto": "Transcripción resumida",
  "pauta_confirmada": true_o_false,
  "mensaje_conversacional_bot": "Confirmación breve al conductor en español, o solicitud de pauta si pauta_confirmada es false"
}`;

  const payload = {
    contents: [{
      parts: [
        { inlineData: { mimeType: mimeType || "audio/ogg; codecs=opus", data: audioBase64 } }
      ]
    }],
    systemInstruction: {
      parts: [{ text: promptSistema }]
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error procesando audio vehículo: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) throw new Error("[Gemini] Respuesta vacía en procesarAudioVehiculo");

  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`[Gemini] JSON inválido vehículo: ${rawText.slice(0, 200)}`);
  }
}

// ================================================================
// FUNCIÓN: Procesar texto de VEHÍCULO (camionetas, furgones, minibuses)
// Extrae kilometraje (odómetro) y destino/ruta en lugar de horómetro
// ================================================================
export async function procesarTextoVehiculo(texto, contexto = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const promptSistema = `Eres el asistente de control de flota vehicular para LukeEquipos.
Procesas el mensaje de texto del CONDUCTOR o SUPERVISOR que toma un vehículo (camioneta, furgón o minibús) en faena.
Este vehículo NO tiene horómetro ni especialidades. Se registra por KILOMETRAJE y DESTINO.

Contexto actual:
- Fecha y hora actual: ${formatFechaHoraChile()}
${contexto.descripcion_equipo && contexto.codigo_equipo ? `- Vehículo asignado actualmente: ${contexto.descripcion_equipo} (${contexto.codigo_equipo})` : ""}
${contexto.estado_sesion ? `- Estado de sesión: ${contexto.estado_sesion}` : ''}
${contexto.km_inicio ? `- Kilometraje de inicio registrado: ${contexto.km_inicio} km` : ''}
${contexto.estado_sesion === 'CHECKIN' && contexto.pauta_del_dia ? `- Pauta preventiva de seguridad para hoy: "${contexto.pauta_del_dia}"` : ''}

Reglas de extracción:
- Detecta km/odómetro ("ochenta y cuatro mil trescientos" = 84300, "84.320" = 84320)
- Detecta destino o ruta mencionada ("voy a Caspana", "sector norte", "faena Atacama")
- Check-in: extrae km_inicial y destino
- Cierre: extrae km_final
- "colación" → estado 'En Colacion'
- "disponible" → estado 'Disponible'
- "falla/problema/accidente" → estado 'Detenido por Falla' (solo por desperfectos, no por decir 'sin carga de combustible')
- IMPORTANTE: Frases como "sin combustible", "no cargué combustible" o "sin carga" significan petroleo_litros = 0. NUNCA las interpretes como falla.
- Mapeo de Nivel de Combustible: Mapea frases sobre el nivel o porcentaje del estanque de combustible a un valor numérico entero en el campo 'combustible_nivel_porcentaje':
  * "Estanque lleno" / "A full" / "Tanque completo" / "lleno" / "100%" -> 100
  * "Tres cuartos" / "3/4" / "75%" -> 75
  * "Medio estanque" / "A la mitad" / "1/2" / "50%" -> 50
  * "Un cuarto" / "1/4" / "Le queda poquito" / "25%" -> 25
  * "En la reserva" / "Prendió la luz" / "Casi seco" / "reserva" / "10%" -> 10
  Si no se menciona el nivel de combustible, ponlo como null.
- Mapeo de Capacidad del Estanque: Si el conductor menciona la capacidad máxima del estanque (en litros) (ej: "estanque de 150 litros", "capacidad de 200", "el estanque hace 120 litros"), extrae el valor numérico entero en el campo 'capacidad_estanque_litros'. Si no se menciona, ponlo como null.
- "cierre/terminé/devolví" → tipo_evento 'CIERRE'
- Si no menciona km en check-in, solicítalo de forma directa y cordial
- Tono formal y respetuoso. Sin "compadre".
- Regla de Pauta Preventiva (pauta_del_dia):
  - Solo aplica si el estado_sesion es 'CHECKIN' y se proporciona pauta preventiva para hoy, verifica si el conductor confirma haber cumplido, revisado o realizado la inspección de la pauta.
  - Si el conductor confirma haber revisado la pauta de hoy, establece 'pauta_confirmada' en true.
  - Si hay una pauta activa pero el conductor no hace mención alguna a su cumplimiento en el mensaje, establece 'pauta_confirmada' en false, y en 'mensaje_conversacional_bot' solicítale cortésmente que confirme si realizó la revisión de seguridad antes de continuar (mencionando la pauta de forma breve).
  - Si el estado_sesion NO es 'CHECKIN' o no hay pauta preventiva, establece 'pauta_confirmada' en true.
- REGLA CRÍTICA - Nivel de Combustible NO es Cierre de Jornada:
  * Si el conductor menciona únicamente el nivel, porcentaje o cantidad del combustible (ej: "nivel de combustible al 85%", "estanque lleno", "cargamos al 100%"), SIN pedir cerrar la jornada o terminar el turno, clasifica el mensaje como hito INTERMEDIO (tipo_evento "En Ruta" o el estado actual correspondiente), deja km_final en null, y registra combustible_nivel_porcentaje.
  * SOLO clasifica como "CIERRE" si el conductor dice explícitamente que termina/cierra la jornada o devuelve el vehículo.
- REGLAS DE RESPUESTAS A CONSULTAS COMUNES (Y EVITACIÓN DE JERGA TÉCNICA):
  * Evita el uso de terminología técnica interna o jerga de base de datos en el campo 'mensaje_conversacional_bot'. NUNCA uses "estado INTERMEDIO", "estado CHECKIN", "tipo_evento", "CHECKIN", "INTERMEDIO", "CIERRE", "UUID" en tus respuestas.
  * Si el conductor consulta sobre el estado de su sesión (ej. "¿estoy en sesión?"), respóndele de manera amigable confirmando que su jornada está activa para su vehículo asignado actual.
  * Si el conductor consulta sobre qué vehículo tiene asignado, indícale el nombre y código del vehículo de su contexto (ej. "${contexto.descripcion_equipo || "el asignado"} con código ${contexto.codigo_equipo || ""}").
  * Si pregunta qué hitos puede reportar, lístale de manera amigable y conversacional las opciones aplicables.

Respuesta ÚNICAMENTE en JSON válido:
{
  "tipo_evento": "CHECKIN | En Ruta | En Colacion | Disponible | Detenido por Falla | CIERRE",
  "km_inicial": numero_o_null,
  "km_final": numero_o_null,
  "destino_ruta": "texto_o_null",
  "combustible_nivel_porcentaje": numero_o_null,
  "capacidad_estanque_litros": numero_o_null,
  "es_falla_critica": true_o_false,
  "detalles_texto": "Transcripción resumida",
  "pauta_confirmada": true_o_false,
  "mensaje_conversacional_bot": "Confirmación breve al conductor en español, o solicitud de pauta si pauta_confirmada es false"
}`;

  const payload = {
    contents: [{
      parts: [
        { text: texto }
      ]
    }],
    systemInstruction: {
      parts: [{ text: promptSistema }]
    },
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error procesando texto vehículo: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!rawText) throw new Error("[Gemini] Respuesta vacía en procesarTextoVehiculo");

  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error(`[Gemini] JSON inválido vehículo: ${rawText.slice(0, 200)}`);
  }
}

// ================================================================
// FUNCIÓN: Analizar imagen de evidencia con Gemini Vision
// ================================================================

export async function analizarImagenEvidencia(imageBase64, mimeType, contextoEquipo = "", comentarioOperador = "") {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const prompt = `Eres un inspector técnico experto en prevención de riesgos y mantenimiento de maquinaria pesada en una obra civil/faena industrial chilena.
Se te proporciona una imagen de evidencia de terreno enviada por el operador${contextoEquipo ? ` del equipo ${contextoEquipo}` : ''}.${comentarioOperador ? ` El operador describe la situación o maniobra como: "${comentarioOperador}".` : ''}

Analiza visualmente la imagen y genera un reporte breve y estructurado estrictamente de la siguiente manera:
1. Descripción técnica de lo que se observa en la imagen (sé específico y claro sobre la maquinaria, carga, maniobra o el entorno).
2. Detección de anomalías: Indica si observas cualquier falla, fuga de fluidos, daño estructural, desgaste o condición insegura. Si no hay anomalías, indícalo claramente.
3. Nivel de urgencia: NORMAL (operación segura), ATENCIÓN (requiere revisión preventiva) o CRÍTICO (riesgo inminente, detener equipo).

Responde en español de Chile de forma directa, profesional y muy breve (máximo 4 líneas en total). No incluyas plantillas de ejemplo, introducciones ni explicaciones adicionales.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType: mimeType || "image/jpeg",
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 512,
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error analizando imagen: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const analisis = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  const esCritico =
    analisis?.toLowerCase().includes("crítico") ||
    analisis?.toLowerCase().includes("critico") ||
    analisis?.toLowerCase().includes("fuga") ||
    analisis?.toLowerCase().includes("falla crítica") ||
    analisis?.toLowerCase().includes("accidente");

  return {
    analisis: analisis || "No se pudo analizar la imagen.",
    esCritico,
  };
}

// ================================================================
// FUNCIÓN: Clasificador conversacional de intenciones históricas
// ================================================================
export async function analizarIntencionHistorica(textoOAudio, contextoFechaActual = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" })) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const prompt = `Analiza la petición del operador de maquinaria. Determina si está pidiendo un reporte PDF o informe de días anteriores.
Fecha de hoy: ${contextoFechaActual}

Debes retornar estrictamente un JSON con este formato:
{
  "es_consulta_pdf": true o false,
  "fecha_solicitada": "YYYY-MM-DD" o null (Calcula la fecha exacta si dice 'ayer', 'el lunes', 'el 15 de junio', etc. en base a la fecha de hoy)
}`;

  const parts = [{ text: prompt }];

  if (typeof textoOAudio === "object" && textoOAudio?.data) {
    parts.push({
      inlineData: {
        mimeType: textoOAudio.mimeType || "audio/ogg; codecs=opus",
        data: textoOAudio.data,
      }
    });
  } else {
    parts.push({ text: textoOAudio || "Audio entrante" });
  }

  const payload = {
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
      maxOutputTokens: 2048,
    }
  };

  const res = await fetch(`${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[Gemini] Error en analizarIntencionHistorica: ${res.status} - ${err}`);
    return { es_consulta_pdf: false, fecha_solicitada: null };
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { es_consulta_pdf: false, fecha_solicitada: null };
  }
}

// ================================================================
// FUNCIÓN: Transcribir audio del supervisor a texto limpio
// ================================================================
export async function transcribirAudioSupervisor(audioBase64, mimeType) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const payload = {
    contents: [{
      parts: [
        { text: "Transcribe este audio de voz a texto limpio y directo en español. No agregues saludos, explicaciones, ni etiquetas. Solo la transcripción literal del mensaje." },
        {
          inlineData: {
            mimeType: mimeType || "audio/ogg; codecs=opus",
            data: audioBase64,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.0,
    },
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error transcribiendo audio de supervisor: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// ================================================================
// FUNCIÓN: Procesar la declaración de carga de plataforma en el cierre
// ================================================================
export async function procesarDeclaracionCarga(texto, especialidades) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const listaEspecialidades = especialidades
    .map(e => `- ID: ${e.id} | Nombre: ${e.nombre_oficial}`)
    .join("\n");

  const prompt = `Analiza la declaración del operador sobre los materiales que quedan cargados en la plataforma del camión/equipo.
Lista oficial de especialidades:
${listaEspecialidades}

Tu tarea es identificar a qué especialidad corresponde la carga y extraer un detalle breve del material/piezas cargadas.
Mapeo de especialidades habituales:
- "cañerías", "tuberías", "líneas", "piping" -> Piping
- "fierros", "estructuras", "vigas", "perfiles" -> Estructuras
- "hormigón", "concreto", "obras civiles" -> Obras Civiles

Responde ÚNICAMENTE con un JSON válido que contenga:
{
  "especialidad_detectada": "Nombre_oficial_o_null",
  "especialidad_id": "UUID_o_null",
  "detalle": "Detalle breve de las piezas o carga declarada (máximo 80 caracteres), o null si no se describe"
}`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { text: texto }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error al procesar declaración de carga: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { especialidad_detectada: null, especialidad_id: null, detalle: null };
  }
}

export async function resolverActividadesSupervisor(pendientes, mensajeSupervisor) {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("[Gemini] GEMINI_API_KEY no configurada");

  const listadoPendientes = pendientes.map(p => {
    const tareas = (p.tareas || [])
      .map(t => `   ${t.orden}. ${t.nombre}`)
      .join("\n");
    return `${p.ancla} Equipo *${p.codigo_equipo}*${p.esperando_libre ? " (esperando descripción libre)" : ""}\n${tareas}`;
  }).join("\n\n");

  const prompt = `Un supervisor de una faena industrial tiene varias confirmaciones de actividad pendientes, una por cada equipo/bloque de trabajo. Cada una tiene un ancla (símbolo ①②③...), un código de equipo, y una lista numerada de tareas posibles.

Pendientes:
${listadoPendientes}

El supervisor envió este mensaje respondiendo a una o varias de estas preguntas (puede mencionar el código de equipo, el ancla, o simplemente responder en el mismo orden en que se le listaron):
"${mensajeSupervisor}"

Tu tarea es mapear el mensaje a cada pendiente que el supervisor efectivamente respondió. Para cada uno, indica el número de tarea elegido (si corresponde a una de la lista) o un texto libre (si describió una actividad no listada). NO inventes respuestas para pendientes que el mensaje no menciona ni permite inferir con confianza razonable — en ese caso simplemente omítelos del resultado.

Responde ÚNICAMENTE con un JSON válido:
{
  "respuestas": [
    { "ancla": "①", "tarea_orden": 1, "texto_libre": null },
    { "ancla": "②", "tarea_orden": null, "texto_libre": "descripción de la actividad" }
  ]
}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  };

  const res = await fetch(
    `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Gemini] Error al resolver actividades múltiples: ${res.status} - ${err}`);
  }

  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
  try {
    return JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { respuestas: [] };
  }
}

