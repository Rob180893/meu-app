import React, { useMemo, useState } from 'react';
import { RotateCw, X } from 'lucide-react';
import type { DiscState } from '../types';
import { buildReviewEntries } from '../utils/date';

interface Props {
  discState: DiscState;
  onVerRevisoes: () => void;
}

/** Janela que aparece ao abrir o app quando há revisões para fazer hoje ou atrasadas. */
export const AvisoRevisoesAbertura: React.FC<Props> = ({ discState, onVerRevisoes }) => {
  const [fechado, setFechado] = useState<boolean>(false);

  const { total, atrasadas, hoje, itens } = useMemo(() => {
    const entries = buildReviewEntries(discState.eds, discState);
    const due = entries
      .filter((e) => e.status === 'late' || e.status === 'today')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      total: due.length,
      atrasadas: due.filter((e) => e.status === 'late').length,
      hoje: due.filter((e) => e.status === 'today').length,
      itens: due,
    };
  }, [discState]);

  if (fechado || total === 0) return null;

  const fechar = () => setFechado(true);

  return (
    <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[calc(1rem+max(env(safe-area-inset-top,0px),28px))]">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Revisões para hoje</h2>
              <p className="text-xs text-slate-500">
                {total} {total === 1 ? 'revisão pendente' : 'revisões pendentes'}
                {hoje > 0 && ` · ${hoje} para hoje`}
                {atrasadas > 0 && ` · ${atrasadas} atrasadas`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={fechar}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {itens.map((e) => (
            <li
              key={e.key}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70"
            >
              <div className="text-[11px] font-bold text-slate-500 truncate">{e.disciplineName}</div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{e.topicName}</div>
              {e.status === 'late' && (
                <div className="text-[11px] font-bold text-rose-600 dark:text-rose-400">Atrasada</div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={fechar}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
          >
            Agora não
          </button>
          <button
            type="button"
            onClick={() => {
              fechar();
              onVerRevisoes();
            }}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
          >
            Ver revisões
          </button>
        </div>
      </div>
    </div>
  );
};
