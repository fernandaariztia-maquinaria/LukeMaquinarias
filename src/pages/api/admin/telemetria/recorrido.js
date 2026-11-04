import { createAdminClient } from "../../../../lib/supabase-server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const { patente, fecha, desde, hasta, action } = req.query;

  // Si se solicita la lista de equipos disponibles para el selector
  if (action === "lista_equipos") {
    try {
      const { data: eqList, error: errList } = await supabase
        .schema("maquinaria")
        .from("equipos")
        .select("id, patente, codigo_interno, descripcion_equipo, tipo, categoria, marca, modelo")
        .not("patente", "is", null)
        .order("codigo_interno", { ascending: true });

      if (errList) throw errList;

      return res.status(200).json({
        success: true,
        equipos: eqList || [],
      });
    } catch (err) {
      console.error("[API telemetria/recorrido lista_equipos] Error:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  if (!patente) {
    return res.status(400).json({ error: "Parámetro 'patente' es requerido" });
  }

  const patNorm = String(patente).replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const fDesde = desde || fecha || new Date().toISOString().slice(0, 10);
  const fHasta = hasta || fecha || fDesde;

  try {
    // 1. Obtener datos del equipo
    const { data: equipoRows } = await supabase
      .schema("maquinaria")
      .from("equipos")
      .select("*, proyectos(nombre_proyecto, codigo_cc)")
      .or(`patente.ilike.%${patNorm}%,codigo_interno.ilike.%${patNorm}%,skynav_identificador.ilike.%${patNorm}%`)
      .limit(1);

    const equipo = equipoRows && equipoRows.length > 0 ? equipoRows[0] : null;

    // 2. Consultar puntos de alta resolución en telemetria_posiciones (cargados vía CSV)
    const desdeISO = `${fDesde}T00:00:00-03:00`;
    const hastaISO = `${fHasta}T23:59:59-03:00`;

    const { data: puntosRaw } = await supabase
      .schema("maquinaria")
      .from("telemetria_posiciones")
      .select("fecha_hora, latitud, longitud, velocidad, rumbo, estado, odometro, lugar")
      .eq("patente", patNorm)
      .gte("fecha_hora", desdeISO)
      .lte("fecha_hora", hastaISO)
      .order("fecha_hora", { ascending: true })
      .limit(8000);

    // 3. Consultar viajes estructurados en telemetria_viajes
    const { data: viajesRaw } = await supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .select("*")
      .eq("patente", patNorm)
      .gte("fecha", fDesde)
      .lte("fecha", fHasta)
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true });

    let puntos = [];
    let fuentePuntos = "CSV_POSICIONES";

    if (puntosRaw && puntosRaw.length > 0) {
      puntos = puntosRaw.map((p) => ({
        lat: Number(p.latitud),
        lng: Number(p.longitud),
        hora: p.fecha_hora,
        velocidad: Number(p.velocidad) || 0,
        estado: p.estado || "Viaje",
        lugar: p.lugar || "",
      }));
    } else if (viajesRaw && viajesRaw.length > 0) {
      // Si aún no se suben CSV de alta resolución, construir el recorrido preliminar desde los puntos de inicio y fin de cada viaje
      fuentePuntos = "RESUMEN_VIAJES";
      viajesRaw.forEach((v) => {
        if (v.latitud_inicio && v.longitud_inicio) {
          puntos.push({
            lat: Number(v.latitud_inicio),
            lng: Number(v.longitud_inicio),
            hora: `${v.fecha}T${v.hora_inicio || "00:00:00"}-03:00`,
            velocidad: 35,
            estado: "Inicio Viaje",
            lugar: v.lugar_inicio || "Origen",
            viaje_id: v.id,
          });
        }
        if (v.latitud_fin && v.longitud_fin) {
          puntos.push({
            lat: Number(v.latitud_fin),
            lng: Number(v.longitud_fin),
            hora: `${v.fecha}T${v.hora_fin || "23:59:59"}-03:00`,
            velocidad: 0,
            estado: "Fin Viaje",
            lugar: v.lugar_fin || "Destino",
            viaje_id: v.id,
          });
        }
      });
    }

    // 4. Construir bloques para la Línea de Tiempo Superior (24 Horas)
    // Clasificados en: En Viaje, En Ralentí, Encendido/Trabajando, Estacionado
    const timelineBloques = [];

    if (puntosRaw && puntosRaw.length > 0) {
      // Agrupar puntos consecutivos de alta resolución en tramos por estado
      let tramoActual = null;

      puntosRaw.forEach((p) => {
        const d = new Date(p.fecha_hora);
        const mins = d.getHours() * 60 + d.getMinutes();
        const vel = Number(p.velocidad) || 0;
        const est = String(p.estado || "").toLowerCase();

        let tipo = "viaje";
        let color = "#16a34a"; // verde
        let labelTipo = "En Viaje";

        if (est.includes("ralent") || (vel <= 3 && (p.ignicion || est.includes("encendido")))) {
          tipo = "ralenti";
          color = "#f59e0b"; // ámbar
          labelTipo = "En Ralentí";
        } else if (vel <= 3 && !p.ignicion && (est.includes("apagado") || est.includes("detenido") || est.includes("estacionado"))) {
          tipo = "estacionado";
          color = "#cbd5e1"; // gris
          labelTipo = "Estacionado / Apagado";
        } else if (est.includes("trabaj") || est.includes("faena") || est.includes("encendido")) {
          tipo = "encendido";
          color = "#0284c7"; // azul
          labelTipo = "Encendido / Faena";
        }

        if (!tramoActual) {
          tramoActual = {
            tipo,
            color,
            label: labelTipo,
            inicio_min: mins,
            fin_min: mins + 1,
            hora_inicio: p.fecha_hora.slice(11, 16),
            hora_fin: p.fecha_hora.slice(11, 16),
            lugar_inicio: p.lugar || "",
            lugar_fin: p.lugar || "",
          };
        } else if (tramoActual.tipo === tipo && (mins - tramoActual.fin_min) <= 5) {
          // Continuación del tramo
          tramoActual.fin_min = Math.max(tramoActual.fin_min, mins + 1);
          tramoActual.hora_fin = p.fecha_hora.slice(11, 16);
          if (p.lugar) tramoActual.lugar_fin = p.lugar;
        } else {
          // Finalizar tramo anterior y comenzar nuevo
          tramoActual.duracion_min = Math.max(1, tramoActual.fin_min - tramoActual.inicio_min);
          timelineBloques.push(tramoActual);

          tramoActual = {
            tipo,
            color,
            label: labelTipo,
            inicio_min: mins,
            fin_min: mins + 1,
            hora_inicio: p.fecha_hora.slice(11, 16),
            hora_fin: p.fecha_hora.slice(11, 16),
            lugar_inicio: p.lugar || "",
            lugar_fin: p.lugar || "",
          };
        }
      });

      if (tramoActual) {
        tramoActual.duracion_min = Math.max(1, tramoActual.fin_min - tramoActual.inicio_min);
        timelineBloques.push(tramoActual);
      }
    } else if (viajesRaw && viajesRaw.length > 0) {
      viajesRaw.forEach((v) => {
        const hIni = v.hora_inicio ? v.hora_inicio.slice(0, 5) : "08:00";
        const hFin = v.hora_fin ? v.hora_fin.slice(0, 5) : "09:00";
        const [h1, m1] = hIni.split(":").map(Number);
        const [h2, m2] = hFin.split(":").map(Number);
        const inicioMin = h1 * 60 + (m1 || 0);
        let finMin = h2 * 60 + (m2 || 0);
        if (finMin < inicioMin) finMin = inicioMin + Math.round(Number(v.tiempo_min) || 60);

        const ev = String(v.evento || "").toLowerCase();
        let tipo = "viaje";
        let color = "#16a34a"; // verde
        let labelTipo = "En Viaje";

        if (ev.includes("ralent")) {
          tipo = "ralenti";
          color = "#f59e0b"; // ámbar
          labelTipo = "En Ralentí";
        } else if (ev.includes("trabaj") || ev.includes("encendido") || Number(v.km_recorridos || 0) === 0) {
          tipo = "encendido";
          color = "#0284c7"; // azul
          labelTipo = "Encendido";
        }

        timelineBloques.push({
          tipo,
          color,
          label: `${labelTipo}: ${v.km_recorridos || 0} km`,
          hora_inicio: hIni,
          hora_fin: hFin,
          inicio_min: inicioMin,
          fin_min: finMin,
          duracion_min: Math.round(Number(v.tiempo_min) || (finMin - inicioMin)),
          conductor: v.nombre_conductor || null,
          distancia_km: v.km_recorridos || 0,
          lugar_inicio: v.lugar_inicio || null,
          lugar_fin: v.lugar_fin || null,
        });
      });
    }

    // 5. Métricas acumuladas del equipo en ese período
    let totalKm = 0;
    let totalHoras = 0;
    let totalCombustible = 0;

    (viajesRaw || []).forEach((v) => {
      totalKm += Number(v.km_recorridos) || 0;
      totalHoras += (Number(v.tiempo_min) || 0) / 60;
      totalCombustible += Number(v.litros_combustible) || 0;
    });

    return res.status(200).json({
      success: true,
      patente: patNorm,
      rango: { desde: fDesde, hasta: fHasta },
      fuente: fuentePuntos,
      equipo: equipo
        ? {
            id: equipo.id,
            codigo_interno: equipo.codigo_interno,
            patente: equipo.patente,
            descripcion: equipo.descripcion_equipo,
            marca: equipo.marca,
            modelo: equipo.modelo,
            tipo: equipo.tipo,
            categoria: equipo.categoria,
            proveedor: equipo.proveedor,
            proyecto: equipo.proyectos?.nombre_proyecto || "Sin proyecto asignado",
            ultimo_odometro: equipo.ultimo_odometro,
            ultimo_horometro: equipo.ultimo_horometro,
            imagen_url: equipo.imagen_url,
          }
        : null,
      resumen: {
        total_viajes: (viajesRaw || []).length,
        total_puntos_gps: puntos.length,
        total_km: Math.round(totalKm * 10) / 10,
        total_horas: Math.round(totalHoras * 10) / 10,
        total_combustible: Math.round(totalCombustible * 10) / 10,
      },
      timeline_bloques: timelineBloques,
      viajes: viajesRaw || [],
      puntos: puntos,
    });
  } catch (err) {
    console.error("[API telemetria/recorrido Error]:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
