import React, { useState } from 'react';
import {
  BookOpen,
  Calendar,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Flame,
  Layers,
  Pen,
  Plus,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react';
import type { DiscState, EditalDatas } from '../types';
import {
  addDays,
  formatCountdown,
  formatDurationCompact,
  formatHoursMinFull,
  formatShortDate,
  getDailyVerse,
  todayStr,
} from '../utils/date';
import { ProgressRing } from './ProgressRing';

interface HomeViewProps {
  discState: DiscState;
  onUpdateDiscState: React.Dispatch<React.SetStateAction<DiscState>>;
  onNavigateToDiscipline: (discId: string) => void;
  currentElapsedSeconds: number;
  onOpenRegisterModal: () => void;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const DATE_LABELS: { key: keyof EditalDatas; label: string }[] = [
  { key: 'inscricaoInicio', label: 'Início das inscrições' },
  { key: 'inscricaoFim', label: 'Fim das inscrições' },
  { key: 'taxa', label: 'Pagamento da taxa' },
  { key: 'prova', label: 'Data da prova' },
];

const daysUntil = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now.getTime()) / 864e5);
};

const CARD_CLS =
  'rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm backdrop-blur-sm';

export const HomeView: React.FC<HomeViewProps> = ({
  discState,
  onUpdateDiscState,
  onNavigateToDiscipline,
  currentElapsedSeconds,
  onOpenRegisterModal,
}) => {
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];
  const today = todayStr();

  const [weekOffset, setWeekOffset] = useState(0);
  const [chartMode, setChartMode] = useState<'t' | 'q'>('t');
  const [editingGoals, setEditingGoals] = useState(false);

  const [verseText, verseRef] = getDailyVerse();

  const getDaySeconds = (day: string) => {
    let sec = 0;
    disciplines.forEach((d) => {
      sec += (d.log && d.log[day]) || 0;
    });
    if (discState.run?.start && day === today) sec += currentElapsedSeconds;
    return sec;
  };

  const getDayQuestions = (day: string) => (discState.qlog && discState.qlog[day]) || 0;

  let totalSeconds = 0;
  let totalTopics = 0;
  let studiedTopics = 0;
  let totalHits = 0;
  let totalErrors = 0;

  disciplines.forEach((d) => {
    d.topics.forEach((t) => {
      totalTopics++;
      if (t.studied) studiedTopics++;
      totalHits += t.h || 0;
      totalErrors += t.e || 0;
      (t.subs || []).forEach((s) => {
        totalTopics++;
        if (s.studied || s.done) studiedTopics++;
        totalHits += s.h || 0;
        totalErrors += s.e || 0;
      });
    });
    totalHits += d.qh || 0;
    totalErrors += d.qe || 0;
    Object.values(d.log || {}).forEach((sec) => {
      totalSeconds += sec;
    });
  });
  if (discState.run?.start) totalSeconds += currentElapsedSeconds;

  const totalQuestions = totalHits + totalErrors;
  const hitRate = totalQuestions > 0 ? Math.round((totalHits / totalQuestions) * 100) : 0;
  const editalPct = totalTopics > 0 ? Math.round((studiedTopics / totalTopics) * 100) : 0;

  const last30 = Array.from({ length: 30 }, (_, idx) => addDays(today, -(29 - idx)));
  let streak = 0;
  for (let i = last30.length - 1; i >= 0; i--) {
    if (getDaySeconds(last30[i]) > 0) streak++;
    else if (last30[i] === today) continue;
    else break;
  }

  const last7 = last30.slice(-7);
  const studiedToday = getDaySeconds(today) > 0;

  const getMondayOfOffsetWeek = (offset: number) => {
    const dt = new Date();
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7) + offset * 7);
    return todayStr(dt);
  };

  const thisWeekDays = Array.from({ length: 7 }, (_, i) => addDays(getMondayOfOffsetWeek(0), i));
  const thisWeekSec = thisWeekDays.reduce((acc, d) => acc + getDaySeconds(d), 0);
  const thisWeekQ = thisWeekDays.reduce((acc, d) => acc + getDayQuestions(d), 0);
  const goals = discState.goals || { h: 20, q: 100 };
  const hoursGoalPct = Math.min(100, (thisWeekSec / 3600 / goals.h) * 100);
  const questionsGoalPct = Math.min(100, (thisWeekQ / goals.q) * 100);

  const chartDays = Array.from({ length: 7 }, (_, i) => addDays(getMondayOfOffsetWeek(weekOffset), i));
  const chartValues = chartDays.map((d) => (chartMode === 't' ? getDaySeconds(d) : getDayQuestions(d)));
  const chartMax = Math.max(...chartValues, chartMode === 't' ? 3600 : 1);
  const chartTotal = chartValues.reduce((a, b) => a + b, 0);
  const bestDayIndex = chartValues.indexOf(Math.max(...chartValues));

  const discCards = disciplines.map((d) => {
    let dSec = 0;
    let dHits = 0;
    let dErrors = 0;
    let dTopics = 0;
    let dStudied = 0;
    Object.values(d.log || {}).forEach((s) => (dSec += s));
    if (discState.run?.start && discState.run.id === d.id) dSec += currentElapsedSeconds;

    d.topics.forEach((t) => {
      dTopics++;
      if (t.studied) dStudied++;
      dHits += t.h || 0;
      dErrors += t.e || 0;
      (t.subs || []).forEach((s) => {
        dTopics++;
        if (s.studied || s.done) dStudied++;
        dHits += s.h || 0;
        dErrors += s.e || 0;
      });
    });
    dHits += d.qh || 0;
    dErrors += d.qe || 0;

    const q = dHits + dErrors;
    return {
      d,
      dSec,
      dHits,
      dErrors,
      q,
      acc: q > 0 ? Math.round((dHits / q) * 100) : 0,
      pct: dTopics > 0 ? Math.round((dStudied / dTopics) * 100) : 0,
    };
  });

  const handleEditalChange = (newId: string) => {
    onUpdateDiscState((prev) => {
      const target = prev.eds.find((e) => e.id === newId) || prev.eds[0];
      return {
        ...prev,
        edsel: newId,
        sel: target.list[0] ? target.list[0].id : '',
      };
    });
  };

  const hour = new Date().getHours();
  const saudacao = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const [nomeUsuario, setNomeUsuario] = useState<string>(() => {
    try {
      return localStorage.getItem('nomeUsuario') || '';
    } catch {
      return '';
    }
  });
  const [editandoNome, setEditandoNome] = useState<boolean>(false);
  const [rascunhoNome, setRascunhoNome] = useState<string>(nomeUsuario);
  const salvarNome = () => {
    const limpo = rascunhoNome.trim();
    setNomeUsuario(limpo);
    try {
      if (limpo) localStorage.setItem('nomeUsuario', limpo);
      else localStorage.removeItem('nomeUsuario');
    } catch {
      /* ignora */
    }
    setEditandoNome(false);
  };
  const greeting = nomeUsuario ? `${saudacao}, ${nomeUsuario}` : saudacao;
  const editalDatas = activeEdital?.datas || {};
  const visibleDates = DATE_LABELS.filter((item) => editalDatas[item.key]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{greeting}</p>
            {!editandoNome && (
              <button
                type="button"
                onClick={() => {
                  setRascunhoNome(nomeUsuario);
                  setEditandoNome(true);
                }}
                className="px-2 py-0.5 rounded-lg text-[11px] font-bold text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Editar seu nome"
              >
                {nomeUsuario ? 'Editar nome' : '+ Adicionar seu nome'}
              </button>
            )}
          </div>
          {editandoNome && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                autoFocus
                value={rascunhoNome}
                onChange={(e) => setRascunhoNome(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvarNome();
                  if (e.key === 'Escape') setEditandoNome(false);
                }}
                placeholder="Digite seu nome"
                maxLength={30}
                className="w-56 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={salvarNome}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Salvar
              </button>
              <button
                type="button"
                onClick={() => setEditandoNome(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
            </div>
          )}
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white mt-1">
            {activeEdital?.name || 'Meu concurso'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {studiedToday
              ? 'Você já estudou hoje. Continue assim!'
              : 'Ainda não estudou hoje. Que tal começar agora?'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenRegisterModal}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white text-xs font-bold uppercase tracking-wider transition shadow-md shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Adicionar estudo</span>
          </button>

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
            <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <select
              value={discState.edsel}
              onChange={(e) => handleEditalChange(e.target.value)}
              className="text-xs font-bold text-slate-800 dark:text-slate-100 bg-transparent pr-1 outline-none cursor-pointer"
              aria-label="Selecionar edital"
            >
              {discState.eds.map((ed) => (
                <option key={ed.id} value={ed.id} className="text-slate-900 bg-white">
                  {ed.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Hero + Sequência */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl p-6 sm:p-7 text-white bg-gradient-to-br from-emerald-500 via-teal-600 to-slate-800 shadow-lg shadow-emerald-900/20">
          <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-emerald-100 text-xs font-bold uppercase tracking-wider">
                <Clock className="w-3.5 h-3.5" />
                <span>Tempo total de estudo</span>
              </div>
              <div className="text-5xl sm:text-6xl font-black tracking-tight mt-2 font-mono tabular-nums">
                {formatHoursMinFull(totalSeconds)}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-4 text-xs font-semibold text-emerald-50">
                <span>{totalQuestions} questões</span>
                <span aria-hidden="true">·</span>
                <span>
                  {studiedTopics}/{totalTopics} tópicos
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {disciplines.length} {disciplines.length === 1 ? 'disciplina' : 'disciplinas'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ProgressRing pct={editalPct} size={112} stroke={11} color="#ffffff">
                <div className="text-center">
                  <div className="text-2xl font-black leading-none tabular-nums">{editalPct}%</div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-100 mt-1">
                    edital
                  </div>
                </div>
              </ProgressRing>

              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-200" />
                  <span className="font-semibold">{studiedTopics} concluídos</span>
                </div>
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-200" />
                  <span className="font-semibold">
                    {Math.max(0, totalTopics - studiedTopics)} pendentes
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className={`${CARD_CLS} p-6 flex flex-col justify-between`}>
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Sequência
              </div>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-5xl font-black text-slate-900 dark:text-white tabular-nums">
                  {streak}
                </span>
                <span className="text-sm font-semibold text-slate-500">
                  {streak === 1 ? 'dia' : 'dias'}
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-2xl bg-orange-100 dark:bg-orange-900/40 text-orange-500">
              <Flame className="w-6 h-6" />
            </div>
          </div>

          <div className="mt-5 flex justify-between gap-1.5">
            {last7.map((day) => {
              const sec = getDaySeconds(day);
              const hasStudy = sec > 0;
              const isToday = day === today;
              const wd = WEEKDAYS[(new Date(`${day}T12:00:00`).getDay() + 6) % 7];
              return (
                <div
                  key={day}
                  className="flex flex-col items-center gap-1.5 flex-1"
                  title={`${formatShortDate(day)}${hasStudy ? ` • ${formatDurationCompact(sec)}` : ''}`}
                >
                  <div
                    className={`w-full aspect-square max-w-[34px] rounded-xl flex items-center justify-center text-xs font-black transition ${
                      hasStudy
                        ? 'bg-gradient-to-br from-orange-400 to-rose-500 text-white shadow-sm'
                        : isToday
                        ? 'border-2 border-dashed border-emerald-400 text-emerald-500'
                        : 'bg-slate-100 dark:bg-slate-700/60 text-slate-300 dark:text-slate-500'
                    }`}
                  >
                    {hasStudy ? <Flame className="w-3.5 h-3.5" /> : isToday ? '•' : ''}
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      isToday ? 'text-emerald-500' : 'text-slate-400'
                    }`}
                  >
                    {wd}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Datas importantes */}
      <div className={`${CARD_CLS} p-6`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Datas importantes
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Inscrições, taxa e prova deste edital</p>
          </div>
          <Calendar className="w-5 h-5 text-blue-500" />
        </div>
        {visibleDates.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhuma data cadastrada. Adicione na aba Disciplinas, em &ldquo;Datas do edital&rdquo;.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {visibleDates.map((item) => {
              const iso = editalDatas[item.key]!;
              const diff = daysUntil(iso);
              const [y, m, d] = iso.split('-');
              const urgent = diff >= 0 && diff <= 7;
              return (
                <div
                  key={item.key}
                  className={`p-4 rounded-2xl border ${
                    urgent
                      ? 'bg-amber-50 border-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
                      : 'bg-slate-50 border-slate-200/70 dark:bg-slate-900/40 dark:border-slate-700/70'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </div>
                  <div className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono tabular-nums">
                    {d}/{m}/{y}
                  </div>
                  <div
                    className={`text-xs font-semibold mt-1 ${
                      urgent ? 'text-amber-700 dark:text-amber-400' : 'text-slate-500'
                    }`}
                  >
                    {formatCountdown(diff)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`${CARD_CLS} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Acertos
            </span>
            <Trophy className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-3 tabular-nums">
            {totalHits}
          </div>
          <div className="text-xs text-slate-500 mt-1">de {totalQuestions} questões</div>
        </div>

        <div className={`${CARD_CLS} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Erros
            </span>
            <Target className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-3 tabular-nums">
            {totalErrors}
          </div>
          <div className="text-xs text-slate-500 mt-1">para revisar</div>
        </div>

        <div className={`${CARD_CLS} p-5`}>
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Aproveitamento
            </span>
            <TrendingUp className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white mt-3 tabular-nums">
            {hitRate}%
          </div>
          <div className="mt-2 h-1.5 w-full bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all duration-500"
              style={{ width: `${hitRate}%` }}
            />
          </div>
        </div>

        <div className={`${CARD_CLS} p-5 flex flex-col justify-between`}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Reflexão do dia
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 leading-relaxed line-clamp-3">
            &ldquo;{verseText}&rdquo;
          </p>
          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {verseRef}
          </span>
        </div>
      </div>

      {/* Metas da semana + Estudo semanal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className={`${CARD_CLS} lg:col-span-5 p-6 space-y-5`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Metas da semana
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Seu ritmo até agora</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingGoals(!editingGoals)}
              className="p-2 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition cursor-pointer"
              title="Editar metas"
            >
              <Pen className="w-3.5 h-3.5" />
            </button>
          </div>

          {editingGoals && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Meta de horas:</span>
                <input
                  type="number"
                  min={1}
                  defaultValue={goals.h}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10) || 20;
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
                  min={1}
                  defaultValue={goals.q}
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10) || 100;
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

          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-2">
              <ProgressRing pct={hoursGoalPct} color="#10b981">
                <div className="text-center">
                  <div className="text-lg font-black text-slate-900 dark:text-white leading-none tabular-nums">
                    {Math.round(hoursGoalPct)}%
                  </div>
                </div>
              </ProgressRing>
              <div className="text-center">
                <div className="text-xs font-bold text-slate-800 dark:text-slate-100">Horas</div>
                <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                  {formatHoursMinFull(thisWeekSec)} / {goals.h}h
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className={`${CARD_CLS} lg:col-span-7 p-6 space-y-5`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                Estudo semanal
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Total no período:{' '}
                <span className="font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                  {chartMode === 't' ? formatHoursMinFull(chartTotal) : `${chartTotal} questões`}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex p-1 rounded-xl bg-slate-100 dark:bg-slate-900/60">
                <button
                  type="button"
                  onClick={() => setChartMode('t')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMode === 't'
                      ? 'bg-white dark:bg-slate-700 text-emerald-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Tempo
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('q')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    chartMode === 'q'
                      ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  Questões
                </button>
              </div>

              <div className="flex items-center gap-1 text-xs text-slate-500 font-semibold">
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w - 1)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  aria-label="Semana anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="whitespace-nowrap tabular-nums">
                  {formatShortDate(chartDays[0])} – {formatShortDate(chartDays[6])}
                </span>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => w + 1)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  aria-label="Próxima semana"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          <div className="h-44 flex items-end justify-between gap-2 px-1">
            {chartDays.map((day, idx) => {
              const val = chartValues[idx];
              const pct = val > 0 ? Math.max(6, (val / chartMax) * 100) : 4;
              const isToday = day === today;
              const isBest = idx === bestDayIndex && val > 0;
              return (
                <div key={day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                  <span className="text-[10px] font-mono text-slate-400 font-bold h-3 tabular-nums">
                    {val > 0 ? (chartMode === 't' ? formatDurationCompact(val) : val) : ''}
                  </span>
                  <div className="w-full flex-1 bg-slate-100 dark:bg-slate-700/40 rounded-xl flex items-end overflow-hidden relative">
                    <div
                      className={`w-full rounded-xl transition-all duration-700 ${
                        chartMode === 't'
                          ? isToday
                            ? 'bg-gradient-to-t from-emerald-600 to-emerald-400'
                            : 'bg-gradient-to-t from-emerald-500/70 to-emerald-300/80 dark:from-emerald-700 dark:to-emerald-500/70'
                          : isToday
                          ? 'bg-gradient-to-t from-indigo-600 to-indigo-400'
                          : 'bg-gradient-to-t from-indigo-500/70 to-indigo-300/80 dark:from-indigo-700 dark:to-indigo-500/70'
                      } ${isBest ? 'ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-slate-800' : ''}`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase ${
                      isToday ? 'text-emerald-500' : 'text-slate-400'
                    }`}
                  >
                    {WEEKDAYS[idx]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Disciplinas overview */}
      <div className={`${CARD_CLS} p-6`}>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
              Disciplinas
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Clique em uma disciplina para abrir</p>
          </div>
        </div>

        {discCards.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">
            Nenhuma disciplina neste edital ainda.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {discCards.map((item) => {
              const badgeCls =
                item.q === 0
                  ? 'text-slate-500 dark:text-slate-300'
                  : item.acc >= 80
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : item.acc >= 60
                  ? 'text-amber-700 dark:text-amber-400'
                  : 'text-rose-700 dark:text-rose-400';

              return (
                <button
                  key={item.d.id}
                  type="button"
                  onClick={() => onNavigateToDiscipline(item.d.id)}
                  className="text-left p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 hover:border-emerald-400 hover:shadow-md transition cursor-pointer group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-black text-sm uppercase text-slate-800 dark:text-slate-100 truncate group-hover:text-emerald-600 transition">
                        {item.d.name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-500 mt-0.5 tabular-nums">
                        {item.dSec > 0 ? formatHoursMinFull(item.dSec) : 'sem tempo registrado'}
                      </div>
                    </div>
                    <span className={`text-xs font-black shrink-0 tabular-nums ${badgeCls}`}>
                      {item.q === 0 ? '—' : `${item.acc}%`}
                    </span>
                  </div>

                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                      <span>Conteúdo</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300 tabular-nums">
                        {item.pct}%
                      </span>
                    </div>
                    <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-3 text-[11px] font-bold tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">✓ {item.dHits}</span>
                    <span className="text-rose-600 dark:text-rose-400">✗ {item.dErrors}</span>
                    <span className="text-slate-500 ml-auto">{item.q} questões</span>
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
