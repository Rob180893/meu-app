import React, { useState } from 'react';
import { DiscState, Edital } from '../types';
import { buildReviewItems, ReviewItem } from '../utils/reviews';
import { addD, fmt, iso } from '../utils/formatters';
import {
  RotateCw,
  Check,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Video,
  FileText,
  ListChecks,
  Link as LinkIcon,
} from 'lucide-react';

interface ReviewViewProps {
  discState: DiscState;
  onCheckReview: (disciplineId: string, topicId: string, intervalDays: number, isRecurring?: boolean) => void;
  onToggleManualReview: (disciplineId: string, topicId: string, customId: string, done: boolean) => void;
}

type Tab = 'programadas' | 'atrasadas' | 'concluidas';

const ALL = '__all__';

const CARD =
  'p-4 rounded-2xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm';

// Dias entre duas datas YYYY-MM-DD (b - a)
const diffDays = (a: string, b: string): number => {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
};

const weekday = (k: string): string => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
};

const dayLabel = (k: string, today: string): string => {
  if (k === today) return 'Hoje';
  if (k === addD(today, 1)) return 'Amanhã';
  return `${fmt(k)} · ${weekday(k)}`;
};

const intervalChip = (i: ReviewItem): string => {
  if (i.kind === 'manual') return 'Manual';
  if (i.kind === 'periodic') return `Periódica · ${i.intervalDays}d`;
  return i.intervalDays === 1 ? '1 dia' : `${i.intervalDays} dias`;
};

const sortAsc = (a: ReviewItem, b: ReviewItem) => a.dueDate.localeCompare(b.dueDate);
const sortDesc = (a: ReviewItem, b: ReviewItem) => b.dueDate.localeCompare(a.dueDate);

const groupByDate = (list: ReviewItem[]): [string, ReviewItem[]][] => {
  const map = new Map<string, ReviewItem[]>();
  list.forEach((i) => map.set(i.dueDate, [...(map.get(i.dueDate) || []), i]));
  return [...map.entries()];
};

