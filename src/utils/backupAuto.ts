/**
 * Backups automáticos guardados no próprio aparelho (IndexedDB).
 * Mantém os 7 mais recentes e é usado pela tela "Backups automáticos".
 */
const DB = 'quadro-backups';
const STORE = 'snapshots';
const MAX = 2;
export const INTERVALO_BACKUP_MS = 6 * 60 * 60 * 1000; // a cada 6 horas, se houve mudanças
const LS_ULTIMO = 'backupAutoUltimo';
const LS_SUJO = 'backupAutoSujo';

export interface SnapshotMeta {
  id: string; // data/hora ISO
  tamanho: number;
}

let dbP: Promise<IDBDatabase> | null = null;
const abrir = (): Promise<IDBDatabase> => {
  if (!dbP) {
    dbP = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbP;
};

const tx = async <T>(modo: IDBTransactionMode, fn: (st: IDBObjectStore) => IDBRequest): Promise<T> => {
  const db = await abrir();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, modo);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r.result as T);
    t.onerror = () => reject(t.error);
  });
};

export async function listarSnapshots(): Promise<SnapshotMeta[]> {
  const chaves = ((await tx<IDBValidKey[]>('readonly', (st) => st.getAllKeys())) || []) as string[];
  const lista: SnapshotMeta[] = [];
  for (const id of chaves) {
    const texto = await tx<string | undefined>('readonly', (st) => st.get(id));
    lista.push({ id, tamanho: (texto || '').length });
  }
  return lista.sort((a, b) => (a.id < b.id ? 1 : -1));
}

export async function obterSnapshot(id: string): Promise<string | undefined> {
  return tx<string | undefined>('readonly', (st) => st.get(id));
}

export async function excluirSnapshot(id: string): Promise<void> {
  await tx('readwrite', (st) => st.delete(id));
}

/** Guarda uma cópia e mantém só as MAX mais recentes. */
export async function salvarSnapshot(texto: string): Promise<void> {
  const id = new Date().toISOString();
  await tx('readwrite', (st) => st.put(texto, id));
  const todos = await listarSnapshots();
  for (const antigo of todos.slice(MAX)) await excluirSnapshot(antigo.id);
  localStorage.setItem(LS_ULTIMO, String(Date.now()));
  localStorage.setItem(LS_SUJO, '0');
}

export const marcarAlterado = (): void => {
  try {
    localStorage.setItem(LS_SUJO, '1');
  } catch {
    /* ignora */
  }
};

/** Deve salvar? Só se houve alteração e já passou o intervalo desde o último backup. */
export const deveSalvarBackup = (): boolean => {
  try {
    const sujo = localStorage.getItem(LS_SUJO) === '1';
    const ultimo = Number(localStorage.getItem(LS_ULTIMO) || 0);
    return sujo && Date.now() - ultimo >= INTERVALO_BACKUP_MS;
  } catch {
    return false;
  }
};

export const ultimoBackupEm = (): number => {
  try {
    return Number(localStorage.getItem(LS_ULTIMO) || 0);
  } catch {
    return 0;
  }
};
