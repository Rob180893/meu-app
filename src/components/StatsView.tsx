import React, { useState } from 'react';
import { AlertTriangle, Award, CheckCircle, Clock, Flame, Target } from 'lucide-react';
import type { ActiveRun, Discipline, DiscState } from '../types';
import { addDays, formatDurationStats, formatShortDate, todayStr } from '../utils/date';

interface StatsViewProps {
  discState: DiscState;
  activeRun: ActiveRun | null;
  currentElapsedSeconds: number;
}

const ALL_EDITAIS = '__all__';

const PERIODS = [
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 'all', label: 'Tudo' },
] as const;

const SORTS = [
  { value: 'time', label: 'Tempo' },
  { value: 'questions', label: 'Questões' },
  { value: 'rate', label: 'Aproveitamento' },
  { value: 'name', label: 'Nome' },
] as const;

const CARD_CLS =
  'p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm';

export const StatsView: React.FC<StatsViewProps> = ({
  discState,
  activeRun,
  currentElapsedSeconds,
}) => {
  const [period, setPeriod] = useState<7 | 30 | 90 | 'all'>(30);
  const [editalFilter, setEditalFilter] = useState<string>(
    discState.edsel || discState.eds[0]?.id || ALL_EDITAIS
  );
  const [sortBy, setSortBy] = useState<'time' | 'questions' | 'rate' | 'name'>('time');

  const today = todayStr();
  const targetEditais =
    editalFilter === ALL_EDITAIS
      ? discState.eds
      : discState.eds.filter((e) => e.id === editalFilter);
  const targetList = targetEditais.length ? targetEditais : discState.eds;
  const disciplines: Discipline[] = targetList.flatMap((e) => e.list || []);

  // Mapa diário de segundos
  const dailyMap: Record<string, number> = {};
  disciplines.forEach((d) => {
    Object.entries(d.log || {}).forEach(([day, sec]) => {
      dailyMap[day] = (dailyMap[day] || 0) + (sec || 0);
    });
  });
  if (activeRun?.start && activeRun.day && disciplines.some((d) => d.id === activeRun.id)) {
    dailyMap[activeRun.day] = (dailyMap[activeRun.day] || 0) + currentElapsedSeconds;
  }

  // Range de datas
  const firstActiveDay =
    Object.keys(dailyMap)
      .filter((k) => dailyMap[k] > 0)
      .sort()[0] || today;
  const startDate = period === 'all' ? firstActiveDay : addDays(today, -(period - 1));
  const rangeDays: string[] = [];
  let cursor = startDate;
  while (cursor <= today) {
    rangeDays.push(cursor);
    cursor = addDays(cursor, 1);
  }

  const totalSecPeriod = rangeDays.reduce((acc, d) => acc + (dailyMap[d] || 0), 0);
  const studiedDaysCount = rangeDays.filter((d) => (dailyMap[d] || 0) > 0).length;
  const avgSecPerStudiedDay = studiedDaysCount > 0 ? totalSecPeriod / studiedDaysCount : 0;
  const consistencyPct =
    rangeDays.length > 0 ? Math.round((studiedDaysCount / rangeDays.length) * 100) : 0;

  // Sequência global
  const activeDatesSet = new Set(Object.keys(dailyMap).filter((k) => dailyMap[k] > 0));
  const sortedDates = [...activeDatesSet].sort();
  let longestStreak = 0;
  let running = 0;
  let prevDay: string | null = null;
  sortedDates.forEach((d) => {
    running = prevDay && addDays(prevDay, 1) === d ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    prevDay = d;
  });
  let currentStreak = 0;
  let check = today;
  if (!activeDatesSet.has(check)) check = addDays(today, -1);
  while (activeDatesSet.has(check)) {
    currentStreak++;
    check = addDays(check, -1);
  }

  // Totais de questões & tópicos
  let hits = 0;
  let errors = 0;
  let totalTopics = 0;
  let studiedTopics = 0;

  const perDisc = disciplines.map((d) => {
    let sec = rangeDays.reduce((acc, day) => acc + ((d.log && d.log[day]) || 0), 0);
    if (activeRun?.id === d.id && activeRun.start && rangeDays.includes(activeRun.day)) {
      sec += currentElapsedSeconds;
    }

    let dHits = 0;
    let dErrors = 0;
    let dTotal = 0;
    let dStudied = 0;
    let dReviews = 0;

    d.topics.forEach((t) => {
      dTotal++;
      if (t.studied) dStudied++;
      dHits += t.h || 0;
      dErrors += t.e || 0;
      dReviews +=
        Object.values(t.r || {}).filter(Boolean).length + (t.recurringDates?.length || 0);
      (t.subs || []).forEach((s) => {
        dTotal++;
        if (s.studied || s.done) dStudied++;
        dHits += s.h || 0;
        dErrors += s.e || 0;
        dReviews += Object.values(s.r || {}).filter(Boolean).length;
      });
    });
    dHits += d.qh || 0;
    dErrors += d.qe || 0;

    hits += dHits;
    errors += dErrors;
    totalTopics += dTotal;
    studiedTopics += dStudied;

    const q = dHits + dErrors;
    return {
      discipline: d,
      seconds: sec,
      hits: dHits,
      errors: dErrors,
      questions: q,
      hitRate: q > 0 ? Math.round((dHits / q) * 100) : null,
      studiedTopics: dStudied,
      totalTopics: dTotal,
      coveragePct: dTotal > 0 ? Math.round((dStudied / dTotal) * 100) : 0,
      reviews: dReviews,
    };
  });

  const totalQuestions = hits + errors;
  const globalHitRate = totalQuestions > 0 ? Math.round((hits / totalQuestions) * 100) : null;
  const editalPct = totalTopics > 0 ? Math.round((studiedTopics / totalTopics) * 100) : 0;

  const sortedDiscs = [...perDisc].sort((a, b) => {
    if (sortBy === 'questions') return b.questions - a.questions;
    if (sortBy === 'rate') return (b.hitRate ?? -1) - (a.hitRate ?? -1);
    if (sortBy === 'name') return a.discipline.name.localeCompare(b.discipline.name);
    return b.seconds - a.seconds;
  });

  const maxDiscSec = Math.max(...perDisc.map((x) => x.seconds), 1);
  const maxDiscQ = Math.max(...perDisc.map((x) => x.questions), 1);
  const hoursSeries = rangeDays.map((day) => (dailyMap[day] || 0) / 3600);
  const maxHoursDay = Math.max(...hoursSeries, 0.5);
  const labelStep = Math.max(1, Math.ceil(rangeDays.length / 8));

  const mostStudied = [...perDisc].filter((x) => x.seconds > 0).sort((a, b) => b.seconds - a.seconds)[0];
  const bestPerf = [...perDisc]
    .filter((x) => x.hitRate !== null && x.questions >= 5)
    .sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0))[0];
  const attentionDisc = [...perDisc]
    .filter((x) => x.hitRate !== null && x.hitRate < 65 && x.questions >= 5)
    .sort((a, b) => (a.hitRate ?? 100) - (b.hitRate ?? 100))[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            Estatísticas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Evolução de horas, constância e desempenho por disciplina
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={editalFilter}
            onChange={(e) => setEditalFilter(e.target.value)}
            aria-label="Edital"
            className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 outline-none cursor-pointer"
          >
            <option value={ALL_EDITAIS}>Todos os editais</option>
            {discState.eds.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.name} ({ed.list.length} disc.)
              </option>
            ))}
          </select>

          <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 overflow-x-auto">
            {PERIODS.map((p) => (
              <button
                key={String(p.value)}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  period === p.value
                    ? 'bg-emerald-600 text-white shadow'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={CARD_CLS}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Tempo no período</span>
            <Clock className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2 tabular-nums">
            {formatDurationStats(totalSecPeriod)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {studiedDaysCount > 0
              ? `${formatDurationStats(avgSecPerStudiedDay)} por dia estudado`
              : 'Nenhum estudo no período'}
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Constância</span>
            <Flame className="w-4 h-4 text-orange-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mt-2 tabular-nums">
            {consistencyPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {studiedDaysCount} de {rangeDays.length} dias · sequência {currentStreak}d (recorde{' '}
            {longestStreak}d)
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Taxa de acertos</span>
            <Target className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-2 tabular-nums">
            {globalHitRate === null ? '—' : `${globalHitRate}%`}
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {hits} acertos · {errors} erros (acumulado)
          </div>
        </div>

        <div className={CARD_CLS}>
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[11px] font-bold uppercase tracking-wider">Edital concluído</span>
            <CheckCircle className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 mt-2 tabular-nums">
            {editalPct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
            {studiedTopics} de {totalTopics} tópicos · {totalTopics - studiedTopics} pendentes
          </div>
        </div>
      </div>

      {/* Horas por dia */}
      <div className={CARD_CLS}>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 mb-4">
          Horas por dia
        </h3>
        {rangeDays.length === 0 || totalSecPeriod === 0 ? (
          <p className="text-xs text-slate-400">Nenhum estudo registrado neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-[3px] h-40 min-w-full">
              {hoursSeries.map((h, i) => (
                <div
                  key={rangeDays[i]}
                  className="flex-1 min-w-[6px] h-full flex items-end"
                  title={`${formatShortDate(rangeDays[i])}: ${formatDurationStats(h * 3600)}`}
                >
                  <div
                    className="w-full rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition"
                    style={{ height: `${Math.max(h > 0 ? 3 : 0, (h / maxHoursDay) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] min-w-full mt-1.5">
              {rangeDays.map((day, idx) => (
                <div
                  key={day}
                  className="flex-1 min-w-[6px] text-[9px] text-slate-400 text-center tabular-nums"
                >
                  {idx % labelStep === 0 ? formatShortDate(day) : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Desempenho por disciplina */}
      <div className={`${CARD_CLS} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Desempenho por disciplina
          </h3>
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
              Ordenar:
            </span>
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSortBy(s.value)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  sortBy === s.value
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {disciplines.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma disciplina cadastrada neste edital.</p>
        ) : (
          <div className="space-y-3">
            {sortedDiscs.map((item) => {
              const sharePct =
                totalSecPeriod > 0 ? Math.round((item.seconds / totalSecPeriod) * 100) : 0;
              return (
                <div
                  key={item.discipline.id}
                  className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 uppercase truncate">
                        {item.discipline.name}
                      </span>
                      {item.seconds > 0 && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold tabular-nums">
                          · {sharePct}% do tempo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 tabular-nums">
                      {item.hitRate !== null && (
                        <span
                          className={`text-[11px] font-bold ${
                            item.hitRate >= 80
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : item.hitRate >= 60
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {item.hitRate}% acertos
                        </span>
                      )}
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {formatDurationStats(item.seconds)}
                      </span>
                    </div>
                  </div>

                  <div className="h-3 bg-slate-200/70 dark:bg-slate-700/60 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                      style={{
                        width: `${item.seconds > 0 ? Math.max(3, (item.seconds / maxDiscSec) * 100) : 0}%`,
                      }}
                    />
                  </div>

                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>
                      Tópicos:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {item.studiedTopics}/{item.totalTopics}
                      </strong>{' '}
                      ({item.coveragePct}%)
                    </span>
                    <span>
                      Questões:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {item.questions}
                      </strong>{' '}
                      ({item.hits} acertos / {item.errors} erros)
                    </span>
                    <span>
                      Revisões concluídas:{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">
                        {item.reviews}
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disciplinas x Desempenho */}
      <div className={CARD_CLS}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Disciplinas x Desempenho
          </h3>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
              Questões
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-violet-600" />
              Desempenho
            </span>
          </div>
        </div>

        {disciplines.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhuma disciplina cadastrada neste edital.</p>
        ) : (
          <div className="overflow-x-auto pb-2">
            <div
              className="flex gap-3 pt-6"
              style={{ minWidth: `${Math.max(perDisc.length * 64, 0)}px` }}
            >
              {perDisc.map((item) => (
                <div key={item.discipline.id} className="flex flex-col flex-1 min-w-[56px]">
                  <div className="relative h-48 border-b border-slate-200 dark:border-slate-700">
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-7 rounded-t-md bg-emerald-400 hover:bg-emerald-500 transition"
                      style={{ height: `${(item.questions / maxDiscQ) * 100}%` }}
                      title={`${item.discipline.name}: ${item.questions} questões`}
                    />
                    {item.hitRate !== null && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 text-[11px] font-bold text-white bg-violet-600 px-2 py-0.5 rounded-lg whitespace-nowrap shadow-sm tabular-nums"
                        style={{ bottom: `${item.hitRate}%` }}
                        title={`${item.discipline.name}: ${item.hitRate}% de acertos`}
                      >
                        {item.hitRate}%
                      </span>
                    )}
                  </div>
                  <div className="h-20 relative">
                    <span
                      className="absolute left-1/2 top-2 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap -rotate-45 origin-top-left"
                      title={item.discipline.name}
                    >
                      {item.discipline.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="text-[10px] text-slate-400 mt-2">
          Altura das barras: questões resolvidas. Indicador: % de acertos acumulado.
        </p>
      </div>

      {(mostStudied || bestPerf || attentionDisc) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mostStudied && (
            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                <Clock className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                  Mais estudada
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {mostStudied.discipline.name}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  {formatDurationStats(mostStudied.seconds)} no período
                </p>
              </div>
            </div>
          )}

          {bestPerf && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                <Award className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Melhor aproveitamento
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {bestPerf.discipline.name}{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                    {bestPerf.hitRate}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                  {bestPerf.hits} acertos em {bestPerf.questions} questões
                </p>
              </div>
            </div>
          )}

          {attentionDisc && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Ponto de atenção
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {attentionDisc.discipline.name}{' '}
                  <span className="text-amber-600 dark:text-amber-400 font-black tabular-nums">
                    {attentionDisc.hitRate}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Abaixo de 65%. Vale reforçar a teoria e revisar os erros.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
