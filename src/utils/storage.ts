import type { AnnotationsMap, DiscState, KanbanState, MaterialMeta } from '../types';
import { todayStr } from './date';

const DB_NAME = 'quadro-materiais';
const DB_VERSION = 1;
const STORES = ['meta', 'arquivos', 'anotacoes'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        STORES.forEach((store) => {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store);
          }
        });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function idbTx<T>(
  storeName: (typeof STORES)[number],
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const req = fn(tx.objectStore(storeName));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      })
  );
}

const uid = (): string => Math.random().toString(36).slice(2, 9);

export async function listMaterials(): Promise<MaterialMeta[]> {
  const list = (await idbTx<MaterialMeta[]>('meta', 'readonly', (s) => s.getAll())) || [];
  return list.sort((a, b) => b.addedAt - a.addedAt);
}

export async function saveMaterialFile(file: File, disciplineId?: string): Promise<MaterialMeta> {
  // Materializa os bytes em um Blob independente no IndexedDB para não perder acesso caso o arquivo original mude de lugar
  const buffer = await file.arrayBuffer();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const meta: MaterialMeta = {
    id: uid(),
    name: file.name.replace(/\.pdf$/i, ''),
    addedAt: Date.now(),
    size: blob.size || file.size,
    disciplineId,
  };
  await idbTx('arquivos', 'readwrite', (s) => s.put(blob, meta.id));
  await idbTx('meta', 'readwrite', (s) => s.put(meta, meta.id));
  return meta;
}

export async function updateMaterialMeta(id: string, patch: Partial<MaterialMeta>): Promise<void> {
  const atual = await getMaterialMeta(id);
  if (!atual) return;
  await idbTx('meta', 'readwrite', (s) => s.put({ ...atual, ...patch }, id));
}

export async function getMaterialMeta(id: string): Promise<MaterialMeta | undefined> {
  return idbTx<MaterialMeta | undefined>('meta', 'readonly', (s) => s.get(id));
}

export async function getMaterialFile(id: string): Promise<Blob | ArrayBuffer | Uint8Array | undefined> {
  return idbTx<Blob | ArrayBuffer | Uint8Array | undefined>('arquivos', 'readonly', (s) => s.get(id));
}

export async function extractPdfBytes(
  stored: Blob | ArrayBuffer | Uint8Array | undefined
): Promise<Uint8Array | null> {
  if (!stored) return null;
  if (stored instanceof Uint8Array) return new Uint8Array(stored);
  if (stored instanceof ArrayBuffer) return new Uint8Array(stored);
  if (typeof (stored as Blob).arrayBuffer === 'function') {
    const buf = await (stored as Blob).arrayBuffer();
    return new Uint8Array(buf);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(stored as Blob);
  });
}

export async function getAnnotations(id: string): Promise<AnnotationsMap> {
  return (await idbTx<AnnotationsMap | undefined>('anotacoes', 'readonly', (s) => s.get(id))) || {};
}

export async function saveAnnotations(id: string, data: AnnotationsMap): Promise<void> {
  await idbTx('anotacoes', 'readwrite', (s) => s.put(data, id));
}

export async function deleteMaterial(id: string): Promise<void> {
  await idbTx('arquivos', 'readwrite', (s) => s.delete(id));
  await idbTx('anotacoes', 'readwrite', (s) => s.delete(id));
  await idbTx('meta', 'readwrite', (s) => s.delete(id));
}

