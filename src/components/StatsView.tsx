import React, { useState } from 'react';
import { ActiveRun, DiscState } from '../types';
import { buildDailyTotals, fmtLong, periodKeys, streaks, sumSeconds } from '../utils/stats';
import { BarChart3, Clock, CheckCircle2, Target, Award, AlertTriangle, Flame } from 'lucide-react';

interface StatsViewProps {
  discState: DiscState;
  activeRun: ActiveRun | null;
  currentElapsedSeconds: number;
}

type Period = 1 | 7 | 30 | 90 | 'all';
type SortBy = 'time' | 'hits' | 'topics';

const ALL_EDITAIS = '__all__';

const PERIODS: { value: Period; label: string }[] = [
  { value: 1, label: 'Hoje' },
  { value: 7, label: '7 dias' },
  { value: 30, label: '30 dias' },
  { value: 90, label: '90 dias' },
  { value: 'all', label: 'Tudo' },
];

const SORTS: { value: SortBy; label: string }[] = [
  { value: 'time', label: 'Horas' },
  { value: 'hits', label: 'Acertos (%)' },
  { value: 'topics', label: 'Tópicos' },
];

const shortDate = (k: string): string => k.slice(8, 10) + '/' + k.slice(5, 7);

const CARD =
  'p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm';

const hitBadgeClass = (rate: number): string =>
  rate >= 80
    ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
    : rate >= 60
    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
    : 'bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300';

const Kpi: React.FC<{
  title: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  valueClass?: string;
}> = ({ title, value, sub, icon, valueClass = 'text-slate-900 dark:text-white' }) => (
  <div className={`${CARD} flex flex-col justify-between gap-2`}>
    <div className="flex items-center justify-between text-slate-400">
      <span className="text-[11px] font-bold uppercase tracking-wider">{title}</span>
      {icon}
    </div>
    <div>
      <div className={`text-2xl sm:text-3xl font-black tabular-nums ${valueClass}`}>{value}</div>
      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>
    </div>
  </div>
);

