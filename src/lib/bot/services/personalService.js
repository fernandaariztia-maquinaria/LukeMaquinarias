export async function buscarPersonal(supabase, phoneClean) {
  if (!phoneClean) return null;
  const digits = String(phoneClean).replace(/[^0-9]/g, "");
  if (!digits) return null;

  const variants = new Set([digits, `+${digits}`]);
  if (digits.startsWith("56") && digits.length === 11) {
    const local9 = digits.slice(2); // 9XXXXXXXX
    variants.add(local9);
    variants.add(`+${local9}`);
  } else if (digits.length === 9 && digits.startsWith("9")) {
    const intl56 = `56${digits}`;
    variants.add(intl56);
    variants.add(`+${intl56}`);
  }

  const orFilter = Array.from(variants).map(v => `whatsapp.eq.${v}`).join(",");
  const { data: personal } = await supabase
    .from("personal")
    .select("*, proyectos(*)")
    .or(orFilter)
    .eq("activo", true)
    .maybeSingle();

  return personal;
}
