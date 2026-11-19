/// <reference types="vite/client" />

declare module 'pdfjs-dist/build/pdf.worker.min.mjs' {
  const workerModule: Record<string, unknown>;
  export = workerModule;
}