export const StatsView: React.FC<StatsViewProps> = ({
  discState,
  activeRun,
  currentElapsedSeconds,
}) => {
  const [period, setPeriod] = useState<Period>(30);
  const [editalId, setEditalId] = useState<string>(discState.edsel || discState.eds[0]?.id || ALL_EDITAIS);
  const [sortBy, setSortBy] = useState<SortBy>('time');

  // ---- Escopo: um edital ou todos ----
  const selectedEd = discState.eds.find((e) => e.id === editalId);
  const scopeEds = editalId === ALL_EDITAIS || !selectedEd ? discState.eds : [selectedEd];
  const disciplines = scopeEds.flatMap((e) => e.list || []);
  const scopeIds = new Set(disciplines.map((d) => d.id));
  const liveRun = activeRun?.start && scopeIds.has(activeRun.id) ? activeRun : null;

  // ---- Tempo e constância (uma única fonte: buildDailyTotals) ----
  const totals = buildDailyTotals({ ...discState, eds: scopeEds }, liveRun, currentElapsedSeconds);
  const keys = periodKeys(period, totals);
  const keySet = new Set(keys);
  const periodSeconds = sumSeconds(totals, keys);
  const studiedDays = keys.filter((k) => (totals[k] || 0) > 0).length;
  const avgSeconds = studiedDays > 0 ? periodSeconds / studiedDays : 0;
  const constancyPct = keys.length > 0 ? Math.round((studiedDays / keys.length) * 100) : 0;
  const streak = streaks(totals);

  // ---- Métricas por disciplina (acertos incluem subtópicos, em todos os cálculos) ----
  const rows = disciplines.map((d) => {
    let seconds = 0;
    Object.entries(d.log || {}).forEach(([k, v]) => {
      if (keySet.has(k)) seconds += Number(v) || 0;
    });
    if (liveRun && liveRun.id === d.id && keySet.has(liveRun.day)) {
      seconds += currentElapsedSeconds;
    }

    let hits = 0;
    let errors = 0;
    let reviews = 0;
    (d.topics || []).forEach((t) => {
      hits += t.h || 0;
      errors += t.e || 0;
      reviews += Object.values(t.r || {}).filter(Boolean).length;
      (t.subs || []).forEach((st) => {
        hits += st.h || 0;
        errors += st.e || 0;
        reviews += Object.values(st.r || {}).filter(Boolean).length;
      });
    });

    const totalTopics = (d.topics || []).length;
    const studiedTopics = (d.topics || []).filter((t) => t.studied).length;
    const questions = hits + errors;

    return {
      discipline: d,
      seconds,
      hits,
      errors,
      questions,
      hitRate: questions > 0 ? Math.round((hits / questions) * 100) : null,
      totalTopics,
      studiedTopics,
      coveragePct: totalTopics > 0 ? Math.round((studiedTopics / totalTopics) * 100) : 0,
      reviews,
    };
  });

  const totalHits = rows.reduce((a, r) => a + r.hits, 0);
  const totalErrors = rows.reduce((a, r) => a + r.errors, 0);
  const totalQuestions = totalHits + totalErrors;
  const overallHitRate = totalQuestions > 0 ? Math.round((totalHits / totalQuestions) * 100) : null;
  const totalTopics = rows.reduce((a, r) => a + r.totalTopics, 0);
  const studiedTopics = rows.reduce((a, r) => a + r.studiedTopics, 0);
  const editalPct = totalTopics > 0 ? Math.round((studiedTopics / totalTopics) * 100) : 0;

  const sorted = [...rows].sort((a, b) => {
    if (sortBy === 'hits') return (b.hitRate ?? -1) - (a.hitRate ?? -1) || b.questions - a.questions;
    if (sortBy === 'topics') return b.coveragePct - a.coveragePct;
    return b.seconds - a.seconds;
  });
  const maxSeconds = Math.max(...rows.map((r) => r.seconds), 1);
  const maxQuestions = Math.max(...rows.map((r) => r.questions), 1);

  // ---- Destaques ----
  const mostStudied = [...rows].filter((r) => r.seconds > 0).sort((a, b) => b.seconds - a.seconds)[0];
  const bestAccuracy = rows
    .filter((r) => r.questions >= 5)
    .sort((a, b) => (b.hitRate ?? 0) - (a.hitRate ?? 0))[0];
  const needsAttention = rows
    .filter((r) => r.questions >= 3 && (r.hitRate ?? 100) < 65)
    .sort((a, b) => (a.hitRate ?? 0) - (b.hitRate ?? 0))[0];

  // ---- Gráfico de horas por dia ----
  const dayHours = keys.map((k) => (totals[k] || 0) / 3600);
  const maxHours = Math.max(1, ...dayHours);
  const labelEvery = Math.max(1, Math.ceil(keys.length / 8));

  const scopeLabel = editalId === ALL_EDITAIS || !selectedEd ? 'Todos os editais' : selectedEd.name;

  return (
    <div className="space-y-6">
      {/* Cabeçalho e filtros (valem para toda a aba) */}
      <div className="flex flex-col gap-4 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-500" />
            Estatísticas
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tempo, constância, acertos e avanço no edital — {scopeLabel.toLowerCase()}.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <select
            value={editalId}
            onChange={(e) => setEditalId(e.target.value)}
            aria-label="Edital"
            className="text-xs font-bold py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value={ALL_EDITAIS}>Todos os editais</option>
            {discState.eds.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.name} ({(ed.list || []).length} disc.)
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

      {/* Indicadores principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          title="Tempo no período"
          value={fmtLong(periodSeconds)}
          sub={studiedDays > 0 ? `${fmtLong(avgSeconds)} por dia estudado` : 'Nenhum estudo no período'}
          icon={<Clock className="w-4 h-4 text-blue-500" />}
        />
        <Kpi
          title="Constância"
          value={`${constancyPct}%`}
          sub={`${studiedDays} de ${keys.length} dias · sequência ${streak.current}d (recorde ${streak.longest}d)`}
          icon={<Flame className="w-4 h-4 text-orange-500" />}
        />
        <Kpi
          title="Taxa de acertos"
          value={overallHitRate !== null ? `${overallHitRate}%` : '—'}
          sub={`${totalHits} acertos · ${totalErrors} erros (acumulado)`}
          icon={<Target className="w-4 h-4 text-emerald-500" />}
          valueClass="text-emerald-600 dark:text-emerald-400"
        />
        <Kpi
          title="Edital concluído"
          value={`${editalPct}%`}
          sub={`${studiedTopics} de ${totalTopics} tópicos · ${totalTopics - studiedTopics} pendentes`}
          icon={<CheckCircle2 className="w-4 h-4 text-indigo-500" />}
          valueClass="text-indigo-600 dark:text-indigo-400"
        />
      </div>

      {/* Evolução diária */}
      <div className={CARD}>
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 mb-4">
          Horas por dia
        </h3>
        {keys.length === 0 || periodSeconds === 0 ? (
          <p className="text-xs text-slate-400">Nenhum estudo registrado neste período.</p>
        ) : (
          <div className="overflow-x-auto">
            <div className="flex items-end gap-[3px] h-40 min-w-full">
              {dayHours.map((h, i) => (
                <div
                  key={keys[i]}
                  className="flex-1 min-w-[6px] h-full flex items-end"
                  title={`${shortDate(keys[i])}: ${fmtLong(h * 3600)}`}
                >
                  <div
                    className="w-full rounded-t bg-emerald-500/80 hover:bg-emerald-500 transition"
                    style={{ height: `${Math.max(h > 0 ? 3 : 0, (h / maxHours) * 100)}%` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-[3px] min-w-full mt-1.5">
              {keys.map((k, i) => (
                <div key={k} className="flex-1 min-w-[6px] text-[9px] text-slate-400 text-center">
                  {i % labelEvery === 0 ? shortDate(k) : ''}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Distribuição por disciplina (substitui as três visões repetidas) */}
      <div className={`${CARD} space-y-4`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Desempenho por disciplina
          </h3>
          <div className="flex items-center gap-1">
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
            {sorted.map((r) => {
              const sharePct = periodSeconds > 0 ? Math.round((r.seconds / periodSeconds) * 100) : 0;
              return (
                <div
                  key={r.discipline.id}
                  className="p-3 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-extrabold text-slate-800 dark:text-slate-100 uppercase truncate">
                        {r.discipline.name}
                      </span>
                      {r.seconds > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                          {sharePct}% do tempo
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.hitRate !== null && (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${hitBadgeClass(r.hitRate)}`}>
                          {r.hitRate}% acertos
                        </span>
                      )}
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        {fmtLong(r.seconds)}
                      </span>
                    </div>
                  </div>

                  <div className="h-3 bg-slate-200/70 dark:bg-slate-700/60 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500"
                      style={{ width: `${r.seconds > 0 ? Math.max(3, (r.seconds / maxSeconds) * 100) : 0}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>
                      Tópicos:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">
                        {r.studiedTopics}/{r.totalTopics}
                      </strong>{' '}
                      ({r.coveragePct}%)
                    </span>
                    <span>
                      Questões:{' '}
                      <strong className="text-slate-700 dark:text-slate-200">{r.questions}</strong>{' '}
                      ({r.hits} acertos / {r.errors} erros)
                    </span>
                    <span>
                      Revisões concluídas:{' '}
                      <strong className="text-emerald-600 dark:text-emerald-400">{r.reviews}</strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Disciplinas x Desempenho: barras = questões, selo = % de acertos */}
      <div className={CARD}>
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
              style={{ minWidth: `${Math.max(rows.length * 64, 0)}px` }}
            >
              {rows.map((r) => (
                <div key={r.discipline.id} className="flex flex-col flex-1 min-w-[56px]">
                  {/* Área do gráfico: 0% embaixo, 100% em cima */}
                  <div className="relative h-48 border-b border-slate-200 dark:border-slate-700">
                    <div
                      className="absolute bottom-0 left-1/2 -translate-x-1/2 w-7 rounded-t-md bg-emerald-400 hover:bg-emerald-500 transition"
                      style={{ height: `${(r.questions / maxQuestions) * 100}%` }}
                      title={`${r.discipline.name}: ${r.questions} questões`}
                    />
                    {r.hitRate !== null && (
                      <span
                        className="absolute left-1/2 -translate-x-1/2 translate-y-1/2 text-[11px] font-bold text-white bg-violet-600 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm"
                        style={{ bottom: `${r.hitRate}%` }}
                        title={`${r.discipline.name}: ${r.hitRate}% de acertos`}
                      >
                        {r.hitRate}%
                      </span>
                    )}
                  </div>
                  <div className="h-20 relative">
                    <span
                      className="absolute left-1/2 top-2 text-[10px] text-slate-500 dark:text-slate-400 whitespace-nowrap -rotate-45 origin-top-left"
                      title={r.discipline.name}
                    >
                      {r.discipline.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-slate-400 mt-2">
          Altura das barras: questões resolvidas. Selo: % de acertos (acumulado).
        </p>
      </div>

      {/* Destaques */}
      {(mostStudied || bestAccuracy || needsAttention) && (
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
                <p className="text-xs text-slate-600 dark:text-slate-300">{fmtLong(mostStudied.seconds)} no período</p>
              </div>
            </div>
          )}

          {bestAccuracy && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                <Award className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  Melhor aproveitamento
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {bestAccuracy.discipline.name}{' '}
                  <span className="text-emerald-600 dark:text-emerald-400 font-black">
                    {bestAccuracy.hitRate}%
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {bestAccuracy.hits} acertos em {bestAccuracy.questions} questões
                </p>
              </div>
            </div>
          )}

          {needsAttention && (
            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 flex items-start gap-3">
              <span className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                  Ponto de atenção
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 truncate">
                  {needsAttention.discipline.name}{' '}
                  <span className="text-amber-600 dark:text-amber-400 font-black">
                    {needsAttention.hitRate}%
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
