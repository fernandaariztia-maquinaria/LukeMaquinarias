import { createAdminClient } from "../../lib/supabase-server";

function formatRut(val) {
  if (!val) return "";
  const clean = val.replace(/[^0-9kK]/g, "").slice(0, 9);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  let formattedBody = "";
  let count = 0;
  for (let i = body.length - 1; i >= 0; i--) {
    formattedBody = body.charAt(i) + formattedBody;
    count++;
    if (count === 3 && i > 0) {
      formattedBody = "." + formattedBody;
      count = 0;
    }
  }
  return `${formattedBody}-${dv}`;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ success: false, message: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const { codigo, identificador } = req.query;

  if (!codigo) {
    return res.status(400).json({ success: false, message: "Código de equipo es requerido" });
  }

  try {
    // 1. Obtener datos del equipo
    const { data: equipo, error: errorEquipo } = await supabase
      .from("equipos")
      .select("id, codigo_interno, descripcion_equipo, proveedor, patente, seguimiento_completo, latitud_actual, longitud_actual, ultima_ubicacion_fecha, ultimo_horometro, ultimo_odometro, pauta_preventiva_activa, tipo_seguimiento, combustible_nivel_porcentaje, proyectos(nombre_proyecto, codigo_cc), capacidad_estanque_litros")
      .eq("codigo_interno", codigo)
      .maybeSingle();

    if (errorEquipo) {
      return res.status(500).json({ success: false, error: errorEquipo.message });
    }

    if (!equipo) {
      return res.status(404).json({ success: false, message: "Equipo no encontrado" });
    }

    // 2. Obtener el número de teléfono del bot de WhatsApp
    const { data: configBot } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .select("valor")
      .eq("clave", "bot_phone")
      .maybeSingle();
    const botPhone = configBot?.valor || "56940470139";

    let operador = null;
    let reportes = [];

    // 3. Si se proporciona un identificador, obtener datos del operador
    if (identificador && identificador.trim() !== "") {
      const cleanIdentificador = identificador.trim();
      const formattedRut = formatRut(cleanIdentificador);
      
      const { data: op, error: errorOp } = await supabase
        .from("personal")
        .select("id, rut, nombre_completo, whatsapp, rol, foto_url")
        .or(`rut.eq.${cleanIdentificador},rut.eq.${formattedRut},whatsapp.eq.${cleanIdentificador},whatsapp.eq.+${cleanIdentificador}`)
        .eq("activo", true)
        .maybeSingle();

      if (errorOp) {
        console.error("Error obteniendo operador:", errorOp.message);
      } else if (op) {
        operador = op;

        // 4. Obtener los últimos 5 reportes consolidados en PDF de este operador
        const { data: repList, error: errorRep } = await supabase
          .from("reportes_diarios")
          .select("id, fecha, pdf_url, equipos(codigo_interno, patente)")
          .eq("operador_id", operador.id)
          .not("pdf_url", "is", null)
          .order("fecha", { ascending: false })
          .limit(5);

        if (errorRep) {
          console.error("Error obteniendo reportes pasados:", errorRep.message);
        } else {
          reportes = repList || [];
        }
      }
    }

    // 5. Consultar si hay bloque de planificación POD para hoy asignado a este equipo
    let podBloque = null;
    try {
      const hoy = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Santiago" });
      const { data: bloque, error: errorBloque } = await supabase
        .from("planificacion_bloques_pod")
        .select(`
          id, hora_inicio, hora_fin, confirmado_at,
          supervisor:personal!planificacion_bloques_pod_supervisor_id_fkey(id, nombre_completo),
          especialidades(id, nombre_oficial, color)
        `)
        .eq("equipo_id", equipo.id)
        .eq("fecha", hoy)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!errorBloque && bloque) {
        podBloque = {
          id: bloque.id,
          hora_inicio: bloque.hora_inicio?.slice(0, 5),
          hora_fin: bloque.hora_fin?.slice(0, 5),
          confirmado_at: bloque.confirmado_at,
          supervisor_nombre: bloque.supervisor?.nombre_completo,
          especialidad: bloque.especialidades?.nombre_oficial,
          color: bloque.especialidades?.color,
        };
      }
    } catch (e) {
      console.error("Error obteniendo bloque POD en qr-landing-data:", e.message);
    }

    return res.status(200).json({
      success: true,
      equipo,
      operador,
      reportes,
      botPhone,
      podBloque
    });

  } catch (err) {
    console.error("Error en qr-landing-data API:", err.message);
    return res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
}
