import React, { useEffect, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronUp, RotateCw } from 'lucide-react';
import type { DiscState, ReviewEntry } from '../types';
import { buildReviewEntries, daysDiff, todayStr } from '../utils/date';
import { LS_REM_OPEN } from '../utils/storage';

interface FloatingReviewsProps {
  discState: DiscState;
  onCheckReview: (
    discId: string,
    topicId: string,
    intervalDays: number,
    isPeriodic: boolean
  ) => void;
  onToggleManualReview: (
    discId: string,
    topicId: string,
    customId: string,
    done: boolean
  ) => void;
  onGoToReviews: () => void;
}

export const FloatingReviews: React.FC<FloatingReviewsProps> = ({
  discState,
  onCheckReview,
  onToggleManualReview,
  onGoToReviews,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(LS_REM_OPEN) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_REM_OPEN, isOpen ? '1' : '0');
    } catch {
      // Ignore storage error
    }
  }, [isOpen]);

  const today = todayStr();
  const entries = buildReviewEntries(discState.eds, discState);
  const dueEntries = entries
    .filter((entry) => entry.status === 'late' || entry.status === 'today')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  if (dueEntries.length === 0) return null;

  const lateCount = dueEntries.filter((e) => e.status === 'late').length;

  const handleComplete = (entry: ReviewEntry) => {
    if (entry.kind === 'manual' && entry.customId) {
      onToggleManualReview(entry.disciplineId, entry.topicId, entry.customId, true);
    } else {
      onCheckReview(
        entry.disciplineId,
        entry.topicId,
        entry.intervalDays,
        entry.kind === 'periodic'
      );
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-[60] max-w-xs w-[calc(100vw-2rem)] sm:w-80 rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <RotateCw className={`w-4 h-4 shrink-0 ${lateCount > 0 ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'}`} />
          <span className="text-xs font-extrabold uppercase tracking-wider text-slate-800 dark:text-slate-100 truncate">
            Revisões do Dia
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] font-bold tabular-nums ${
              lateCount > 0
                ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
            }`}
          >
            {dueEntries.length}
          </span>
        </div>
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-slate-200/80 dark:border-slate-800">
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {dueEntries.slice(0, 12).map((entry) => {
              const overdueDays = Math.max(0, daysDiff(entry.dueDate, today));
              return (
                <div
                  key={entry.key}
                  className="px-3.5 py-2.5 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition"
                >
                  <button
                    type="button"
                    onClick={() => handleComplete(entry)}
                    title="Marcar revisão como concluída"
                    className="w-5 h-5 rounded-md border border-slate-300 dark:border-slate-600 hover:border-emerald-500 hover:bg-emerald-500 hover:text-white flex items-center justify-center shrink-0 transition cursor-pointer"
                  >
                    <Check className="w-3 h-3 opacity-0 hover:opacity-100" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                      {entry.topicName}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1.5">
                      <span>{entry.disciplineName}</span>
                      <span>·</span>
                      <span className={overdueDays > 0 ? 'text-rose-500 font-semibold' : ''}>
                        {overdueDays > 0 ? `${overdueDays}d atraso` : 'Hoje'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
            {dueEntries.length > 12 && (
              <div className="px-3.5 py-2 text-[11px] text-slate-400 text-center">
                +{dueEntries.length - 12} revisões pendentes
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onGoToReviews}
            className="w-full px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 border-t border-slate-200/80 dark:border-slate-800 text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <span>Ver todas na aba Revisão</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
