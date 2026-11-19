import * as pdfjsLib from 'pdfjs-dist';
import workerCode from 'pdfjs-dist/build/pdf.worker.min.mjs?raw';

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

let workerBlobUrl: string | null = null;
let fallbackLoaded = false;

/**
 * Garante que o worker do PDF.js esteja sempre embutido (via Blob URL gerada
 * a partir do bundle local) e nunca dependa de um arquivo externo `/assets/pdf.worker...mjs`.
 */
export function ensureInlinePdfWorker(): void {
  if (!workerBlobUrl) {
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    workerBlobUrl = URL.createObjectURL(blob);
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerBlobUrl;
}

/**
 * Fallback automático caso o navegador/CSP bloqueie `new Worker(blob:...)`:
 * registra o WorkerMessageHandler em `globalThis.pdfjsWorker` no thread principal.
 */
async function ensureMainThreadWorkerFallback(): Promise<void> {
  if (fallbackLoaded) return;
  const workerMod = await import('pdfjs-dist/build/pdf.worker.min.mjs');
  (globalThis as Record<string, unknown>).pdfjsWorker = workerMod;
  fallbackLoaded = true;
}

export function isPdfBytesValid(bytes: Uint8Array): boolean {
  // O cabeçalho `%PDF-` costuma estar nos primeiros bytes (toleramos até 1024 bytes de lixo/BOM inicial)
  const limit = Math.min(bytes.length, 1024);
  for (let i = 0; i <= limit - 5; i++) {
    if (
      bytes[i] === 0x25 && // %
      bytes[i + 1] === 0x50 && // P
      bytes[i + 2] === 0x44 && // D
      bytes[i + 3] === 0x46 && // F
      bytes[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

export interface LoadPdfOptions {
  bytes: Uint8Array;
  password?: string;
}

export interface PasswordRequiredError {
  kind: 'password_required' | 'password_incorrect';
}

export async function loadPdfDocument({
  bytes,
  password,
}: LoadPdfOptions): Promise<pdfjsLib.PDFDocumentProxy> {
  ensureInlinePdfWorker();

  const tryOpen = async (): Promise<pdfjsLib.PDFDocumentProxy> => {
    // Passamos uma cópia porque `getDocument` transfere o buffer para o Worker
    const dataCopy = new Uint8Array(bytes);
    const loadingTask = pdfjsLib.getDocument({
      data: dataCopy,
      password,
    });

    return new Promise((resolve, reject) => {
      loadingTask.onPassword = (
        _updatePassword: (pw: string) => void,
        reason: number
      ) => {
        loadingTask.destroy().catch(() => {});
        const kind =
          reason === pdfjsLib.PasswordResponses.INCORRECT_PASSWORD
            ? 'password_incorrect'
            : 'password_required';
        reject(Object.assign(new Error(kind), { pdfPasswordKind: kind }));
      };

      loadingTask.promise.then(resolve, reject);
    });
  };

  try {
    return await tryOpen();
  } catch (err) {
    // Se for erro de senha, propaga direto sem tentar fallback
    if ((err as { pdfPasswordKind?: string })?.pdfPasswordKind) {
      throw err;
    }
    // Se falhou ao instanciar o Web Worker (ex.: CSP bloqueando blob:), tenta fallback no thread principal
    await ensureMainThreadWorkerFallback();
    return tryOpen();
  }
}

export function describePdfError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err || '');
  const lower = msg.toLowerCase();
  if (lower.includes('invalid pdf')) {
    return 'O arquivo não parece ser um PDF válido ou está corrompido.';
  }
  if (lower.includes('missing pdf')) {
    return 'Os dados do arquivo PDF estão vazios ou incompletos.';
  }
  if (lower.includes('password')) {
    return 'Este PDF é protegido por senha.';
  }
  return msg
    ? `Não foi possível abrir este PDF (${msg}).`
    : 'Não foi possível abrir este PDF.';
}
