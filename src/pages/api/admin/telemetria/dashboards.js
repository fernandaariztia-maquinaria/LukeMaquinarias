import { createAdminClient } from "../../../../lib/supabase-server";
import {
  formatearPatente,
  normalizarPatente,
  clasificarTipoEquipo,
} from "../../../../lib/telemetriaUtils";

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
    busqueda,
    tipo_equipo = "todos",
    user_rol = "",
    user_proyecto_id = "",
  } = req.query;

  // Búsqueda unificada por conductor o patente/vehículo
  const terminoBusqueda = (busqueda || conductor || patente || "").trim();

  try {
    // 1. Verificación de permisos de proyecto (Regla: sólo administradores pueden ver todos los proyectos)
    const esAdmin =
      String(user_rol).toLowerCase().includes("admin") ||
      String(user_rol).toLowerCase() === "administrador";

    let filtroProyecto = null;
    if (esAdmin) {
      if (proyecto_id && proyecto_id.trim() !== "") {
        filtroProyecto = proyecto_id.trim();
      }
    } else {
      if (user_proyecto_id && user_proyecto_id.trim() !== "") {
        filtroProyecto = user_proyecto_id.trim();
      }
    }

    // 2. Cargar Proyectos, Equipos y la Base de Asignaciones de Gerentes / Jefaturas
    const [{ data: proyectosRaw }, { data: equiposRaw }, { data: configGerenciaRaw }] = await Promise.all([
      supabase
        .schema("maquinaria")
        .from("proyectos")
        .select("id, nombre_proyecto, codigo_cc, estado")
        .order("nombre_proyecto", { ascending: true }),
      supabase
        .schema("maquinaria")
        .from("equipos")
        .select(
          "id, codigo_interno, patente, descripcion_equipo, tipo, categoria, marca, modelo, proyecto_actual_id, proyectos(id, nombre_proyecto, codigo_cc)"
        ),
      supabase
        .schema("maquinaria")
        .from("configuracion_bot")
        .select("valor")
        .eq("clave", "telemetria_asignaciones_gerencia")
        .maybeSingle(),
    ]);

    const proyectos = proyectosRaw || [];
    const todosEquipos = equiposRaw || [];

    // Parsear la base de asignaciones de camionetas a gerentes o jefaturas
    let asignacionesGerencia = [];
    try {
      if (configGerenciaRaw?.valor) {
        asignacionesGerencia = JSON.parse(configGerenciaRaw.valor);
      }
    } catch {
      asignacionesGerencia = [];
    }

    const normPat = (p) => normalizarPatente(p);

    // Mapa de gerentes indexado por patente normalizada y código interno
    const mapaGerencia = new Map();
    for (const asig of asignacionesGerencia) {
      if (asig.activo !== false) {
        if (asig.patente) {
          mapaGerencia.set(normPat(asig.patente), asig);
        }
        if (asig.codigo_interno) {
          mapaGerencia.set(normPat(asig.codigo_interno), asig);
        }
      }
    }

    // Identificar patentes si el usuario busca por nombre de gerente asignado
    const patentesGerentesBuscados = new Set();
    if (terminoBusqueda !== "") {
      const termLow = terminoBusqueda.toLowerCase();
      for (const asig of asignacionesGerencia) {
        if (
          (asig.nombre_responsable && asig.nombre_responsable.toLowerCase().includes(termLow)) ||
          (asig.rut_responsable && asig.rut_responsable.toLowerCase().includes(termLow)) ||
          (asig.cargo && asig.cargo.toLowerCase().includes(termLow))
        ) {
          if (asig.patente) patentesGerentesBuscados.add(normPat(asig.patente));
        }
      }
    }

    // Mapa de equipos por patente y código interno para resolver metadatos
    const equipoPorPatente = new Map();
    const equipoPorCodigo = new Map();
    for (const eq of todosEquipos) {
      if (eq.patente) {
        equipoPorPatente.set(normPat(eq.patente), eq);
      }
      if (eq.codigo_interno) {
        equipoPorCodigo.set(normPat(eq.codigo_interno), eq);
      }
    }

    // 3. Rango de Fechas
    const fechaMinDefault = "2026-10-01";
    const fechaMaxDefault = new Date().toISOString().slice(0, 10);
    const fDesde = desde || fechaMinDefault;
    const fHasta = hasta || fechaMaxDefault;

    // 4. Consultar viajes en batches
    let todosViajes = [];
    let from = 0;
    const step = 1000;
    let hayMas = true;

    while (hayMas) {
      let query = supabase
        .schema("maquinaria")
        .from("telemetria_viajes")
        .select(
          "id, equipo_id, identificador_skynav, patente, nombre_skynav, tipo_skynav, subtipo_skynav, evento, fecha, hora_inicio, hora_fin, tiempo_min, km_recorridos, litros_combustible, litros_can, litros_gps, rut_conductor, nombre_conductor"
        )
        .gte("fecha", fDesde)
        .lte("fecha", fHasta);

      // Si hay término de búsqueda directo
      if (terminoBusqueda !== "") {
        const term = `%${terminoBusqueda}%`;
        const patSearch = `%${normPat(terminoBusqueda)}%`;
        let orClause = `nombre_conductor.ilike.${term},rut_conductor.ilike.${term},patente.ilike.${patSearch},nombre_skynav.ilike.${term}`;

        // Si coincide con alguna patente asignada al gerente buscado
        if (patentesGerentesBuscados.size > 0) {
          for (const p of patentesGerentesBuscados) {
            orClause += `,patente.ilike.%${p}%`;
          }
        }
        query = query.or(orClause);
      }

      query = query.range(from, from + step - 1);
      const { data, error } = await query;

      if (error) throw error;

      if (!data || data.length === 0) {
        hayMas = false;
      } else {
        todosViajes.push(...data);
        if (data.length < step) {
          hayMas = false;
        } else {
          from += step;
        }
      }

      if (from >= 50000) hayMas = false;
    }

    // 5. Agregación en memoria de métricas y resolución RFID vs Asignación Gerencia
    const porEquipo = new Map();
    const porConductor = new Map();
    const distribucionHoras = Array.from({ length: 24 }, (_, i) => ({
      hora: i,
      etiqueta: `${String(i).padStart(2, "0")}:00`,
      viajes: 0,
      minutos: 0,
      horas_operacion: 0,
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

    for (const v of todosViajes) {
      const patNorm = normPat(v.patente);
      const nomNorm = normPat(v.nombre_skynav);

      const eqMatched =
        (v.equipo_id && todosEquipos.find((e) => e.id === v.equipo_id)) ||
        equipoPorPatente.get(patNorm) ||
        equipoPorCodigo.get(nomNorm) ||
        equipoPorPatente.get(nomNorm) ||
        null;

      // Filtrado por faena/proyecto si aplica
      if (filtroProyecto) {
        const proyId = eqMatched?.proyecto_actual_id;
        if (!proyId || proyId !== filtroProyecto) {
          continue;
        }
      }

      // Si hay búsqueda unificada activa
      if (terminoBusqueda !== "") {
        const termLow = terminoBusqueda.toLowerCase();
        const patClean = normPat(terminoBusqueda);
        const matchCond =
          (v.nombre_conductor && v.nombre_conductor.toLowerCase().includes(termLow)) ||
          (v.rut_conductor && v.rut_conductor.toLowerCase().includes(termLow));
        const matchVeh =
          (v.patente && (v.patente.toLowerCase().includes(termLow) || normPat(v.patente).includes(patClean))) ||
          (v.nombre_skynav && v.nombre_skynav.toLowerCase().includes(termLow)) ||
          (eqMatched?.patente && normPat(eqMatched.patente).includes(patClean)) ||
          (eqMatched?.codigo_interno && eqMatched.codigo_interno.toLowerCase().includes(termLow)) ||
          (eqMatched?.descripcion_equipo && eqMatched.descripcion_equipo.toLowerCase().includes(termLow)) ||
          patentesGerentesBuscados.has(patNorm) ||
          (eqMatched?.patente && patentesGerentesBuscados.has(normPat(eqMatched.patente)));

        if (!matchCond && !matchVeh) {
          continue;
        }
      }

      globalTotalViajes++;
      if (v.fecha) fechasActivasSet.add(v.fecha);

      const tMin = Number(v.tiempo_min) || 0;
      const km = Number(v.km_recorridos) || 0;
      const litros = Number(v.litros_combustible) || 0;
      const lCan = Number(v.litros_can) || 0;
      const lGps = Number(v.litros_gps) || 0;

      const esRalenti = v.evento === "Trabajando" && km === 0;
      const minRalenti = esRalenti ? tMin : 0;
      const minEfectivo = esRalenti ? 0 : tMin;

      globalHorasEfectivas += minEfectivo / 60;
      globalHorasRalenti += minRalenti / 60;
      globalKm += km;
      globalLitros += litros;
      globalLitrosCan += lCan;
      globalLitrosGps += lGps;

      // 5.1 Agregación por Equipo
      const eqKey = eqMatched?.id || patNorm || v.identificador_skynav || v.id;
      if (!porEquipo.has(eqKey)) {
        porEquipo.set(eqKey, {
          equipo_id: eqMatched?.id || null,
          patente: v.patente || eqMatched?.patente || v.identificador_skynav,
          patente_raw: eqMatched?.patente || v.patente,
          codigo_interno: eqMatched?.codigo_interno || v.nombre_skynav || "",
          descripcion: eqMatched?.descripcion_equipo || v.subtipo_skynav || "Unidad Flota",
          tipo: eqMatched?.tipo || v.tipo_skynav || "Equipo",
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

      // ── REGLA SOLICITADA POR EL USUARIO: RESOLUCIÓN RFID VS BASE DE GERENCIAS ──
      // 1. Revisar si el viaje tiene conductor registrado por sistema RFID
      const tieneRfid =
        v.nombre_conductor &&
        v.nombre_conductor.trim() !== "" &&
        v.nombre_conductor.trim().toUpperCase() !== "SIN REGISTRO";

      let condName = "";
      let condRut = "S/R";
      let esAsignadoGerencia = false;
      let cargoConductor = "";

      if (tieneRfid) {
        // SI TIENE RFID -> SE MANTIENE EL CONDUCTOR REGISTRADO
        condName = v.nombre_conductor.trim();
        condRut = v.rut_conductor?.trim() || "S/R";
        esAsignadoGerencia = false;
      } else {
        // SI NO TIENE RFID -> SE BUSCA EN LA BASE DE GERENTES / JEFATURAS ASIGNADAS
        const patViaje = normPat(v.patente);
        const patEq = eqMatched?.patente ? normPat(eqMatched.patente) : "";
        const codEq = eqMatched?.codigo_interno ? normPat(eqMatched.codigo_interno) : "";
        const asigEncontrada =
          mapaGerencia.get(patViaje) ||
          (patEq && mapaGerencia.get(patEq)) ||
          (codEq && mapaGerencia.get(codEq)) ||
          null;

        if (asigEncontrada) {
          condName = asigEncontrada.nombre_responsable?.trim() || "Gerente Asignado";
          condRut = asigEncontrada.rut_responsable?.trim() || "S/R";
          cargoConductor = asigEncontrada.cargo || "Gerente / Jefatura";
          esAsignadoGerencia = true;
        }
      }

      if (condName) {
        if (!eqStat.conductores_map.has(condName)) {
          eqStat.conductores_map.set(condName, {
            nombre: condName,
            rut: condRut,
            cargo: cargoConductor,
            es_asignado_gerencia: esAsignadoGerencia,
            minutos: 0,
            minutos_rfid: 0,
            minutos_asignados: 0,
            km: 0,
            viajes: 0,
            litros: 0,
          });
        }
        const condEntry = eqStat.conductores_map.get(condName);
        condEntry.minutos += tMin;
        if (tieneRfid) condEntry.minutos_rfid += tMin;
        else condEntry.minutos_asignados += tMin;
        condEntry.km += km;
        condEntry.viajes += 1;
        condEntry.litros += litros;

        // 5.2 Agregación por Conductor
        const condKey = condName;
        if (!porConductor.has(condKey)) {
          porConductor.set(condKey, {
            nombre: condKey,
            rut: condRut,
            cargo: cargoConductor,
            es_asignado_gerencia: esAsignadoGerencia,
            tiempo_min: 0,
            min_rfid: 0,
            min_asignados: 0,
            km_total: 0,
            litros_total: 0,
            viajes: 0,
            vehiculos_set: new Set(),
          });
        }
        const condStat = porConductor.get(condKey);
        condStat.tiempo_min += tMin;
        if (tieneRfid) condStat.min_rfid += tMin;
        else condStat.min_asignados += tMin;
        condStat.km_total += km;
        condStat.litros_total += litros;
        condStat.viajes += 1;
        if (v.patente) condStat.vehiculos_set.add(v.patente);
      }

      // 5.3 Agregación de Distribución Horaria
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

    // 6. Formatear listas de equipos y rankings
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
      for (const [cName, cObj] of e.conductores_map.entries()) {
        const cMin = typeof cObj === "object" ? cObj.minutos : cObj;
        if (cMin > maxMinCond) {
          maxMinCond = cMin;
          conductorPrincipal = cName;
        }
      }

      // Verificar si este vehículo pertenece a la base de gerentes asignados
      const patNorm = normPat(e.patente);
      const asigGerente = mapaGerencia.get(patNorm) || (e.codigo_interno && mapaGerencia.get(normPat(e.codigo_interno))) || null;

      return {
        equipo_id: e.equipo_id,
        patente: e.patente,
        patente_raw: e.patente_raw,
        codigo_interno: e.codigo_interno,
        descripcion: e.descripcion,
        tipo: e.tipo,
        categoria: e.categoria,
        tipo_clasificado: e.tipo_clasificado,
        marca: e.marca,
        modelo: e.modelo,
        proyecto_id: e.proyecto_id,
        proyecto_nombre: e.proyecto_nombre,
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
        cantidad_conductores: e.conductores_map.size,
        es_asignacion_gerencia: Boolean(asigGerente),
        gerente_asignado: asigGerente
          ? {
              nombre: asigGerente.nombre_responsable,
              rut: asigGerente.rut_responsable || "S/R",
              cargo: asigGerente.cargo || "Gerente / Jefatura",
            }
          : null,
      };
    });

    // 7. Filtrado por tipo de equipo
    const equiposFiltradosPorTipo =
      tipo_equipo && tipo_equipo !== "todos"
        ? listaEquiposDash.filter((e) => e.tipo_clasificado === tipo_equipo)
        : listaEquiposDash;

    // 8. Rankings (Completos sin límite, ordenados de mayor a menor)
    // 8.1 Top Horas de Uso
    const topHorasUso = [...equiposFiltradosPorTipo]
      .sort((a, b) => b.horas_totales - a.horas_totales);

    // 8.2 Top Consumo de Combustible
    const topCombustible = [...equiposFiltradosPorTipo]
      .filter((e) => e.litros_totales > 0)
      .sort((a, b) => b.litros_totales - a.litros_totales);

    // 8.3 Top Kilometraje
    const topKilometraje = [...equiposFiltradosPorTipo]
      .filter((e) => e.km_totales > 0)
      .sort((a, b) => b.km_totales - a.km_totales);

    // 8.4 Top Ralentí
    const topRalenti = [...equiposFiltradosPorTipo]
      .filter((e) => e.horas_ralenti > 0)
      .sort((a, b) => b.horas_ralenti - a.horas_ralenti);

    // 8.5 Top Conductores más Activos
    const topConductores = Array.from(porConductor.values())
      .map((c) => ({
        nombre: c.nombre,
        rut: c.rut,
        cargo: c.cargo || "",
        es_asignado_gerencia: c.es_asignado_gerencia || false,
        horas_conducidas: Math.round((c.tiempo_min / 60) * 10) / 10,
        horas_rfid: Math.round((c.min_rfid / 60) * 10) / 10,
        horas_asignadas: Math.round((c.min_asignados / 60) * 10) / 10,
        km_totales: Math.round(c.km_total * 10) / 10,
        litros_totales: Math.round(c.litros_total * 10) / 10,
        viajes: c.viajes,
        vehiculos: Array.from(c.vehiculos_set).map(formatearPatente),
      }))
      .sort((a, b) => b.horas_conducidas - a.horas_conducidas);

    // 8.6 BASE DE CAMIONETAS ASIGNADAS A GERENTES O JEFATURAS (Basada estrictamente en la base de datos detallada)
    const equiposAsignadosGerencia = asignacionesGerencia
      .filter((asig) => asig.activo !== false)
      .map((asig) => {
        const patClean = normPat(asig.patente);
        // Buscar estadísticas en el período
        const eqStat = Array.from(porEquipo.values()).find(
          (e) =>
            normPat(e.patente) === patClean ||
            (asig.codigo_interno && normPat(e.codigo_interno) === normPat(asig.codigo_interno))
        ) || null;

        // Buscar equipo en catálogo general
        const eqCatalogo = todosEquipos.find(
          (e) =>
            normPat(e.patente) === patClean ||
            (asig.codigo_interno && normPat(e.codigo_interno) === normPat(asig.codigo_interno))
        );

        const horasTotales = eqStat ? Math.round((eqStat.tiempo_min_total / 60) * 10) / 10 : 0;
        const horasEfectivas = eqStat ? Math.round((eqStat.min_efectivo / 60) * 10) / 10 : 0;
        const horasRalenti = eqStat ? Math.round((eqStat.min_ralenti / 60) * 10) / 10 : 0;
        const pctRalenti =
          horasTotales > 0 ? Math.round((horasRalenti / horasTotales) * 1000) / 10 : 0;
        const kmTot = eqStat ? Math.round(eqStat.km_total * 10) / 10 : 0;
        const litTot = eqStat ? Math.round(eqStat.litros_total * 10) / 10 : 0;
        const rend = litTot > 0 ? Math.round((kmTot / litTot) * 10) / 10 : null;

        return {
          id: asig.id,
          patente: asig.patente,
          patente_raw: asig.patente,
          codigo_interno: asig.codigo_interno || eqCatalogo?.codigo_interno || "",
          descripcion: eqCatalogo?.descripcion_equipo || "Camioneta Asignada",
          tipo: eqCatalogo?.tipo || "Camionetas",
          tipo_clasificado: clasificarTipoEquipo(eqCatalogo || { patente: asig.patente }),
          marca: eqCatalogo?.marca || "",
          modelo: eqCatalogo?.modelo || "",
          proyecto_id: asig.proyecto_id || eqCatalogo?.proyecto_actual_id || null,
          proyecto_nombre:
            asig.proyecto_nombre ||
            eqCatalogo?.proyectos?.nombre_proyecto ||
            eqStat?.proyecto_nombre ||
            "Faena General",
          nombre_responsable: asig.nombre_responsable,
          rut_responsable: asig.rut_responsable || "S/R",
          cargo: asig.cargo || "Gerente / Jefatura",
          horas_totales: horasTotales,
          horas_efectivas: horasEfectivas,
          horas_ralenti: horasRalenti,
          pct_ralenti: pctRalenti,
          km_totales: kmTot,
          litros_totales: litTot,
          rendimiento_kml: rend,
          viajes_totales: eqStat ? eqStat.viajes_total : 0,
          dias_activos: eqStat ? eqStat.fechas_set.size : 0,
          notas: asig.notas || "",
          activo: asig.activo !== false,
          conductor_principal: asig.nombre_responsable,
        };
      })
      .sort((a, b) => b.horas_totales - a.horas_totales);

    // 8.7 Formatear distribución horaria
    const distribucionFinal = distribucionHoras.map((d) => ({
      ...d,
      horas_operacion: Math.round((d.minutos / 60) * 10) / 10,
      km: Math.round(d.km * 10) / 10,
      litros: Math.round(d.litros * 10) / 10,
    }));

    // 9. Días en el período
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
        equipos_asignados_gerencia: equiposAsignadosGerencia,
        equipos_uso_exclusivo: equiposAsignadosGerencia, // retrocompatibilidad
      },
      asignaciones_gerencia: asignacionesGerencia,
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
