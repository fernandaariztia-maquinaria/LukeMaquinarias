import { createAdminClient } from "../../../../lib/supabase-server";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const {
    action,
    fecha,
    desde,
    hasta,
    proyecto_id,
    equipo_id,
    patente,
    origen,
    search,
    limit = 100,
    offset = 0,
  } = req.query;

  try {
    // 1. Obtener todas las fechas distintas, proyectos y equipos disponibles
    const [{ data: fechasRaw }, { data: proyectosRaw }, { data: equiposRaw }] = await Promise.all([
      supabase.schema("maquinaria").from("telemetria_fechas_disponibles").select("fecha"),
      supabase
        .schema("maquinaria")
        .from("proyectos")
        .select("id, nombre_proyecto, codigo_cc, estado")
        .order("nombre_proyecto", { ascending: true }),
      supabase
        .schema("maquinaria")
        .from("equipos")
        .select(
          "id, codigo_interno, patente, descripcion_equipo, tipo, categoria, proyecto_actual_id, proyecto:proyectos(id, nombre_proyecto, codigo_cc)"
        ),
    ]);

    const fechasUnicas = (fechasRaw || []).map((f) => f.fecha);
    const fechaMin = fechasUnicas[fechasUnicas.length - 1] || "2026-10-01";
    const fechaMax = fechasUnicas[0] || new Date().toISOString().slice(0, 10);
    const proyectos = proyectosRaw || [];
    const todosEquipos = equiposRaw || [];

    // Mapa por patente normalizada (sin guiones ni espacios) para enriquecer viajes sin equipo_id
    const normPatente = (p) => String(p || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    const equipoPorPatente = new Map();
    for (const eq of todosEquipos) {
      if (eq.patente) {
        equipoPorPatente.set(normPatente(eq.patente), eq);
      }
      if (eq.codigo_interno) {
        const m = String(eq.codigo_interno).match(/([A-Z]{2,4}[-\s]?\d{2,4})\s*$/i);
        if (m) {
          equipoPorPatente.set(normPatente(m[1]), eq);
        }
      }
    }

    if (action === "fechas_disponibles") {
      return res.status(200).json({
        success: true,
        fechas: fechasUnicas,
        min: fechaMin,
        max: fechaMax,
        proyectos,
      });
    }

    if (action === "mapa") {
      const filtroProyMapa = proyecto_id && proyecto_id !== "ALL" ? String(proyecto_id).trim() : null;
      let qMapa = supabase
        .schema("maquinaria")
        .from("telemetria_viajes")
        .select("*")
        .not("latitud_fin", "is", null)
        .order("fecha", { ascending: false })
        .order("hora_fin", { ascending: false })
        .limit(fecha ? 2500 : 3000);

      if (fecha) {
        qMapa = qMapa.eq("fecha", fecha);
      } else {
        if (desde) qMapa = qMapa.gte("fecha", desde);
        if (hasta) qMapa = qMapa.lte("fecha", hasta);
      }

      const { data: viajesMapaRaw, error: errMapa } = await qMapa;
      if (errMapa) throw errMapa;

      const equipoPorId = new Map(todosEquipos.map((e) => [e.id, e]));
      const unidadesMap = new Map();

      for (const v of viajesMapaRaw || []) {
        const latFin = Number(v.latitud_fin || v.latitud_inicio);
        const lngFin = Number(v.longitud_fin || v.longitud_inicio);
        if (!latFin || !lngFin) continue;

        const eq = (v.equipo_id && equipoPorId.get(v.equipo_id)) || equipoPorPatente.get(normPatente(v.patente)) || null;
        if (filtroProyMapa && eq?.proyecto_actual_id !== filtroProyMapa) {
          continue;
        }

        const unitKey = eq?.id || normPatente(v.patente) || v.id;
        const esCan = v.origen_km === "CAN" || v.origen_combustible === "CAN" || Number(v.litros_can) > 0;

        if (!unidadesMap.has(unitKey)) {
          unidadesMap.set(unitKey, {
            id: unitKey,
            equipo_id: eq?.id || null,
            patente: v.patente || eq?.patente || v.identificador_skynav || "S/P",
            codigo_interno: eq?.codigo_interno || v.nombre_skynav || v.patente || "S/C",
            descripcion_equipo: eq?.descripcion_equipo || v.subtipo_skynav || v.nombre_skynav || "Unidad Monitoreada SKYNAV",
            tipo: eq?.tipo || v.subtipo_skynav || "Flota",
            categoria: eq?.categoria || "Maquinaria / Vehículo",
            estado_actual: eq?.estado_actual || "Equipo Operativo",
            proyecto_actual_id: eq?.proyecto_actual_id || null,
            proyecto: eq?.proyecto || null,
            latitud: latFin,
            longitud: lngFin,
            lugar_actual: v.lugar_fin || v.geocerca_fin || v.lugar_inicio || "Coordenadas registradas",
            ultimo_conductor: v.nombre_conductor || null,
            rut_conductor: v.rut_conductor || null,
            ultima_fecha: v.fecha,
            ultima_hora: v.hora_fin || v.hora_inicio || "--:--",
            origen_medicion: esCan ? "CANBUS" : "GPS",
            fuente_gps: "SKYNAV",
            resumen: {
              total_viajes: 0,
              total_km: 0,
              total_litros: 0,
              total_min: 0,
              vel_max: 0,
            },
            viajes: [],
          });
        }

        const u = unidadesMap.get(unitKey);
        if (!u.ultimo_conductor && v.nombre_conductor) {
          u.ultimo_conductor = v.nombre_conductor;
          u.rut_conductor = v.rut_conductor;
        }
        u.resumen.total_viajes += 1;
        u.resumen.total_km = Math.round((u.resumen.total_km + (Number(v.km_recorridos) || 0)) * 10) / 10;
        u.resumen.total_litros = Math.round((u.resumen.total_litros + (Number(v.litros_combustible) || 0)) * 10) / 10;
        u.resumen.total_min += Math.round(Number(v.tiempo_min) || 0);
        if ((Number(v.velocidad_max_kmh) || 0) > u.resumen.vel_max) {
          u.resumen.vel_max = Number(v.velocidad_max_kmh) || 0;
        }

        if (u.viajes.length < 30) {
          u.viajes.push({
            id: v.id,
            fecha: v.fecha,
            hora_inicio: v.hora_inicio,
            hora_fin: v.hora_fin,
            tiempo_min: v.tiempo_min,
            km_recorridos: Number(v.km_recorridos) || 0,
            litros_combustible: Number(v.litros_combustible) || 0,
            origen_medicion: esCan ? "CANBUS" : "GPS",
            nombre_conductor: v.nombre_conductor || null,
            latitud_inicio: Number(v.latitud_inicio) || null,
            longitud_inicio: Number(v.longitud_inicio) || null,
            lugar_inicio: v.lugar_inicio || v.geocerca_inicio || null,
            latitud_fin: latFin,
            longitud_fin: lngFin,
            lugar_fin: v.lugar_fin || v.geocerca_fin || null,
          });
        }
      }

      // Agregar también equipos de la tabla equipos que tengan latitud_actual/longitud_actual pero no viajes en el filtro actual
      if (!fecha) {
        for (const eq of todosEquipos) {
          if (filtroProyMapa && eq.proyecto_actual_id !== filtroProyMapa) continue;
          if (eq.latitud_actual && eq.longitud_actual && !unidadesMap.has(eq.id)) {
            unidadesMap.set(eq.id, {
              id: eq.id,
              equipo_id: eq.id,
              patente: eq.patente || "S/P",
              codigo_interno: eq.codigo_interno,
              descripcion_equipo: eq.descripcion_equipo,
              tipo: eq.tipo || "Equipo",
              categoria: eq.categoria || "Maquinaria",
              estado_actual: eq.estado_actual || "Disponible",
              proyecto_actual_id: eq.proyecto_actual_id || null,
              proyecto: eq.proyecto || null,
              latitud: Number(eq.latitud_actual),
              longitud: Number(eq.longitud_actual),
              lugar_actual: eq.proyecto?.nombre_proyecto || "Posición GPS en faena",
              ultimo_conductor: null,
              rut_conductor: null,
              ultima_fecha: eq.ultima_ubicacion_fecha ? String(eq.ultima_ubicacion_fecha).slice(0, 10) : fechaMax,
              ultima_hora: eq.ultima_ubicacion_fecha
                ? new Date(eq.ultima_ubicacion_fecha).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })
                : "--:--",
              origen_medicion: "GPS",
              fuente_gps: "EQUIPO",
              resumen: { total_viajes: 0, total_km: 0, total_litros: 0, total_min: 0, vel_max: 0 },
              viajes: [],
            });
          }
        }
      }

      const unidades = Array.from(unidadesMap.values());
      return res.status(200).json({
        success: true,
        fechas_disponibles: fechasUnicas,
        fecha_min: fechaMin,
        fecha_max: fechaMax,
        proyectos,
        total_unidades: unidades.length,
        unidades,
      });
    }

    // Normalizar fechas para filtros
    const filtroDesde = fecha || desde || null;
    const filtroHasta = fecha || hasta || null;
    const filtroProyecto = proyecto_id && proyecto_id !== "ALL" ? String(proyecto_id).trim() : null;

    // Si hay filtro por proyecto, determinar los equipos e identificadores de patente asociados a ese proyecto
    let proyectoEquipoIds = [];
    let proyectoPatentes = [];
    if (filtroProyecto) {
      const eqsProyecto = todosEquipos.filter((e) => e.proyecto_actual_id === filtroProyecto);
      proyectoEquipoIds = eqsProyecto.map((e) => e.id);
      const patSet = new Set();
      for (const e of eqsProyecto) {
        if (e.patente) {
          const clean = String(e.patente).trim().toUpperCase();
          const noDash = normPatente(clean);
          if (clean) patSet.add(clean);
          if (noDash) patSet.add(noDash);
          if (noDash.length === 6) {
            patSet.add(`${noDash.slice(0, 4)}-${noDash.slice(4)}`);
            patSet.add(`${noDash.slice(0, 2)}-${noDash.slice(2, 4)}-${noDash.slice(4)}`);
          }
        }
        if (e.codigo_interno) {
          const m = String(e.codigo_interno).match(/([A-Z]{2,4}[-\s]?\d{2,4})\s*$/i);
          if (m) {
            const rawP = m[1].trim().toUpperCase();
            const noDash = normPatente(rawP);
            patSet.add(rawP);
            if (noDash) patSet.add(noDash);
            if (noDash.length === 6) {
              patSet.add(`${noDash.slice(0, 4)}-${noDash.slice(4)}`);
            }
          }
        }
      }
      proyectoPatentes = Array.from(patSet);
    }

    const aplicarFiltrosComunes = (q) => {
      let builder = q;
      if (fecha) {
        builder = builder.eq("fecha", fecha);
      } else {
        if (desde) builder = builder.gte("fecha", desde);
        if (hasta) builder = builder.lte("fecha", hasta);
      }
      if (equipo_id) {
        builder = builder.eq("equipo_id", equipo_id);
      }
      if (patente) {
        builder = builder.ilike("patente", `%${patente}%`);
      }
      if (filtroProyecto) {
        const orParts = [];
        if (proyectoEquipoIds.length > 0) {
          orParts.push(`equipo_id.in.(${proyectoEquipoIds.join(",")})`);
        }
        if (proyectoPatentes.length > 0) {
          orParts.push(`patente.in.(${proyectoPatentes.map((p) => `"${p}"`).join(",")})`);
        }
        builder = builder.or(orParts.join(","));
      }
      if (origen) {
        if (origen.toUpperCase() === "CAN") {
          builder = builder.or("origen_km.eq.CAN,origen_combustible.eq.CAN,litros_can.gt.0");
        } else if (origen.toUpperCase() === "GPS") {
          builder = builder.and("origen_km.eq.GPS,origen_combustible.eq.GPS,litros_can.eq.0");
        }
      }
      if (search && search.trim() !== "") {
        const term = `%${search.trim()}%`;
        builder = builder.or(
          `patente.ilike.${term},nombre_conductor.ilike.${term},rut_conductor.ilike.${term},lugar_inicio.ilike.${term},lugar_fin.ilike.${term},nombre_skynav.ilike.${term}`
        );
      }
      return builder;
    };

    let kpis = {
      total_viajes: 0,
      total_km: 0,
      total_km_can: 0,
      total_km_gps: 0,
      total_horas: 0,
      total_combustible_litros: 0,
      total_combustible_can: 0,
      total_combustible_gps: 0,
    };

    // Si se filtró por un proyecto que no tiene ningún equipo asignado, retornar vacío directo
    if (filtroProyecto && proyectoEquipoIds.length === 0 && proyectoPatentes.length === 0) {
      return res.status(200).json({
        success: true,
        total: 0,
        limit: Number(limit) || 100,
        offset: Number(offset) || 0,
        fechas_disponibles: fechasUnicas,
        fecha_min: fechaMin,
        fecha_max: fechaMax,
        proyectos,
        kpis,
        data: [],
      });
    }

    // 2. Calcular KPIs (por RPC si no hay filtro de proyecto, o agregando sobre los equipos del proyecto)
    if (!filtroProyecto) {
      const { data: kpisRpc } = await supabase
        .schema("maquinaria")
        .rpc("get_telemetria_kpis", {
          p_desde: filtroDesde,
          p_hasta: filtroHasta,
          p_patente: patente || null,
          p_origen: origen || null,
          p_search: search || null,
        });

      if (kpisRpc && kpisRpc.length > 0) {
        const row = kpisRpc[0];
        kpis = {
          total_viajes: Number(row.total_viajes) || 0,
          total_km: Number(row.total_km) || 0,
          total_km_can: Number(row.total_km_can) || 0,
          total_km_gps: Number(row.total_km_gps) || 0,
          total_horas: Number(row.total_horas) || 0,
          total_combustible_litros: Number(row.total_combustible) || 0,
          total_combustible_can: Number(row.total_combustible_can) || 0,
          total_combustible_gps: Number(row.total_combustible_gps) || 0,
        };
      }
    } else {
      // Agregar KPIs exactos para el proyecto seleccionado (paginando de a 1000 filas en Supabase)
      let allRows = [];
      let pageIdx = 0;
      const pageSize = 1000;
      while (pageIdx < 50) {
        let qKpi = supabase
          .schema("maquinaria")
          .from("telemetria_viajes")
          .select("km_recorridos, origen_km, origen_combustible, litros_can, litros_gps, tiempo_min, litros_combustible");
        qKpi = aplicarFiltrosComunes(qKpi).range(pageIdx * pageSize, (pageIdx + 1) * pageSize - 1);
        const { data: chunk, error: errChunk } = await qKpi;
        if (errChunk || !chunk || chunk.length === 0) break;
        allRows = allRows.concat(chunk);
        if (chunk.length < pageSize) break;
        pageIdx++;
      }

      let sumKm = 0,
        sumKmCan = 0,
        sumKmGps = 0,
        sumMin = 0,
        sumComb = 0,
        sumCombCan = 0,
        sumCombGps = 0;
      for (const r of allRows) {
        const km = Number(r.km_recorridos) || 0;
        const lCan = Number(r.litros_can) || 0;
        const lGps = Number(r.litros_gps) || 0;
        const lTot = Number(r.litros_combustible) || 0;
        const tMin = Number(r.tiempo_min) || 0;
        const isCanKm = r.origen_km === "CAN" || r.origen_combustible === "CAN" || lCan > 0;
        const isGpsKm =
          r.origen_km === "GPS" &&
          (r.origen_combustible === "GPS" || !r.origen_combustible) &&
          lCan === 0;

        sumKm += km;
        if (isCanKm) sumKmCan += km;
        else if (isGpsKm) sumKmGps += km;
        sumMin += tMin;
        sumComb += lTot;
        if (lCan > 0) sumCombCan += lCan;
        else if (r.origen_combustible === "CAN") sumCombCan += lTot;
        if (lGps > 0) sumCombGps += lGps;
        else if (r.origen_combustible === "GPS") sumCombGps += lTot;
      }

      kpis = {
        total_viajes: allRows.length,
        total_km: Math.round(sumKm * 10) / 10,
        total_km_can: Math.round(sumKmCan * 10) / 10,
        total_km_gps: Math.round(sumKmGps * 10) / 10,
        total_horas: Math.round((sumMin / 60.0) * 10) / 10,
        total_combustible_litros: Math.round(sumComb * 10) / 10,
        total_combustible_can: Math.round(sumCombCan * 10) / 10,
        total_combustible_gps: Math.round(sumCombGps * 10) / 10,
      };
    }

    // 3. Consulta de viajes paginados
    let query = supabase
      .schema("maquinaria")
      .from("telemetria_viajes")
      .select(
        `
        *,
        equipo:equipos!telemetria_viajes_equipo_id_fkey(
          id, codigo_interno, patente, descripcion_equipo, tipo, categoria, proyecto_actual_id,
          proyecto:proyectos(id, nombre_proyecto, codigo_cc)
        )
      `
      );

    query = aplicarFiltrosComunes(query);

    const nLimit = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const nOffset = Math.max(Number(offset) || 0, 0);

    query = query
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false })
      .range(nOffset, nOffset + nLimit - 1);

    const { data: viajesRaw, error: errViajes } = await query;
    if (errViajes) throw errViajes;

    // Enriquecer viajes que no tengan equipo_id directo usando el mapa por patente normalizada
    const viajes = (viajesRaw || []).map((v) => {
      if (!v.equipo && v.patente) {
        const matched = equipoPorPatente.get(normPatente(v.patente));
        if (matched) {
          return { ...v, equipo: matched };
        }
      }
      return v;
    });

    return res.status(200).json({
      success: true,
      total: kpis.total_viajes,
      limit: nLimit,
      offset: nOffset,
      fechas_disponibles: fechasUnicas,
      fecha_min: fechaMin,
      fecha_max: fechaMax,
      proyectos,
      kpis,
      data: viajes,
    });
  } catch (err) {
    console.error("[API telemetria/index GET] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
