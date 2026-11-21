import React, { useEffect, useState } from 'react';
import { BookOpen, Check, Clock, X } from 'lucide-react';
import type { DiscState, StudyLogPayload } from '../types';
import { addDays, formatHMS, parseHMS, todayStr } from '../utils/date';

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  discState: DiscState;
  initialDisciplineId?: string;
  initialSeconds?: number;
  onSave: (payload: StudyLogPayload) => void;
}

const CATEGORIES = ['PDF', 'Videoaula', 'Questões', 'Revisão', 'Simulado'] as const;

const INPUT_CLS =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500';

export const RegisterModal: React.FC<RegisterModalProps> = ({
  isOpen,
  onClose,
  discState,
  initialDisciplineId,
  initialSeconds = 0,
  onSave,
}) => {
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];

  const [dateMode, setDateMode] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(todayStr());
  const [durationStr, setDurationStr] = useState('00:00:00');
  const [category, setCategory] = useState<string>('PDF');
  const [disciplineId, setDisciplineId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');
  const [subId, setSubId] = useState<string>('');
  const [material, setMaterial] = useState('');
  const [finishTheory, setFinishTheory] = useState(false);
  const [scheduleReviews, setScheduleReviews] = useState(true);
  const [correctQuestions, setCorrectQuestions] = useState('');
  const [wrongQuestions, setWrongQuestions] = useState('');
  const [initialPage, setInitialPage] = useState('');
  const [finalPage, setFinalPage] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [videoStart, setVideoStart] = useState('');
  const [videoEnd, setVideoEnd] = useState('');
  const [comments, setComments] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const defaultDisc =
      disciplines.find((d) => d.id === initialDisciplineId)?.id ||
      disciplines.find((d) => d.id === discState.sel)?.id ||
      disciplines[0]?.id ||
      '';
    setDateMode('today');
    setCustomDate(todayStr());
    setDurationStr(formatHMS(initialSeconds));
    setCategory('PDF');
    setDisciplineId(defaultDisc);
    setTopicId('');
    setSubId('');
    setMaterial('');
    setFinishTheory(false);
    setScheduleReviews(true);
    setCorrectQuestions('');
    setWrongQuestions('');
    setInitialPage('');
    setFinalPage('');
    setVideoTitle('');
    setVideoStart('');
    setVideoEnd('');
    setComments('');
    setError(null);
  }, [isOpen, initialDisciplineId, initialSeconds, discState.sel]);

  if (!isOpen) return null;

  const selectedDisc = disciplines.find((d) => d.id === disciplineId) || disciplines[0];
  const topics = selectedDisc?.topics || [];

  const resolveDate = (): string => {
    const today = todayStr();
    if (dateMode === 'today') return today;
    if (dateMode === 'yesterday') return addDays(today, -1);
    return customDate || today;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDisc) {
      setError('Cadastre ao menos uma disciplina antes de registrar o estudo.');
      return;
    }
    const seconds = parseHMS(durationStr);
    const hits = Math.max(0, parseInt(correctQuestions, 10) || 0);
    const errs = Math.max(0, parseInt(wrongQuestions, 10) || 0);
    const temNota = comments.trim().length > 0;
    if (seconds <= 0 && hits + errs <= 0 && !temNota) {
      setError('Informe o tempo, as questões ou escreva uma nota no bloco de notas.');
      return;
    }

    onSave({
      disciplineId: selectedDisc.id,
      topicId,
      subId: subId || undefined,
      date: resolveDate(),
      seconds,
      category,
      material: material.trim(),
      correctQuestions: hits,
      wrongQuestions: errs,
      initialPage: Math.max(0, parseInt(initialPage, 10) || 0),
      finalPage: Math.max(0, parseInt(finalPage, 10) || 0),
      videoTitle: videoTitle.trim(),
      videoStart: videoStart.trim(),
      videoEnd: videoEnd.trim(),
      comments: comments.trim(),
      finishTheory,
      scheduleReviews,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Adicionar Estudo"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden my-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Registrar Sessão de Estudo
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-xs font-semibold text-rose-700 dark:text-rose-200">
              {error}
            </div>
          )}

          {/* Data e Duração */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Data
              </label>
              <div className="flex items-center gap-1.5">
                {(['today', 'yesterday', 'custom'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setDateMode(m)}
                    className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      dateMode === m
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {m === 'today' ? 'Hoje' : m === 'yesterday' ? 'Ontem' : 'Outra'}
                  </button>
                ))}
              </div>
              {dateMode === 'custom' && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className={`${INPUT_CLS} mt-2`}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Tempo estudado (HH:MM:SS)</span>
              </label>
              <input
                type="text"
                value={durationStr}
                onChange={(e) => setDurationStr(e.target.value)}
                placeholder="01:00:00"
                className={`${INPUT_CLS} font-mono font-bold tabular-nums`}
              />
            </div>
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Categoria
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    category === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Disciplina e Tópico */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Disciplina
              </label>
              <select
                value={selectedDisc?.id || ''}
                onChange={(e) => {
                  setDisciplineId(e.target.value);
                  setTopicId('');
                }}
                className={INPUT_CLS}
              >
                {disciplines.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Tópico (opcional)
              </label>
              <select
                value={topicId}
                onChange={(e) => {
                  setTopicId(e.target.value);
                  setSubId('');
                }}
                className={INPUT_CLS}
              >
                <option value="">Sem tópico específico</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.g ? `[${t.g}] ` : ''}
                    {t.name}
                  </option>
                ))}
              </select>
              {topicId && (topics.find((t) => t.id === topicId)?.subs || []).length > 0 && (
                <select
                  value={subId}
                  onChange={(e) => setSubId(e.target.value)}
                  className={INPUT_CLS}
                >
                  <option value="">Tópico inteiro (sem subtópico)</option>
                  {(topics.find((t) => t.id === topicId)?.subs || []).map((sb) => (
                    <option key={sb.id} value={sb.id}>
                      ↳ {sb.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Checkboxes de Teoria / Revisões */}
          {topicId && (
            <div className="flex flex-wrap items-center gap-5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={finishTheory}
                  onChange={(e) => setFinishTheory(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Concluir teoria do tópico</span>
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scheduleReviews}
                  onChange={(e) => setScheduleReviews(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Programar revisões espaçadas</span>
              </label>
            </div>
          )}

          {/* Questões */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Acertos
              </label>
              <input
                type="number"
                min={0}
                value={correctQuestions}
                onChange={(e) => setCorrectQuestions(e.target.value)}
                placeholder="0"
                className={INPUT_CLS}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-rose-500">
                Erros
              </label>
              <input
                type="number"
                min={0}
                value={wrongQuestions}
                onChange={(e) => setWrongQuestions(e.target.value)}
                placeholder="0"
                className={INPUT_CLS}
              />
            </div>
          </div>

<div className="space-y-1">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Bloco de notas
            </label>
            <textarea
              rows={6}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Anote o que quiser sobre a sessão..."
              className={INPUT_CLS}
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4" />
              <span>Salvar Estudo</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
