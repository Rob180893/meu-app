import { LineCapStyle, PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { AnnotationsMap, Stroke } from '../types';

function parseHexColor(hex: string) {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return rgb(r / 255, g / 255, b / 255);
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return rgb(r / 255, g / 255, b / 255);
  }
  return rgb(0.07, 0.09, 0.15);
}

/**
 * StandardFonts do pdf-lib usam codificação WinAnsi (Latin-1 + alguns símbolos).
 * Substituímos caracteres fora do WinAnsi para evitar falha ao exportar texto com acentos/símbolos.
 */
function sanitizeWinAnsi(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '?');
}

export function hasAnyAnnotations(annotations: AnnotationsMap): boolean {
  return Object.values(annotations).some((list) => Array.isArray(list) && list.length > 0);
}

function toPdfPoint(
  nx: number,
  ny: number,
  crop: { x: number; y: number; width: number; height: number },
  rot: number
): { x: number; y: number } {
  switch (rot) {
    case 90:
      return {
        x: crop.x + ny * crop.width,
        y: crop.y + nx * crop.height,
      };
    case 180:
      return {
        x: crop.x + (1 - nx) * crop.width,
        y: crop.y + ny * crop.height,
      };
    case 270:
      return {
        x: crop.x + (1 - ny) * crop.width,
        y: crop.y + (1 - nx) * crop.height,
      };
    default:
      return {
        x: crop.x + nx * crop.width,
        y: crop.y + (1 - ny) * crop.height,
      };
  }
}

export async function exportAnnotatedPdfBytes(
  originalBytes: Uint8Array,
  annotations: AnnotationsMap
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalBytes, { ignoreEncryption: true });
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  pages.forEach((page, pageIndex) => {
    const strokes: Stroke[] = annotations[String(pageIndex + 1)] || [];
    if (strokes.length === 0) return;

    const crop = page.getCropBox();
    const rot = ((page.getRotation().angle % 360) + 360) % 360;
    const visualWidth = rot === 90 || rot === 270 ? crop.height : crop.width;

    for (const stroke of strokes) {
      const color = parseHexColor(stroke.c || '#111827');

      if (stroke.t === 'rect' && stroke.rects && stroke.rects.length > 0) {
        for (const r of stroke.rects) {
          const p1 = toPdfPoint(r.x, r.y, crop, rot);
          const p2 = toPdfPoint(r.x + r.w, r.y + r.h, crop, rot);
          page.drawRectangle({
            x: Math.min(p1.x, p2.x),
            y: Math.min(p1.y, p2.y),
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y),
            color,
            opacity: 0.34,
          });
        }
        continue;
      }

      if (!stroke.p || stroke.p.length === 0) continue;

      if (stroke.t === 'text') {
        const rawText = (stroke.txt || '').trim();
        if (!rawText) continue;

        const [nx, ny] = stroke.p[0];
        const fontSize = Math.max(8, (stroke.fs || 0.022) * visualWidth);
        const lineHeight = fontSize * 1.25;
        const lines = sanitizeWinAnsi(rawText).split(/\r?\n/);

        lines.forEach((line, lineIdx) => {
          const offsetYNorm = (lineIdx * lineHeight) / (rot === 90 || rot === 270 ? crop.width : crop.height);
          const anchor = toPdfPoint(nx, ny + offsetYNorm, crop, rot);
          // Pequeno ajuste vertical para alinhar linha-base do texto abaixo do topo clicado
          const baselineShift = fontSize * 0.85;
          const x =
            rot === 90
              ? anchor.x + baselineShift
              : rot === 270
              ? anchor.x - baselineShift
              : anchor.x;
          const y =
            rot === 0
              ? anchor.y - baselineShift
              : rot === 180
              ? anchor.y + baselineShift
              : anchor.y;

          const textWidth = font.widthOfTextAtSize(line || ' ', fontSize);
          if (rot === 0 && line.trim()) {
            page.drawRectangle({
              x: x - 3,
              y: y - fontSize * 0.25,
              width: textWidth + 6,
              height: fontSize * 1.15,
              color: rgb(1, 1, 1),
              opacity: 0.78,
            });
          }

          page.drawText(line, {
            x,
            y,
            size: fontSize,
            font,
            color,
            rotate: rot ? degrees(-rot) : undefined,
          });
        });
        continue;
      }

      const thickness = Math.max(0.75, stroke.w * visualWidth);
      const opacity = stroke.t === 'hl' ? 0.36 : 1;

      if (stroke.p.length === 1) {
        const pt = toPdfPoint(stroke.p[0][0], stroke.p[0][1], crop, rot);
        page.drawCircle({
          x: pt.x,
          y: pt.y,
          size: thickness / 2,
          color,
          opacity,
        });
        continue;
      }

      for (let i = 1; i < stroke.p.length; i++) {
        const start = toPdfPoint(stroke.p[i - 1][0], stroke.p[i - 1][1], crop, rot);
        const end = toPdfPoint(stroke.p[i][0], stroke.p[i][1], crop, rot);
        page.drawLine({
          start,
          end,
          thickness,
          color,
          opacity,
          lineCap: LineCapStyle.Round,
        });
      }
    }
  });

  return pdfDoc.save();
}
