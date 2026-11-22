import React, { useEffect, useState } from 'react';
import {
  Check,
  Flame,
  Pause,
  Play,
  RotateCcw,
  Timer,
  TrendingUp,
  X,
} from 'lucide-react';
import type { ActiveRun, DiscState } from '../types';
import { addDays, formatHMS, formatHoursMin, todayStr } from '../utils/date';


interface TimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  discState: DiscState;
  activeRun: ActiveRun | null;
  currentElapsedSeconds: number;
  onStartSession: (discId: string) => void;
  onPauseSession: () => void;
  onCancelSession: () => void;
  onOpenRegisterFromTimer: (discId: string, seconds: number) => void;
}

export const TimerModal: React.FC<TimerModalProps> = ({
  isOpen,
  onClose,
  discState,
  activeRun,
  currentElapsedSeconds,
  onStartSession,
  onPauseSession,
  onCancelSession,
  onOpenRegisterFromTimer,
}) => {
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];

  const [mode, setMode] = useState<'up' | 'down'>('up');
  const [countdownTarget, setCountdownTarget] = useState(25 * 60);
  const [selectedDiscId, setSelectedDiscId] = useState<string>(
    activeRun?.id || discState.sel || disciplines[0]?.id || ''
  );

  useEffect(() => {
    if (activeRun?.id) {
      setSelectedDiscId(activeRun.id);
    } else if (!disciplines.some((d) => d.id === selectedDiscId)) {
      setSelectedDiscId(discState.sel || disciplines[0]?.id || '');
    }
  }, [activeRun?.id, discState.sel, disciplines, selectedDiscId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const isRunning = Boolean(activeRun?.start);
  const [mostrarTudo, setMostrarTudo] = useState<boolean>(false);

  // Ao iniciar ou trocar a disciplina cronometrada, volta ao modo foco
  useEffect(() => {
    setMostrarTudo(false);
  }, [isRunning, selectedDiscId]);

  if (!isOpen) return null;

  const isActiveDiscMatch = Boolean(activeRun && activeRun.id === selectedDiscId);
  const elapsedForView = isActiveDiscMatch ? currentElapsedSeconds : 0;

  const displaySeconds =
    mode === 'up'
      ? elapsedForView
      : Math.max(0, countdownTarget - elapsedForView);

  const ringProgress =
    mode === 'down'
      ? countdownTarget > 0
        ? Math.min(1, elapsedForView / countdownTarget)
        : 0
      : Math.min(1, (elapsedForView % 3600) / 3600);

  const radius = 112;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - ringProgress);

  const today = todayStr();
  const thisMonthPrefix = today.slice(0, 7);
  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonthPrefix = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

  let thisMonthSec = 0;
  let prevMonthSec = 0;
  let todayTotalSec = elapsedForView;
  const studiedDays = new Set<string>();
  if (elapsedForView > 0) studiedDays.add(today);

  discState.eds.forEach((ed) => {
    ed.list.forEach((d) => {
      Object.entries(d.log || {}).forEach(([day, sec]) => {
        if (sec > 0) studiedDays.add(day);
        if (day === today) todayTotalSec += sec;
        if (day.startsWith(thisMonthPrefix)) thisMonthSec += sec;
        if (day.startsWith(prevMonthPrefix)) prevMonthSec += sec;
      });
    });
  });

  thisMonthSec += elapsedForView;

  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const day = addDays(today, -i);
    if (studiedDays.has(day)) streak++;
    else if (i > 0) break;
  }

  const activeDiscipline = disciplines.find((d) => d.id === selectedDiscId);

  // Modo foco escuro: aparece enquanto o cronômetro roda; um toque mostra tudo
  if (isRunning && isActiveDiscMatch && !mostrarTudo) {
    return (
      <div
        onClick={() => setMostrarTudo(true)}
        className="fixed inset-0 z-[95] bg-black text-slate-500 flex flex-col items-center justify-center select-none cursor-pointer"
        role="dialog"
        aria-label="Cronômetro em foco"
      >
        <div className="font-mono text-6xl sm:text-7xl font-black tracking-tight tabular-nums text-slate-400">
          {formatHMS(displaySeconds)}
        </div>
        <div className="text-[11px] uppercase tracking-widest text-slate-600 font-bold mt-3">
          {activeDiscipline?.name}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPauseSession();
          }}
          className="mt-12 px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 cursor-pointer"
        >
          <Pause className="w-4 h-4" />
          <span>Pausar</span>
        </button>
        <div className="absolute bottom-8 text-[11px] text-slate-700">Toque na tela para ver tudo</div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[95] bg-slate-950/95 backdrop-blur-xl text-white flex flex-col overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Cronômetro de Estudos"
    >
      <div className="flex items-center justify-between px-5 sm:px-8 pt-[calc(1rem+var(--safe-top))] pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <Timer className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight">Modo Foco</div>
            <div className="text-[11px] text-slate-400">
              {activeDiscipline?.name || 'Selecione uma disciplina'}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-xl bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white transition cursor-pointer"
          title="Fechar (Esc)"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-8 flex flex-col items-center justify-center py-4">
          <div className="inline-flex p-1 rounded-2xl bg-white/10 border border-white/10 mb-6">
            <button
              type="button"
              onClick={() => setMode('up')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                mode === 'up' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              Cronômetro
            </button>
            <button
              type="button"
              onClick={() => setMode('down')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                mode === 'down' ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'
              }`}
            >
              Regressivo
            </button>
          </div>

          <div className="w-full max-w-xs mb-6">
            <select
              value={selectedDiscId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedDiscId(nextId);
                if (activeRun && activeRun.id !== nextId && isRunning) {
                  onStartSession(nextId);
                }
              }}
              className="w-full px-4 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-sm font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 text-center"
            >
              {disciplines.map((d) => (
                <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-64 h-64 sm:w-72 sm:h-72 flex items-center justify-center mb-6">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 260 260">
              <circle
                cx="130"
                cy="130"
                r={radius}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="130"
                cy="130"
                r={radius}
                stroke={mode === 'down' && displaySeconds === 0 ? '#10b981' : '#3b82f6'}
                strokeWidth="12"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                className="transition-all duration-300"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-mono text-4xl sm:text-5xl font-black tracking-tight tabular-nums">
                {formatHMS(displaySeconds)}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold mt-2">
                {isRunning && isActiveDiscMatch
                  ? 'Em andamento'
                  : elapsedForView > 0
                  ? 'Pausado'
                  : mode === 'down'
                  ? `Meta: ${Math.round(countdownTarget / 60)} min`
                  : 'Pronto'}
              </div>
            </div>
          </div>

          {mode === 'down' && (
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              {[1, 5, 15, 30].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => setCountdownTarget((prev) => prev + min * 60)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold tabular-nums transition cursor-pointer whitespace-nowrap"
                >
                  +{min} min
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCountdownTarget(25 * 60)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-xs font-semibold text-slate-300 transition cursor-pointer whitespace-nowrap"
              >
                25 min
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-3">
            {selectedDiscId && (
              <button
                type="button"
                onClick={() => {
                  if (isRunning && isActiveDiscMatch) onPauseSession();
                  else onStartSession(selectedDiscId);
                }}
                className={`px-6 py-3 rounded-2xl text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer whitespace-nowrap ${
                  isRunning && isActiveDiscMatch
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {isRunning && isActiveDiscMatch ? (
                  <>
                    <Pause className="w-4 h-4" />
                    <span>Pausar</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>{elapsedForView > 0 ? 'Continuar' : 'Iniciar'}</span>
                  </>
                )}
              </button>
            )}

            {selectedDiscId && (
              <button
                type="button"
                onClick={() => onOpenRegisterFromTimer(selectedDiscId, 0)}
                className="px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Registrar questões</span>
              </button>
            )}

            {elapsedForView > 0 && selectedDiscId && (
              <button
                type="button"
                onClick={() => onOpenRegisterFromTimer(selectedDiscId, elapsedForView)}
                className="px-5 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-lg transition cursor-pointer whitespace-nowrap"
              >
                <Check className="w-4 h-4" />
                <span>Concluir e Registrar</span>
              </button>
            )}

            {activeRun && (
              <button
                type="button"
                onClick={onCancelSession}
                className="px-4 py-3 rounded-2xl bg-white/10 hover:bg-rose-500/20 text-slate-200 hover:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Zerar</span>
              </button>
            )}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="p-5 rounded-3xl bg-white/5 border border-white/10">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Estudado hoje
            </div>
            <div className="text-2xl font-black text-white tabular-nums">
              {formatHoursMin(todayTotalSec)}
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400 mb-1">
              <Flame className="w-4 h-4" />
              <span>Sequência atual</span>
            </div>
            <div className="text-2xl font-black text-white tabular-nums">
              {streak} {streak === 1 ? 'dia' : 'dias'}
            </div>
          </div>

          <div className="p-5 rounded-3xl bg-white/5 border border-white/10">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-blue-400 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span>Comparativo mensal</span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-slate-300 mb-1">
              <span>Mês atual</span>
              <span className="font-bold text-white tabular-nums">
                {formatHoursMin(thisMonthSec)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-xs text-slate-400">
              <span>Mês anterior</span>
              <span className="font-semibold tabular-nums">{formatHoursMin(prevMonthSec)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
