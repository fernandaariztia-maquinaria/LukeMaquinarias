import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { formatEquipoLabel } from "./equipoLabel.js";

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "evidencias-montaje";

// Cliente Supabase para storage (singleton simple)
let _storageClient = null;
function getStorageClient() {
  if (_storageClient) return _storageClient;
  _storageClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
  return _storageClient;
}

// Descarga imagen desde Supabase Storage y retorna Buffer
async function downloadStorageImage(storagePath) {
  try {
    const supabase = getStorageClient();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .download(storagePath);

    if (error || !data) return null;

    // Blob → Buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (err) {
    console.error("[pdf-generator] Error descargando imagen de Storage:", err.message);
    return null;
  }
}

// Filtro de limpieza para sanitizar strings y remover retazos de markdown, LaTeX o emojis no soportados por Helvetica WinAnsi
function sanitizarTexto(texto) {
  if (!texto) return "";
  return String(texto)
    // Eliminar fórmulas matemáticas estilo LaTeX como $B=\overline{UI}$ o $\emptyset=UI$ o similares
    .replace(/\$[^\$]+\$/g, "")
    // Eliminar emojis y pictogramas Unicode que causan mojibake (ej: Ø=ÜÍ) en fuentes estándar PDFKit
    .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{200D}]/gu, "")
    // Reemplazar tabulaciones por espacio
    .replace(/\t+/g, " ")
    // Eliminar markdown como asteriscos, guiones bajos excesivos, etc.
    .replace(/\*\*+/g, "")
    .replace(/__+/g, "")
    .replace(/`/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Calcula las horas trabajadas priorizando diferencia de horómetro (Hr. Final - Hr. Inicio)
function calcularDuracionEfectiva(eventos, horasGuardadas, horometroInicio, horometroFinal) {
  if (horometroFinal !== null && horometroFinal !== undefined && horometroInicio !== null && horometroInicio !== undefined) {
    const diff = Number(horometroFinal) - Number(horometroInicio);
    if (!Number.isNaN(diff) && diff >= 0) {
      const redondeado = Number.isInteger(diff) ? diff : Number(diff.toFixed(1));
      return `${redondeado.toLocaleString("es-CL")} hrs`;
    }
  }

  if (horasGuardadas !== null && horasGuardadas !== undefined) {
    return `${Number(horasGuardadas).toLocaleString("es-CL")} hrs`;
  }

  if (!eventos || eventos.length === 0) {
    return "—";
  }

  const inicio = new Date(eventos[0].hora_evento);
  const fin = new Date(eventos[eventos.length - 1].hora_evento);
  const difMs = fin - inicio;

  if (difMs > 0) {
    const totalMinutos = Math.floor(difMs / 60000);
    const horas = Math.floor(totalMinutos / 60);
    const minutos = totalMinutos % 60;

    if (horas === 0) {
      return `${minutos} min`;
    } else if (minutos === 0) {
      return `${horas} hrs`;
    } else {
      return `${horas}h ${minutos}m`;
    }
  }

  return "—";
}

/**
 * Genera el PDF del reporte diario de jornada.
 * Guarda el archivo en /public/reportes/YYYY/MM/[id_reporte].pdf
 * Retorna la URL pública relativa.
 */
export async function generarReportePDF({
  reporte,
  equipo,
  operador,
  supervisor,
  eventos,
  evidencias,
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const fecha = new Date(reporte.fecha);
      const anio = fecha.getFullYear();
      const mes = String(fecha.getMonth() + 1).padStart(2, "0");

      // Carpeta de destino dentro de public/
      const dirPath = path.join(process.cwd(), "public", "reportes", String(anio), mes);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      const fileName = `${reporte.id}.pdf`;
      const filePath = path.join(dirPath, fileName);
      const publicUrl = `/reportes/${anio}/${mes}/${fileName}`;

      // ============================================================
      // CONFIGURACIÓN DEL DOCUMENTO (con bufferPages para paginación)
      // ============================================================
      const doc = new PDFDocument({
        size: "A4",
        margins: { top: 40, bottom: 35, left: 50, right: 50 },
        bufferPages: true,
        info: {
          Title: `Reporte Diario - ${equipo.descripcion_equipo} - ${reporte.fecha}`,
          Author: "LukeEquipos Sistema de Control Operacional",
          Subject: `Jornada ${operador.nombre_completo}`,
        },
      });

      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Colores corporativos
      const AZUL_OSCURO = "#101c33";
      const AZUL_ACENTO = "#2563eb";
      const GRIS_CLARO = "#f8fafc";
      const NARANJA = "#ff303e";
      const VERDE = "#16a34a";
      const ROJO = "#dc2626";
      const AMARILLO = "#d97706";

      const colorEstado = (estado) => {
        switch (estado) {
          case "Trabajando":
          case "Equipo Operativo": return VERDE;
          case "Disponible": return AZUL_ACENTO;
          case "En Colacion": return AMARILLO;
          case "Detenido por Falla": return ROJO;
          default: return AZUL_ACENTO;
        }
      };

      const W = doc.page.width - 100; // ancho útil

      // ============================================================
      // CABECERA CORPORATIVA
      // ============================================================
      const pathLogo = path.join(process.cwd(), "public", "logo-eimisa.png");
      if (fs.existsSync(pathLogo)) {
        doc.image(pathLogo, 54, 55, { width: 120 });
      } else {
        // Fallback si la imagen no se encontrara
        doc.fontSize(16).font("Helvetica-Bold").fillColor(AZUL_OSCURO).text("EIMISA", 54, 60);
        doc.fontSize(9).font("Helvetica").fillColor("#64748b").text("LukeEquipos", 54, 78);
      }

      // Título en el centro con espaciado vertical dinámico y alineación centrada (sin solapamiento)
      const tituloX = 165;
      const tituloW = 215;
      doc
        .fillColor(AZUL_OSCURO)
        .fontSize(11.5)
        .font("Helvetica-Bold")
        .text("REPORTE DIARIO DE JORNADA", tituloX, 48, { width: tituloW, align: "center" });

      const subY = Math.max(doc.y + 3, 67);
      doc
        .fontSize(8.5)
        .font("Helvetica")
        .fillColor("#475569")
        .text("LukeEquipos — Control Operacional", tituloX, subY, { width: tituloW, align: "center" });

      const genY = Math.max(doc.y + 2, 81);
      doc
        .fontSize(7.5)
        .font("Helvetica")
        .fillColor("#64748b")
        .text(`Generado: ${new Date().toLocaleString("es-CL")}`, tituloX, genY, { width: tituloW, align: "center" });

      // Código de equipo a la derecha en una pastilla proporcionada y con ajuste dinámico
      const codeW = 160;
      const codeX = 50 + W - codeW;
      const codeBadgeH = 50;
      doc.roundedRect(codeX, 46, codeW, codeBadgeH, 5).fillAndStroke("#f8fafc", "#cbd5e1");
      doc
        .fontSize(7)
        .font("Helvetica-Bold")
        .fillColor("#64748b")
        .text("CÓDIGO DE EQUIPO", codeX, 51, { width: codeW, align: "center" });

      const labelEq = formatEquipoLabel(equipo);
      const codeFontSize = labelEq.length > 24 ? 7.5 : (labelEq.length > 16 ? 8.5 : 9.5);
      doc
        .fontSize(codeFontSize)
        .font("Helvetica-Bold")
        .fillColor(NARANJA)
        .text(labelEq, codeX + 4, 63, { width: codeW - 8, align: "center", lineGap: 1 });

      // Línea divisoria inferior de la cabecera
      doc.moveTo(50, 115).lineTo(50 + W, 115).strokeColor(AZUL_ACENTO).lineWidth(2).stroke();

      // ============================================================
      // SECCIÓN 1: DATOS DEL EQUIPO Y PERSONAL
      // ============================================================
      let y = 130;

      // Banner de Alerta / Inconsistencia si el reporte fue marcado como OBSERVADO
      const obsTexto = String(reporte.observaciones || "");
      const esObservado = reporte.estado_final === "Observado" ||
        obsTexto.includes("[ALERTA INCONSISTENCIA]") ||
        obsTexto.includes("[OBSERVADO]") ||
        obsTexto.includes("cierre automático") ||
        obsTexto.includes("Cierre automático") ||
        (reporte.horometro_final != null && reporte.horometro_inicio != null && Number(reporte.horometro_final) <= Number(reporte.horometro_inicio) && eventos.some(e => e.estado_hito === "Trabajando"));

      let alertaMotivo = null;
      if (esObservado) {
        if (obsTexto.includes("[ALERTA INCONSISTENCIA]")) {
          alertaMotivo = "Actividad declarada con 0 horas de avance de horómetro o lectura inconsistente.";
        } else if (obsTexto.includes("cierre automático") || obsTexto.includes("Cierre automático")) {
          alertaMotivo = "Cierre automático por cumplimiento del límite de 12 horas de jornada.";
        } else if (reporte.horometro_final != null && Number(reporte.horometro_final) < Number(reporte.horometro_inicio)) {
          alertaMotivo = `Horómetro final (${reporte.horometro_final}) menor al inicial (${reporte.horometro_inicio}).`;
        } else if (Number(reporte.horometro_final) === Number(reporte.horometro_inicio)) {
          alertaMotivo = "Horómetro final igual al inicial (0 hrs de avance) con actividad declarada.";
        } else {
          alertaMotivo = "Reporte con observaciones operacionales para revisión y auditoría.";
        }

        doc.roundedRect(50, y, W, 24, 4).fillAndStroke("#fef2f2", "#ef4444");
        doc.fontSize(8).font("Helvetica-Bold").fillColor("#b91c1c").text(`⚠️ REPORTE OBSERVADO: ${alertaMotivo}`, 58, y + 7, { width: W - 16 });
        y += 30;
      }

      // Banner de sección con color sólido
      doc.rect(50, y, W, 22).fill(AZUL_OSCURO);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("white").text("INFORMACIÓN DEL TURNO", 60, y + 6);
      y += 32;

      const filaInfo = (label, value, x = 50, yPos = y, maxWidth = 140) => {
        doc.fontSize(9).font("Helvetica-Bold").fillColor("#64748b").text(label.toUpperCase(), x, yPos, { width: maxWidth });
        doc.fontSize(10.5).font("Helvetica").fillColor(AZUL_OSCURO).text(sanitizarTexto(value) || "—", x, yPos + 13, { width: maxWidth });
      };

      filaInfo("Equipo", equipo.descripcion_equipo, 50, y, 220);
      filaInfo("Código", formatEquipoLabel(equipo), 280, y, 140);
      filaInfo("Proveedor", equipo.proveedor, 430, y, 115);
      y += 45;

      filaInfo("Operador", operador.nombre_completo, 50, y, 220);
      filaInfo("Supervisor", supervisor?.nombre_completo || "N/A", 280, y, 140);
      filaInfo("Fecha", reporte.fecha, 430, y, 115);
      y += 45;

      // ============================================================
      // SECCIÓN 2: HORÓMETROS Y COMBUSTIBLE
      // ============================================================
      doc.rect(50, y, W, 22).fill(AZUL_OSCURO);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("white").text("HORÓMETROS Y COMBUSTIBLE", 60, y + 6);
      y += 32;

      // Calcular duración efectiva real (priorizando diferencia de horómetro)
      const horasEfectivasStr = calcularDuracionEfectiva(
        eventos,
        reporte.horas_trabajadas,
        reporte.horometro_inicio,
        reporte.horometro_final
      );

      // Caja de métricas
      const boxW = (W - 18) / 4; 
      const esVehiculo = equipo.tipo_seguimiento === 'vehiculo';

      const formatCombustibleValor = (litros) => {
        if (litros === 0 || litros === "0") return "Sin carga";
        if (litros != null && Number(litros) > 0) return `${Number(litros).toLocaleString("es-CL")} L`;
        return "Sin carga";
      };

      const metricas = esVehiculo
        ? [
            { label: "Odóm. Inicio", value: reporte.km_inicial ? `${reporte.km_inicial.toLocaleString("es-CL")} km` : "—" },
            { label: "Odóm. Final", value: reporte.km_final ? `${reporte.km_final.toLocaleString("es-CL")} km` : "—" },
            { label: "Km Recorridos", value: (reporte.km_final && reporte.km_inicial) ? `${(reporte.km_final - reporte.km_inicial).toLocaleString("es-CL")} km` : "—" },
            { label: "Combustible", value: formatCombustibleValor(reporte.petroleo_litros) },
          ]
        : [
            { label: "Hr. Inicio", value: reporte.horometro_inicio?.toLocaleString("es-CL") || "—" },
            { label: "Hr. Final", value: reporte.horometro_final?.toLocaleString("es-CL") || "—" },
            { label: "Horas Trabajadas", value: horasEfectivasStr },
            { label: "Combustible", value: formatCombustibleValor(reporte.petroleo_litros) },
          ];

      metricas.forEach((m, i) => {
        const bx = 50 + i * (boxW + 6);
        doc.rect(bx, y, boxW, 55).fill(i % 2 === 0 ? GRIS_CLARO : "white").stroke("#e2e8f0");
        doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#64748b").text(m.label.toUpperCase(), bx + 8, y + 8);
        
        // Ajustar tamaño de fuente dinámicamente si el valor es largo
        const length = String(m.value).length;
        const fontSizeVal = length > 12 ? 8.5 : (length > 8 ? 10.5 : 13);
        
        doc.fontSize(fontSizeVal).font("Helvetica-Bold").fillColor(AZUL_OSCURO).text(m.value, bx + 8, y + 24, { width: boxW - 16 });
      });
      y += 75;

      // ============================================================
      // SECCIÓN 3: LÍNEA DE TIEMPO DE HITOS
      // ============================================================
      doc.rect(50, y, W, 22).fill(AZUL_OSCURO);
      doc.fontSize(10).font("Helvetica-Bold").fillColor("white").text("LÍNEA DE TIEMPO DE JORNADA", 60, y + 6);
      y += 32;

      if (eventos && eventos.length > 0) {
        // Encabezados de tabla
        doc.rect(50, y, W, 20).fill(AZUL_OSCURO);
        doc.fontSize(8.5).font("Helvetica-Bold").fillColor("white");
        
        const colHoraX = 55;
        const colEstadoX = 125;
        const colEspecX = 245;
        const colNotaX = 365;
        
        const colHoraW = 60;
        const colEstadoW = 110;
        const colEspecW = 110;
        const colNotaW = W - (colHoraW + colEstadoW + colEspecW) - 10;
        
        doc.text("HORA", colHoraX, y + 6, { width: colHoraW });
        doc.text("ESTADO", colEstadoX, y + 6, { width: colEstadoW });
        doc.text(esVehiculo ? "INFO ADICIONAL" : "ESPECIALIDAD", colEspecX, y + 6, { width: colEspecW });
        doc.text("NOTA", colNotaX, y + 6, { width: colNotaW });
        
        y += 20;

        eventos.forEach((ev, i) => {
          const hora = new Date(ev.hora_evento).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

          // Sanitizar y limpiar la nota para evitar prefijos técnicos
          let notaRaw = ev.nota_transcripcion || "—";
          notaRaw = notaRaw
            .replace(/^📍?\s*Check-?in\s*(?:Web)?\s*\[[^\]]+\]:\s*/i, "Inicio de turno: ")
            .replace(/^📍?\s*Check-?in\s*(?:Web)?:\s*/i, "Inicio de turno: ")
            .replace(/^CHECK-?OUT\s*(?:Web)?:\s*/i, "Término de jornada: ")
            .replace(/^Check-?out\s*(?:Web)?:\s*/i, "Término de jornada: ")
            .replace(/\bcheck-?in\s*(?:web)?\b/gi, "inicio de turno")
            .replace(/\bcheck-?out\s*(?:web)?\b/gi, "término de jornada")
            .replace(/\s*\|\s*Ubicación:.*$/i, "")
            .replace(/\s*Ubicación:\s*Lat\s*[-0-9.]+,?\s*Lng\s*[-0-9.]+.*$/i, "");
          const notaLimpia = sanitizarTexto(notaRaw);
          const notaHeight = doc.fontSize(8.5).heightOfString(notaLimpia, { width: colNotaW, lineGap: 2 });
          const rowHeight = Math.max(22, notaHeight + 14);

          // Nueva página si esta fila no cabe entera
          if (y + rowHeight > doc.page.height - 120) {
            doc.addPage();
            y = 50;

            // Repetir encabezados en nueva página
            doc.rect(50, y, W, 20).fill(AZUL_OSCURO);
            doc.fontSize(8.5).font("Helvetica-Bold").fillColor("white");
            doc.text("HORA", colHoraX, y + 6, { width: colHoraW });
            doc.text("ESTADO", colEstadoX, y + 6, { width: colEstadoW });
            doc.text(esVehiculo ? "INFO ADICIONAL" : "ESPECIALIDAD", colEspecX, y + 6, { width: colEspecW });
            doc.text("NOTA", colNotaX, y + 6, { width: colNotaW });
            y += 20;
          }

          const bgColor = i % 2 === 0 ? GRIS_CLARO : "white";
          doc.rect(50, y, W, rowHeight).fill(bgColor).stroke("#e2e8f0");

          doc.fontSize(8.5).font("Helvetica").fillColor(AZUL_OSCURO).text(hora, colHoraX, y + 7, { width: colHoraW });
          doc.fillColor(colorEstado(ev.estado_hito)).font("Helvetica-Bold").text(ev.estado_hito, colEstadoX, y + 7, { width: colEstadoW });
          doc.fillColor(AZUL_OSCURO).font("Helvetica").text(esVehiculo ? "—" : (ev.especialidad_nombre || "—"), colEspecX, y + 7, { width: colEspecW });
          doc.font("Helvetica").text(notaLimpia, colNotaX, y + 7, { width: colNotaW, lineGap: 2 });

          y += rowHeight;
        });
      } else {
        doc.fontSize(10).fillColor("#94a3b8").text("Sin hitos registrados en esta jornada.", 50, y + 5);
        y += 25;
      }

      // ============================================================
      // SECCIÓN 4: EVIDENCIAS FOTOGRÁFICAS
      // ============================================================
      if (evidencias && evidencias.length > 0) {
        y += 15;
        if (y > doc.page.height - 200) { doc.addPage(); y = 50; }

        doc.rect(50, y, W, 22).fill(AZUL_OSCURO);
        doc.fontSize(10).font("Helvetica-Bold").fillColor("white").text("EVIDENCIAS FOTOGRÁFICAS", 60, y + 6);
        y += 32;

        for (const [i, ev] of evidencias.entries()) {
          // Verificar si cabe el título de la evidencia y la imagen
          if (y > doc.page.height - 240) { doc.addPage(); y = 50; }

          doc.rect(50, y, W, 1).fill("#cbd5e1");
          y += 10;
          
          doc.fontSize(9.5).font("Helvetica-Bold").fillColor("#475569").text(`EVIDENCIA ${i + 1}`, 50, y);
          y += 15;

          // Intentar embeber imagen desde Supabase Storage
          let imagenDibujada = false;
          try {
            if (ev.local_storage_path && ev.local_storage_path !== 'upload-error') {
              const imageBuffer = await downloadStorageImage(ev.local_storage_path);
              if (imageBuffer) {
                // Centrar la imagen en un recuadro redondeado delgado
                const boxW = 220;
                const boxH = 170;
                const boxX = 50 + (W - boxW) / 2;
                const boxY = y;
                
                doc.roundedRect(boxX, boxY, boxW, boxH, 8).lineWidth(1).strokeColor("#cbd5e1").stroke();
                doc.image(imageBuffer, boxX + 10, boxY + 10, { width: boxW - 20, height: boxH - 20 });
                
                y += boxH + 15;
                imagenDibujada = true;
              }
            }
          } catch (errImg) {
            console.error("[pdf-generator] Error embebiendo imagen:", errImg.message);
          }

          if (!imagenDibujada) {
            doc.fontSize(9).font("Helvetica-Oblique").fillColor("#94a3b8").text("[Fotografía de evidencia no disponible en este momento]", 50, y);
            y += 20;
          }

          // Verificar si cabe el análisis técnico
          if (y > doc.page.height - 120) { doc.addPage(); y = 50; }

          doc.fontSize(9.5).font("Helvetica-Bold").fillColor(AZUL_OSCURO).text("Análisis Técnico de Inspección:", 50, y);
          y += 15;

          // Renderizar el análisis estructurado línea por línea
          const descripcionAnalisis = ev.descripcion_analisis_ia || "Sin análisis IA disponible.";
          const lineas = descripcionAnalisis.split("\n");
          
          lineas.forEach(linea => {
            if (y > doc.page.height - 60) { doc.addPage(); y = 50; }
            
            // Sanitizar la línea y verificar si es un encabezado/título de sección
            const lineaSanitizada = sanitizarTexto(linea);
            if (lineaSanitizada.trim().length === 0) return;
            
            const esTituloSec = /^\d+\.\s|Descripción técnica|Detección de anomalías|Nivel de urgencia/i.test(lineaSanitizada);
            
            doc.fontSize(9)
               .font(esTituloSec ? "Helvetica-Bold" : "Helvetica")
               .fillColor(AZUL_OSCURO)
               .text(lineaSanitizada, 50, y, { width: W, lineGap: 3 });
               
            y += doc.heightOfString(lineaSanitizada, { width: W, lineGap: 3 }) + 3;
          });
          
          y += 15;
        }
      }

      // ============================================================
      // GENERACIÓN GLOBAL DE PIE DE PÁGINA (Paginación Dinámica)
      // ============================================================
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        
        const pageNum = i + 1;
        const totalPages = range.count;
        const bottomY = doc.page.height - 40;
        
        // Línea divisoria gris
        doc.moveTo(50, bottomY - 5)
           .lineTo(50 + W, bottomY - 5)
           .strokeColor("#e2e8f0")
           .lineWidth(1)
           .stroke();
        
        doc.fontSize(8).font("Helvetica").fillColor("#64748b");
        
        // Suprimir temporalmente margin inferior para evitar salto de página fantasma
        const oldBottomMargin = doc.page.margins.bottom;
        doc.page.margins.bottom = 0;

        // ID de reporte y operador a la izquierda
        doc.text(`ID Reporte: ${reporte.id} | Operador: ${operador.nombre_completo}`, 50, bottomY, { width: W - 100, align: "left", lineBreak: false });
        
        // Paginación a la derecha
        doc.text(`Página ${pageNum} de ${totalPages}`, 50 + W - 100, bottomY, { width: 100, align: "right", lineBreak: false });

        doc.page.margins.bottom = oldBottomMargin;
      }

      doc.end();

      writeStream.on("finish", () => resolve(publicUrl));
      writeStream.on("error", reject);
    } catch (err) {
      reject(err);
    }
  });
}