const blobToBase64 = (blob: Blob | ArrayBuffer | Uint8Array): Promise<string> =>
  new Promise((resolve, reject) => {
    const normalized =
      blob instanceof Blob
        ? blob
        : new Blob([blob instanceof Uint8Array ? new Uint8Array(blob).buffer : blob], {
            type: 'application/pdf',
          });
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || '');
      resolve(res.slice(res.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(normalized);
  });

const base64ToBlob = (base64: string): Blob => {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new Blob([bytes], { type: 'application/pdf' });
};

export interface MaterialBackupEntry {
  meta: MaterialMeta;
  arquivoBase64: string;
  anotacoes?: AnnotationsMap;
}

export async function exportAllMaterials(): Promise<MaterialBackupEntry[]> {
  const metas = await listMaterials();
  const out: MaterialBackupEntry[] = [];
  for (const meta of metas) {
    const file = await getMaterialFile(meta.id);
    if (file) {
      out.push({
        meta,
        arquivoBase64: await blobToBase64(file),
        anotacoes: await getAnnotations(meta.id),
      });
    }
  }
  return out;
}

export async function importAllMaterials(entries: MaterialBackupEntry[]): Promise<number> {
  let count = 0;
  for (const entry of entries) {
    if (!entry || !entry.meta || !entry.arquivoBase64) continue;
    const blob = base64ToBlob(entry.arquivoBase64);
    await idbTx('arquivos', 'readwrite', (s) => s.put(blob, entry.meta.id));
    await idbTx('meta', 'readwrite', (s) => s.put(entry.meta, entry.meta.id));
    await idbTx('anotacoes', 'readwrite', (s) => s.put(entry.anotacoes || {}, entry.meta.id));
    count++;
  }
  return count;
}

export const LS_BOARDS = 'kanban-v1';
export const LS_DISC = 'kanban-disc-v1';
export const LS_THEME = 'kanban-theme';
export const LS_NAV = 'kanban-nav';
export const LS_REM_OPEN = 'kanban-rem-open';

export function defaultBoards(): KanbanState {
  const id = uid();
  return {
    list: [
      {
        id,
        name: 'Quadro 1',
        cols: [
          {
            id: uid(),
            title: 'A fazer',
            cards: [
              { id: uid(), text: 'Pesquisar referências' },
              { id: uid(), text: 'Definir escopo do projeto' },
              { id: uid(), text: 'Montar cronograma' },
            ],
          },
          {
            id: uid(),
            title: 'Em andamento',
            cards: [{ id: uid(), text: 'Desenhar telas' }],
          },
          {
            id: uid(),
            title: 'Concluído',
            cards: [{ id: uid(), text: 'Reunião de kickoff' }],
          },
        ],
      },
    ],
    sel: id,
  };
}

export function defaultDiscState(): DiscState {
  const topicId = uid();
  const discId = uid();
  const cycleId = uid();
  const edId = uid();
  return {
    eds: [
      {
        id: edId,
        name: 'Edital 1',
        list: [
          {
            id: discId,
            name: 'Direito Administrativo',
            topics: [{ id: topicId, name: 'ATOS ADMINISTRATIVOS', studied: null, q: false, r: {}, h: 0, e: 0 }],
            log: {},
          },
        ],
        cycles: [
          {
            id: cycleId,
            name: 'Ciclo 1',
            items: [{ id: discId, min: 60 }],
            base: {},
            n: 0,
          },
        ],
        csel: cycleId,
      },
    ],
    edsel: edId,
    sel: discId,
    intv: [7, 15, 30, 60],
    acts: [],
    goals: { h: 20, q: 100 },
    rem: [],
    qlog: {},
    run: null,
  };
}

export function normalizeDiscState(raw: unknown): DiscState {
  const d: DiscState = raw && typeof raw === 'object' ? { ...(raw as DiscState) } : defaultDiscState();

  if (!d.eds || !Array.isArray(d.eds) || !d.eds.length) {
    const legacy = raw as { list?: DiscState['eds'][0]['list']; cycles?: DiscState['eds'][0]['cycles']; csel?: string } | null;
    const edId = uid();
    d.eds = [
      {
        id: edId,
        name: 'Edital 1',
        list: legacy?.list?.length ? legacy.list : [{ id: uid(), name: 'Direito Administrativo', topics: [] }],
        cycles: legacy?.cycles?.length ? legacy.cycles : undefined,
        csel: legacy?.csel,
      },
    ];
    d.edsel = edId;
  }

  if (!d.eds.some((e) => e.id === d.edsel)) {
    d.edsel = d.eds[0].id;
  }

  d.eds.forEach((ed) => {
    if (!ed.list || !Array.isArray(ed.list) || !ed.list.length) {
      ed.list = [{ id: uid(), name: 'Disciplina 1', topics: [] }];
    }
    ed.list.forEach((disc) => {
      disc.topics = disc.topics || [];
      disc.topics.forEach((topic) => {
        topic.name = String(topic.name || '').toUpperCase();
        if (Array.isArray(topic.r)) {
          const map: Record<number, number> = {};
          [1, 7, 15, 30, 45].forEach((days, idx) => {
            if ((topic.r as unknown as boolean[])[idx]) map[days] = 1;
          });
          topic.r = map;
        } else {
          topic.r = topic.r || {};
        }
        topic.subs = (topic.subs || []).map((sub) => ({
          id: sub.id || uid(),
          name: String(sub.name || '').toUpperCase(),
          studied: sub.studied ?? (sub.done ? todayStr() : null),
          done: !!(sub.done || sub.studied),
          videoTime: sub.videoTime || '',
          pi: sub.pi,
          pf: sub.pf,
          h: sub.h || 0,
          e: sub.e || 0,
          q: !!(sub.q || (sub.h || 0) + (sub.e || 0) > 0),
          tp: sub.tp || {},
          link: sub.link || '',
          r: sub.r || {},
          pdfId: sub.pdfId,
          pdfPagina: sub.pdfPagina,
        }));
      });
      disc.log = disc.log || {};
    });

    if (!ed.cycles || !ed.cycles.length) {
      ed.cycles = [
        {
          id: uid(),
          name: 'Ciclo 1',
          items: ed.list.slice(0, 3).map((disc) => ({ id: disc.id, min: 60 })),
          base: {},
          n: 0,
        },
      ];
      ed.csel = ed.cycles[0].id;
    }
    if (!ed.csel || !ed.cycles.some((c) => c.id === ed.csel)) {
      ed.csel = ed.cycles[0].id;
    }
  });

  const activeEd = d.eds.find((e) => e.id === d.edsel) || d.eds[0];
  if (!activeEd.list.some((disc) => disc.id === d.sel)) {
    d.sel = activeEd.list[0].id;
  }

  const isLegacyIntv = d.intv && d.intv.length === 4 && d.intv.join(',') === '1,15,30,45';
  d.intv = (d.intv && d.intv.length && !isLegacyIntv ? [...d.intv] : [7, 15, 30, 60]).sort((a, b) => a - b);
  d.acts = d.acts || [];
  d.goals = d.goals || { h: 20, q: 100 };
  d.rem = d.rem || [];
  d.qlog = d.qlog || {};
  d.weekPlan = d.weekPlan || {};
  return d;
}

export function loadBoards(): KanbanState {
  try {
    const raw = localStorage.getItem(LS_BOARDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const board = { id: uid(), name: 'Quadro 1', cols: parsed };
        return { list: [board], sel: board.id };
      }
      if (parsed && Array.isArray(parsed.list) && parsed.list.length) {
        if (!parsed.list.some((b: { id: string }) => b.id === parsed.sel)) {
          parsed.sel = parsed.list[0].id;
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Error loading boards:', err);
  }
  return defaultBoards();
}

export function saveBoards(state: KanbanState): void {
  try {
    localStorage.setItem(LS_BOARDS, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving boards:', err);
  }
}

export function loadDiscState(): DiscState {
  try {
    const raw = localStorage.getItem(LS_DISC);
    if (raw) return normalizeDiscState(JSON.parse(raw));
  } catch (err) {
    console.error('Error loading disciplines:', err);
  }
  return defaultDiscState();
}

export function saveDiscState(state: DiscState): void {
  try {
    localStorage.setItem(LS_DISC, JSON.stringify(state));
  } catch (err) {
    console.error('Error saving disciplines:', err);
  }
}

export function downloadBlob(content: BlobPart, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Preferências do usuário guardadas no aparelho (nome, tema, aba aberta, última página de cada PDF). */
export interface PreferenciasBackup {
  nomeUsuario: string;
  tema: string;
  navegacao: string;
  remAberto: string;
  pdfUltimaPagina: Record<string, string>;
}

const PREFIXO_PDF_PAGINA = 'pdfUltimaPagina:';

export function coletarPreferencias(): PreferenciasBackup {
  const pdfUltimaPagina: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIXO_PDF_PAGINA)) {
      pdfUltimaPagina[k.slice(PREFIXO_PDF_PAGINA.length)] = localStorage.getItem(k) || '0';
    }
  }
  return {
    nomeUsuario: localStorage.getItem('nomeUsuario') || '',
    tema: localStorage.getItem(LS_THEME) || '',
    navegacao: localStorage.getItem(LS_NAV) || '',
    remAberto: localStorage.getItem(LS_REM_OPEN) || '',
    pdfUltimaPagina,
  };
}

export function restaurarPreferencias(p: Partial<PreferenciasBackup> | undefined): void {
  if (!p) return;
  if (p.nomeUsuario) localStorage.setItem('nomeUsuario', p.nomeUsuario);
  if (p.tema) localStorage.setItem(LS_THEME, p.tema);
  if (p.navegacao) localStorage.setItem(LS_NAV, p.navegacao);
  if (p.remAberto) localStorage.setItem(LS_REM_OPEN, p.remAberto);
  Object.entries(p.pdfUltimaPagina || {}).forEach(([id, pagina]) => {
    localStorage.setItem(`${PREFIXO_PDF_PAGINA}${id}`, String(pagina));
  });
}

export async function montarBackup(boards: KanbanState, disc: DiscState) {
  const materiais = await exportAllMaterials();
  return {
    app: 'quadro-estudos',
    version: 2,
    exported: new Date().toISOString(),
    boards,
    materiais,
    // Estado completo do planejamento: editais, disciplinas, sessões, horas do formulário,
    // planejamento semanal, metas, ciclos, lembretes, registros de questões e cronômetro.
    disc: { ...disc },
    preferencias: coletarPreferencias(),
  };
}

/**
 * Salva um arquivo em qualquer lugar do aparelho.
 * Usa a tela de compartilhar do sistema (Drive, pasta, WhatsApp, e-mail etc.) quando disponível;
 * caso contrário, baixa o arquivo normalmente.
 */
export async function salvarEmQualquerLugar(
  nome: string,
  conteudo: string,
  tipo = 'application/json'
): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const arquivo = new File([conteudo], nome, { type: tipo });
  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };
  if (nav.share && nav.canShare && nav.canShare({ files: [arquivo] })) {
    try {
      await nav.share({ files: [arquivo], title: nome });
      return 'compartilhado';
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return 'cancelado';
    }
  }
  downloadBlob(conteudo, nome, tipo);
  return 'baixado';
}

