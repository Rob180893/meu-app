import React, { useState } from 'react';
import { DiscState, Discipline, WeekPlanItem } from '../types';
import { fmtH, titleCase, uid } from '../utils/formatters';
import { addDaysKey } from '../utils/stats';
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Plus, Trash2 } from 'lucide-react';

interface WeeklyPlanViewProps {
  discState: DiscState;
  onUpdateDiscState: (updater: (prev: DiscState) => DiscState) => void;
  onToast: (msg: string) => void;
}

type PlanMap = Record<string, WeekPlanItem[]>;

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

// ISO date key (YYYY-MM-DD) in local time
const toKey = (d: Date): string =>
  d.getFullYear() +
  '-' +
  String(d.getMonth() + 1).padStart(2, '0') +
  '-' +
  String(d.getDate()).padStart(2, '0');

const fromKey = (k: string): Date => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Monday of the week that contains `d`
const mondayOf = (d: Date): Date => {
  const offset = (d.getDay() + 6) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset);
};

const shortDate = (k: string): string => k.slice(8, 10) + '/' + k.slice(5, 7);

const withItemAdded = (plan: PlanMap, day: string, item: WeekPlanItem): PlanMap => ({
  ...plan,
  [day]: [...(plan[day] || []), item],
});

export const WeeklyPlanView: React.FC<WeeklyPlanViewProps> = ({
  discState,
  onUpdateDiscState,
  onToast,
}) => {
  const curEd = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines: Discipline[] = curEd?.list || [];
  const plan: PlanMap = discState.weekPlan || {};

  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const days: string[] = Array.from({ length: 7 }, (_, i) =>
    toKey(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i))
  );
  const todayKey = toKey(new Date());

  // Add form state
  const [newName, setNewName] = useState<string>('');
  const [newHours, setNewHours] = useState<number>(1);
  const [newMinutes, setNewMinutes] = useState<number>(0);
  const [newDay, setNewDay] = useState<string>(todayKey);
  const [repeatWeeks, setRepeatWeeks] = useState<number>(1);

  // Drag and drop state
  const [dragItem, setDragItem] = useState<{ id: string; from: string } | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const addDay = days.includes(newDay) ? newDay : days[0];

  const disciplineName = (id: string): string => {
    const d = disciplines.find((x) => x.id === id);
    return d ? d.name : 'Disciplina removida';
  };

  const hueFor = (id: string): number => {
    const idx = disciplines.findIndex((d) => d.id === id);
    return ((idx < 0 ? 0 : idx) * 45 + 160) % 360;
  };

  const dayTotalMinutes = (day: string): number =>
    (plan[day] || []).reduce((acc, it) => acc + it.min, 0);

  const weekTotalMinutes = days.reduce((acc, day) => acc + dayTotalMinutes(day), 0);

  const updatePlan = (fn: (p: PlanMap) => PlanMap) => {
    onUpdateDiscState((prev) => ({ ...prev, weekPlan: fn({ ...(prev.weekPlan || {}) }) }));
  };

  // Add a discipline to a day (creates it in the edital list if the name is new)
  const handleAdd = () => {
    const cleanName = titleCase(newName.trim());
    if (!cleanName) {
      onToast('Digite ou selecione uma disciplina.');
      return;
    }

    const hours = Math.min(24, Math.max(0, newHours || 0));
    const minutes = Math.min(59, Math.max(0, newMinutes || 0));
    const totalMinutes = Math.max(1, hours * 60 + minutes);

    const existing = disciplines.find((d) => d.name.toLowerCase() === cleanName.toLowerCase());
    const discId = existing ? existing.id : uid();
    const item: WeekPlanItem = { id: uid(), disciplineId: discId, min: totalMinutes };

    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel && !existing
          ? {
              ...ed,
              list: [...ed.list, { id: discId, name: cleanName, topics: [], log: {} }],
            }
          : ed
      ),
      weekPlan: withItemAdded({ ...(prev.weekPlan || {}) }, addDay, item),
    }));

    setNewName('');
    onToast(`"${cleanName}" adicionada em ${shortDate(addDay)}.`);
  };

  const handleMove = (itemId: string, from: string, to: string) => {
    if (from === to) return;
    updatePlan((p) => {
      const item = (p[from] || []).find((i) => i.id === itemId);
      if (!item) return p;
      return {
        ...p,
        [from]: (p[from] || []).filter((i) => i.id !== itemId),
        [to]: [...(p[to] || []), item],
      };
    });
    onToast(`Movida para ${shortDate(to)}.`);
  };

  // Copy this week's plan into the next N weeks (replacing what is there)
  const handleRepeatWeek = () => {
    const targets: { day: string; items: WeekPlanItem[] }[] = [];
    for (let w = 1; w <= repeatWeeks; w++) {
      days.forEach((src) => {
        const dest = addDaysKey(src, 7 * w);
        const items = (plan[src] || []).map((it) => ({ ...it, id: uid() }));
        targets.push({ day: dest, items });
      });
    }

    const hasExisting = targets.some((t) => (plan[t.day] || []).length > 0);
    if (hasExisting) {
      const ok = window.confirm(
        `As próximas ${repeatWeeks} semana(s) já têm matérias planejadas. Substituir pelo planejamento desta semana?`
      );
      if (!ok) return;
    }

    updatePlan((p) => {
      const next = { ...p };
      targets.forEach((t) => {
        if (t.items.length > 0) next[t.day] = t.items;
        else delete next[t.day];
      });
      return next;
    });

    onToast(
      `Planejamento repetido para ${repeatWeeks === 1 ? 'a próxima semana' : `as próximas ${repeatWeeks} semanas`}.`
    );
  };

  const handleUpdateTime = (day: string, itemId: string, hours: number, minutes: number) => {
    const safeHours = Math.min(24, Math.max(0, hours || 0));
    const safeMinutes = Math.min(59, Math.max(0, minutes || 0));
    const totalMinutes = Math.max(1, safeHours * 60 + safeMinutes);
    updatePlan((p) => ({
      ...p,
      [day]: (p[day] || []).map((it) => (it.id === itemId ? { ...it, min: totalMinutes } : it)),
    }));
  };

  const handleRemove = (day: string, itemId: string) => {
    updatePlan((p) => ({
      ...p,
      [day]: (p[day] || []).filter((it) => it.id !== itemId),
    }));
  };

  const weekLabel = (): string => {
    const first = days[0];
    const last = days[6];
    return `${shortDate(first)} a ${shortDate(last)}/${last.slice(0, 4)}`;
  };

  const shiftWeek = (weeks: number) => {
    setWeekStart((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + weeks * 7));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
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
            onClick={() => shiftWeek(-1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Semana anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono min-w-[150px] text-center">
            {weekLabel()}
          </span>
          <button
            onClick={() => shiftWeek(1)}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer"
            title="Próxima semana"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWeekStart(mondayOf(new Date()))}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition cursor-pointer"
          >
            Hoje
          </button>
        </div>
      </div>

      {/* Summary + repeat */}
      <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Total planejado na semana
          </span>
          <span className="text-slate-800 dark:text-slate-100 font-mono font-bold">
            {fmtH(weekTotalMinutes * 60)}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Repetir esta semana por</span>
          <select
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(parseInt(e.target.value) || 1)}
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
            disabled={weekTotalMinutes === 0}
            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:pointer-events-none text-white text-xs font-bold transition cursor-pointer"
            title="Copia o planejamento desta semana para as semanas seguintes"
          >
            Repetir
          </button>
        </div>
      </div>

      {/* Add form */}
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
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
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
              value={addDay}
              onChange={(e) => setNewDay(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold outline-none"
            >
              {days.map((day, i) => (
                <option key={day} value={day}>
                  {WEEKDAYS[i]} {shortDate(day)}
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
                min="0"
                max="24"
                value={newHours}
                onChange={(e) => setNewHours(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-center outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Minutos
              </label>
              <input
                type="number"
                min="0"
                max="59"
                step="5"
                value={newMinutes}
                onChange={(e) => setNewMinutes(parseInt(e.target.value) || 0)}
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

      {/* Week grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-3">
        {days.map((day, i) => {
          const items = plan[day] || [];
          const isToday = day === todayKey;
          const isDragTarget = dragOverDay === day && dragItem !== null && dragItem.from !== day;

          return (
            <div
              key={day}
              onDragOver={(e) => {
                if (!dragItem) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverDay !== day) setDragOverDay(day);
              }}
              onDragLeave={() => {
                if (dragOverDay === day) setDragOverDay(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragItem) {
                  handleMove(dragItem.id, dragItem.from, day);
                }
                setDragItem(null);
                setDragOverDay(null);
              }}
              className={`p-3 rounded-3xl border min-h-[180px] flex flex-col gap-2 transition ${
                isDragTarget
                  ? 'ring-2 ring-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-400'
                  : isToday
                  ? 'bg-white dark:bg-slate-800 border-emerald-300 dark:border-emerald-700 shadow-sm'
                  : 'bg-white/90 dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-800'
              }`}
            >
              {/* Day header */}
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700/60">
                <div>
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {WEEKDAYS[i]}
                  </div>
                  <div
                    className={`text-sm font-extrabold ${
                      isToday ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-100'
                    }`}
                  >
                    {shortDate(day)}
                  </div>
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-400">
                  {fmtH(dayTotalMinutes(day) * 60)}
                </span>
              </div>

              {/* Items */}
              {items.length === 0 && (
                <p className="text-[11px] text-slate-400 text-center py-4">Nenhuma matéria</p>
              )}

              {items.map((item) => {
                const hue = hueFor(item.disciplineId);
                return (
                  <div
                    key={item.id}
                    className="relative overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/50 p-2.5 pl-3 space-y-2"
                  >
                    <div
                      className="absolute left-0 top-0 bottom-0 w-1"
                      style={{ backgroundColor: `hsl(${hue} 75% 50%)` }}
                    />

                    <div className="flex items-start gap-1.5">
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDragItem({ id: item.id, from: day });
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', item.id);
                        }}
                        onDragEnd={() => {
                          setDragItem(null);
                          setDragOverDay(null);
                        }}
                        className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 pt-0.5"
                        title="Arraste para outro dia"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                      <span className="flex-1 min-w-0 text-xs font-extrabold uppercase tracking-tight text-slate-800 dark:text-slate-100 break-words">
                        {disciplineName(item.disciplineId)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemove(day, item.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer"
                        title="Remover do dia"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-semibold">
                      <input
                        type="number"
                        min="0"
                        max="24"
                        value={Math.floor(item.min / 60)}
                        onChange={(e) =>
                          handleUpdateTime(day, item.id, parseInt(e.target.value) || 0, item.min % 60)
                        }
                        className="w-11 px-1 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-center outline-none"
                      />
                      <span>h</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        step="5"
                        value={item.min % 60}
                        onChange={(e) =>
                          handleUpdateTime(day, item.id, Math.floor(item.min / 60), parseInt(e.target.value) || 0)
                        }
                        className="w-11 px-1 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-center outline-none"
                      />
                      <span>min</span>
                    </div>

                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleMove(item.id, day, e.target.value);
                      }}
                      className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold outline-none cursor-pointer"
                    >
                      <option value="">Mover para…</option>
                      {days
                        .filter((d) => d !== day)
                        .map((d) => (
                          <option key={d} value={d}>
                            {WEEKDAYS[days.indexOf(d)]} {shortDate(d)}
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
