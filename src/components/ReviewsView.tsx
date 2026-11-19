import React, { useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle,
  FileText,
  Link2,
  ListChecks,
  RotateCw,
  Video,
} from 'lucide-react';
import type { DiscState, ReviewEntry } from '../types';
import { addDays, buildReviewEntries, daysDiff, formatShortDate, todayStr } from '../utils/date';

interface ReviewsViewProps {
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
}

const ALL_KEY = '__all__';
const CARD_CLS =
  'p-4 rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm';

const formatDayLabel = (iso: string, today: string): string => {
  if (iso === today) return 'Hoje';
  if (iso === addDays(today, 1)) return 'Amanhã';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d)
    .toLocaleDateString('pt-BR', { weekday: 'short' })
    .replace('.', '');
  return `${formatShortDate(iso)} · ${wd}`;
};

const kindLabel = (entry: ReviewEntry): string =>
  entry.kind === 'manual'
    ? 'Manual'
    : entry.kind === 'periodic'
    ? `Periódica · ${entry.intervalDays}d`
    : entry.intervalDays === 1
    ? '1 dia'
    : `${entry.intervalDays} dias`;

export const ReviewsView: React.FC<ReviewsViewProps> = ({
  discState,
  onCheckReview,
  onToggleManualReview,
}) => {
  const today = todayStr();
  const [tab, setTab] = useState<'programadas' | 'atrasadas' | 'concluidas'>('programadas');
  const [editalFilter, setEditalFilter] = useState(
    discState.edsel || discState.eds[0]?.id || ALL_KEY
  );
  const [discFilter, setDiscFilter] = useState(ALL_KEY);

  const selectedEdital = discState.eds.find((e) => e.id === editalFilter);
  const targetEditais = editalFilter === ALL_KEY || !selectedEdital ? discState.eds : [selectedEdital];
  const targetDiscs = targetEditais.flatMap((e) => e.list || []);

  const entries = buildReviewEntries(targetEditais, discState).filter(
    (e) => discFilter === ALL_KEY || e.disciplineId === discFilter
  );

  const todayCount = entries.filter((e) => e.status === 'today').length;
  const lateList = entries
    .filter((e) => e.status === 'late')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const next7Count = entries.filter(
    (e) => e.status === 'scheduled' && e.dueDate <= addDays(today, 7)
  ).length;
  const doneList = entries
    .filter((e) => e.status === 'done')
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  const scheduledList = entries
    .filter((e) => e.status === 'today' || e.status === 'scheduled')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  const visibleList =
    tab === 'programadas' ? scheduledList : tab === 'atrasadas' ? lateList : doneList;

  const grouped = new Map<string, ReviewEntry[]>();
  visibleList.forEach((entry) => {
    grouped.set(entry.dueDate, [...(grouped.get(entry.dueDate) || []), entry]);
  });

  const handleToggle = (entry: ReviewEntry) => {
    if (entry.kind === 'manual' && entry.customId) {
      onToggleManualReview(entry.disciplineId, entry.topicId, entry.customId, entry.status !== 'done');
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
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <RotateCw className="w-6 h-6 text-emerald-500" />
            <span>Revisões</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Acompanhe o que revisar hoje, o que está atrasado e o que já foi concluído.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={editalFilter}
            onChange={(e) => {
              setEditalFilter(e.target.value);
              setDiscFilter(ALL_KEY);
            }}
            aria-label="Edital"
            className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value={ALL_KEY}>Todos os editais</option>
            {discState.eds.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>

          <select
            value={discFilter}
            onChange={(e) => setDiscFilter(e.target.value)}
            aria-label="Disciplina"
            className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer max-w-[220px]"
          >
            <option value={ALL_KEY}>Todas as disciplinas</option>
            {targetDiscs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${CARD_CLS} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Para hoje</span>
            <CalendarDays className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-emerald-600 dark:text-emerald-400">
              {todayCount}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              revisões programadas
            </div>
          </div>
        </div>

        <div className={`${CARD_CLS} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Atrasadas</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-rose-500">
              {lateList.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {lateList.length ? 'pedem atenção' : 'nenhuma atrasada'}
            </div>
          </div>
        </div>

        <div className={`${CARD_CLS} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Próximos 7 dias</span>
            <RotateCw className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-blue-600 dark:text-blue-400">
              {next7Count}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              revisões previstas
            </div>
          </div>
        </div>

        <div className={`${CARD_CLS} flex flex-col justify-between gap-2`}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Concluídas</span>
            <CheckCircle className="w-4 h-4 text-indigo-500" />
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">
              {doneList.length}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">no total</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 p-1 w-fit max-w-full overflow-x-auto">
        {(
          [
            { key: 'programadas', label: 'Programadas', count: scheduledList.length, alert: false },
            { key: 'atrasadas', label: 'Atrasadas', count: lateList.length, alert: true },
            { key: 'concluidas', label: 'Concluídas', count: undefined, alert: false },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === item.key
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            <span>{item.label}</span>
            {item.count !== undefined && item.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-black tabular-nums ${
                  item.alert
                    ? 'bg-rose-500 text-white'
                    : tab === item.key
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {grouped.size === 0 ? (
        <div className={`${CARD_CLS} text-center py-10`}>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {tab === 'programadas'
              ? 'Nenhuma revisão programada.'
              : tab === 'atrasadas'
              ? 'Nenhuma revisão atrasada. Ótimo trabalho!'
              : 'Nenhuma revisão concluída ainda.'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            As revisões aparecem automaticamente depois que você marca um tópico como estudado.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([date, list]) => (
            <section key={date} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3
                  className={`text-xs font-extrabold uppercase tracking-wider ${
                    date < today
                      ? 'text-rose-500'
                      : date === today
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {formatDayLabel(date, today)}
                </h3>
                <div className="flex-1 h-px bg-emerald-200/70 dark:bg-emerald-900/60" />
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {list.length} {list.length === 1 ? 'revisão' : 'revisões'}
                </span>
              </div>

              <div className="space-y-3">
                {list.map((entry) => {
                  const t = entry.topic;
                  const hits = t.h || 0;
                  const errors = t.e || 0;
                  const q = hits + errors;
                  const rate = q > 0 ? Math.round((hits / q) * 100) : null;
                  const lateDays = entry.status === 'late' ? daysDiff(entry.dueDate, today) : 0;

                  return (
                    <div
                      key={entry.key}
                      className="p-4 rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 flex flex-col gap-3 shadow-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-slate-700 dark:text-slate-200">
                          {kindLabel(entry)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200 truncate">
                          {entry.disciplineName}
                        </span>
                        {entry.kind === 'periodic' && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-bold text-rose-500">Revisão contínua</span>
                          </>
                        )}
                        {t.tp?.v && (
                          <span className="inline-flex items-center gap-1 text-violet-600 dark:text-violet-400 font-semibold">
                            <Video className="w-3 h-3" /> Videoaula
                          </span>
                        )}
                        {t.tp?.p && (
                          <span className="inline-flex items-center gap-1 text-sky-600 dark:text-sky-400 font-semibold">
                            <FileText className="w-3 h-3" /> PDF
                          </span>
                        )}
                        {t.tp?.q && (
                          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                            <ListChecks className="w-3 h-3" /> Questões
                          </span>
                        )}
                      </div>

                      <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                        {t.name}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                          <span>
                            Estudado em{' '}
                            <strong className="text-slate-700 dark:text-slate-200">
                              {formatShortDate(entry.studiedDate)}
                            </strong>
                          </span>
                          {entry.kind !== 'manual' && (
                            <span>
                              Previsto para{' '}
                              <strong className="text-slate-700 dark:text-slate-200">
                                {formatShortDate(entry.dueDate)}
                              </strong>
                            </span>
                          )}
                          {q > 0 && (
                            <span className="flex items-center gap-1.5">
                              <span className="font-bold text-emerald-600 dark:text-emerald-400">
                                {hits}
                              </span>{' '}
                              /<span className="font-bold text-rose-500">{errors}</span>
                              {rate !== null && (
                                <span className="font-bold text-slate-700 dark:text-slate-200">
                                  ({rate}%)
                                </span>
                              )}
                            </span>
                          )}
                          {t.link && (
                            <a
                              href={t.link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Link2 className="w-3 h-3" /> Material
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {entry.status === 'late' && (
                            <span className="text-[11px] font-bold text-rose-500 tabular-nums">
                              atrasada {lateDays} {lateDays === 1 ? 'dia' : 'dias'}
                            </span>
                          )}
                          {entry.status === 'done' ? (
                            entry.kind === 'manual' ? (
                              <button
                                type="button"
                                onClick={() => handleToggle(entry)}
                                className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                              >
                                Reabrir
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <Check className="w-3.5 h-3.5" /> Concluída
                              </span>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggle(entry)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer whitespace-nowrap"
                            >
                              <Check className="w-3.5 h-3.5" /> Concluir revisão
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
