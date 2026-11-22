import React, { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Settings, Sparkles, Trash2 } from 'lucide-react';
import type { ActiveRun, CycleItem, DiscState } from '../types';
import { formatHoursMin, titleCase, uid } from '../utils/date';
import { ConfirmacaoInline } from './ConfirmacaoInline';

interface CycleViewProps {
  discState: DiscState;
  onUpdateDiscState: React.Dispatch<React.SetStateAction<DiscState>>;
  activeRun: ActiveRun | null;
  onToast: (msg: string) => void;
  currentElapsedSeconds: number;
}

export const CycleView: React.FC<CycleViewProps> = ({
  discState,
  onUpdateDiscState,
  activeRun,
  onToast,
  currentElapsedSeconds,
}) => {
  const [confirmarRecomeco, setConfirmarRecomeco] = useState(false);
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];
  const cycles = activeEdital?.cycles || [];
  const activeCycle = cycles.find((c) => c.id === activeEdital?.csel) || cycles[0];

  const [editing, setEditing] = useState(false);
  const [newName, setNewName] = useState('');
  const [hours, setHours] = useState(1);
  const [mins, setMins] = useState(0);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!activeCycle) {
    return <div className="text-center p-8 text-slate-400">Nenhum ciclo encontrado.</div>;
  }

  const validItems = activeCycle.items.filter((item) =>
    disciplines.some((d) => d.id === item.id)
  );

  const getItemElapsedSec = (item: CycleItem) => {
    const disc = disciplines.find((d) => d.id === item.id);
    if (!disc) return 0;
    let total = 0;
    Object.values(disc.log || {}).forEach((s) => (total += s));
    if (activeRun?.id === item.id && activeRun.start) total += currentElapsedSeconds;
    const base = activeCycle.base[item.id] || 0;
    return Math.max(0, total - base);
  };

  const completedFlags = validItems.map((item) => getItemElapsedSec(item) >= item.min * 60);
  const nextIndex = completedFlags.findIndex((done) => !done);
  const totalTargetSec = validItems.reduce((acc, item) => acc + item.min * 60, 0);
  const totalStudiedSec = validItems.reduce(
    (acc, item) => acc + Math.min(getItemElapsedSec(item), item.min * 60),
    0
  );
  const cyclePct = totalTargetSec > 0 ? Math.round((totalStudiedSec / totalTargetSec) * 100) : 0;

  const updateCurrentCycle = (updater: (items: CycleItem[]) => CycleItem[]) => {
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              cycles: (ed.cycles || []).map((c) =>
                c.id === activeCycle.id ? { ...c, items: updater(c.items) } : c
              ),
            }
          : ed
      ),
    }));
  };

  const reorderItem = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= validItems.length || to >= validItems.length) {
      return;
    }
    updateCurrentCycle((items) => {
      const copy = [...items];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  const restartCycle = (incrementCount: boolean) => {
    const nextBase: Record<string, number> = {};
    validItems.forEach((item) => {
      const disc = disciplines.find((d) => d.id === item.id);
      if (disc) {
        let total = 0;
        Object.values(disc.log || {}).forEach((s) => (total += s));
        nextBase[item.id] = total;
      }
    });
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              cycles: (ed.cycles || []).map((c) =>
                c.id === activeCycle.id
                  ? { ...c, base: nextBase, n: incrementCount ? c.n + 1 : c.n }
                  : c
              ),
            }
          : ed
      ),
    }));
    onToast(
      incrementCount
        ? `Parabéns! Ciclo nº ${activeCycle.n + 1} concluído com sucesso!`
        : 'Contagem do ciclo reiniciada.'
    );
  };

  const addItemToCycle = (raw: string) => {
    const clean = titleCase(raw);
    if (!clean) return;
    let targetDisc = disciplines.find(
      (d) => d.id === raw || d.name.toLowerCase() === clean.toLowerCase()
    );
    const nextDiscs = [...disciplines];
    if (!targetDisc) {
      targetDisc = { id: uid(), name: clean, topics: [], log: {} };
      nextDiscs.push(targetDisc);
    }
    if (validItems.some((item) => item.id === targetDisc!.id)) {
      onToast('Esta disciplina já está no ciclo.');
      return;
    }
    const min = Math.max(1, hours * 60 + mins);
    let logSum = 0;
    Object.values(targetDisc.log || {}).forEach((s) => (logSum += s));
    const newItem: CycleItem = { id: targetDisc.id, min };

    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              list: nextDiscs,
              cycles: (ed.cycles || []).map((c) =>
                c.id === activeCycle.id
                  ? {
                      ...c,
                      items: [...c.items, newItem],
                      base: { ...c.base, [targetDisc!.id]: logSum },
                    }
                  : c
              ),
            }
          : ed
      ),
    }));
    setNewName('');
    onToast(`Disciplina "${targetDisc.name}" adicionada ao ciclo.`);
  };

  const updateItemMinutes = (discId: string, h: number, m: number) => {
    const safeH = Math.min(24, Math.max(0, h || 0));
    const safeM = Math.min(59, Math.max(0, m || 0));
    const min = Math.max(1, safeH * 60 + safeM);
    updateCurrentCycle((items) =>
      items.map((item) => (item.id === discId ? { ...item, min } : item))
    );
  };

  const availableDiscs = disciplines.filter((d) => !validItems.some((item) => item.id === d.id));

  // SVG donut geometry
  const totalMinutes = validItems.reduce((acc, item) => acc + item.min, 0);
  const outer = (deg: number): [number, number] => [
    200 + 150 * Math.cos((deg * Math.PI) / 180),
    200 + 150 * Math.sin((deg * Math.PI) / 180),
  ];
  const inner = (deg: number): [number, number] => [
    200 + 95 * Math.cos((deg * Math.PI) / 180),
    200 + 95 * Math.sin((deg * Math.PI) / 180),
  ];
  let cursorAngle = -90;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            Ciclo de Estudos
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ciclo contínuo e equilibrado por disciplinas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setConfirmarRecomeco(true)}
            className="px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition hover:bg-emerald-100 cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Recomeçar Ciclo</span>
          </button>
          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>{editing ? 'Concluir Ajuste' : 'Editar Planejamento'}</span>
          </button>
        </div>
      </div>

      {confirmarRecomeco && (
        <ConfirmacaoInline
          mensagem="Deseja recomeçar a contagem deste ciclo de estudos?"
          textoConfirmar="Recomeçar"
          onCancelar={() => setConfirmarRecomeco(false)}
          onConfirmar={() => {
            setConfirmarRecomeco(false);
            restartCycle(false);
          }}
        />
      )}

      {/* Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
        <div className="sm:col-span-3 p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Ciclos Completos
          </span>
          <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            {activeCycle.n}
          </div>
          <span className="text-xs text-slate-500 mt-1">
            {nextIndex === -1 && validItems.length > 0
              ? 'Pronto para iniciar próximo ciclo!'
              : `${completedFlags.filter(Boolean).length}/${validItems.length} matérias concluídas`}
          </span>
        </div>

        <div className="sm:col-span-9 p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Progresso do Ciclo Atual
            </span>
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatHoursMin(totalStudiedSec)} / {formatHoursMin(totalTargetSec)} ({cyclePct}%)
            </span>
          </div>
          <div className="h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${cyclePct}%` }}
            />
          </div>
          {nextIndex === -1 && validItems.length > 0 && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => restartCycle(true)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Concluir Ciclo e Iniciar Próximo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Editor inline */}
      {editing && (
        <div className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            Adicionar disciplina ao ciclo
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
            <div className="sm:col-span-5">
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Disciplina
              </label>
              <input
                type="text"
                list="cycle-disciplines"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Selecione ou digite"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold outline-none"
              />
              <datalist id="cycle-disciplines">
                {availableDiscs.map((d) => (
                  <option key={d.id} value={d.name} />
                ))}
              </datalist>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Horas
              </label>
              <input
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-center outline-none"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
                Minutos
              </label>
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={mins}
                onChange={(e) => setMins(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-center outline-none"
              />
            </div>
            <div className="sm:col-span-3">
              <button
                type="button"
                onClick={() => addItemToCycle(newName)}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
              >
                Adicionar ao Ciclo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista + Gráfico Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
            Ordem do Ciclo
          </h3>

          {validItems.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhuma disciplina no ciclo.</p>
          ) : (
            <div className="space-y-2.5">
              {validItems.map((item, idx) => {
                const disc = disciplines.find((d) => d.id === item.id);
                const elapsed = getItemElapsedSec(item);
                const targetSec = item.min * 60;
                const pct = Math.min(100, Math.round((elapsed / targetSec) * 100));
                const isNext = idx === nextIndex;
                const done = completedFlags[idx];
                const hue = (idx * 45 + 160) % 360;

                return (
                  <div
                    key={item.id}
                    className={`p-3.5 rounded-2xl border transition flex items-center gap-3 ${
                      isNext
                        ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-400'
                        : done
                        ? 'bg-slate-50/80 dark:bg-slate-900/40 border-slate-200 dark:border-slate-700 opacity-80'
                        : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div
                      className="w-2.5 h-10 rounded-full shrink-0"
                      style={{ backgroundColor: `hsl(${hue} 70% 50%)` }}
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-extrabold text-xs uppercase text-slate-800 dark:text-slate-100 truncate">
                            {disc?.name || 'Disciplina'}
                          </span>
                          {isNext && (
                            <span className="text-[10px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400">
                              Próxima
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                          {formatHoursMin(elapsed)} / {formatHoursMin(targetSec)}
                        </span>
                      </div>

                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: `hsl(${hue} 70% 50%)`,
                          }}
                        />
                      </div>

                      {editing && (
                        <div className="flex items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => reorderItem(idx, idx - 1)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === validItems.length - 1}
                            onClick={() => reorderItem(idx, idx + 1)}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 cursor-pointer"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={Math.floor(item.min / 60)}
                            onChange={(e) =>
                              updateItemMinutes(
                                item.id,
                                parseInt(e.target.value, 10) || 0,
                                item.min % 60
                              )
                            }
                            className="w-12 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center outline-none"
                          />
                          <span>h</span>
                          <input
                            type="number"
                            min={0}
                            max={59}
                            step={5}
                            value={item.min % 60}
                            onChange={(e) =>
                              updateItemMinutes(
                                item.id,
                                Math.floor(item.min / 60),
                                parseInt(e.target.value, 10) || 0
                              )
                            }
                            className="w-12 px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center outline-none"
                          />
                          <span>min</span>
                        </div>
                      )}
                    </div>

                    {editing && (
                      <button
                        type="button"
                        onClick={() =>
                          updateCurrentCycle((items) => items.filter((_, i) => i !== idx))
                        }
                        className="p-2 rounded-xl text-slate-400 hover:text-rose-500 transition cursor-pointer"
                        title="Remover do ciclo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-500" />
              <span>Ciclo</span>
            </h3>
            <span className="text-xs text-slate-400 font-bold">{activeCycle.name}</span>
          </div>

          <div className="py-2">
            <svg viewBox="0 0 400 400" className="w-full max-w-[340px] mx-auto select-none">
              {validItems.map((item, idx) => {
                const disc = disciplines.find((d) => d.id === item.id);
                const sweep =
                  (totalMinutes > 0 ? item.min / totalMinutes : 1 / validItems.length) * 360;
                const a1 = cursorAngle + 1;
                const a2 = cursorAngle + sweep - 1;
                cursorAngle += sweep;
                const [x1, y1] = outer(a1);
                const [x2, y2] = outer(a2);
                const [ix1, iy1] = inner(a2);
                const [ix2, iy2] = inner(a1);
                const largeArc = sweep - 2 > 180 ? 1 : 0;
                const path = `M ${x1} ${y1} A 150 150 0 ${largeArc} 1 ${x2} ${y2} L ${ix1} ${iy1} A 95 95 0 ${largeArc} 0 ${ix2} ${iy2} Z`;
                const hue = (idx * 45 + 160) % 360;
                const highlighted = idx === nextIndex || hoverIdx === idx;
                const done = completedFlags[idx];
                return (
                  <g
                    key={item.id}
                    onMouseEnter={() => setHoverIdx(idx)}
                    onMouseLeave={() => setHoverIdx(null)}
                  >
                    <path
                      d={path}
                      fill={`hsl(${hue} ${highlighted ? '85%' : '70%'} ${done ? '55%' : '65%'})`}
                      className={`transition-all duration-200 ${
                        highlighted ? 'brightness-110' : 'opacity-90'
                      }`}
                    />
                    <title>
                      {disc?.name || 'Disciplina'}: {Math.floor(item.min / 60)}h
                      {String(item.min % 60).padStart(2, '0')}min
                    </title>
                  </g>
                );
              })}
              <text
                x={200}
                y={190}
                textAnchor="middle"
                fontSize={28}
                fontWeight={900}
                className="fill-slate-900 dark:fill-white font-mono tracking-tight"
              >
                {formatHoursMin(totalTargetSec)}
              </text>
              <text
                x={200}
                y={216}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                className="fill-slate-400 dark:fill-slate-500 uppercase tracking-wider"
              >
                {hoverIdx !== null && validItems[hoverIdx]
                  ? disciplines.find((d) => d.id === validItems[hoverIdx].id)?.name
                  : 'Total Planejado'}
              </text>
              {hoverIdx !== null && validItems[hoverIdx] && (
                <text
                  x={200}
                  y={234}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={800}
                  className="fill-emerald-600 dark:fill-emerald-400 font-mono"
                >
                  {formatHoursMin(validItems[hoverIdx].min * 60)}
                </text>
              )}
            </svg>
          </div>

          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="w-full py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs uppercase tracking-wider shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-4 h-4" />
            <span>{editing ? 'Concluir Ajuste' : 'Ajustar Ciclo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
