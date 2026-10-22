import { createAdminClient } from "../../lib/supabase-server";

export default async function handler(req, res) {
  const supabase = createAdminClient();

  if (req.method === "GET") {
    const clave = (req.query.clave || "bot_phone").toString();
    const { data, error } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .select("*")
      .eq("clave", clave)
      .maybeSingle();

    if (error || !data) {
      // Si no existe, retornamos valor por defecto
      return res.status(200).json({ success: true, valor: clave === "bot_phone" ? "56940470139" : null });
    }
    return res.status(200).json({ success: true, valor: data.valor });
  }

  if (req.method === "POST" || req.method === "PATCH") {
    const clave = (req.body.clave || "bot_phone").toString();
    const { valor } = req.body;
    if (!valor || !String(valor).trim()) {
      return res.status(400).json({ success: false, message: "Falta valor" });
    }

    const cleanVal = String(valor).trim();

    const { data, error } = await supabase
      .schema("maquinaria")
      .from("configuracion_bot")
      .upsert(
        {
          clave,
          valor: cleanVal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "clave" }
      )
      .select()
      .single();

    if (error) {
      console.error("[api/config] Error guardando configuracion:", error.message);
      return res.status(500).json({ success: false, error: error.message });
    }
    return res.status(200).json({ success: true, data, valor: data.valor });
  }

  res.setHeader("Allow", ["GET", "POST", "PATCH"]);
  return res.status(405).json({ success: false, message: "Método no permitido" });
}
