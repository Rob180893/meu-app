import React, { useState } from 'react';
import { Download, X } from 'lucide-react';

const LS_ULTIMO_EXPORT = 'backupUltimoExport';
const LS_DISPENSADO = 'lembreteBackupDispensado';
const DIA_MS = 24 * 60 * 60 * 1000;

const hojeChave = () => new Date().toISOString().slice(0, 10);

/** Mostra o lembrete se não houve exportação nas últimas 24h e ele não foi fechado hoje. */
const precisaLembrar = (): boolean => {
  try {
    const ultimo = Number(localStorage.getItem(LS_ULTIMO_EXPORT) || 0);
    const dispensadoHoje = localStorage.getItem(LS_DISPENSADO) === hojeChave();
    return Date.now() - ultimo >= DIA_MS && !dispensadoHoje;
  } catch {
    return false;
  }
};

interface Props {
  onExportar: () => Promise<void> | void;
}

/** Caixa flutuante, fechável, lembrando de exportar o backup para o Google Drive ou outro lugar. */
export const LembreteBackupDiario: React.FC<Props> = ({ onExportar }) => {
  const [visivel, setVisivel] = useState<boolean>(() => precisaLembrar());

  const fechar = () => {
    try {
      localStorage.setItem(LS_DISPENSADO, hojeChave());
    } catch {
      /* ignora */
    }
    setVisivel(false);
  };

  const exportar = async () => {
    await onExportar();
    setVisivel(false);
  };

  if (!visivel) return null;

  return (
    <div
      role="dialog"
      aria-label="Lembrete de backup"
      className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[70] rounded-2xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 shadow-2xl p-4"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 shrink-0">
          <Download className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900 dark:text-white">Faça seu backup de hoje</div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
            Exporte seus dados para o Google Drive ou outro lugar. Assim, se perder o aparelho, nada se perde.
          </p>
        </div>
        <button
          type="button"
          onClick={fechar}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          aria-label="Fechar lembrete"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          type="button"
          onClick={fechar}
          className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
        >
          Hoje não
        </button>
        <button
          type="button"
          onClick={exportar}
          className="px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
        >
          Exportar agora
        </button>
      </div>
    </div>
  );
};