const Kpi: React.FC<{ title: string; value: number; sub: string; tone: string; icon: React.ReactNode }> = ({
  title,
  value,
  sub,
  tone,
  icon,
}) => (
  <div className={`${CARD} flex flex-col justify-between gap-2`}>
    <div className="flex items-center justify-between text-slate-400">
      <span className="text-[11px] font-bold uppercase tracking-wider">{title}</span>
      {icon}
    </div>
    <div>
      <div className={`text-2xl sm:text-3xl font-black tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400">{sub}</div>
    </div>
  </div>
);

export const ReviewView: React.FC<ReviewViewProps> = ({
  discState,
  onCheckReview,
  onToggleManualReview,
}) => {
  const today = iso(new Date());
  const [tab, setTab] = useState<Tab>('programadas');
  const [editalId, setEditalId] = useState<string>(discState.edsel || discState.eds[0]?.id || ALL);
  const [discFilter, setDiscFilter] = useState<string>(ALL);

  const selectedEd = discState.eds.find((e) => e.id === editalId);
  const scopeEds: Edital[] = editalId === ALL || !selectedEd ? discState.eds : [selectedEd];
  const discOptions = scopeEds.flatMap((e) => e.list || []);

  const items = buildReviewItems(scopeEds, discState).filter(
    (i) => discFilter === ALL || i.disciplineId === discFilter
  );

  const todayCount = items.filter((i) => i.status === 'today').length;
  const late = items.filter((i) => i.status === 'late').sort(sortAsc);
  const next7 = items.filter((i) => i.status === 'scheduled' && i.dueDate <= addD(today, 7)).length;
  const done = items.filter((i) => i.status === 'done').sort(sortDesc);
  const programadas = items.filter((i) => i.status === 'today' || i.status === 'scheduled').sort(sortAsc);

  const list = tab === 'programadas' ? programadas : tab === 'atrasadas' ? late : done;
  const groups = groupByDate(list);

  const complete = (item: ReviewItem) => {
    if (item.kind === 'manual' && item.customId) {
      onToggleManualReview(item.disciplineId, item.topicId, item.customId, item.status !== 'done');
    } else {
      onCheckReview(item.disciplineId, item.topicId, item.intervalDays, item.kind === 'periodic');
    }
  };

  const tabs: { key: Tab; label: string; count?: number; alert?: boolean }[] = [
    { key: 'programadas', label: 'Programadas', count: programadas.length },
    { key: 'atrasadas', label: 'Atrasadas', count: late.length, alert: true },
    { key: 'concluidas', label: 'Concluídas' },
  ];

  const renderCard = (i: ReviewItem) => {
    const t = i.topic;
    const hits = t.h || 0;
    const errs = t.e || 0;
    const q = hits + errs;
    const rate = q > 0 ? Math.round((hits / q) * 100) : null;
    const isDone = i.status === 'done';
    const lateDays = i.status === 'late' ? diffDays(i.dueDate, today) : 0;

    return (
      <div
        key={i.key}
        className="p-4 rounded-2xl bg-slate-50/80 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">
            {intervalChip(i)}
          </span>
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200 truncate">
            {i.disciplineName}
          </span>
          {i.kind === 'periodic' && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500 text-white">REVISÃO</span>
          )}
          {t.tp?.v && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300">
              <Video className="w-3 h-3" /> Videoaula
            </span>
          )}
          {t.tp?.p && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
              <FileText className="w-3 h-3" /> PDF
            </span>
          )}
          {t.tp?.q && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
              <ListChecks className="w-3 h-3" /> Questões
            </span>
          )}
        </div>

        <div className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{t.name}</div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              Estudado em <strong className="text-slate-700 dark:text-slate-200">{fmt(i.studiedDate)}</strong>
            </span>
            {i.kind !== 'manual' && (
              <span>
                Previsto para <strong className="text-slate-700 dark:text-slate-200">{fmt(i.dueDate)}</strong>
              </span>
            )}
            {q > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{hits}</span> /
                <span className="font-bold text-rose-500">{errs}</span>
                {rate !== null && (
                  <span
                    className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                      rate >= 80
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                        : rate >= 60
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300'
                    }`}
                  >
                    {rate}%
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
                <LinkIcon className="w-3 h-3" /> Material
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {i.status === 'late' && (
              <span className="text-[11px] font-bold text-rose-500">
                atrasada {lateDays} {lateDays === 1 ? 'dia' : 'dias'}
              </span>
            )}
            {isDone ? (
              i.kind === 'manual' ? (
                <button
                  type="button"
                  onClick={() => complete(i)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
                >
                  Reabrir
                </button>
              ) : (
                <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                  <Check className="w-3.5 h-3.5" /> Concluída
                </span>
              )
            ) : (
              <button
                type="button"
                onClick={() => complete(i)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Concluir revisão
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e filtros */}
      <div className="flex flex-col gap-4 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
              <RotateCw className="w-6 h-6 text-emerald-500" />
              Revisões
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Acompanhe o que revisar hoje, o que está atrasado e o que já foi concluído.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={editalId}
              onChange={(e) => {
                setEditalId(e.target.value);
                setDiscFilter(ALL);
              }}
              aria-label="Edital"
              className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value={ALL}>Todos os editais</option>
              {discState.eds.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.name}
                </option>
              ))}
            </select>
            <select
              value={discFilter}
              onChange={(e) => setDiscFilter(e.target.value)}
              aria-label="Disciplina"
              className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer max-w-[220px]"
            >
              <option value={ALL}>Todas as disciplinas</option>
              {discOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Para hoje" value={todayCount} sub="revisões programadas" tone="text-emerald-600 dark:text-emerald-400" icon={<CalendarDays className="w-4 h-4 text-emerald-500" />} />
        <Kpi title="Atrasadas" value={late.length} sub={late.length ? 'pedem atenção' : 'nenhuma atrasada'} tone="text-rose-500" icon={<AlertTriangle className="w-4 h-4 text-rose-500" />} />
        <Kpi title="Próximos 7 dias" value={next7} sub="revisões previstas" tone="text-blue-600 dark:text-blue-400" icon={<RotateCw className="w-4 h-4 text-blue-500" />} />
        <Kpi title="Concluídas" value={done.length} sub="no total" tone="text-indigo-600 dark:text-indigo-400" icon={<CheckCircle2 className="w-4 h-4 text-indigo-500" />} />
      </div>

      {/* Abas */}
      <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700 p-1 w-fit max-w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
              tab === t.key
                ? 'bg-emerald-600 text-white shadow'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-md font-black ${
                  t.alert
                    ? 'bg-rose-500 text-white'
                    : tab === t.key
                    ? 'bg-white/25 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Lista agrupada por data */}
      {groups.length === 0 ? (
        <div className={`${CARD} text-center py-10`}>
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
          {groups.map(([dateKey, group]) => (
            <section key={dateKey} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3
                  className={`text-xs font-extrabold uppercase tracking-wider ${
                    dateKey < today ? 'text-rose-500' : dateKey === today ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  {dayLabel(dateKey, today)}
                </h3>
                <div className="flex-1 h-px bg-emerald-200/70 dark:bg-emerald-900/60" />
                <span className="text-[11px] text-slate-400">{group.length} {group.length === 1 ? 'revisão' : 'revisões'}</span>
              </div>
              <div className="space-y-3">{group.map(renderCard)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
