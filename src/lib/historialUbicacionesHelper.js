const CLAVE_CONFIG_FALLBACK = "equipos_historial_ubicaciones";

export function calcularDias(fInicio, fFin) {
  if (!fInicio) return 0;
  const d1 = new Date(`${fInicio}T00:00:00`);
  const d2 = fFin ? new Date(`${fFin}T00:00:00`) : new Date();
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return 0;
  const diff = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
}

export async function leerHistorialConfig(supabase) {
  try {
    const { data } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .select("valor")
      .eq("clave", CLAVE_CONFIG_FALLBACK)
      .maybeSingle();

    if (!data?.valor) return [];
    const parsed = JSON.parse(data.valor);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function guardarHistorialConfig(supabase, lista) {
  await supabase
    .schema("maquinaria")
    .from("configuracion_bot")
    .upsert(
      {
        clave: CLAVE_CONFIG_FALLBACK,
        valor: JSON.stringify(lista),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "clave" }
    );
}

export async function registrarCambioUbicacion(supabase, {
  equipo_id,
  proyecto_id,
  proyecto_nombre,
  proyecto_cc,
  fecha_inicio,
  fecha_fin_estimada,
  fecha_salida_anterior,
  motivo_traslado,
  registrado_por,
}) {
  if (!equipo_id) return;
  const hoy = new Date().toISOString().slice(0, 10);
  const fInicioNueva = fecha_inicio || hoy;
  const fSalidaAnt = fecha_salida_anterior || fInicioNueva || hoy;

  // 1. Probar si existe tabla dedicada
  const { error: errTest } = await supabase
    .schema("maquinaria")
    .from("historial_ubicaciones_equipos")
    .select("id")
    .limit(1);

  const usoTabla = !errTest;

  if (usoTabla) {
    // Cerrar asignaciones activas anteriores
    const { data: activas } = await supabase
      .schema("maquinaria")
      .from("historial_ubicaciones_equipos")
      .select("*")
      .eq("equipo_id", equipo_id)
      .eq("estado", "ACTIVA");

    if (activas && activas.length > 0) {
      for (const act of activas) {
        const dias = calcularDias(act.fecha_inicio, fSalidaAnt);
        await supabase
          .schema("maquinaria")
          .from("historial_ubicaciones_equipos")
          .update({
            fecha_fin_real: fSalidaAnt,
            estado: "FINALIZADA",
            dias_reales: dias,
            updated_at: new Date().toISOString(),
          })
          .eq("id", act.id);
      }
    }

    // Si hay nuevo proyecto
    if (proyecto_id) {
      await supabase
        .schema("maquinaria")
        .from("historial_ubicaciones_equipos")
        .insert({
          equipo_id,
          proyecto_id,
          proyecto_nombre: proyecto_nombre || "Obra Asignada",
          proyecto_cc: proyecto_cc || "",
          fecha_inicio: fInicioNueva,
          fecha_fin_estimada: fecha_fin_estimada || null,
          fecha_fin_real: null,
          estado: "ACTIVA",
          dias_reales: 0,
          motivo_traslado: motivo_traslado || "Asignación de obra",
          registrado_por: registrado_por || "Usuario",
        });
    }
  } else {
    // Fallback configuracion_bot
    const list = await leerHistorialConfig(supabase);

    for (const item of list) {
      if (item.equipo_id === equipo_id && item.estado === "ACTIVA") {
        item.fecha_fin_real = fSalidaAnt;
        item.estado = "FINALIZADA";
        item.dias_reales = calcularDias(item.fecha_inicio, fSalidaAnt);
        item.updated_at = new Date().toISOString();
      }
    }

    if (proyecto_id) {
      const newEntry = {
        id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        equipo_id,
        proyecto_id,
        proyecto_nombre: proyecto_nombre || "Obra Asignada",
        proyecto_cc: proyecto_cc || "",
        fecha_inicio: fInicioNueva,
        fecha_fin_estimada: fecha_fin_estimada || null,
        fecha_fin_real: null,
        estado: "ACTIVA",
        dias_reales: 0,
        motivo_traslado: motivo_traslado || "Asignación de obra",
        registrado_por: registrado_por || "Usuario",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      list.unshift(newEntry);
    }

    await guardarHistorialConfig(supabase, list);
  }
}
