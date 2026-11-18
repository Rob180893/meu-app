import React, { useState } from 'react';
import { DiscState } from '../types';
import { addD, fmt, getDailyVerse, hm, iso, shortT } from '../utils/formatters';
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Clock,
  Edit2,
  Flame,
  Layers,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';

interface HomeViewProps {
  discState: DiscState;
  onUpdateDiscState: (updater: (prev: DiscState) => DiscState) => void;
  onNavigateToDiscipline: (disciplineId: string) => void;
  onToast: (msg: string) => void;
  currentElapsedSeconds: number;
  onOpenRegisterModal?: () => void;
}

/* Anel de progresso circular (SVG puro) */
const Ring: React.FC<{
  pct: number;
  size?: number;
  stroke?: number;
  color: string;
  children?: React.ReactNode;
}> = ({ pct, size = 96, stroke = 9, color, children }) => {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200/70 dark:stroke-slate-700/70"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
};

const WEEKDAY_NAMES = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const DATAS_LABELS: { key: 'inscricaoInicio' | 'inscricaoFim' | 'taxa' | 'prova'; label: string }[] = [
  { key: 'inscricaoInicio', label: 'Início das inscrições' },
  { key: 'inscricaoFim', label: 'Fim das inscrições' },
  { key: 'taxa', label: 'Pagamento da taxa' },
  { key: 'prova', label: 'Data da prova' },
];

const diasAte = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  const alvo = new Date(y, m - 1, d).getTime();
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.round((alvo - hoje.getTime()) / 86400000);
};

const textoContagem = (n: number): string => {
  if (n < 0) return 'já passou';
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  return `faltam ${n} dias`;
};

const card =
  'rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm backdrop-blur-sm';

