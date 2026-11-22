import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpenCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Download,
  FileDown,
  Highlighter,
  Lock,
  Maximize2,
  MousePointer2,
  PanelTopClose,
  PanelTopOpen,
  Pause,
  PenLine,
  Play,
  RefreshCw,
  RotateCcw,
  Rows3,
  Square,
  Timer,
  Trash2,
  Type,
  Redo2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { TextLayer } from 'pdfjs-dist';
import type { ActiveRun, AnnotationsMap, NormalizedRect, Stroke } from '../types';
import { formatHMS } from '../utils/date';
import { mostrarBarraStatus, ocultarBarraStatus } from '../utils/barraStatus';
import { exportAnnotatedPdfBytes, hasAnyAnnotations } from '../utils/pdfExport';
import type { PDFDocumentProxy, RenderTask } from '../utils/pdfLoader';
import { describePdfError, isPdfBytesValid, loadPdfDocument } from '../utils/pdfLoader';
import {
  downloadBlob,
  extractPdfBytes,
  getAnnotations,
  getMaterialFile,
  getMaterialMeta,
  saveAnnotations,
} from '../utils/storage';

const PEN_COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a'];
const HL_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];
const FONT_SIZES = [
  { label: 'P', value: 0.017 },
  { label: 'M', value: 0.022 },
  { label: 'G', value: 0.03 },
];

