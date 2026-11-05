import { createAdminClient } from "../../../../lib/supabase-server";
import { formatearPatente, clasificarTipoEquipo, normalizarPatente } from "../../../../lib/telemetriaUtils";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const supabase = createAdminClient();
  const {
    desde,
    hasta,
    proyecto_id,
    patente,
    conductor,
    tipo_equipo = "todos",
    user_rol = "",
    user_proyecto_id = "",
  } = req.query;

  try {
    // 1. Verificación de permisos de proyecto (Regla: sólo administradores pueden ver todos los proyectos)
    const esAdmin =
      String(user_rol || "").toLowerCase().includes("admin") ||
      String(user_rol || "").toLowerCase() === "administrador";

    // Si NO es administrador, forzar el proyecto al asignado a su obra
    let filtroProyecto = null;
    if (!esAdmin) {
      if (user_proyecto_id && user_proyecto_id.trim() !== "") {
        filtroProyecto = user_proyecto_id.trim();
      }
    } else {
      if (proyecto_id && proyecto_id !== "ALL" && proyecto_id.trim() !== "") {
        filtroProyecto = proyecto_id.trim();
      }
    }

    // 2. Obtener lista de proyectos y equipos desde Supabase (esquema maquinaria)
    const [{ data: proyectosRaw }, { data: equiposRaw }, { data: fechasRaw }] =
      await Promise.all([
        supabase
          .schema("maquinaria")
          .from("proyectos")
          .select("id, nombre_proyecto, codigo_cc, estado")
          .order("nombre_proyecto", { ascending: true }),
        supabase
          .schema("maquinaria")
          .from("equipos")
          .select(
            "id, codigo_interno, patente, descripcion_equipo, tipo, categoria, marca, modelo, proyecto_actual_id, proyectos(id, nombre_proyecto)"
          ),
        supabase
          .schema("maquinaria")
          .from("telemetria_fechas_disponibles")
          .select("fecha"),
      ]);

    const proyectos = proyectosRaw || [];
    const todosEquipos = equiposRaw || [];
    const fechasUnicas = (fechasRaw || []).map((f) => f.fecha);
    const fechaMinDefault = fechasUnicas[fechasUnicas.length - 1] || "2026-10-01";
    const fechaMaxDefault = fechasUnicas[0] || new Date().toISOString().slice(0, 10);

    const fDesde = desde || fechaMinDefault;
    const fHasta = hasta || fechaMaxDefault;

    // Normalizador de patentes para cruce robusto
    const normPat = (p) =>
      String(p || "")
        .replace(/[^A-Z0-9]/gi, "")
        .toUpperCase();

    // Mapas de equipos
    const equipoPorId = new Map(todosEquipos.map((e) => [e.id, e]));
    const equipoPorPatente = new Map();
    for (const eq of todosEquipos) {
      if (eq.patente) {
        equipoPorPatente.set(normPat(eq.patente), eq);
      }
      if (eq.codigo_interno) {
        const m = String(eq.codigo_interno).match(/([A-Z]{2,4}[-\s]?\d{2,4})\s*$/i);
        if (m) {
          equipoPorPatente.set(normPat(m[1]), eq);
        }
      }
    }

    // Filtrar equipos si hay filtro de proyecto
    let proyectoEquipoIds = new Set();
    let proyectoPatentesNorm = new Set();
    if (filtroProyecto) {
      for (const eq of todosEquipos) {
        if (eq.proyecto_actual_id === filtroProyecto) {
          proyectoEquipoIds.add(eq.id);
          if (eq.patente) proyectoPatentesNorm.add(normPat(eq.patente));
          if (eq.codigo_interno) {
            const m = String(eq.codigo_interno).match(/([A-Z]{2,4}[-\s]?\d{2,4})\s*$/i);
            if (m) proyectoPatentesNorm.add(normPat(m[1]));
          }
        }
      }
    }

    // 3. Consultar viajes estructurados en el rango de fechas solicitado
    // Paginamos de a 10,000 para cargar todo el período sin límites de PostgREST
    let allViajes = [];
    let from = 0;
    const step = 10000;
    const maxRows = 60000;

    while (from < maxRows) {
      let query = supabase
        .schema("maquinaria")
        .from("telemetria_viajes")
        .select(
          "id, equipo_id, patente, nombre_skynav, fecha, hora_inicio, hora_fin, tiempo_min, km_recorridos, litros_combustible, litros_can, litros_gps, nombre_conductor, rut_conductor, evento, lugar_inicio, lugar_fin"
        )
        .gte("fecha", fDesde)
        .lte("fecha", fHasta);

      if (patente && patente.trim() !== "") {
        const patSearch = normPat(patente);
        query = query.ilike("patente", `%${patSearch}%`);
      }

      if (conductor && conductor.trim() !== "") {
        const term = `%${conductor.trim()}%`;
        query = query.or(`nombre_conductor.ilike.${term},rut_conductor.ilike.${term}`);
      }

      query = query.range(from, from + step - 1);

      const { data: chunk, error: errChunk } = await query;
      if (errChunk) throw errChunk;
      if (!chunk || chunk.length === 0) break;

      allViajes = allViajes.concat(chunk);
      if (chunk.length < step) break;
      from += step;
    }

    // 4. Procesar y agregar datos
    const porEquipo = new Map();
    const porConductor = new Map();
    const distribucionHoras = Array.from({ length: 24 }, (_, i) => ({
      hora: i,
      etiqueta: `${String(i).padStart(2, "0")}:00`,
      viajes: 0,
      minutos: 0,
      km: 0,
      litros: 0,
    }));

    let globalHorasEfectivas = 0;
    let globalHorasRalenti = 0;
    let globalKm = 0;
    let globalLitros = 0;
    let globalLitrosCan = 0;
    let globalLitrosGps = 0;
    let globalTotalViajes = 0;
    const fechasActivasSet = new Set();

    for (const v of allViajes) {
      const pNorm = normPat(v.patente);
      const eqMatched =
        (v.equipo_id && equipoPorId.get(v.equipo_id)) ||
        equipoPorPatente.get(pNorm) ||
        null;

      // Si hay filtro de proyecto activo, descartar viajes que no pertenezcan al proyecto
      if (filtroProyecto) {
        const pertenece =
          (eqMatched && eqMatched.proyecto_actual_id === filtroProyecto) ||
          proyectoPatentesNorm.has(pNorm) ||
          (v.equipo_id && proyectoEquipoIds.has(v.equipo_id));
        if (!pertenece) continue;
      }

      // Si hay filtro por tipo de equipo, descartar viajes de equipos que no correspondan
      const tipoV = clasificarTipoEquipo(eqMatched || v);
      if (tipo_equipo && tipo_equipo !== "todos" && tipoV !== tipo_equipo) {
        continue;
      }

      globalTotalViajes++;
      if (v.fecha) fechasActivasSet.add(v.fecha);

      const tMin = Number(v.tiempo_min) || 0;
      const km = Number(v.km_recorridos) || 0;
      const litros = Number(v.litros_combustible) || 0;
      const lCan = Number(v.litros_can) || 0;
      const lGps = Number(v.litros_gps) || 0;

      // Criterio de ralentí vs efectivo:
      // Cuando la distancia es <= 0.1 km y tiempo > 0, corresponde a ralentí (motor encendido detenido)
      const esRalenti = km <= 0.1;
      const minRalenti = esRalenti ? tMin : 0;
      const minEfectivo = esRalenti ? 0 : tMin;

      globalHorasRalenti += minRalenti / 60;
      globalHorasEfectivas += minEfectivo / 60;
      globalKm += km;
      globalLitros += litros;
      globalLitrosCan += lCan;
      globalLitrosGps += lGps;

      // 4.1 Agregación por Equipo / Patente
      const eqKey = eqMatched?.id || pNorm || v.nombre_skynav || "DESCONOCIDO";
      if (!porEquipo.has(eqKey)) {
        const rawPat = eqMatched?.patente || v.patente || "S/P";
        porEquipo.set(eqKey, {
          equipo_id: eqMatched?.id || null,
          patente: formatearPatente(rawPat),
          patente_raw: rawPat,
          codigo_interno: eqMatched?.codigo_interno || v.nombre_skynav || v.patente || "S/C",
          descripcion: eqMatched?.descripcion_equipo || eqMatched?.tipo || "Equipo / Vehículo",
          tipo: eqMatched?.tipo || "Flota",
          categoria: eqMatched?.categoria || "Vehículo Liviano",
          tipo_clasificado: clasificarTipoEquipo(eqMatched || v),
          marca: eqMatched?.marca || "",
          modelo: eqMatched?.modelo || "",
          proyecto_id: eqMatched?.proyecto_actual_id || null,
          proyecto_nombre:
            eqMatched?.proyectos?.nombre_proyecto ||
            proyectos.find((p) => p.id === eqMatched?.proyecto_actual_id)?.nombre_proyecto ||
            "Sin Asignar",
          tiempo_min_total: 0,
          min_efectivo: 0,
          min_ralenti: 0,
          km_total: 0,
          litros_total: 0,
          litros_can: 0,
          litros_gps: 0,
          viajes_total: 0,
          fechas_set: new Set(),
          conductores_map: new Map(),
        });
      }

      const eqStat = porEquipo.get(eqKey);
      eqStat.tiempo_min_total += tMin;
      eqStat.min_efectivo += minEfectivo;
      eqStat.min_ralenti += minRalenti;
      eqStat.km_total += km;
      eqStat.litros_total += litros;
      eqStat.litros_can += lCan;
      eqStat.litros_gps += lGps;
      eqStat.viajes_total += 1;
      if (v.fecha) eqStat.fechas_set.add(v.fecha);

      if (v.nombre_conductor && v.nombre_conductor.trim() !== "") {
        const condName = v.nombre_conductor.trim();
        eqStat.conductores_map.set(
          condName,
          (eqStat.conductores_map.get(condName) || 0) + tMin
        );
      }

      // 4.2 Agregación por Conductor
      if (v.nombre_conductor && v.nombre_conductor.trim() !== "") {
        const condKey = v.nombre_conductor.trim();
        if (!porConductor.has(condKey)) {
          porConductor.set(condKey, {
            nombre: condKey,
            rut: v.rut_conductor || "S/R",
            tiempo_min: 0,
            km_total: 0,
            litros_total: 0,
            viajes: 0,
            vehiculos_set: new Set(),
          });
        }
        const condStat = porConductor.get(condKey);
        condStat.tiempo_min += tMin;
        condStat.km_total += km;
        condStat.litros_total += litros;
        condStat.viajes += 1;
        if (v.patente) condStat.vehiculos_set.add(v.patente);
      }

      // 4.3 Agregación de Distribución Horaria
      if (v.hora_inicio) {
        const h = parseInt(v.hora_inicio.slice(0, 2), 10);
        if (!isNaN(h) && h >= 0 && h < 24) {
          distribucionHoras[h].viajes += 1;
          distribucionHoras[h].minutos += tMin;
          distribucionHoras[h].km += km;
          distribucionHoras[h].litros += litros;
        }
      }
    }

    // 5. Formatear listas de equipos y rankings
    const listaEquiposDash = Array.from(porEquipo.values()).map((e) => {
      const horasTotales = Math.round((e.tiempo_min_total / 60) * 10) / 10;
      const horasEfectivas = Math.round((e.min_efectivo / 60) * 10) / 10;
      const horasRalenti = Math.round((e.min_ralenti / 60) * 10) / 10;
      const pctRalenti =
        horasTotales > 0 ? Math.round((horasRalenti / horasTotales) * 1000) / 10 : 0;
      const kmTot = Math.round(e.km_total * 10) / 10;
      const litTot = Math.round(e.litros_total * 10) / 10;
      const rend = litTot > 0 ? Math.round((kmTot / litTot) * 10) / 10 : null;

      // Obtener conductor más frecuente
      let conductorPrincipal = "Sin Registro";
      let maxMinCond = 0;
      for (const [cName, cMin] of e.conductores_map.entries()) {
        if (cMin > maxMinCond) {
          maxMinCond = cMin;
          conductorPrincipal = cName;
        }
      }

      return {
        equipo_id: e.equipo_id,
        patente: e.patente,
        codigo_interno: e.codigo_interno,
        descripcion: e.descripcion,
        tipo: e.tipo,
        categoria: e.categoria,
        marca: e.marca,
        modelo: e.modelo,
        proyecto_id: e.proyecto_id,
        proyecto_nombre: e.proyecto_nombre,
        tipo_clasificado: e.tipo_clasificado || "otros",
        horas_totales: horasTotales,
        horas_efectivas: horasEfectivas,
        horas_ralenti: horasRalenti,
        pct_ralenti: pctRalenti,
        km_totales: kmTot,
        litros_totales: litTot,
        litros_can: Math.round(e.litros_can * 10) / 10,
        litros_gps: Math.round(e.litros_gps * 10) / 10,
        rendimiento_kml: rend,
        viajes_totales: e.viajes_total,
        dias_activos: e.fechas_set.size,
        conductor_principal: conductorPrincipal,
      };
    });

    // Filtrar por tipo de equipo si se especifica
    const equiposFiltradosPorTipo =
      tipo_equipo && tipo_equipo !== "todos"
        ? listaEquiposDash.filter((e) => e.tipo_clasificado === tipo_equipo)
        : listaEquiposDash;

    // 6. Construir rankings específicos (Top de mayor a menor)
    // 6.1 Top Horas de Uso
    const topHorasUso = [...equiposFiltradosPorTipo]
      .filter((e) => e.horas_totales > 0)
      .sort((a, b) => b.horas_totales - a.horas_totales);

    // 6.2 Top Consumo de Combustible
    const topCombustible = [...equiposFiltradosPorTipo]
      .filter((e) => e.litros_totales > 0)
      .sort((a, b) => b.litros_totales - a.litros_totales);

    // 6.3 Top Kilometraje / Distancia
    const topKilometraje = [...equiposFiltradosPorTipo]
      .filter((e) => e.km_totales > 0)
      .sort((a, b) => b.km_totales - a.km_totales);

    // 6.4 Top Ralentí (Equipos con mayor tiempo en ralentí)
    const topRalenti = [...equiposFiltradosPorTipo]
      .filter((e) => e.horas_ralenti > 0)
      .sort((a, b) => b.horas_ralenti - a.horas_ralenti);

    // 6.5 Top Conductores más Activos
    const topConductores = Array.from(porConductor.values())
      .map((c) => ({
        nombre: c.nombre,
        rut: c.rut,
        horas_conducidas: Math.round((c.tiempo_min / 60) * 10) / 10,
        km_totales: Math.round(c.km_total * 10) / 10,
        litros_totales: Math.round(c.litros_total * 10) / 10,
        viajes: c.viajes,
        vehiculos: Array.from(c.vehiculos_set).map(formatearPatente),
      }))
      .sort((a, b) => b.horas_conducidas - a.horas_conducidas)
      .slice(0, 30);

    // 6.6 Formatear distribución horaria
    const distribucionFinal = distribucionHoras.map((d) => ({
      ...d,
      horas_operacion: Math.round((d.minutos / 60) * 10) / 10,
      km: Math.round(d.km * 10) / 10,
      litros: Math.round(d.litros * 10) / 10,
    }));

    // 7. Calcular número de días en el período
    const dIni = new Date(fDesde);
    const dFin = new Date(fHasta);
    const diasEnPeriodo = Math.max(
      1,
      Math.round((dFin.getTime() - dIni.getTime()) / (1000 * 60 * 60 * 24)) + 1
    );

    const totalHorasGlobal = Math.round((globalHorasEfectivas + globalHorasRalenti) * 10) / 10;
    const pctRalentiGlobal =
      totalHorasGlobal > 0
        ? Math.round((globalHorasRalenti / totalHorasGlobal) * 1000) / 10
        : 0;

    return res.status(200).json({
      success: true,
      periodo: {
        desde: fDesde,
        hasta: fHasta,
        dias_totales: diasEnPeriodo,
        dias_con_actividad: fechasActivasSet.size,
      },
      permisos: {
        es_admin: esAdmin,
        proyecto_filtrado: filtroProyecto,
      },
      kpis_globales: {
        total_vehiculos_activos: listaEquiposDash.length,
        total_viajes: globalTotalViajes,
        total_horas: totalHorasGlobal,
        horas_efectivas: Math.round(globalHorasEfectivas * 10) / 10,
        horas_ralenti: Math.round(globalHorasRalenti * 10) / 10,
        pct_ralenti: pctRalentiGlobal,
        total_km: Math.round(globalKm * 10) / 10,
        total_litros: Math.round(globalLitros * 10) / 10,
        litros_can: Math.round(globalLitrosCan * 10) / 10,
        litros_gps: Math.round(globalLitrosGps * 10) / 10,
        rendimiento_promedio:
          globalLitros > 0 ? Math.round((globalKm / globalLitros) * 10) / 10 : null,
      },
      rankings: {
        top_horas_uso: topHorasUso,
        top_consumo_combustible: topCombustible,
        top_kilometraje: topKilometraje,
        top_ralenti: topRalenti,
        top_conductores: topConductores,
      },
      distribucion_horaria: distribucionFinal,
      equipos_disponibles: todosEquipos.map((e) => ({
        id: e.id,
        patente: formatearPatente(e.patente),
        patente_raw: e.patente,
        codigo_interno: e.codigo_interno,
        descripcion: e.descripcion_equipo,
        tipo: e.tipo,
        categoria: e.categoria,
        tipo_clasificado: clasificarTipoEquipo(e),
        proyecto_id: e.proyecto_actual_id,
      })),
      proyectos_disponibles: proyectos,
      fechas_disponibles: {
        min: fechaMinDefault,
        max: fechaMaxDefault,
      },
    });
  } catch (err) {
    console.error("[API telemetria/dashboards GET] Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}