export async function exportBackupJSON(boards: KanbanState, disc: DiscState): Promise<void> {
  const payload = await montarBackup(boards, disc);
  const resultado = await salvarEmQualquerLugar(
    `backup-estudos-${todayStr()}.json`,
    JSON.stringify(payload, null, 2),
    'application/json'
  );
  if (resultado !== 'cancelado') {
    try {
      localStorage.setItem('backupUltimoExport', String(Date.now()));
    } catch {
      /* ignora */
    }
  }
}

export function exportTopicsCSV(disc: DiscState): void {
  const rows: (string | number)[][] = [
    [
      'Edital',
      'Disciplina',
      'Conteúdo',
      'Nível',
      'Tópico/Assunto',
      'Tipo',
      'Tempo Vídeo',
      'Pág. inicial',
      'Pág. final',
      'Acertos',
      'Erros',
      'Último estudo',
      'Link',
    ],
  ];

  disc.eds.forEach((ed) => {
    ed.list.forEach((d) => {
      d.topics.forEach((topic) => {
        const types: string[] = [];
        if (topic.tp?.v) types.push('Videoaula');
        if (topic.tp?.p) types.push('PDF');
        if (topic.tp?.q) types.push('Questões');
        rows.push([
          ed.name,
          d.name,
          topic.g || '',
          'Tópico',
          topic.name,
          types.join('+'),
          topic.videoTime || '',
          topic.pi || '',
          topic.pf || '',
          topic.h || 0,
          topic.e || 0,
          topic.studied || '',
          topic.link || '',
        ]);
        (topic.subs || []).forEach((sub) => {
          const subTypes: string[] = [];
          if (sub.tp?.v) subTypes.push('Videoaula');
          if (sub.tp?.p) subTypes.push('PDF');
          if (sub.tp?.q) subTypes.push('Questões');
          rows.push([
            ed.name,
            d.name,
            topic.g || '',
            'Subtópico',
            `  ↳ ${sub.name}`,
            subTypes.join('+'),
            sub.videoTime || '',
            sub.pi || '',
            sub.pf || '',
            sub.h || 0,
            sub.e || 0,
            sub.studied || '',
            sub.link || '',
          ]);
        });
      });
    });
  });

  const csv = '\uFEFF' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  downloadBlob(csv, `planilha-estudos-${todayStr()}.csv`, 'text/csv;charset=utf-8');
}
