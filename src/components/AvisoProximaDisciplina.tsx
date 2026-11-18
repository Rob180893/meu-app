import React, { useEffect } from 'react';
import { AlarmClock, ArrowRight, X } from 'lucide-react';
import { AvisoProxima, avisarSonoroVisual } from '../utils/alerts';

interface Props {
  aviso: AvisoProxima | null;
  onIniciarProxima: (id: string) => void;
  onFechar: (key: string) => void;
}

export const AvisoProximaDisciplina: React.FC<Props> = ({ aviso, onIniciarProxima, onFechar }) => {
  // Toca o aviso uma vez cada vez que um novo aviso aparece
  useEffect(() => {
    if (aviso) avisarSonoroVisual();
  }, [aviso?.key]);

  if (!aviso) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed top-4 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-[70] rounded-3xl bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-800 shadow-2xl p-5"
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300 shrink-0">
          <AlarmClock className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-black text-slate-900 dark:text-white">{aviso.titulo}</div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{aviso.mensagem}</p>
        </div>
        <button
          type="button"
          onClick={() => onFechar(aviso.key)}
          className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          aria-label="Fechar aviso"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={() => onFechar(aviso.key)}
          className="px-3 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
        >
          Continuar nesta
        </button>
        {aviso.proximaId && (
          <button
            type="button"
            onClick={() => onIniciarProxima(aviso.proximaId as string)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer"
          >
            Iniciar {aviso.proximaNome}
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
