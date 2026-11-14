import React, { useEffect, useState } from 'react';
import { ActiveRun, DiscState } from '../types';
import { fmtT } from '../utils/formatters';
import { buildDailyTotals, dateRange, addDaysKey, fmtLong, streaks, sumSeconds, todayKey } from '../utils/stats';
import { X, Play, Pause, Square } from 'lucide-react';

interface FocusModalProps {
  isOpen: boolean;
  onClose: () => void;
  discState: DiscState;
  activeRun: ActiveRun | null;
  onStartSession: (disciplineId: string) => void;
  onPauseSession: () => void;
  onCancelSession: () => void;
  onOpenRegisterModal: () => void;
  currentElapsedSeconds: number;
}

const RING_R = 118;
const RING_C = 2 * Math.PI * RING_R;

export const FocusModal: React.FC<FocusModalProps> = ({
  isOpen,
  onClose,
  discState,
  activeRun,
  onStartSession,
  onPauseSession,
  onCancelSession,
  onOpenRegisterModal,
  currentElapsedSeconds,
}) => {
  // All hooks must run before any early return
  const curEd = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = curEd?.list || [];

  const [selectedDisciplineId, setSelectedDisciplineId] = useState<string>(
    activeRun?.id || discState.sel || (disciplines[0] ? disciplines[0].id : '')
  );
  const [mode, setMode] = useState<'sw' | 'tm'>('sw');
  const [goalMin, setGoalMin] = useState<number>(60);

  // The modal stays mounted, so refresh the chosen discipline every time it opens:
  // the running session's discipline, otherwise the one selected in the Disciplinas tab.
  useEffect(() => {
    if (!isOpen) return;
    const stillExists = disciplines.some((d) => d.id === discState.sel);
    const fallback = stillExists ? discState.sel : disciplines[0] ? disciplines[0].id : '';
    setSelectedDisciplineId(activeRun?.start ? activeRun.id : fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const isRunning = !!activeRun?.start;
  const isCurrentActive = activeRun?.id === selectedDisciplineId;

  const elapsed = isCurrentActive ? currentElapsedSeconds : 0;
  const goalSeconds = goalMin * 60;
  const remainingSeconds = Math.max(0, goalSeconds - elapsed);
  const displayTime = mode === 'tm' ? fmtT(remainingSeconds) : fmtT(elapsed);
  const ringPct = goalSeconds > 0 ? Math.min(1, elapsed / goalSeconds) : 0;
  const ringOffset = RING_C * (1 - ringPct);

  const selectedName = disciplines.find((d) => d.id === selectedDisciplineId)?.name || 'Sem disciplina';

  // Stats shown on the right side
  const totals = buildDailyTotals(discState, activeRun, currentElapsedSeconds);
  const today = todayKey();
  const todaySeconds = totals[today] || 0;
  const allSeconds = Object.values(totals).reduce((a, b) => a + b, 0);

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonth = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`;
  const thisMonthSeconds = Object.entries(totals)
    .filter(([k]) => k.startsWith(thisMonth))
    .reduce((acc, [, s]) => acc + s, 0);
  const lastMonthSeconds = Object.entries(totals)
    .filter(([k]) => k.startsWith(lastMonth))
    .reduce((acc, [, s]) => acc + s, 0);
  const monthChange =
    lastMonthSeconds > 0 ? Math.round(((thisMonthSeconds - lastMonthSeconds) / lastMonthSeconds) * 100) : null;

  const last14 = dateRange(addDaysKey(today, -13), today);
  const streak = streaks(totals);

  const handleToggleTimer = () => {
    if (isRunning && isCurrentActive) {
      onPauseSession();
    } else {
      onStartSession(selectedDisciplineId);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white overflow-y-auto animate-in fade-in duration-200">
      <div className="min-h-full w-full max-w-5xl mx-auto px-4 py-6 sm:py-10 flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
            Cronômetro de estudo
          </span>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-center">
          {/* LEFT: ring + timer */}
          <div className="lg:col-span-3 flex flex-col items-center text-center">
            {/* Success strip for today's study */}
            {todaySeconds > 0 && (
              <div className="mb-4 flex items-center gap-2 px-4 py-2 rounded-full bg-white text-slate-900 text-xs font-bold shadow-lg">
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
                <span>+{fmtLong(todaySeconds)} de estudo registrado hoje</span>
              </div>
            )}

            <div className="relative w-[280px] h-[280px] sm:w-[320px] sm:h-[320px]">
              <svg viewBox="0 0 280 280" className="w-full h-full -rotate-90">
                <circle cx="140" cy="140" r={RING_R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
                <circle
                  cx="140"
                  cy="140"
                  r={RING_R}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="14"
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  strokeDashoffset={ringOffset}
                  className="transition-[stroke-dashoffset] duration-500"
                />
              </svg>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs font-semibold text-slate-400 mb-1">
                  {isRunning && isCurrentActive ? 'Estudando agora' : 'Pronto para estudar'}
                </span>
                <div className="font-mono text-4xl sm:text-5xl font-black tracking-tight tabular-nums select-none">
                  {displayTime}
                </div>

                {/* Discipline chip */}
                <div className="mt-3">
                  <select
                    value={selectedDisciplineId}
                    onChange={(e) => setSelectedDisciplineId(e.target.value)}
                    disabled={isRunning}
                    className="px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer disabled:opacity-60 max-w-[220px]"
                    title={selectedName}
                  >
                    {disciplines.map((d) => (
                      <option key={d.id} value={d.id} className="text-slate-900 bg-white">
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Mode and goal */}
            <div className="flex items-center gap-3 mt-6 text-xs">
              <div className="flex rounded-xl bg-white/10 p-1">
                <button
                  type="button"
                  onClick={() => setMode('sw')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    mode === 'sw' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Cronômetro
                </button>
                <button
                  type="button"
                  onClick={() => setMode('tm')}
                  className={`px-3 py-1.5 rounded-lg font-bold transition ${
                    mode === 'tm' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Regressivo
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-slate-300">
                <span>Meta</span>
                <input
                  type="number"
                  min="1"
                  value={goalMin}
                  onChange={(e) => setGoalMin(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-center font-bold text-white outline-none"
                />
                <span>min</span>
              </div>
            </div>

            {mode === 'tm' && elapsed >= goalSeconds && (
              <div className="mt-3 text-xs font-bold text-amber-300 bg-amber-500/20 px-3 py-1.5 rounded-full animate-pulse">
                Tempo concluído! Salve a sessão ou adicione mais tempo.
              </div>
            )}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <button
                type="button"
                onClick={handleToggleTimer}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer ${
                  isRunning && isCurrentActive ? 'bg-amber-500 hover:bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
                title={isRunning && isCurrentActive ? 'Pausar' : 'Iniciar'}
              >
                {isRunning && isCurrentActive ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>

              <button
                type="button"
                disabled={!isCurrentActive || elapsed === 0}
                onClick={() => {
                  onPauseSession();
                  onOpenRegisterModal();
                  onClose();
                }}
                className="w-16 h-16 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:pointer-events-none text-white shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer"
                title="Parar e salvar registro"
              >
                <Square className="w-6 h-6 fill-current" />
              </button>
            </div>

            {/* Quick add minutes to goal */}
            <div className="flex items-center justify-center gap-2 mt-5">
              {[1, 5, 15, 30].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setGoalMin((prev) => prev + mins)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-slate-200 transition cursor-pointer"
                >
                  +{mins} min
                </button>
              ))}
            </div>

            {isCurrentActive && elapsed > 0 && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Tem certeza que deseja cancelar esta sessão de estudo?')) {
                    onCancelSession();
                  }
                }}
                className="mt-5 text-xs text-rose-400 hover:text-rose-300 underline font-medium cursor-pointer"
              >
                Cancelar sessão atual
              </button>
            )}
          </div>

          {/* RIGHT: stats cards */}
          <div className="lg:col-span-2 space-y-4">
            <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Tempo de estudo</span>
                <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs">
                  ⏱
                </span>
              </div>
              <div className="mt-2 text-3xl font-black tabular-nums">{fmtLong(allSeconds)}</div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                <span>
                  Neste mês: <span className="font-bold text-slate-200">{fmtLong(thisMonthSeconds)}</span>
                </span>
                {monthChange !== null && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md font-bold ${
                      monthChange < 0 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                    }`}
                  >
                    {monthChange < 0 ? '↓' : '↑'} {Math.abs(monthChange)}%
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white/5 border border-white/10">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Constância nos estudos
              </span>
              <div className="mt-3 flex items-center justify-between gap-1">
                {last14.map((k) => (
                  <span
                    key={k}
                    title={k}
                    className={`w-3.5 h-3.5 rounded-full ${
                      (totals[k] || 0) > 0 ? 'bg-emerald-400' : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-3 text-sm">
                <span className="font-bold">{streak.current} dias seguidos</span>
                <span className="text-slate-400"> · recorde: {streak.longest}</span>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white/5 border border-white/10 text-xs text-slate-400">
              Total registrado hoje:{' '}
              <span className="font-bold text-slate-200">{fmtLong(sumSeconds(totals, [today]))}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
