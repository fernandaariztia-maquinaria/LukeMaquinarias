// Algunos operadores reconocen su equipo por la patente antes que por el
// codigo_interno -- se muestra "codigo - patente" cuando la patente no esté ya incluida.
export function formatEquipoLabel(equipo) {
  if (!equipo) return "";
  const cod = String(equipo.codigo_interno || "").trim();
  const pat = String(equipo.patente || "").trim();
  if (!pat) return cod;
  if (!cod) return pat;
  
  const patClean = pat.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const codClean = cod.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (codClean.includes(patClean)) {
    return cod;
  }
  return `${cod} - ${pat}`;
}

