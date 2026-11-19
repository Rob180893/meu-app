import React, { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { DiscState, WeekPlan } from '../types';
import {
  addDays,
  formatHoursMin,
  formatShortDate,
  titleCase,
  todayStr,
  uid,
} from '../utils/date';

interface WeekPlanViewProps {
  discState: DiscState;
  onUpdateDiscState: React.Dispatch<React.SetStateAction<DiscState>>;
  onToast: (msg: string) => void;
}

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

const getMonday = (d: Date): Date => {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
};

export const WeekPlanView: React.FC<WeekPlanViewProps> = ({
  discState,
  onUpdateDiscState,
  onToast,
}) => {
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];
  const weekPlan: WeekPlan = discState.weekPlan || {};

  const [weekStart, setWeekStart] = useState<Date>(() => getMonday(new Date()));
  const days = Array.from({ length: 7 }, (_, i) =>
    todayStr(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  );
  const today = todayStr();

  const [discInput, setDiscInput] = useState('');
  const [hours, setHours] = useState(1);
  const [mins, setMins] = useState(0);
  const [selectedDay, setSelectedDay] = useState(today);
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [dragged, setDragged] = useState<{ id: string; from: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const effectiveDay = days.includes(selectedDay) ? selectedDay : days[0];

  const getDiscName = (id: string) =>
    disciplines.find((d) => d.id === id)?.name || 'Disciplina removida';
  const getDiscHue = (id: string) => {
    const idx = disciplines.findIndex((d) => d.id === id);
    return ((idx < 0 ? 0 : idx) * 45 + 160) % 360;
  };

  const dayMinutes = (day: string) => (weekPlan[day] || []).reduce((acc, i) => acc + i.min, 0);
  const weekMinutes = days.reduce((acc, d) => acc + dayMinutes(d), 0);

  const updatePlan = (fn: (prev: WeekPlan) => WeekPlan) => {
    onUpdateDiscState((prev) => ({
      ...prev,
      weekPlan: fn({ ...(prev.weekPlan || {}) }),
    }));
  };

  const handleAdd = () => {
    const clean = titleCase(discInput.trim());
    if (!clean) {
      onToast('Digite ou selecione uma disciplina.');
      return;
    }
    const safeH = Math.min(24, Math.max(0, hours || 0));
    const safeM = Math.min(59, Math.max(0, mins || 0));
    const min = Math.max(1, safeH * 60 + safeM);
    const existing = disciplines.find((d) => d.name.toLowerCase() === clean.toLowerCase());
    const discId = existing ? existing.id : uid();
    const item = { id: uid(), disciplineId: discId, min };

    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel && !existing
          ? { ...ed, list: [...ed.list, { id: discId, name: clean, topics: [], log: {} }] }
          : ed
      ),
      weekPlan: {
        ...(prev.weekPlan || {}),
        [effectiveDay]: [...((prev.weekPlan || {})[effectiveDay] || []), item],
      },
    }));
    setDiscInput('');
    onToast(`"${clean}" adicionada em ${formatShortDate(effectiveDay)}.`);
  };

  const moveItem = (itemId: string, fromDay: string, toDay: string) => {
    if (fromDay === toDay) return;
    updatePlan((plan) => {
      const target = (plan[fromDay] || []).find((i) => i.id === itemId);
      if (!target) return plan;
      return {
        ...plan,
        [fromDay]: (plan[fromDay] || []).filter((i) => i.id !== itemId),
        [toDay]: [...(plan[toDay] || []), target],
      };
    });
    onToast(`Movida para ${formatShortDate(toDay)}.`);
  };

  const handleRepeatWeek = () => {
    const updates: { day: string; items: { id: string; disciplineId: string; min: number }[] }[] =
      [];
    for (let w = 1; w <= repeatWeeks; w++) {
      days.forEach((day) => {
        const dest = addDays(day, w * 7);
        const cloned = (weekPlan[day] || []).map((i) => ({ ...i, id: uid() }));
        updates.push({ day: dest, items: cloned });
      });
    }
    const hasExisting = updates.some((u) => (weekPlan[u.day] || []).length > 0);
    if (
      hasExisting &&
      !window.confirm(
        `As próximas ${repeatWeeks} semana(s) já têm matérias planejadas. Substituir pelo planejamento desta semana?`
      )
    ) {
      return;
    }
    updatePlan((plan) => {
      const copy = { ...plan };
      updates.forEach((u) => {
        if (u.items.length > 0) copy[u.day] = u.items;
        else delete copy[u.day];
      });
      return copy;
    });
    onToast(
      `Planejamento repetido para ${
        repeatWeeks === 1 ? 'a próxima semana' : `as próximas ${repeatWeeks} semanas`
      }.`
    );
  };

  const updateItemTime = (day: string, itemId: string, h: number, m: number) => {
    const safeH = Math.min(24, Math.max(0, h || 0));
    const safeM = Math.min(59, Math.max(0, m || 0));
    const min = Math.max(1, safeH * 60 + safeM);
    updatePlan((plan) => ({
      ...plan,
      [day]: (plan[day] || []).map((i) => (i.id === itemId ? { ...i, min } : i)),
    }));
  };

  const removeItem = (day: string, itemId: string) => {
    updatePlan((plan) => ({
      ...plan,
      [day]: (plan[day] || []).filter((i) => i.id !== itemId),
    }));
  };

  const rangeTitle = `${formatShortDate(days[0])} a ${formatShortDate(days[6])}/${days[6].slice(0, 4)}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <div>
          <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
            Planejamento semanal
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Organize por dia as matérias que quer estudar. Você pode mover ou ajustar a qualquer momento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() - 7))
            }
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono min-w-[150px] text-center tabular-nums">
            {rangeTitle}
          </span>
          <button
            type="button"
            onClick={() =>
              setWeekStart((w) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7))
            }
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeekStart(getMonday(new Date()))}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Total e repetir */}
      <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total planejado na semana
          </span>
          <span className="text-slate-800 dark:text-slate-100 font-mono font-bold tabular-nums">
            {formatHoursMin(weekMinutes * 60)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Repetir esta semana por
          </span>
          <select
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(parseInt(e.target.value, 10) || 1)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold outline-none cursor-pointer"
          >
            {[1, 2, 3, 4, 6, 8].map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'semana' : 'semanas'}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRepeatWeek}
            disabled={weekMinutes === 0}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold transition cursor-pointer"
          >
            Repetir
          </button>
        </div>
      </div>

      {/* Formulário adicionar */}
      <div className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-emerald-500" />
          <span>Adicionar ao planejamento</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Disciplina
            </label>
            <input
              type="text"
              list="weekly-disciplines"
              placeholder="Selecione ou digite o nome"
              value={discInput}
              onChange={(e) => setDiscInput(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
            />
            <datalist id="weekly-disciplines">
              {disciplines.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Dia
            </label>
            <select
              value={effectiveDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
            >
              {days.map((d, idx) => (
                <option key={d} value={d}>
                  {WEEKDAYS[idx]} {formatShortDate(d)}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Horas
              </label>
              <input
                type="number"
                min={0}
                max={24}
                value={hours}
                onChange={(e) => setHours(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Minutos
              </label>
              <input
                type="number"
                min={0}
                max={59}
                step={5}
                value={mins}
                onChange={(e) => setMins(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-4">
            <button
              type="button"
              onClick={handleAdd}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar</span>
            </button>
          </div>
        </div>
      </div>

      {/* Grid 7 dias */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        {days.map((day, idx) => {
          const items = weekPlan[day] || [];
          const isToday = day === today;
          const isTarget = dropTarget === day && dragged !== null && dragged.from !== day;

          return (
            <div
              key={day}
              onDragOver={(e) => {
                if (dragged) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTarget !== day) setDropTarget(day);
                }
              }}
              onDragLeave={() => {
                if (dropTarget === day) setDropTarget(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragged) moveItem(dragged.id, dragged.from, day);
                setDragged(null);
                setDropTarget(null);
              }}
              className={`p-3 rounded-3xl border min-h-[180px] flex flex-col gap-2 transition ${
                isTarget
                  ? 'ring-2 ring-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400'
                  : isToday
                  ? 'bg-white dark:bg-slate-800 border-emerald-400 dark:border-emerald-600 shadow-sm'
                  : 'bg-white/90 dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {WEEKDAYS[idx]}
                  </div>
                  <div
                    className={`text-sm font-extrabold ${
                      isToday
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {formatShortDate(day)}
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-400 tabular-nums">
                  {formatHoursMin(dayMinutes(day) * 60)}
                </span>
              </div>

              {items.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-4">Nenhuma matéria</p>
              )}

              {items.map((item) => {
                const hue = getDiscHue(item.disciplineId);
                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 p-2.5 space-y-2"
                  >
                    <div className="flex items-start gap-1.5">
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDragged({ id: item.id, from: day });
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', item.id);
                        }}
                        onDragEnd={() => {
                          setDragged(null);
                          setDropTarget(null);
                        }}
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 pt-0.5 shrink-0"
                        title="Arraste para outro dia"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ backgroundColor: `hsl(${hue} 70% 50%)` }}
                      />
                      <span className="flex-1 min-w-0 text-xs font-extrabold uppercase tracking-tight text-slate-800 dark:text-slate-100 break-words">
                        {getDiscName(item.disciplineId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(day, item.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer shrink-0"
                        title="Remover do dia"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                      <input
                        type="number"
                        min={0}
                        max={24}
                        value={Math.floor(item.min / 60)}
                        onChange={(e) =>
                          updateItemTime(
                            day,
                            item.id,
                            parseInt(e.target.value, 10) || 0,
                            item.min % 60
                          )
                        }
                        className="w-11 px-1 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-center outline-none"
                      />
                      <span>h</span>
                      <input
                        type="number"
                        min={0}
                        max={59}
                        step={5}
                        value={item.min % 60}
                        onChange={(e) =>
                          updateItemTime(
                            day,
                            item.id,
                            Math.floor(item.min / 60),
                            parseInt(e.target.value, 10) || 0
                          )
                        }
                        className="w-11 px-1 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-center outline-none"
                      />
                      <span>min</span>
                    </div>

                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) moveItem(item.id, day, e.target.value);
                      }}
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold outline-none cursor-pointer"
                    >
                      <option value="">Mover para…</option>
                      {days
                        .filter((other) => other !== day)
                        .map((other) => (
                          <option key={other} value={other}>
                            {WEEKDAYS[days.indexOf(other)]} ({formatShortDate(other)})
                          </option>
                        ))}
                    </select>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