export const HomeView: React.FC<HomeViewProps> = ({
  discState,
  onUpdateDiscState,
  onNavigateToDiscipline,
  onToast,
  currentElapsedSeconds,
  onOpenRegisterModal,
}) => {
  const curEd = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = curEd?.list || [];
  const todayIso = iso(new Date());

  const [homeWeekOffset, setHomeWeekOffset] = useState<number>(0);
  const [chartMetric, setChartMetric] = useState<'t' | 'q'>('t');
  const [isEditingGoals, setIsEditingGoals] = useState<boolean>(false);

  const dailyVerse = getDailyVerse();

  const getDaySeconds = (dayKey: string) => {
    let total = 0;
    disciplines.forEach((d) => {
      total += (d.log && d.log[dayKey]) || 0;
    });
    if (discState.run?.start && dayKey === todayIso) {
      total += currentElapsedSeconds;
    }
    return total;
  };

  const getDayQuestions = (dayKey: string) => (discState.qlog && discState.qlog[dayKey]) || 0;

  // Totais gerais do edital
  let totalSeconds = 0;
  let totalTopics = 0;
  let completedTopics = 0;
  let totalHits = 0;
  let totalErrors = 0;

  disciplines.forEach((d) => {
    d.topics.forEach((t) => {
      totalTopics++;
      if (t.studied) completedTopics++;
      totalHits += t.h || 0;
      totalErrors += t.e || 0;
      (t.subs || []).forEach((sb) => {
        totalTopics++;
        if (sb.studied || sb.done) completedTopics++;
        totalHits += sb.h || 0;
        totalErrors += sb.e || 0;
      });
    });
    Object.values(d.log || {}).forEach((s) => {
      totalSeconds += s;
    });
  });

  if (discState.run?.start) totalSeconds += currentElapsedSeconds;

  const totalQuestions = totalHits + totalErrors;
  const overallAccuracy = totalQuestions > 0 ? Math.round((totalHits / totalQuestions) * 100) : 0;
  const overallProgress = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  // Sequência (streak)
  const streakDays: string[] = [];
  for (let i = 29; i >= 0; i--) streakDays.push(addD(todayIso, -i));

  let currentStreak = 0;
  for (let i = streakDays.length - 1; i >= 0; i--) {
    const s = getDaySeconds(streakDays[i]);
    if (s > 0) currentStreak++;
    else if (streakDays[i] === todayIso) continue;
    else break;
  }

  const last7 = streakDays.slice(-7);
  const studiedToday = getDaySeconds(todayIso) > 0;

  // Semana
  const getMonday = (offset: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7) + offset * 7);
    return iso(dt);
  };

  const currentWeekDays = Array.from({ length: 7 }, (_, i) => addD(getMonday(0), i));
  const weekTotalSeconds = currentWeekDays.reduce((acc, k) => acc + getDaySeconds(k), 0);
  const weekTotalQuestions = currentWeekDays.reduce((acc, k) => acc + getDayQuestions(k), 0);

  const goals = discState.goals || { h: 20, q: 100 };
  const weekHoursPct = Math.min(100, (weekTotalSeconds / 3600 / goals.h) * 100);
  const weekQuestionsPct = Math.min(100, (weekTotalQuestions / goals.q) * 100);

  // Gráfico semanal
  const chartWeekDays = Array.from({ length: 7 }, (_, i) => addD(getMonday(homeWeekOffset), i));
  const chartValues = chartWeekDays.map((k) =>
    chartMetric === 't' ? getDaySeconds(k) : getDayQuestions(k)
  );
  const maxChartVal = Math.max(...chartValues, chartMetric === 't' ? 3600 : 1);
  const chartTotal = chartValues.reduce((a, b) => a + b, 0);
  const bestIdx = chartValues.indexOf(Math.max(...chartValues));

  // Progresso por disciplina
  const discStats = disciplines.map((d) => {
    let dSec = 0;
    let dHits = 0;
    let dErrors = 0;
    let dTotal = 0;
    let dDone = 0;

    Object.values(d.log || {}).forEach((s) => (dSec += s));
    if (discState.run?.start && discState.run.id === d.id) dSec += currentElapsedSeconds;

    d.topics.forEach((t) => {
      dTotal++;
      if (t.studied) dDone++;
      dHits += t.h || 0;
      dErrors += t.e || 0;
      (t.subs || []).forEach((sb) => {
        dTotal++;
        if (sb.studied || sb.done) dDone++;
        dHits += sb.h || 0;
        dErrors += sb.e || 0;
      });
    });

    const q = dHits + dErrors;
    return {
      d,
      dSec,
      dHits,
      dErrors,
      q,
      acc: q > 0 ? Math.round((dHits / q) * 100) : 0,
      pct: dTotal > 0 ? Math.round((dDone / dTotal) * 100) : 0,
    };
  });

  // Ações de edital
  const handleSelectEdital = (editalId: string) => {
    onUpdateDiscState((prev) => {
      const targetEd = prev.eds.find((e) => e.id === editalId) || prev.eds[0];
      return {
        ...prev,
        edsel: editalId,
        sel: targetEd.list[0] ? targetEd.list[0].id : '',
      };
    });
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="space-y-6">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            {greeting}
          </p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
            {curEd?.name || 'Meu concurso'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {studiedToday
              ? 'Você já estudou hoje. Continue assim!'
              : 'Ainda não estudou hoje. Que tal começar agora?'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onOpenRegisterModal && (
            <button
              onClick={onOpenRegisterModal}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold uppercase tracking-wider transition shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar estudo</span>
            </button>
          )}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <select
              value={discState.edsel}
              onChange={(e) => handleSelectEdital(e.target.value)}
              className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent pr-1 outline-none cursor-pointer"
            >
              {discState.eds.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* HERO: resumo + sequência */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white bg-gradient-to-br from-emerald-500 via-teal-600 to-slate-800 shadow-lg shadow-emerald-900/20">
          <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <div className="absolute -right-4 -bottom-16 w-40 h-40 rounded-full bg-white/5 pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" />
                Tempo total de estudo
              </div>
              <div className="text-5xl sm:text-6xl font-black tracking-tight mt-2 font-mono">
                {hm(totalSeconds)}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <span className="px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold backdrop-blur-sm">
                  {totalQuestions} questões
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold backdrop-blur-sm">
                  {completedTopics}/{totalTopics} tópicos
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/15 text-xs font-bold backdrop-blur-sm">
                  {discCountLabel(disciplines.length)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Ring pct={overallProgress} size={112} stroke={11} color="#ffffff">
                <div className="text-center">
                  <div className="text-2xl font-black leading-none">{overallProgress}%</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-100 mt-1">
                    edital
                  </div>
                </div>
              </Ring>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                  <span className="font-semibold">{completedTopics} concluídos</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-200" />
                  <span className="font-semibold">{Math.max(0, totalTopics - completedTopics)} pendentes</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEQUÊNCIA */}
        <div className={`${card} p-6 flex flex-col justify-between`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sequência</div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-5xl font-black text-slate-900 dark:text-white">{currentStreak}</span>
                <span className="text-sm font-semibold text-slate-500">{currentStreak === 1 ? 'dia' : 'dias'}</span>
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-orange-100 dark:bg-orange-900/40 text-orange-500">
              <Flame className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-5">
            <div className="flex justify-between gap-1.5">
              {last7.map((k) => {
                const sec = getDaySeconds(k);
                const hit = sec > 0;
                const isToday = k === todayIso;
                return (
                  <div key={k} className="flex flex-col items-center gap-1.5 flex-1" title={`${fmt(k)}${hit ? ` • ${shortT(sec)}` : ''}`}>
                    <div
                      className={`w-full aspect-square max-w-[34px] rounded-xl flex items-center justify-center text-xs font-black transition ${
                        hit
                          ? 'bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-sm'
                          : isToday
                          ? 'border-2 border-dashed border-emerald-400 text-emerald-500'
                          : 'bg-slate-100 dark:bg-slate-700/60 text-slate-300 dark:text-slate-500'
                      }`}
                    >
                      {hit ? <Flame className="w-3.5 h-3.5" /> : isToday ? '•' : ''}
                    </div>
                    <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {WEEKDAY_NAMES[(new Date(k + 'T12:00:00').getDay() + 6) % 7]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* DATAS IMPORTANTES */}
      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Datas importantes</h3>
            <p className="text-xs text-slate-500 mt-0.5">Inscrições, taxa e prova deste edital</p>
          </div>
          <Calendar className="w-5 h-5 text-blue-500" />
        </div>
        {(() => {
          const datas = curEd?.datas || {};
          const itens = DATAS_LABELS.filter((x) => datas[x.key]);
          if (itens.length === 0) {
            return (
              <p className="text-sm text-slate-500">
                Nenhuma data cadastrada. Adicione na aba Disciplinas, em "Datas do edital".
              </p>
            );
          }
          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {itens.map((x) => {
                const valor = datas[x.key] as string;
                const n = diasAte(valor);
                const [y, m, d] = valor.split('-');
                return (
                  <div
                    key={x.key}
                    className={`p-4 rounded-2xl border ${
                      n >= 0 && n <= 7
                        ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                        : 'bg-slate-50 border-slate-200/70 dark:bg-slate-900/40 dark:border-slate-700/70'
                    }`}
                  >
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{x.label}</div>
                    <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                      {d}/{m}/{y}
                    </div>
                    <div className={`text-xs font-semibold mt-1 ${n >= 0 && n <= 7 ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'}`}>
                      {textoContagem(n)}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Acertos</span>
            <Trophy className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-3">{totalHits}</div>
          <div className="text-xs text-slate-500 mt-1">de {totalQuestions} questões</div>
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Erros</span>
            <Target className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-3">{totalErrors}</div>
          <div className="text-xs text-slate-500 mt-1">para revisar</div>
        </div>

        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Aproveitamento</span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-3">{overallAccuracy}%</div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${overallAccuracy}%` }} />
          </div>
        </div>

        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Versículo do dia</span>
            <Sparkles className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xs italic text-slate-700 dark:text-slate-200 leading-relaxed mt-2 line-clamp-3">
            "{dailyVerse[0]}"
          </p>
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-auto pt-2 text-right">
            — {dailyVerse[1]}
          </div>
        </div>
      </div>

      {/* METAS + GRÁFICO SEMANAL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Metas */}
        <div className={`${card} lg:col-span-5 p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Metas da semana</h3>
              <p className="text-xs text-slate-500 mt-0.5">Seu ritmo até agora</p>
            </div>
            <button
              onClick={() => setIsEditingGoals(!isEditingGoals)}
              className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              title="Editar metas"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {isEditingGoals && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Meta de horas:</span>
                <input
                  type="number"
                  min="1"
                  defaultValue={goals.h}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value) || 20;
                    onUpdateDiscState((prev) => ({
                      ...prev,
                      goals: { ...(prev.goals || { h: 20, q: 100 }), h: val },
                    }));
                  }}
                  className="w-16 p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-center font-bold"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Meta de questões:</span>
                <input
                  type="number"
                  min="1"
                  defaultValue={goals.q}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value) || 100;
                    onUpdateDiscState((prev) => ({
                      ...prev,
                      goals: { ...(prev.goals || { h: 20, q: 100 }), q: val },
                    }));
                  }}
                  className="w-16 p-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-center font-bold"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-around gap-4">
            <div className="flex flex-col items-center gap-2">
              <Ring pct={weekHoursPct} color="#10b981">
                <div className="text-center">
                  <div className="text-lg font-black text-slate-900 dark:text-white leading-none">{Math.round(weekHoursPct)}%</div>
                </div>
              </Ring>
              <div className="text-center">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Horas</div>
                <div className="text-[11px] font-mono text-slate-500">
                  {hm(weekTotalSeconds)} / {goals.h}h
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <Ring pct={weekQuestionsPct} color="#6366f1">
                <div className="text-center">
                  <div className="text-lg font-black text-slate-900 dark:text-white leading-none">{Math.round(weekQuestionsPct)}%</div>
                </div>
              </Ring>
              <div className="text-center">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Questões</div>
                <div className="text-[11px] font-mono text-slate-500">
                  {weekTotalQuestions} / {goals.q}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Gráfico semanal */}
        <div className={`${card} lg:col-span-7 p-6 space-y-5`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Estudo semanal</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Total no período:{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  {chartMetric === 't' ? hm(chartTotal) : `${chartTotal} questões`}
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                <button
                  onClick={() => setChartMetric('t')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMetric === 't' ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Tempo
                </button>
                <button
                  onClick={() => setChartMetric('q')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMetric === 'q' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Questões
                </button>
              </div>
              <div className="flex items-center gap-1 text-xs text-slate-500 font-semibold">
                <button onClick={() => setHomeWeekOffset((p) => p - 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="whitespace-nowrap">
                  {fmt(chartWeekDays[0])} – {fmt(chartWeekDays[6])}
                </span>
                <button onClick={() => setHomeWeekOffset((p) => p + 1)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="h-44 flex items-end justify-between gap-2 px-1">
            {chartWeekDays.map((day, idx) => {
              const val = chartValues[idx];
              const heightPct = val > 0 ? Math.max(6, (val / maxChartVal) * 100) : 4;
              const isToday = day === todayIso;
              const isBest = idx === bestIdx && val > 0;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono text-slate-400 font-bold h-3">
                    {val > 0 ? (chartMetric === 't' ? shortT(val) : val) : ''}
                  </span>
                  <div className="w-full flex-1 bg-slate-100 dark:bg-slate-700/40 rounded-xl flex items-end overflow-hidden relative">
                    <div
                      className={`w-full rounded-xl transition-all duration-700 ${
                        chartMetric === 't'
                          ? isToday
                            ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                            : 'bg-gradient-to-t from-emerald-500/70 to-emerald-300/80 dark:from-emerald-700 dark:to-emerald-500/70'
                          : isToday
                          ? 'bg-gradient-to-t from-indigo-600 to-indigo-400'
                          : 'bg-gradient-to-t from-indigo-500/70 to-indigo-300/80 dark:from-indigo-700 dark:to-indigo-500/70'
                      } ${isBest ? 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-slate-800' : ''}`}
                      style={{ height: `${heightPct}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-bold uppercase ${isToday ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {WEEKDAY_NAMES[idx]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* DISCIPLINAS */}
      <div className={`${card} p-6`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">Disciplinas</h3>
            <p className="text-xs text-slate-500 mt-0.5">Clique em uma disciplina para abrir</p>
          </div>
        </div>

        {discStats.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">Nenhuma disciplina neste edital ainda.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {discStats.map((s) => {
              const accColor =
                s.q === 0
                  ? 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                  : s.acc >= 80
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                  : s.acc >= 60
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300';
              return (
                <button
                  key={s.d.id}
                  onClick={() => onNavigateToDiscipline(s.d.id)}
                  className="text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 hover:border-emerald-400 hover:shadow-md transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-sm uppercase text-slate-800 dark:text-slate-100 truncate group-hover:text-emerald-600 transition">
                        {s.d.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                        {s.dSec > 0 ? hm(s.dSec) : 'sem tempo registrado'}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black shrink-0 ${accColor}`}>
                      {s.q === 0 ? '—' : `${s.acc}%`}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                      <span>Conteúdo</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{s.pct}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                        style={{ width: `${s.pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-[11px] font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ {s.dHits}</span>
                    <span className="text-rose-600 dark:text-rose-400">✗ {s.dErrors}</span>
                    <span className="text-slate-500 ml-auto">{s.q} questões</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// Helper pequeno para o texto de quantidade de disciplinas
function discCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'disciplina' : 'disciplinas'}`;
}