export type PdfToolMode = 'nav' | 'pen' | 'hl' | 'text' | 'erase';
export type HighlightMode = 'text' | 'free';

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) || 253;
    const g = parseInt(clean.slice(2, 4), 16) || 224;
    const b = parseInt(clean.slice(4, 6), 16) || 71;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(253, 224, 71, ${alpha})`;
}

function drawStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  width: number,
  height: number
): void {
  if (stroke.t === 'rect' && stroke.rects && stroke.rects.length > 0) {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = stroke.c;
    for (const r of stroke.rects) {
      ctx.fillRect(r.x * width, r.y * height, r.w * width, r.h * height);
    }
    ctx.restore();
    return;
  }

  if (!stroke.p || stroke.p.length === 0) return;

  if (stroke.t === 'text') {
    const raw = (stroke.txt || '').trim();
    if (!raw) return;
    const [nx, ny] = stroke.p[0];
    const fontSize = Math.max(10, (stroke.fs || 0.022) * width);
    const lineHeight = fontSize * 1.25;
    const lines = raw.split(/\r?\n/);

    ctx.save();
    ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textBaseline = 'top';

    const px = nx * width;
    const py = ny * height;

    lines.forEach((line, idx) => {
      const ly = py + idx * lineHeight;
      const metrics = ctx.measureText(line || ' ');
      if (line.trim()) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.fillRect(px - 3, ly - 2, metrics.width + 6, fontSize * 1.15);
      }
      ctx.fillStyle = stroke.c || '#111827';
      ctx.fillText(line, px, ly);
    });
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.globalAlpha = stroke.t === 'hl' ? 0.45 : 1;
  ctx.strokeStyle = stroke.c;
  ctx.fillStyle = stroke.c;
  ctx.lineWidth = Math.max(1.5, stroke.w * width);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  stroke.p.forEach(([px, py], idx) => {
    if (idx === 0) ctx.moveTo(px * width, py * height);
    else ctx.lineTo(px * width, py * height);
  });
  ctx.stroke();
  ctx.restore();
}

function hitsStroke(stroke: Stroke, x: number, y: number, radius: number): boolean {
  if (stroke.t === 'rect' && stroke.rects && stroke.rects.length > 0) {
    return stroke.rects.some(
      (r) =>
        x >= r.x - radius * 0.5 &&
        x <= r.x + r.w + radius * 0.5 &&
        y >= r.y - radius * 0.5 &&
        y <= r.y + r.h + radius * 0.5
    );
  }
  if (stroke.t === 'text' && stroke.p.length > 0) {
    const [tx, ty] = stroke.p[0];
    const lines = (stroke.txt || '').split(/\r?\n/);
    const maxLen = Math.max(4, ...lines.map((l) => l.length));
    const fs = stroke.fs || 0.022;
    const estW = Math.min(0.45, maxLen * fs * 0.6);
    const estH = Math.max(0.03, lines.length * fs * 1.4);
    return x >= tx - 0.02 && x <= tx + estW + 0.02 && y >= ty - 0.015 && y <= ty + estH + 0.015;
  }
  return stroke.p.some(([px, py]) => Math.hypot(px - x, py - y) <= radius);
}

function extractNormalizedSelectionRects(
  range: Range,
  pageEl: HTMLElement
): NormalizedRect[] {
  const pageRect = pageEl.getBoundingClientRect();
  if (pageRect.width <= 0 || pageRect.height <= 0) return [];

  const maxLineHeight = Math.max(72, pageRect.height * 0.12);
  const rawRects: { left: number; top: number; right: number; bottom: number }[] = [];

  for (const r of Array.from(range.getClientRects())) {
    if (r.width < 1.5 || r.height < 3 || r.height > maxLineHeight) continue;
    const left = Math.max(pageRect.left, r.left);
    const right = Math.min(pageRect.right, r.right);
    const top = Math.max(pageRect.top, r.top);
    const bottom = Math.min(pageRect.bottom, r.bottom);
    if (right - left < 1.5 || bottom - top < 2) continue;
    rawRects.push({ left, top, right, bottom });
  }

  if (rawRects.length === 0) return [];

  // Ordena por linha e posição horizontal, mesclando fragmentos da mesma linha em uma barra contínua
  rawRects.sort((a, b) => (Math.abs(a.top - b.top) < 4 ? a.left - b.left : a.top - b.top));

  const merged: { left: number; top: number; right: number; bottom: number }[] = [];
  for (const cur of rawRects) {
    const last = merged[merged.length - 1];
    if (last) {
      const lastH = last.bottom - last.top;
      const curH = cur.bottom - cur.top;
      const sameLine = Math.abs(last.top - cur.top) <= Math.max(lastH, curH) * 0.5;
      const closeX = cur.left <= last.right + Math.max(8, lastH * 0.6);
      if (sameLine && closeX) {
        last.left = Math.min(last.left, cur.left);
        last.top = Math.min(last.top, cur.top);
        last.right = Math.max(last.right, cur.right);
        last.bottom = Math.max(last.bottom, cur.bottom);
        continue;
      }
    }
    merged.push({ ...cur });
  }

  return merged.map((r) => ({
    x: (r.left - pageRect.left) / pageRect.width,
    y: (r.top - pageRect.top) / pageRect.height,
    w: (r.right - r.left) / pageRect.width,
    h: (r.bottom - r.top) / pageRect.height,
  }));
}

interface TextDraft {
  page: number;
  nx: number;
  ny: number;
  value: string;
  editIndex?: number;
}

interface PdfPageCanvasProps {
  pdfDoc: PDFDocumentProxy;
  pageNumber: number;
  containerWidth: number;
  zoomFactor: number;
  continuous: boolean;
  strokes: Stroke[];
  tool: PdfToolMode;
  hlMode: HighlightMode;
  color: string;
  fontSizeNorm: number;
  textDraft: TextDraft | null;
  onStartTextDraft: (draft: TextDraft) => void;
  onUpdateTextDraft: (val: string) => void;
  onCommitTextDraft: () => void;
  onCancelTextDraft: () => void;
  onUpdatePageStrokes: (pageNumber: number, next: Stroke[]) => void;
  onPageVisible?: (pageNumber: number, ratio: number) => void;
  registerElement?: (pageNumber: number, el: HTMLDivElement | null) => void;
}

const PdfPageCanvas: React.FC<PdfPageCanvasProps> = ({
  pdfDoc,
  pageNumber,
  containerWidth,
  zoomFactor,
  continuous,
  strokes,
  tool,
  hlMode,
  color,
  fontSizeNorm,
  textDraft,
  onStartTextDraft,
  onUpdateTextDraft,
  onCommitTextDraft,
  onCancelTextDraft,
  onUpdatePageStrokes,
  onPageVisible,
  registerElement,
}) => {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const textLayerTaskRef = useRef<TextLayer | null>(null);
  const activeStrokeRef = useRef<Stroke | null>(null);
  const isDrawingRef = useRef(false);

  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [inView, setInView] = useState(!continuous);
  const [hasTextContent, setHasTextContent] = useState(true);

  useEffect(() => {
    registerElement?.(pageNumber, wrapperRef.current);
    return () => registerElement?.(pageNumber, null);
  }, [pageNumber, registerElement]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!continuous || !el) {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          setInView(entry.isIntersecting);
          if (entry.isIntersecting && onPageVisible) {
            onPageVisible(pageNumber, entry.intersectionRatio);
          }
        });
      },
      { rootMargin: '500px 0px', threshold: [0, 0.25, 0.5, 0.75] }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [continuous, pageNumber, onPageVisible]);

  // Renderiza canvas da página + TextLayer real para marca-texto em texto corrido
  useEffect(() => {
    if (!inView || !containerWidth) return;
    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDoc.getPage(pageNumber);
        if (cancelled) return;

        const baseVp = page.getViewport({ scale: 1 });
        const targetW = Math.min(Math.max(containerWidth - 24, 280), 980) * zoomFactor;
        const scale = targetW / baseVp.width;
        const vp = page.getViewport({ scale });
        const dpr = window.devicePixelRatio || 1;

        setViewportSize({ w: Math.round(vp.width), h: Math.round(vp.height) });

        const canvas = pdfCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = Math.floor(vp.width * dpr);
        canvas.height = Math.floor(vp.height * dpr);
        canvas.style.width = `${vp.width}px`;
        canvas.style.height = `${vp.height}px`;

        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const task = page.render({
          canvas,
          canvasContext: ctx,
          viewport: vp,
          transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        const textDiv = textLayerRef.current;
        if (textDiv) {
          if (textLayerTaskRef.current) {
            textLayerTaskRef.current.cancel();
            textLayerTaskRef.current = null;
          }
          textDiv.innerHTML = '';
          textDiv.style.setProperty('--total-scale-factor', String(vp.scale));
          const textContent = await page.getTextContent();
          if (cancelled) return;

          setHasTextContent(textContent.items.length > 0);

          const tl = new TextLayer({
            textContentSource: textContent,
            container: textDiv,
            viewport: vp,
          });
          textLayerTaskRef.current = tl;
          await tl.render();
        }
      } catch (err) {
        const name = (err as { name?: string })?.name;
        if (name !== 'RenderingCancelledException' && name !== 'AbortException') {
          console.error(`Erro ao renderizar página ${pageNumber}:`, err);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
      if (textLayerTaskRef.current) {
        textLayerTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNumber, zoomFactor, containerWidth, inView]);

  const redrawOverlay = useCallback(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !viewportSize.w) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    strokes.forEach((s, idx) => {
      if (textDraft && textDraft.page === pageNumber && textDraft.editIndex === idx) {
        return;
      }
      drawStroke(ctx, s, w, h);
    });
    if (activeStrokeRef.current) {
      drawStroke(ctx, activeStrokeRef.current, w, h);
    }
    ctx.restore();
  }, [strokes, viewportSize.w, pageNumber, textDraft]);

  useEffect(() => {
    const canvas = drawCanvasRef.current;
    if (!canvas || !viewportSize.w) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewportSize.w * dpr);
    canvas.height = Math.floor(viewportSize.h * dpr);
    canvas.style.width = `${viewportSize.w}px`;
    canvas.style.height = `${viewportSize.h}px`;
    redrawOverlay();
  }, [viewportSize, redrawOverlay]);

  useEffect(() => {
    redrawOverlay();
  }, [strokes, redrawOverlay]);

  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
  };

  const touchScrollRef = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      touchScrollRef.current = { x: e.clientX, y: e.clientY };
      return;
    }
    if (tool === 'nav' || !viewportSize.w) return;
    const [nx, ny] = getNormalizedPoint(e);

    if (tool === 'text') {
      e.preventDefault();
      const existingIdx = strokes.findIndex(
        (s) => s.t === 'text' && hitsStroke(s, nx, ny, 0.03)
      );
      if (existingIdx >= 0) {
        const target = strokes[existingIdx];
        onStartTextDraft({
          page: pageNumber,
          nx: target.p[0][0],
          ny: target.p[0][1],
          value: target.txt || '',
          editIndex: existingIdx,
        });
      } else {
        onStartTextDraft({
          page: pageNumber,
          nx: Math.min(0.85, Math.max(0.02, nx)),
          ny: Math.min(0.92, Math.max(0.02, ny)),
          value: '',
        });
      }
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingRef.current = true;

    if (tool === 'erase') {
      onUpdatePageStrokes(
        pageNumber,
        strokes.filter((s) => !hitsStroke(s, nx, ny, 0.028))
      );
      return;
    }

    const isHl = tool === 'hl';
    activeStrokeRef.current = {
      t: isHl ? 'hl' : 'pen',
      c: color,
      w: (isHl ? 18 : 2.5) / viewportSize.w,
      p: [
        [nx, ny],
        [nx, ny],
      ],
    };
    redrawOverlay();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') {
      const ultimo = touchScrollRef.current;
      const rolagem = e.currentTarget.closest('[data-pdf-scroll]') as HTMLElement | null;
      if (ultimo && rolagem) {
        rolagem.scrollTop -= e.clientY - ultimo.y;
        rolagem.scrollLeft -= e.clientX - ultimo.x;
        touchScrollRef.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }
    if (!isDrawingRef.current) return;
    const [nx, ny] = getNormalizedPoint(e);
    if (tool === 'erase') {
      const filtered = strokes.filter((s) => !hitsStroke(s, nx, ny, 0.028));
      if (filtered.length !== strokes.length) {
        onUpdatePageStrokes(pageNumber, filtered);
      }
    } else if (activeStrokeRef.current) {
      activeStrokeRef.current.p.push([nx, ny]);
      redrawOverlay();
    }
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e?.pointerType === 'touch') {
      touchScrollRef.current = null;
      return;
    }
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (activeStrokeRef.current) {
      const finished = activeStrokeRef.current;
      activeStrokeRef.current = null;
      onUpdatePageStrokes(pageNumber, [...strokes, finished]);
    }
  };

  // Quando o usuário seleciona texto corrido na TextLayer no modo Marca-texto, converte a seleção em marcação alinhada às linhas
  const handleTextSelectionCommit = () => {
    if (tool !== 'hl' || hlMode !== 'text' || !textLayerRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;

    const range = sel.getRangeAt(0);
    if (!textLayerRef.current.contains(range.commonAncestorContainer)) return;

    const rects = extractNormalizedSelectionRects(range, textLayerRef.current);
    sel.removeAllRanges();

    if (rects.length > 0) {
      onUpdatePageStrokes(pageNumber, [
        ...strokes,
        {
          t: 'rect',
          c: color,
          w: 0,
          p: [],
          rects,
        },
      ]);
    }
  };

  const useTextSelectionLayer =
    hasTextContent && (tool === 'nav' || (tool === 'hl' && hlMode === 'text'));

  const activeDraft = textDraft && textDraft.page === pageNumber ? textDraft : null;

  return (
    <div
      ref={wrapperRef}
      data-page={pageNumber}
      className="relative shadow-2xl bg-white my-1 shrink-0"
      style={{
        width: viewportSize.w || Math.min(Math.max(containerWidth - 24, 280), 980) * zoomFactor,
        height: viewportSize.h || 720 * zoomFactor,
      }}
    >
      <canvas ref={pdfCanvasRef} className="block" />
      <canvas
        ref={drawCanvasRef}
        className="absolute inset-0"
        style={{
          mixBlendMode: 'multiply',
          touchAction: tool === 'nav' || useTextSelectionLayer ? 'auto' : 'none',
          pointerEvents: useTextSelectionLayer ? 'none' : 'auto',
          cursor:
            tool === 'nav'
              ? 'default'
              : tool === 'text'
              ? 'text'
              : tool === 'erase'
              ? `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Ccircle cx='10' cy='10' r='7' fill='rgba(255,255,255,0.75)' stroke='%230f172a' stroke-width='1.5'/%3E%3C/svg%3E") 10 10, crosshair`
              : tool === 'pen'
              ? `url("data:image/svg+xml,${encodeURIComponent(
                  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="3.5" fill="${color}" stroke="#ffffff" stroke-width="1.5"/></svg>`
                )}") 8 8, crosshair`
              : 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />

      {/* Camada de texto real do PDF para selecionar e grifar em texto corrido */}
      <div
        ref={textLayerRef}
        className="pdf-text-layer"
        style={
          {
            pointerEvents: useTextSelectionLayer ? 'auto' : 'none',
            zIndex: useTextSelectionLayer ? 10 : 0,
            '--pdf-sel-bg':
              tool === 'hl' ? hexToRgba(color, 0.45) : 'rgba(59, 130, 246, 0.28)',
          } as React.CSSProperties
        }
        onMouseUp={handleTextSelectionCommit}
        onPointerUp={handleTextSelectionCommit}
        onDoubleClick={() => setTimeout(handleTextSelectionCommit, 20)}
        onTouchEnd={() => setTimeout(handleTextSelectionCommit, 60)}
      />

      {continuous && (
        <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-900/75 text-white text-[10px] font-mono font-bold pointer-events-none z-20">
          Pág. {pageNumber}
        </span>
      )}

      {activeDraft && (
        <div
          className="absolute z-20 p-2 rounded-xl bg-white shadow-xl border-2 border-blue-500 flex flex-col gap-1.5 min-w-[210px] max-w-[320px]"
          style={{
            left: `${Math.min(72, Math.max(2, activeDraft.nx * 100))}%`,
            top: `${Math.min(82, Math.max(2, activeDraft.ny * 100))}%`,
          }}
        >
          <textarea
            autoFocus
            rows={2}
            value={activeDraft.value}
            onChange={(e) => onUpdateTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onCommitTextDraft();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancelTextDraft();
              }
            }}
            placeholder="Digite sua anotação (Enter salva)..."
            style={{
              color,
              fontSize: `${Math.max(12, Math.round(fontSizeNorm * (viewportSize.w || 650)))}px`,
            }}
            className="w-full px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-blue-500 resize"
          />
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onCancelTextDraft}
              className="px-2 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onCommitTextDraft}
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Check className="w-3 h-3" />
              <span>Salvar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface PdfViewerProps {
  pdfId: string;
  paginaInicial?: number;
  initialTool?: PdfToolMode;
  contextLabel?: string;
  disciplines?: { id: string; name: string }[];
  defaultDisciplineId?: string;
  activeRun: ActiveRun | null;
  currentElapsedSeconds: number;
  onStartSession: (discId: string) => void;
  onPauseSession: () => void;
  onCancelSession: () => void;
  onRegisterFromPdf: (discId: string, seconds: number) => void;
  onPageProgress?: (page: number) => void;
  onApplyPageEnd?: (pageEnd: number) => void;
  onFechar: () => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfId,
  paginaInicial = 1,
  initialTool = 'nav',
  contextLabel,
  disciplines = [],
  defaultDisciplineId,
  activeRun,
  currentElapsedSeconds,
  onStartSession,
  onPauseSession,
  onCancelSession,
  onRegisterFromPdf,
  onPageProgress,
  onApplyPageEnd,
  onFechar,
}) => {
  const [erroExportacao, setErroExportacao] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  // Reabre na última página visualizada deste arquivo (a menos que a página inicial tenha sido pedida, ex.: pelo tópico)
  const [pageNum, setPageNum] = useState<number>(() => {
    let salva = 0;
    try {
      salva = Number(localStorage.getItem(`pdfUltimaPagina:${pdfId}`) || 0);
    } catch {
      salva = 0;
    }
    return paginaInicial > 1 ? Math.max(1, paginaInicial) : Math.max(1, salva || paginaInicial || 1);
  });
  const [totalPages, setTotalPages] = useState(0);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [tool, setTool] = useState<PdfToolMode>(initialTool);
  const [hlMode, setHlMode] = useState<HighlightMode>('free');

  // Sem distrações: esconde a barra de notificações enquanto o PDF estiver aberto
  useEffect(() => {
    ocultarBarraStatus();
    return () => {
      mostrarBarraStatus();
    };
  }, []);
  const [color, setColor] = useState(initialTool === 'hl' ? HL_COLORS[0] : PEN_COLORS[0]);
  const [fontSizeNorm, setFontSizeNorm] = useState(FONT_SIZES[1].value);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [annotations, setAnnotations] = useState<AnnotationsMap>({});
  const [pageInput, setPageInput] = useState(String(Math.max(1, paginaInicial)));
  const [reloadTick, setReloadTick] = useState(0);
  const [containerWidth, setContainerWidth] = useState(720);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const [exportingAnnotated, setExportingAnnotated] = useState(false);

  // Modo leitura limpa (oculta as duas barras do topo para deixar somente o PDF visível)
  const [barsHidden, setBarsHidden] = useState(false);
  const [quickOpen, setQuickOpen] = useState<boolean>(false);

  // Mini-cronômetro começa sempre recolhido para não atrapalhar a concentração
  const [timerExpanded, setTimerExpanded] = useState(false);
  const [timerDiscId, setTimerDiscId] = useState(
    activeRun?.id || defaultDisciplineId || disciplines[0]?.id || ''
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const pageElementsRef = useRef<Record<number, HTMLDivElement | null>>({});
  const visibleRatiosRef = useRef<Record<number, number>>({});
  const rawBytesRef = useRef<Uint8Array | null>(null);
  const annotationsRef = useRef<AnnotationsMap>({});
  const annotationsLoadedRef = useRef(false);

  useEffect(() => {
    if (activeRun?.id) {
      setTimerDiscId(activeRun.id);
    } else if (!disciplines.some((d) => d.id === timerDiscId)) {
      setTimerDiscId(defaultDisciplineId || disciplines[0]?.id || '');
    }
  }, [activeRun?.id, defaultDisciplineId, disciplines, timerDiscId]);

  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth);
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [barsHidden]);

  const updateAnnotations = useCallback((next: AnnotationsMap) => {
    annotationsRef.current = next;
    setAnnotations(next);
  }, []);

  const currentStrokes = useCallback(
    (pg: number = pageNum): Stroke[] => annotationsRef.current[String(pg)] || [],
    [pageNum]
  );

  const openWithBytes = useCallback(async (bytes: Uint8Array, password?: string) => {
    undoHistoryRef.current = [];
    redoHistoryRef.current = [];
    setError(null);
    setPasswordError(null);
    setLoading(true);
    try {
      const doc = await loadPdfDocument({ bytes, password });
      setPdfDoc((prev) => {
        if (prev) {
          prev.cleanup(false).catch(() => {});
          (prev as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
        }
        return doc;
      });
      setTotalPages(doc.numPages);
      setPageNum((p) => {
        const clamped = Math.min(Math.max(1, p), doc.numPages);
        setPageInput(String(clamped));
        return clamped;
      });
      setNeedsPassword(false);
      setLoading(false);
    } catch (err) {
      const pwKind = (err as { pdfPasswordKind?: string })?.pdfPasswordKind;
      if (pwKind === 'password_required' || pwKind === 'password_incorrect') {
        setNeedsPassword(true);
        setLoading(false);
        if (pwKind === 'password_incorrect') {
          setPasswordError('Senha incorreta. Tente novamente.');
        }
        return;
      }
      setLoading(false);
      setError(describePdfError(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    annotationsLoadedRef.current = false;

    (async () => {
      try {
        setLoading(true);
        setError(null);
        setNeedsPassword(false);

        const [meta, storedFile, savedAnn] = await Promise.all([
          getMaterialMeta(pdfId),
          getMaterialFile(pdfId),
          getAnnotations(pdfId),
        ]);

        if (cancelled) return;
        setTitle(meta?.name || 'Material PDF');

        if (!storedFile) {
          setLoading(false);
          setError(
            'Arquivo não encontrado neste navegador. Envie ou importe o PDF novamente na aba Materiais.'
          );
          return;
        }

        const bytes = await extractPdfBytes(storedFile);
        if (cancelled) return;

        if (!bytes || bytes.length === 0) {
          setLoading(false);
          setError('O arquivo PDF salvo está vazio (0 bytes).');
          return;
        }

        if (!isPdfBytesValid(bytes)) {
          setLoading(false);
          setError(
            'O arquivo salvo não possui cabeçalho PDF válido (%PDF-). Verifique se o arquivo original não está corrompido.'
          );
          return;
        }

        rawBytesRef.current = bytes;
        updateAnnotations(savedAnn);
        annotationsLoadedRef.current = true;
        await openWithBytes(bytes);
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(describePdfError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfId, reloadTick, openWithBytes, updateAnnotations]);

  useEffect(() => {
    return () => {
      setPdfDoc((prev) => {
        if (prev) {
          prev.cleanup(false).catch(() => {});
          (prev as { destroy?: () => Promise<void> }).destroy?.().catch(() => {});
        }
        return null;
      });
    };
  }, []);

  useEffect(() => {
    if (!annotationsLoadedRef.current) return;
    const timer = setTimeout(() => {
      saveAnnotations(pdfId, annotationsRef.current).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [pdfId, annotations]);

  useEffect(() => {
    if (!loading && !error && !needsPassword && pdfDoc && onPageProgress) {
      onPageProgress(pageNum);
    }
  }, [pageNum, loading, error, needsPassword, pdfDoc, onPageProgress]);

  // Guarda a última página deste arquivo
  useEffect(() => {
    if (!pdfId || loading) return;
    try {
      localStorage.setItem(`pdfUltimaPagina:${pdfId}`, String(pageNum));
    } catch {
      /* ignora */
    }
  }, [pageNum, pdfId, loading]);

  const goToPage = useCallback(
    (target: number) => {
      if (!totalPages) return;
      const clamped = Math.min(Math.max(1, target), totalPages);
      setPageNum(clamped);
      setPageInput(String(clamped));
      setTextDraft(null);
      if (continuousMode) {
        pageElementsRef.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [totalPages, continuousMode]
  );

  // Atalhos de teclado: F alterna barras ocultas, Esc restaura barras ou fecha leitor, setas mudam página
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textDraft) {
          setTextDraft(null);
          return;
        }
        if (downloadMenuOpen) {
          setDownloadMenuOpen(false);
          return;
        }
        if (barsHidden) {
          setBarsHidden(false);
          return;
        }
        onFechar();
        return;
      }
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setBarsHidden((v) => !v);
        return;
      }
      if (!continuousMode) {
        if (e.key === 'ArrowLeft') goToPage(pageNum - 1);
        else if (e.key === 'ArrowRight') goToPage(pageNum + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFechar, pageNum, continuousMode, goToPage, textDraft, downloadMenuOpen, barsHidden]);

  const undoHistoryRef = useRef<{ page: number; before: Stroke[]; after: Stroke[] }[]>([]);
  const redoHistoryRef = useRef<{ page: number; before: Stroke[]; after: Stroke[] }[]>([]);

  const handleUpdatePageStrokes = useCallback(
    (targetPage: number, strokes: Stroke[]) => {
      const antes = annotationsRef.current[String(targetPage)] || [];
      if (antes !== strokes) {
        undoHistoryRef.current.push({ page: targetPage, before: antes, after: strokes });
        redoHistoryRef.current = [];
      }
      updateAnnotations({
        ...annotationsRef.current,
        [String(targetPage)]: strokes,
      });
    },
    [updateAnnotations]
  );

  const handleCommitTextDraft = useCallback(() => {
    if (!textDraft) return;
    const trimmed = textDraft.value.trim();
    const list = [...(annotationsRef.current[String(textDraft.page)] || [])];

    if (typeof textDraft.editIndex === 'number') {
      if (!trimmed) {
        list.splice(textDraft.editIndex, 1);
      } else {
        list[textDraft.editIndex] = {
          ...list[textDraft.editIndex],
          c: color,
          fs: fontSizeNorm,
          txt: trimmed,
        };
      }
    } else if (trimmed) {
      list.push({
        t: 'text',
        c: color,
        w: fontSizeNorm,
        fs: fontSizeNorm,
        p: [[textDraft.nx, textDraft.ny]],
        txt: trimmed,
      });
    }

    handleUpdatePageStrokes(textDraft.page, list);
    setTextDraft(null);
  }, [textDraft, color, fontSizeNorm, handleUpdatePageStrokes]);

  const handleUndo = () => {
    const entrada = undoHistoryRef.current.pop();
    if (!entrada) return;
    redoHistoryRef.current.push(entrada);
    updateAnnotations({ ...annotationsRef.current, [String(entrada.page)]: entrada.before });
  };

  const handleRedo = () => {
    const entrada = redoHistoryRef.current.pop();
    if (!entrada) return;
    undoHistoryRef.current.push(entrada);
    updateAnnotations({ ...annotationsRef.current, [String(entrada.page)]: entrada.after });
  };

  const selectTool = (next: PdfToolMode) => {
    setTextDraft(null);
    setTool(next);
    if (next === 'pen' || next === 'text') {
      if (!PEN_COLORS.includes(color)) setColor(PEN_COLORS[0]);
    }
    if (next === 'hl') {
      if (!HL_COLORS.includes(color)) setColor(HL_COLORS[0]);
    }
  };

  const handleFitWidth = () => {
    if (!containerRef.current) {
      setZoomFactor(1);
      return;
    }
    const cw = containerRef.current.clientWidth;
    const baseCap = Math.min(Math.max(cw - 24, 280), 980);
    const fitRatio = (cw - 24) / baseCap;
    setZoomFactor(Math.max(0.5, Math.min(2.5, +fitRatio.toFixed(2))));
  };

  const handleDownloadOriginal = () => {
    if (!rawBytesRef.current) return;
    setDownloadMenuOpen(false);
    downloadBlob(
      new Uint8Array(rawBytesRef.current),
      `${title || 'material'}.pdf`,
      'application/pdf'
    );
  };

  const handleDownloadAnnotated = async () => {
    if (!rawBytesRef.current) return;
    setDownloadMenuOpen(false);
    setExportingAnnotated(true);
    try {
      const merged = await exportAnnotatedPdfBytes(rawBytesRef.current, annotationsRef.current);
      downloadBlob(
        new Uint8Array(merged),
        `${title || 'material'}-anotado.pdf`,
        'application/pdf'
      );
    } catch (err) {
      console.error(err);
      setErroExportacao('Não foi possível gravar as marcações neste PDF (alguns PDFs têm restrição interna). Você pode baixar a cópia original.');
    } finally {
      setExportingAnnotated(false);
    }
  };

  const registerPageEl = useCallback((pg: number, el: HTMLDivElement | null) => {
    pageElementsRef.current[pg] = el;
  }, []);

  const handlePageVisible = useCallback((pg: number, ratio: number) => {
    visibleRatiosRef.current[pg] = ratio;
    let bestPage = pg;
    let bestRatio = -1;
    Object.entries(visibleRatiosRef.current).forEach(([k, r]) => {
      if (r > bestRatio) {
        bestRatio = r;
        bestPage = Number(k);
      }
    });
    if (bestRatio > 0) {
      setPageNum(bestPage);
      setPageInput(String(bestPage));
    }
  }, []);

  const palette = tool === 'hl' ? HL_COLORS : PEN_COLORS;
  const hasMarks = hasAnyAnnotations(annotations);
  const isTimerRunning = Boolean(activeRun?.start);
  const isTimerMatch = Boolean(activeRun && activeRun.id === timerDiscId);
  const timerElapsed = isTimerMatch ? currentElapsedSeconds : 0;

  const btnCls = (active: boolean) =>
    `p-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-white/10 text-white hover:bg-white/20'
    }`;

  return (
    <div className="fixed inset-0 z-[80] bg-slate-950/95 flex flex-col pt-[0px]">
      {/* Barras ocultas: botão flutuante discreto com acesso rápido às opções da caneta */}
      {barsHidden && (
        <div className="fixed top-[calc(0.5rem+var(--safe-top))] right-2 z-40 flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={() => setQuickOpen((v) => !v)}
            className="w-9 h-9 rounded-full bg-slate-900/40 hover:bg-slate-900/85 text-white/60 hover:text-white border border-white/10 flex items-center justify-center opacity-40 hover:opacity-100 transition cursor-pointer"
            title="Opções da caneta"
            aria-label="Opções da caneta"
          >
            <PenLine className="w-4 h-4" />
          </button>
          {quickOpen && (
            <div className="p-2 rounded-2xl bg-slate-900/90 border border-white/15 shadow-xl backdrop-blur-sm flex flex-col gap-2 items-end">
              <div className="flex gap-1">
                <button type="button" onClick={() => selectTool('pen')} className={btnCls(tool === 'pen')} title="Caneta" aria-label="Caneta">
                  <PenLine className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => selectTool('hl')} className={btnCls(tool === 'hl')} title="Marca-texto" aria-label="Marca-texto">
                  <Highlighter className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => selectTool('erase')} className={btnCls(tool === 'erase')} title="Borracha" aria-label="Borracha">
                  <Circle className="w-4 h-4" />
                </button>
              </div>
              <div className="flex gap-1.5">
                {PEN_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${color === c ? 'border-white' : 'border-white/30'}`}
                    style={{ background: c }}
                    aria-label={`Cor ${c}`}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={handleUndo} disabled={undoHistoryRef.current.length === 0} className={`${btnCls(false)} disabled:opacity-40`} title="Desfazer" aria-label="Desfazer">
                  <Undo2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={handleRedo} disabled={redoHistoryRef.current.length === 0} className={`${btnCls(false)} disabled:opacity-40`} title="Refazer" aria-label="Refazer">
                  <Redo2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => { setBarsHidden(false); setQuickOpen(false); }} className={btnCls(false)} title="Mostrar barras" aria-label="Mostrar barras">
                  <PanelTopOpen className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Barras superiores (ocultáveis para deixar visível somente o PDF) */}
      {!barsHidden && (
        <>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-slate-900 border-b border-white/10 text-white">
            <button
              type="button"
              onClick={onFechar}
              className={btnCls(false)}
              aria-label="Fechar leitor"
              title="Fechar (Esc)"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="min-w-0 max-w-[38vw] sm:max-w-[32vw]">
              <div className="text-sm font-bold truncate">{title || 'Material PDF'}</div>
              {contextLabel && (
                <div className="text-[11px] text-slate-400 truncate">{contextLabel}</div>
              )}
            </div>

            <div className="flex items-center gap-1.5 ml-auto flex-wrap">
              {/* Botão Ocultar barras para foco total no PDF */}
              <button
                type="button"
                onClick={() => setBarsHidden(true)}
                className={btnCls(false)}
                title="Ocultar barras e ver somente o PDF (tecla F)"
              >
                <PanelTopClose className="w-4 h-4" />
                <span className="hidden xl:inline">Ocultar barras</span>
              </button>

              {/* Mini-cronômetro recolhido por padrão */}
              {disciplines.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTimerExpanded((v) => !v)}
                  className={`px-2.5 py-2 rounded-xl transition cursor-pointer flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap border ${
                    timerExpanded
                      ? 'bg-blue-600 text-white border-blue-500'
                      : isTimerRunning
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                      : 'bg-white/10 text-slate-200 border-transparent hover:bg-white/20'
                  }`}
                  title={
                    timerExpanded
                      ? 'Recolher mini-cronômetro'
                      : 'Abrir mini-cronômetro da disciplina'
                  }
                >
                  <Timer className="w-4 h-4" />
                  <span className="hidden md:inline">Cronômetro</span>
                  {timerExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
              )}

              {/* Toggle Página única / Rolagem contínua */}
              <button
                type="button"
                onClick={() => setContinuousMode((v) => !v)}
                className={btnCls(continuousMode)}
                title={
                  continuousMode
                    ? 'Modo rolagem contínua ativo (clique para página única)'
                    : 'Ativar rolagem contínua de páginas'
                }
              >
                {continuousMode ? <Rows3 className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                <span className="hidden lg:inline">
                  {continuousMode ? 'Contínuo' : 'Página única'}
                </span>
              </button>

              {/* Menu / botão de download */}
              {rawBytesRef.current && (
                <div className="relative">
                  <button
                    type="button"
                    disabled={exportingAnnotated}
                    onClick={() => {
                      if (hasMarks) setDownloadMenuOpen((v) => !v);
                      else handleDownloadOriginal();
                    }}
                    className={`${btnCls(hasMarks)} ${
                      hasMarks ? 'bg-emerald-600 hover:bg-emerald-500' : ''
                    }`}
                    title={
                      hasMarks
                        ? 'Baixar PDF com anotações ou arquivo original'
                        : 'Baixar PDF'
                    }
                  >
                    <Download className="w-4 h-4" />
                    <span className="hidden sm:inline">
                      {exportingAnnotated
                        ? 'Exportando…'
                        : hasMarks
                        ? 'Baixar PDF'
                        : 'Baixar'}
                    </span>
                    {hasMarks && <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {erroExportacao && (
                    <div
                      role="alert"
                      className="absolute right-0 top-full mt-2 w-64 p-3 rounded-2xl bg-rose-50 dark:bg-rose-950 border border-rose-300 dark:border-rose-800 text-xs font-semibold text-rose-800 dark:text-rose-100 shadow-lg z-30 space-y-2"
                    >
                      <p>{erroExportacao}</p>
                      <button
                        type="button"
                        onClick={() => setErroExportacao(null)}
                        className="font-bold underline cursor-pointer"
                      >
                        Entendi
                      </button>
                    </div>
                  )}

                  {downloadMenuOpen && hasMarks && (
                    <div className="absolute right-0 mt-1.5 w-60 rounded-2xl bg-slate-900 border border-white/15 shadow-2xl p-1.5 z-30 space-y-1">
                      <button
                        type="button"
                        onClick={handleDownloadAnnotated}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 flex items-center gap-2 cursor-pointer"
                      >
                        <FileDown className="w-4 h-4 shrink-0" />
                        <div>
                          <div>Baixar com marcações</div>
                          <div className="text-[10px] text-emerald-100 font-normal">
                            Grava grifos, caneta e textos no PDF
                          </div>
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadOriginal}
                        className="w-full px-3 py-2 rounded-xl text-left text-xs font-semibold text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer"
                      >
                        <Download className="w-4 h-4 shrink-0 text-slate-400" />
                        <span>Baixar original limpo</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Controles de zoom */}
              <div className="flex items-center gap-0.5 bg-white/5 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setZoomFactor((z) => Math.max(0.5, +(z - 0.15).toFixed(2)))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
                  title="Diminuir zoom"
                  aria-label="Diminuir zoom"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleFitWidth}
                  className="px-2 py-1 text-[11px] font-mono font-bold hover:bg-white/10 rounded-lg cursor-pointer flex items-center gap-1 tabular-nums"
                  title="Ajustar à largura da tela"
                >
                  <Maximize2 className="w-3 h-3 opacity-70" />
                  <span>{Math.round(zoomFactor * 100)}%</span>
                </button>
                <button
                  type="button"
                  onClick={() => setZoomFactor((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white cursor-pointer"
                  title="Aumentar zoom"
                  aria-label="Aumentar zoom"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Paginação */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => goToPage(pageNum - 1)}
                  disabled={pageNum <= 1}
                  className={`${btnCls(false)} disabled:opacity-40`}
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    goToPage(parseInt(pageInput, 10) || 1);
                  }}
                  className="flex items-center gap-1 text-xs font-mono"
                >
                  <input
                    type="number"
                    min={1}
                    max={totalPages || 1}
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value)}
                    onBlur={() => goToPage(parseInt(pageInput, 10) || pageNum)}
                    className="w-12 px-1.5 py-1 rounded-lg bg-white/10 border border-white/15 text-center text-white outline-none focus:border-blue-400 tabular-nums"
                    aria-label="Número da página"
                  />
                  <span className="text-slate-400 px-1 tabular-nums">/ {totalPages || '—'}</span>
                </form>

                <button
                  type="button"
                  onClick={() => goToPage(pageNum + 1)}
                  disabled={!totalPages || pageNum >= totalPages}
                  className={`${btnCls(false)} disabled:opacity-40`}
                  aria-label="Próxima página"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Painel expansível do Mini-cronômetro (recolhido por padrão) */}
          {timerExpanded && disciplines.length > 0 && (
            <div className="px-4 py-2.5 bg-slate-900/95 border-b border-blue-500/30 flex flex-wrap items-center gap-3 text-white">
              <div className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-blue-400 shrink-0" />
                <select
                  value={timerDiscId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setTimerDiscId(nextId);
                    if (activeRun && activeRun.id !== nextId && isTimerRunning) {
                      onStartSession(nextId);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-white/10 border border-white/15 text-xs font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]"
                >
                  {disciplines.map((d) => (
                    <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="font-mono text-lg font-black tabular-nums tracking-tight px-2">
                {formatHMS(timerElapsed)}
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {timerDiscId && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isTimerRunning && isTimerMatch) onPauseSession();
                      else onStartSession(timerDiscId);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                      isTimerRunning && isTimerMatch
                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'
                    }`}
                  >
                    {isTimerRunning && isTimerMatch ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        <span>Pausar</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        <span>{timerElapsed > 0 ? 'Continuar' : 'Iniciar'}</span>
                      </>
                    )}
                  </button>
                )}

                {timerElapsed > 0 && timerDiscId && (
                  <button
                    type="button"
                    onClick={() => onRegisterFromPdf(timerDiscId, timerElapsed)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Registrar</span>
                  </button>
                )}

                {activeRun && (
                  <button
                    type="button"
                    onClick={onCancelSession}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    title="Zerar sessão"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Zerar</span>
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setTimerExpanded(false)}
                className="ml-auto text-xs font-semibold text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Recolher</span>
              </button>
            </div>
          )}

          {/* Barra de ferramentas de anotação */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-slate-900/90 border-b border-white/10">
            <button
              type="button"
              onClick={() => selectTool('nav')}
              className={btnCls(tool === 'nav')}
              title="Navegar / selecionar texto"
            >
              <MousePointer2 className="w-4 h-4" />
              <span className="hidden sm:inline">Navegar</span>
            </button>
            <button
              type="button"
              onClick={() => selectTool('pen')}
              className={btnCls(tool === 'pen')}
              title="Caneta livre"
            >
              <PenLine className="w-4 h-4" />
              <span className="hidden sm:inline">Caneta</span>
            </button>
            <button
              type="button"
              onClick={() => selectTool('hl')}
              className={btnCls(tool === 'hl')}
              title="Marca-texto (arraste sobre o texto para grifar em linha reta)"
            >
              <Highlighter className="w-4 h-4" />
              <span className="hidden sm:inline">Marca-texto</span>
            </button>
            <button
              type="button"
              onClick={() => selectTool('erase')}
              className={btnCls(tool === 'erase')}
              title="Borracha (apaga grifos, riscos e textos)"
            >
              <Circle className="w-4 h-4" />
              <span className="hidden sm:inline">Borracha</span>
            </button>


            {(tool === 'pen' || tool === 'hl' || tool === 'text') && (
              <>
                <div className="w-px h-6 bg-white/20 mx-0.5" />
                <div className="flex items-center gap-1.5">
                  {palette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full border-2 cursor-pointer transition ${
                        color === c ? 'border-white scale-110' : 'border-white/30'
                      }`}
                      style={{ background: c }}
                      aria-label={`Cor ${c}`}
                    />
                  ))}
                </div>
              </>
            )}

            {tool === 'text' && (
              <>
                <div className="w-px h-6 bg-white/20 mx-0.5" />
                <div className="flex items-center gap-1 bg-white/5 rounded-xl p-0.5">
                  {FONT_SIZES.map((sz) => (
                    <button
                      key={sz.label}
                      type="button"
                      onClick={() => setFontSizeNorm(sz.value)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                        fontSizeNorm === sz.value
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-300 hover:bg-white/10'
                      }`}
                      title={`Tamanho ${sz.label}`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            <div className="w-px h-6 bg-white/20 mx-0.5" />

            <button
              type="button"
              onClick={handleUndo}
              disabled={undoHistoryRef.current.length === 0}
              className={`${btnCls(false)} disabled:opacity-40`}
              title="Desfazer"
              aria-label="Desfazer"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={redoHistoryRef.current.length === 0}
              className={`${btnCls(false)} disabled:opacity-40`}
              title="Refazer"
              aria-label="Refazer"
            >
              <Redo2 className="w-4 h-4" />
            </button>

            {onApplyPageEnd && totalPages > 0 && (
              <button
                type="button"
                onClick={() => onApplyPageEnd(pageNum)}
                className="ml-auto px-3 py-1.5 rounded-xl bg-white/10 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
                title="Atualizar Pág. Fim do tópico vinculado no Edital"
              >
                <BookOpenCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Marcar pág. {pageNum} lida</span>
              </button>
            )}
          </div>
        </>
      )}

      {/* Área do documento */}
      <div
        ref={containerRef}
        data-pdf-scroll="1"
        className={`flex-1 overflow-auto flex flex-col items-center ${barsHidden ? 'p-1.5' : 'p-3'}`}
      >
        {needsPassword && (
          <div className="mt-12 w-full max-w-sm rounded-2xl bg-slate-900 border border-white/15 p-6 text-white shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold">PDF protegido por senha</h3>
            </div>
            <p className="text-xs text-slate-300">
              Digite a senha deste documento para abri-lo no leitor.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (rawBytesRef.current) {
                  openWithBytes(rawBytesRef.current, passwordInput);
                }
              }}
              className="space-y-3"
            >
              <input
                type="password"
                autoFocus
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Senha do PDF"
                className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500"
              />
              {passwordError && (
                <p className="text-xs font-semibold text-rose-400">{passwordError}</p>
              )}
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold uppercase tracking-wider cursor-pointer transition"
              >
                Desbloquear PDF
              </button>
            </form>
          </div>
        )}

        {error && !needsPassword && (
          <div className="mt-12 w-full max-w-md rounded-2xl bg-slate-900 border border-rose-500/30 p-6 text-center space-y-4">
            <p className="text-rose-300 text-sm font-medium">{error}</p>
            <div className="flex justify-center gap-2">
              <button
                type="button"
                onClick={() => setReloadTick((n) => n + 1)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
              <button
                type="button"
                onClick={onFechar}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Voltar
              </button>
            </div>
          </div>
        )}

        {loading && !error && !needsPassword && (
          <p className="text-white/70 text-sm mt-12">Carregando PDF…</p>
        )}

        {!loading && !error && !needsPassword && pdfDoc && (
          <div className="flex flex-col items-center gap-3 pb-8">
            {(continuousMode
              ? Array.from({ length: totalPages }, (_, i) => i + 1)
              : [pageNum]
            ).map((pg) => (
              <PdfPageCanvas
                key={pg}
                pdfDoc={pdfDoc}
                pageNumber={pg}
                containerWidth={containerWidth}
                zoomFactor={zoomFactor}
                continuous={continuousMode}
                strokes={annotations[String(pg)] || []}
                tool={tool}
                hlMode={hlMode}
                color={color}
                fontSizeNorm={fontSizeNorm}
                textDraft={textDraft}
                onStartTextDraft={setTextDraft}
                onUpdateTextDraft={(val) =>
                  setTextDraft((prev) => (prev ? { ...prev, value: val } : prev))
                }
                onCommitTextDraft={handleCommitTextDraft}
                onCancelTextDraft={() => setTextDraft(null)}
                onUpdatePageStrokes={handleUpdatePageStrokes}
                onPageVisible={continuousMode ? handlePageVisible : undefined}
                registerElement={registerPageEl}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
