import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  FilePlus,
  FileText,
  ListPlus,
  Maximize2,
  Minimize2,
  Pause,
  Pen,
  PenLine,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  ActiveRun,
  Discipline,
  DiscState,
  EditalDatas,
  MaterialMeta,
  PdfOpenRequest,
  SubTopic,
  Topic,
  SessaoEstudo,
} from '../types';
import {
  addDays,
  cleanEditalDates,
  countPages,
  formatFullDate,
  formatHMS,
  formatHoursMin,
  formatShortDate,
  nextPeriodicDate,
  syncSubtopicsWithTopic,
  syncTopicFromSubtopics,
  titleCase,
  todayStr,
  uid,
  validateEditalDates,
} from '../utils/date';
import { aplicarEdicaoSessao, ocultarSessao } from '../utils/sessoes';
import { listMaterials, saveMaterialFile } from '../utils/storage';

interface DisciplinesViewProps {
  discState: DiscState;
  onUpdateDiscState: React.Dispatch<React.SetStateAction<DiscState>>;
  activeRun: ActiveRun | null;
  onStartSession: (discId: string) => void;
  onPauseSession: () => void;
  onCancelSession: () => void;
  onOpenRegisterModal: () => void;
  onAbrirPdf: (req: PdfOpenRequest) => void;
  onToast: (msg: string) => void;
  currentElapsedSeconds: number;
}

const INPUT_CLS =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500';

const EditalDatesFields: React.FC<{
  value: EditalDatas;
  onChange: (next: EditalDatas) => void;
}> = ({ value, onChange }) => {
  const bind = (key: keyof EditalDatas) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [key]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Início das inscrições
        </label>
        <input type="date" value={value.inscricaoInicio || ''} onChange={bind('inscricaoInicio')} className={INPUT_CLS} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Fim das inscrições
        </label>
        <input type="date" value={value.inscricaoFim || ''} onChange={bind('inscricaoFim')} className={INPUT_CLS} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Pagamento da taxa
        </label>
        <input type="date" value={value.taxa || ''} onChange={bind('taxa')} className={INPUT_CLS} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Data da prova
        </label>
        <input type="date" value={value.prova || ''} onChange={bind('prova')} className={INPUT_CLS} />
      </div>
    </div>
  );
};

interface TopicoColado {
  name: string;
  g?: string;
  subs: string[];
}

const limparPrefixoLista = (texto: string): string =>
  texto.replace(/^(\d+(\.\d+)*[.)\-:\s]+|[-•*]\s+)/, '').trim().toUpperCase();

/** Converte o texto da janela em tópicos e subtópicos. Traço ou recuo = subtópico. */
const parseColagem = (texto: string): TopicoColado[] => {
  const out: TopicoColado[] = [];
  let grupo: string | undefined;
  texto
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .forEach((raw) => {
      const line = raw.trim();
      if (line.startsWith('#') || (line.endsWith(':') && line.length < 70)) {
        grupo = line.replace(/^#+\s*/, '').replace(/:$/, '').trim().toUpperCase() || undefined;
        return;
      }
      const cleaned = limparPrefixoLista(line);
      if (!cleaned) return;
      const ehSub = out.length > 0 && (/^\s/.test(raw) || /^[-•*]\s+/.test(line));
      if (ehSub) {
        out[out.length - 1].subs.push(cleaned);
        return;
      }
      out.push({ name: cleaned, g: grupo, subs: [] });
    });
  return out;
};

/** Gera o texto da janela a partir dos tópicos atuais, para editar. */
const serializarTopicos = (topics: Topic[]): string => {
  const linhas: string[] = [];
  let grupoAtual: string | undefined;
  topics.forEach((t) => {
    if (t.g && t.g !== grupoAtual) {
      linhas.push(`# ${t.g}`);
      grupoAtual = t.g;
    }
    linhas.push(t.name);
    (t.subs || []).forEach((sb) => linhas.push(`  - ${sb.name}`));
  });
  return linhas.join('\n');
};

/** Junta a lista colada com os tópicos existentes, mantendo o progresso dos que já existem. */
const reconciliarTopicos = (existentes: Topic[], lista: TopicoColado[]): Topic[] => {
  const usados = new Set<string>();
  return lista.map((item) => {
    const k = limparPrefixoLista(item.name);
    const antigo = existentes.find((t) => !usados.has(t.id) && limparPrefixoLista(t.name) === k);
    if (antigo) usados.add(antigo.id);
    const subsAntigos = antigo?.subs || [];
    const subsUsados = new Set<string>();
    const subs: SubTopic[] = item.subs.map((nomeSub) => {
      const ks = limparPrefixoLista(nomeSub);
      const sa = subsAntigos.find((x) => !subsUsados.has(x.id) && limparPrefixoLista(x.name) === ks);
      if (sa) {
        subsUsados.add(sa.id);
        return sa;
      }
      return { id: uid(), name: nomeSub, studied: null, done: false, h: 0, e: 0, tp: {}, r: {} };
    });
    const base: Topic = antigo
      ? { ...antigo, g: item.g }
      : { id: uid(), name: item.name, g: item.g, studied: null, q: false, r: {}, h: 0, e: 0 };
    return syncTopicFromSubtopics({ ...base, subs });
  });
};

/** Mostra o nome por inteiro. Só vira campo de edição ao clicar na caneta. */
const NomeEditavel: React.FC<{
  valor: string;
  onSalvar: (novo: string) => void;
  className?: string;
}> = ({ valor, onSalvar, className }) => {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(valor);

  if (editando) {
    return (
      <textarea
        autoFocus
        rows={2}
        value={rascunho}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={() => {
          const novo = rascunho.trim().toUpperCase();
          if (novo && novo !== valor) onSalvar(novo);
          setEditando(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setRascunho(valor);
            setEditando(false);
          }
        }}
        className="flex-1 min-w-[200px] font-bold text-xs uppercase bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 outline-none px-2 py-1 rounded-lg leading-snug focus:ring-2 focus:ring-blue-500"
      />
    );
  }

  return (
    <div className="flex items-start gap-1.5 flex-1 min-w-[200px]">
      <span
        className={`flex-1 font-bold text-xs uppercase whitespace-normal break-words leading-snug text-slate-800 dark:text-slate-100 ${className || ''}`}
      >
        {valor}
      </span>
      <button
        type="button"
        onClick={() => {
          setRascunho(valor);
          setEditando(true);
        }}
        className="shrink-0 p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
        title="Editar nome"
      >
        <PenLine className="w-3 h-3" />
      </button>
    </div>
  );
};

/** Histórico dos registros de estudo. Observações e detalhes podem ser editados. */
const temDetalhe = (s: SessaoEstudo): boolean =>
  !!(
    s.paginaInicial ||
    s.paginaFinal ||
    s.material ||
    s.videoTitulo ||
    s.videoInicio ||
    s.videoFim ||
    s.observacoes
  );

const HistoricoSessoes: React.FC<{
  sessoes: SessaoEstudo[];
  onEditar: (id: string, patch: Partial<SessaoEstudo>) => void;
  onExcluir: (id: string) => void;
}> = ({ sessoes: sessoesRaw, onEditar, onExcluir }) => {
  // Só aparecem registros que têm pelo menos um detalhe (páginas, material, vídeo ou observações)
  const sessoes = sessoesRaw.filter((x) => temDetalhe(x) && !x.oculto);
  const [aberto, setAberto] = useState<boolean>(true);
  const [limite, setLimite] = useState<number>(20);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [confirmObsId, setConfirmObsId] = useState<string | null>(null);
  const [confirmDelId, setConfirmDelId] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState({
    ac: '',
    er: '',
    obs: '',
    material: '',
    vt: '',
    vi: '',
    vf: '',
    pi: '',
    pf: '',
  });

  const fmtData = (d: string) => {
    const [y, m, dia] = (d || '').split('-');
    return y && m && dia ? `${dia}/${m}/${y}` : d;
  };
  const fmtTempo = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
  };

  const iniciarEdicao = (s: SessaoEstudo) => {
    setRascunho({
      ac: String(s.acertos || 0),
      er: String(s.erros || 0),
      obs: s.observacoes || '',
      material: s.material || '',
      vt: s.videoTitulo || '',
      vi: s.videoInicio || '',
      vf: s.videoFim || '',
      pi: s.paginaInicial ? String(s.paginaInicial) : '',
      pf: s.paginaFinal ? String(s.paginaFinal) : '',
    });
    setEditandoId(s.id);
  };

  const salvarEdicao = () => {
    if (!editandoId) return;
    onEditar(editandoId, {
      acertos: Math.max(0, parseInt(rascunho.ac, 10) || 0),
      erros: Math.max(0, parseInt(rascunho.er, 10) || 0),
      observacoes: rascunho.obs.trim(),
      material: rascunho.material.trim(),
      videoTitulo: rascunho.vt.trim(),
      videoInicio: rascunho.vi.trim(),
      videoFim: rascunho.vf.trim(),
      paginaInicial: Math.max(0, parseInt(rascunho.pi, 10) || 0),
      paginaFinal: Math.max(0, parseInt(rascunho.pf, 10) || 0),
    });
    setEditandoId(null);
  };

  const campo =
    'w-full px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-blue-500';
  const rotulo = 'text-[10px] font-bold uppercase tracking-wider text-slate-500';

  return (
    <div className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
          Observações ({sessoes.length})
        </h3>
        <button
          type="button"
          onClick={() => setAberto(!aberto)}
          className="text-xs font-bold text-blue-600 dark:text-blue-400 cursor-pointer"
        >
          {aberto ? 'Recolher' : 'Mostrar'}
        </button>
      </div>

      {aberto &&
        (sessoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum registro ainda. Os registros feitos pelo cronômetro aparecem aqui, com observações e detalhes.
          </p>
        ) : (
          <div className="space-y-3">
            {sessoes.slice(0, limite).map((s) => {
              const totalQ = s.acertos + s.erros;
              const local = [s.topico, s.subtopico].filter(Boolean).join(' › ');
              const video = [
                s.videoTitulo,
                s.videoInicio && s.videoFim ? `${s.videoInicio} – ${s.videoFim}` : s.videoInicio || s.videoFim,
              ]
                .filter(Boolean)
                .join(' · ');
              const paginas =
                s.paginaInicial || s.paginaFinal
                  ? `pág. ${s.paginaInicial || '?'} a ${s.paginaFinal || '?'}`
                  : '';
              const editando = editandoId === s.id;

              return (
                <div
                  key={s.id}
                  className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="font-black text-slate-800 dark:text-slate-100">{fmtData(s.date)}</span>
                    {s.seconds > 0 && (
                      <span className="font-mono font-bold text-slate-600 dark:text-slate-300">{fmtTempo(s.seconds)}</span>
                    )}
                    {totalQ > 0 && (
                      <span className="font-bold">
                        <span className="text-emerald-600 dark:text-emerald-400">✓ {s.acertos}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-rose-600 dark:text-rose-400">✗ {s.erros}</span>
                      </span>
                    )}
                    {s.categoria && <span className="text-slate-500">{s.categoria}</span>}
                    {!editando && confirmDelId !== s.id && (
                      <div className="ml-auto flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => iniciarEdicao(s)}
                          title="Editar registro"
                          className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          <PenLine className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelId(s.id)}
                          title="Ocultar esta observação"
                          className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    {confirmDelId === s.id && (
                      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                          Ocultar esta observação da lista? Os totais não mudam.
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onExcluir(s.id);
                            setConfirmDelId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                        >
                          Apagar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelId(null)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {local && <div className="text-xs font-semibold text-blue-700 dark:text-blue-300">{local}</div>}

                  {editando ? (
                    <div className="space-y-3 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className={rotulo}>Acertos</div>
                          <input
                            type="number"
                            min={0}
                            value={rascunho.ac}
                            onChange={(e) => setRascunho({ ...rascunho, ac: e.target.value })}
                            className={campo}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className={rotulo}>Erros</div>
                          <input
                            type="number"
                            min={0}
                            value={rascunho.er}
                            onChange={(e) => setRascunho({ ...rascunho, er: e.target.value })}
                            className={campo}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <div className={rotulo}>Observações</div>
                        <textarea
                          rows={3}
                          value={rascunho.obs}
                          onChange={(e) => setRascunho({ ...rascunho, obs: e.target.value })}
                          className={campo}
                        />
                        {rascunho.obs && (
                          <button
                            type="button"
                            onClick={() => setRascunho({ ...rascunho, obs: '' })}
                            className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                          >
                            Apagar texto das observações
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        <div className={rotulo}>Material / aula</div>
                        <input
                          type="text"
                          value={rascunho.material}
                          onChange={(e) => setRascunho({ ...rascunho, material: e.target.value })}
                          className={campo}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1 col-span-3 sm:col-span-1">
                          <div className={rotulo}>Videoaula</div>
                          <input
                            type="text"
                            value={rascunho.vt}
                            onChange={(e) => setRascunho({ ...rascunho, vt: e.target.value })}
                            className={campo}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className={rotulo}>Início</div>
                          <input
                            type="text"
                            value={rascunho.vi}
                            onChange={(e) => setRascunho({ ...rascunho, vi: e.target.value })}
                            className={campo}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className={rotulo}>Fim</div>
                          <input
                            type="text"
                            value={rascunho.vf}
                            onChange={(e) => setRascunho({ ...rascunho, vf: e.target.value })}
                            className={campo}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <div className={rotulo}>Página inicial</div>
                          <input
                            type="number"
                            min={0}
                            value={rascunho.pi}
                            onChange={(e) => setRascunho({ ...rascunho, pi: e.target.value })}
                            className={campo}
                          />
                        </div>
                        <div className="space-y-1">
                          <div className={rotulo}>Página final</div>
                          <input
                            type="number"
                            min={0}
                            value={rascunho.pf}
                            onChange={(e) => setRascunho({ ...rascunho, pf: e.target.value })}
                            className={campo}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditandoId(null)}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={salvarEdicao}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {s.material && (
                        <div className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-bold">Material / aula:</span> {s.material}
                        </div>
                      )}
                      {video && (
                        <div className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-bold">Videoaula:</span> {video}
                        </div>
                      )}
                      {paginas && (
                        <div className="text-xs text-slate-700 dark:text-slate-300">
                          <span className="font-bold">Páginas:</span> {paginas}
                        </div>
                      )}
                      {s.observacoes && (
                        <div className="relative text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-white/70 dark:bg-slate-800/70 rounded-xl p-2.5 pr-9 border border-slate-200/70 dark:border-slate-700/70">
                          <span className="font-bold">Observações:</span> {s.observacoes}
                          {confirmObsId === s.id ? (
                            <div className="mt-2 flex items-center justify-end gap-2">
                              <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                Apagar as observações?
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  onEditar(s.id, { observacoes: '' });
                                  setConfirmObsId(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                              >
                                Apagar
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmObsId(null)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                              >
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmObsId(s.id)}
                              title="Apagar observações"
                              className="absolute top-2 right-2 p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
            {sessoes.length > limite && (
              <button
                type="button"
                onClick={() => setLimite((l) => l + 20)}
                className="w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 cursor-pointer"
              >
                Mostrar mais
              </button>
            )}
          </div>
        ))}
    </div>
  );
};

export const DisciplinesView: React.FC<DisciplinesViewProps> = ({
  discState,
  onUpdateDiscState,
  activeRun,
  onStartSession,
  onPauseSession,
  onCancelSession,
  onOpenRegisterModal,
  onAbrirPdf,
  onToast,
  currentElapsedSeconds,
}) => {
  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];
  const activeDisc = disciplines.find((d) => d.id === discState.sel) || disciplines[0];
  const today = todayStr();
  const intervals = [...(discState.intv || [7, 15, 30, 60])].sort((a, b) => a - b);

  const [viewMode, setViewMode] = useState<'grid' | 'det'>('grid');
  const [calState, setCalState] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth(), sel: todayStr(now) };
  });
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [addingSubToId, setAddingSubToId] = useState<string | null>(null);
  const [subTopicName, setSubTopicName] = useState('');
  const [manualMinInput, setManualMinInput] = useState('');
  const [expandedTopicRevId, setExpandedTopicRevId] = useState<string | null>(null);
  const [customRevDate, setCustomRevDate] = useState('');
  const [newDiscName, setNewDiscName] = useState('');

  // Modais de Edital
  const [newEditalModal, setNewEditalModal] = useState(false);
  const [newEditalName, setNewEditalName] = useState('');
  const [newEditalDates, setNewEditalDates] = useState<EditalDatas>({});
  const [newEditalError, setNewEditalError] = useState<string | null>(null);

  const [editDatesModal, setEditDatesModal] = useState(false);
  const [editDatesVal, setEditDatesVal] = useState<EditalDatas>({});
  const [editDatesError, setEditDatesError] = useState<string | null>(null);

  // Expansão de nomes longos, filtros e vínculo direto de PDF
  const [expandedNames, setExpandedNames] = useState<Record<string, boolean>>({});
  const [expandAllNames, setExpandAllNames] = useState(false);
  const [topicSearch, setTopicSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState<'all' | 'pending' | 'done' | 'pdf'>('all');
  const [materials, setMaterials] = useState<MaterialMeta[]>([]);
  const [pdfLinkTarget, setPdfLinkTarget] = useState<{
    topicId: string;
    subId?: string;
    label: string;
    pdfId: string;
    page: string;
  } | null>(null);
  const [pdfPickerSearch, setPdfPickerSearch] = useState('');
  const [uploadingPdfInModal, setUploadingPdfInModal] = useState(false);
  const modalPdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listMaterials()
      .then(setMaterials)
      .catch(() => {});
  }, [viewMode]);

  const isRunning = !!activeRun?.start;
  const isCurrentActive = activeRun?.id === activeDisc?.id;
  const displaySec = isCurrentActive ? currentElapsedSeconds : 0;

  const computeDiscMetrics = (d: Discipline) => {
    let studiedCount = 0;
    let hits = 0;
    let errors = 0;
    let totalTopics = 0;
    d.topics.forEach((t) => {
      totalTopics++;
      if (t.studied) studiedCount++;
      hits += t.h || 0;
      errors += t.e || 0;
      (t.subs || []).forEach((s) => {
        totalTopics++;
        if (s.studied || s.done) studiedCount++;
        hits += s.h || 0;
        errors += s.e || 0;
      });
    });
    hits += d.qh || 0;
    errors += d.qe || 0;

    let totalSec = 0;
    let weekSec = 0;
    let todaySec = 0;
    const weekAgo = addDays(today, -7);
    Object.entries(d.log || {}).forEach(([day, sec]) => {
      totalSec += sec;
      if (day === today) todaySec += sec;
      if (day > weekAgo) weekSec += sec;
    });
    if (activeRun?.id === d.id) {
      totalSec += displaySec;
      todaySec += displaySec;
      weekSec += displaySec;
    }

    return {
      studiedCount,
      totalTopics,
      hits,
      errors,
      totalQuestions: hits + errors,
      totalSec,
      todaySec,
      weekSec,
    };
  };

  const activeMetrics = activeDisc ? computeDiscMetrics(activeDisc) : null;

  // Edita um registro do histórico e corrige tópico, subtópico, disciplina e o total do dia
  const editarSessao = (id: string, patch: Partial<SessaoEstudo>) => {
    if (!activeDisc) return;
    onUpdateDiscState((prev) => aplicarEdicaoSessao(prev, activeDisc.id, id, patch));
  };

  const updateCurrentTopics = (updater: (topics: Topic[]) => Topic[]) => {
    if (!activeDisc) return;
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              list: ed.list.map((d) =>
                d.id === activeDisc.id ? { ...d, topics: updater(d.topics) } : d
              ),
            }
          : ed
      ),
    }));
  };

  const addDiscipline = (name: string) => {
    const clean = titleCase(name);
    if (!clean) return;
    const newDisc: Discipline = { id: uid(), name: clean, topics: [], log: {} };
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel ? { ...ed, list: [...ed.list, newDisc] } : ed
      ),
      sel: newDisc.id,
    }));
    setViewMode('det');
    onToast(`Disciplina "${clean}" adicionada ao ${activeEdital.name}.`);
  };

  const renameDiscipline = (newName: string) => {
    if (!activeDisc) return;
    const clean = titleCase(newName);
    if (!clean || clean === activeDisc.name) return;
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              list: ed.list.map((d) => (d.id === activeDisc.id ? { ...d, name: clean } : d)),
            }
          : ed
      ),
    }));
  };

  const deleteDiscipline = () => {
    if (!activeDisc) return;
    if (disciplines.length <= 1) {
      onToast('Você precisa ter pelo menos uma disciplina.');
      return;
    }
    if (!window.confirm(`Excluir a disciplina "${activeDisc.name}"?`)) return;
    onUpdateDiscState((prev) => {
      const remaining = disciplines.filter((d) => d.id !== activeDisc.id);
      return {
        ...prev,
        eds: prev.eds.map((ed) =>
          ed.id === prev.edsel ? { ...ed, list: remaining } : ed
        ),
        sel: remaining[0]?.id || '',
      };
    });
    setViewMode('grid');
    onToast('Disciplina excluída.');
  };

  const handleCreateEdital = () => {
    const err = validateEditalDates(newEditalDates);
    if (err) {
      setNewEditalError(err);
      return;
    }
    const clean = titleCase(newEditalName.trim());
    if (!clean) {
      setNewEditalError('Informe o nome do edital.');
      return;
    }
    const dId = uid();
    const cId = uid();
    const newEd = {
      id: uid(),
      name: clean,
      datas: cleanEditalDates(newEditalDates),
      list: [{ id: dId, name: 'Disciplina 1', topics: [], log: {} }],
      cycles: [{ id: cId, name: 'Ciclo 1', items: [], base: {}, n: 0 }],
      csel: cId,
    };
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: [...prev.eds, newEd],
      edsel: newEd.id,
      sel: dId,
    }));
    setNewEditalName('');
    setNewEditalDates({});
    setNewEditalError(null);
    setNewEditalModal(false);
    onToast(`Edital "${clean}" cadastrado.`);
  };

  const handleSaveDates = () => {
    const err = validateEditalDates(editDatesVal);
    if (err) {
      setEditDatesError(err);
      return;
    }
    const cleaned = cleanEditalDates(editDatesVal);
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) => (ed.id === prev.edsel ? { ...ed, datas: cleaned } : ed)),
    }));
    setEditDatesModal(false);
    setEditDatesError(null);
    onToast('Datas do edital salvas.');
  };

  const handleRenameEdital = () => {
    const next = window.prompt('Novo nome para o edital:', activeEdital?.name || '');
    if (next === null) return;
    const clean = titleCase(next.trim());
    if (!clean) {
      onToast('O nome do edital não pode ficar vazio.');
      return;
    }
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) => (ed.id === prev.edsel ? { ...ed, name: clean } : ed)),
    }));
    onToast(`Edital renomeado para "${clean}".`);
  };

  const handleDeleteEdital = () => {
    if (discState.eds.length <= 1) {
      onToast('Você precisa ter pelo menos um edital.');
      return;
    }
    if (
      !window.confirm(
        `Apagar o edital "${activeEdital?.name}"? As disciplinas, tópicos e horas dele também serão apagados.`
      )
    ) {
      return;
    }
    onUpdateDiscState((prev) => {
      const remaining = prev.eds.filter((ed) => ed.id !== prev.edsel);
      const first = remaining[0];
      return {
        ...prev,
        eds: remaining,
        edsel: first.id,
        sel: first.list[0]?.id || '',
      };
    });
    onToast('Edital apagado.');
  };

  const handleManualMin = () => {
    if (!activeDisc) return;
    const mins = parseInt(manualMinInput, 10);
    if (!mins) return;
    onUpdateDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.id === prev.edsel
          ? {
              ...ed,
              list: ed.list.map((d) => {
                if (d.id !== activeDisc.id) return d;
                const log = { ...(d.log || {}) };
                log[today] = Math.max(0, (log[today] || 0) + mins * 60);
                return { ...d, log };
              }),
            }
          : ed
      ),
    }));
    setManualMinInput('');
    onToast(mins > 0 ? `+${mins} min adicionados.` : `${mins} min ajustados.`);
  };

  const addTopic = (rawName: string) => {
    const clean = rawName.trim().toUpperCase();
    if (!clean) return;
    const topic: Topic = { id: uid(), name: clean, studied: null, q: false, r: {}, h: 0, e: 0 };
    updateCurrentTopics((topics) => [...topics, topic]);
  };

  const toggleTopicStudied = (topic: Topic) => {
    const nextStudied = topic.studied ? null : today;
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topic.id
          ? syncSubtopicsWithTopic({ ...t, studied: nextStudied, r: {} }, nextStudied)
          : t
      )
    );
  };

  const moveTopicOrder = (from: number, to: number) => {
    updateCurrentTopics((topics) => {
      if (to < 0 || to >= topics.length) return topics;
      const copy = [...topics];
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return copy;
    });
  };

  const updateSubTopic = (topicId: string, subId: string, patch: Partial<SubTopic>) => {
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? syncTopicFromSubtopics({
              ...t,
              subs: (t.subs || []).map((s) => (s.id === subId ? { ...s, ...patch } : s)),
            })
          : t
      )
    );
  };

  const addSubTopic = (topicId: string, rawName: string) => {
    const clean = rawName.trim().toUpperCase();
    if (!clean) return;
    const sub: SubTopic = {
      id: uid(),
      name: clean,
      studied: null,
      done: false,
      h: 0,
      e: 0,
      tp: {},
      r: {},
    };
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId ? syncTopicFromSubtopics({ ...t, subs: [...(t.subs || []), sub] }) : t
      )
    );
    setSubTopicName('');
    setAddingSubToId(null);
  };

  const handleBulkPaste = () => {
    const lista = parseColagem(bulkText);
    if (!lista.length) {
      onToast('A lista está vazia. Nada foi alterado.');
      return;
    }
    const existentes = activeDisc?.topics || [];
    const novos = reconciliarTopicos(existentes, lista);
    const mantidos = novos.filter((n) => existentes.some((e) => e.id === n.id)).length;
    const removidos = existentes.length - mantidos;
    updateCurrentTopics(() => novos);
    onToast(
      `Lista salva: ${novos.length} tópicos${removidos ? `, ${removidos} removidos` : ''}.`
    );
    setBulkText('');
    setShowBulkPaste(false);
  };

  const addInterval = (days: number) => {
    if (!days || days < 1 || intervals.includes(days)) return;
    onUpdateDiscState((prev) => ({
      ...prev,
      intv: [...intervals, days].sort((a, b) => a - b),
    }));
  };

  const removeInterval = (days: number) => {
    if (intervals.length <= 1) {
      onToast('Mantenha pelo menos 1 intervalo.');
      return;
    }
    onUpdateDiscState((prev) => ({
      ...prev,
      intv: intervals.filter((d) => d !== days),
    }));
  };

  const setRecurringInterval = (days: number) => {
    onUpdateDiscState((prev) => ({
      ...prev,
      recurringEnabled: true,
      defaultRecurringDays: days,
    }));
    onToast(`Revisão contínua configurada para cada ${days} dias.`);
  };

  const completeRecurring = (topicId: string) => {
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId ? { ...t, recurringDates: [...(t.recurringDates || []), today] } : t
      )
    );
    onToast('Revisão periódica registrada!');
  };

  const addCustomReview = (topicId: string) => {
    if (!customRevDate) return;
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              customReviews: [...(t.customReviews || []), { id: uid(), date: customRevDate, done: false }],
            }
          : t
      )
    );
    setCustomRevDate('');
  };

  const toggleCustomReview = (topicId: string, customId: string, done: boolean) => {
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              customReviews: (t.customReviews || []).map((r) =>
                r.id === customId ? { ...r, done } : r
              ),
            }
          : t
      )
    );
  };

  const deleteCustomReview = (topicId: string, customId: string) => {
    updateCurrentTopics((topics) =>
      topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              customReviews: (t.customReviews || []).filter((r) => r.id !== customId),
            }
          : t
      )
    );
  };

  // Resumo geral do edital
  let edTotalSec = 0;
  let edHits = 0;
  let edErrors = 0;
  let edTopicsTotal = 0;
  let edTopicsStudied = 0;
  disciplines.forEach((d) => {
    const m = computeDiscMetrics(d);
    edTotalSec += m.totalSec;
    edHits += m.hits;
    edErrors += m.errors;
    edTopicsTotal += m.totalTopics;
    edTopicsStudied += m.studiedCount;
  });
  const edQuestions = edHits + edErrors;
  const edPerf = edQuestions > 0 ? Math.round((edHits / edQuestions) * 100) : 0;
  const edProgress = edTopicsTotal > 0 ? Math.round((edTopicsStudied / edTopicsTotal) * 100) : 0;

  // Mapa de revisões da disciplina atual (para o card lateral + mini calendário)
  type MiniReview = {
    item: Topic | SubTopic;
    interval: number | string;
    dueDate: string;
    isDone: boolean;
    isLate: boolean;
    customId?: string;
  };
  const reviewsByDate: Record<string, MiniReview[]> = {};
  const pendingTodayReviews: MiniReview[] = [];

  if (activeDisc) {
    activeDisc.topics.forEach((topic) => {
      if (topic.studied) {
        intervals.forEach((days) => {
          const due = addDays(topic.studied!, days);
          const done = !!(topic.r && topic.r[days]);
          const entry: MiniReview = {
            item: topic,
            interval: days,
            dueDate: due,
            isDone: done,
            isLate: !done && due < today,
          };
          reviewsByDate[due] = [...(reviewsByDate[due] || []), entry];
          if (!done && due <= today) pendingTodayReviews.push(entry);
        });
      }
      (topic.customReviews || []).forEach((cr) => {
        const entry: MiniReview = {
          item: topic,
          interval: 'extra',
          dueDate: cr.date,
          isDone: !!cr.done,
          isLate: !cr.done && cr.date < today,
          customId: cr.id,
        };
        reviewsByDate[cr.date] = [...(reviewsByDate[cr.date] || []), entry];
        if (!cr.done && cr.date <= today) pendingTodayReviews.push(entry);
      });
    });
  }

  const expandedTopic = activeDisc?.topics.find((t) => t.id === expandedTopicRevId) || null;

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Barra lateral de editais e disciplinas */}
      <aside className="w-full lg:w-64 shrink-0 space-y-4">
        <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Edital
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setEditDatesVal({ ...(activeEdital?.datas || {}) });
                  setEditDatesError(null);
                  setEditDatesModal(true);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title="Datas do edital"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleRenameEdital}
                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title="Renomear edital"
              >
                <Pen className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setNewEditalError(null);
                  setNewEditalModal(true);
                }}
                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                title="Novo edital"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              {discState.eds.length > 1 && (
                <button
                  type="button"
                  onClick={handleDeleteEdital}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer"
                  title="Excluir edital"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <select
            value={discState.edsel}
            onChange={(e) => {
              const id = e.target.value;
              onUpdateDiscState((prev) => {
                const target = prev.eds.find((ed) => ed.id === id) || prev.eds[0];
                return { ...prev, edsel: id, sel: target.list[0]?.id || '' };
              });
            }}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none cursor-pointer"
          >
            {discState.eds.map((ed) => (
              <option key={ed.id} value={ed.id}>
                {ed.name}
              </option>
            ))}
          </select>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-700/60 space-y-1.5">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              Visão Geral do Edital
            </button>

            <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
              {disciplines.map((d) => {
                const isSel = viewMode === 'det' && d.id === activeDisc?.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      onUpdateDiscState((prev) => ({ ...prev, sel: d.id }));
                      setViewMode('det');
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold truncate transition cursor-pointer ${
                      isSel
                        ? 'bg-emerald-600 text-white shadow-xs font-bold'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60'
                    }`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                addDiscipline(newDiscName);
                setNewDiscName('');
              }}
              className="pt-2 flex lg:flex-col gap-2"
            >
              <input
                type="text"
                placeholder="+ Nova disciplina"
                value={newDiscName}
                onChange={(e) => setNewDiscName(e.target.value)}
                className="px-3 py-2 rounded-xl w-full text-xs border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap"
              >
                Adicionar
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Área principal */}
      <div className="flex-1 min-w-0 space-y-6 w-full">
        {viewMode === 'grid' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                    {formatHoursMin(edTotalSec)}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                    Horas de Estudo ({activeEdital?.name})
                  </div>
                </div>
                <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tabular-nums">
                    {edQuestions}
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                    Questões Resolvidas
                  </div>
                </div>
                <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    {edPerf}%
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1">
                    Desempenho Geral
                  </div>
                </div>
                <div className="p-4 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm text-center">
                  <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 tabular-nums">
                    {edProgress}%
                  </div>
                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                    {edTopicsStudied} de {edTopicsTotal} tópicos
                  </div>
                </div>
              </div>

              <div className="h-3 w-full bg-slate-200/70 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-300"
                  style={{ width: `${edProgress}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {disciplines.map((d) => {
                const m = computeDiscMetrics(d);
                return (
                  <div
                    key={d.id}
                    onClick={() => {
                      onUpdateDiscState((prev) => ({ ...prev, sel: d.id }));
                      setViewMode('det');
                    }}
                    className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer flex flex-col justify-between"
                  >
                    <h3 className="font-extrabold text-base uppercase text-slate-800 dark:text-slate-100 tracking-tight line-clamp-1 mb-4">
                      {d.name}
                    </h3>
                    <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100 dark:border-slate-800 tabular-nums">
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">
                          {m.studiedCount}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Estudados
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">
                          {m.totalTopics}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Totais
                        </div>
                      </div>
                      <div>
                        <div className="text-lg font-bold text-slate-900 dark:text-white">
                          {m.totalQuestions}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">
                          Questões
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {viewMode === 'det' && activeDisc && activeMetrics && (
          <div className="space-y-6">
            {/* Cabeçalho da disciplina */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
              <div className="flex items-center gap-3">
                <input
                  key={activeDisc.id}
                  type="text"
                  defaultValue={activeDisc.name}
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (val && val !== activeDisc.name) renameDiscipline(val);
                    else e.target.value = activeDisc.name;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                  className="text-2xl sm:text-3xl font-black uppercase text-slate-900 dark:text-white tracking-tight bg-transparent outline-none focus:bg-white dark:focus:bg-slate-800 px-2 py-1 rounded-xl"
                />
                <button
                  type="button"
                  onClick={deleteDiscipline}
                  className="p-2 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 transition cursor-pointer"
                  title="Excluir disciplina"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Cronômetro da disciplina */}
            <div className="p-4 sm:p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>Sessão de Estudo · {activeDisc.name}</span>
                </div>
                <div className="font-mono text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight tabular-nums">
                  {isCurrentActive ? formatHMS(displaySec) : '00:00:00'}
                </div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  Hoje: {formatHoursMin(activeMetrics.todaySec)} · Últimos 7 dias:{' '}
                  {formatHoursMin(activeMetrics.weekSec)} · Total:{' '}
                  {formatHoursMin(activeMetrics.totalSec)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isCurrentActive && isRunning) onPauseSession();
                    else onStartSession(activeDisc.id);
                  }}
                  className={`px-4 py-2.5 rounded-2xl text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 shadow-sm transition cursor-pointer whitespace-nowrap ${
                    isCurrentActive && isRunning
                      ? 'bg-amber-500 hover:bg-amber-600 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {isCurrentActive && isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pausar</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Continuar</span>
                    </>
                  )}
                </button>

                {isCurrentActive && (
                  <>
                    <button
                      type="button"
                      onClick={onOpenRegisterModal}
                      className="px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider shadow-sm transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Check className="w-4 h-4" />
                      <span>Salvar</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Deseja cancelar esta sessão?')) onCancelSession();
                      }}
                      className="px-3 py-2.5 rounded-2xl border border-rose-200 dark:border-rose-900 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 text-xs font-bold transition cursor-pointer whitespace-nowrap"
                    >
                      Cancelar
                    </button>
                  </>
                )}

                <input
                  type="number"
                  placeholder="± min"
                  value={manualMinInput}
                  onChange={(e) => setManualMinInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleManualMin();
                  }}
                  className="w-20 px-2.5 py-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-bold text-center outline-none"
                  title="Ajuste manual: digite minutos (ex: 30 ou -15) e tecle Enter"
                />
              </div>
            </div>

            {/* Edital Verticalizado */}
            <div className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                  Edital Verticalizado · {activeMetrics.studiedCount} de {activeMetrics.totalTopics} itens concluídos (
                  {activeMetrics.totalTopics > 0
                    ? Math.round((activeMetrics.studiedCount / activeMetrics.totalTopics) * 100)
                    : 0}
                  %)
                </h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!showBulkPaste) setBulkText(serializarTopicos(activeDisc?.topics || []));
                      setShowBulkPaste(!showBulkPaste);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 text-xs font-bold transition hover:bg-blue-100 cursor-pointer flex items-center gap-1.5 w-fit whitespace-nowrap"
                  >
                    <ListPlus className="w-3.5 h-3.5" />
                    <span>Colar vários tópicos</span>
                  </button>
                </div>
              </div>

              {/* Busca e filtros do Edital Verticalizado */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={topicSearch}
                    onChange={(e) => setTopicSearch(e.target.value)}
                    placeholder="Buscar tópico ou assunto..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      ['all', 'Todos'],
                      ['pending', 'Pendentes'],
                      ['done', 'Concluídos'],
                      ['pdf', 'Com PDF'],
                    ] as const
                  ).map(([val, lbl]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTopicFilter(val)}
                      className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                        topicFilter === val
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {showBulkPaste && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
                  <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                    Cole sua lista de tópicos (um por linha):
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Dica: Linhas que terminam com &ldquo;:&rdquo; ou começam com &ldquo;#&rdquo; criam grupos. Prefixos como &ldquo;1.&rdquo;, &ldquo;1.1&rdquo;, &ldquo;-&rdquo;, &ldquo;•&rdquo; são removidos automaticamente.
                  </p>
                  <textarea
                    rows={6}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={`# DIREITO ADMINISTRATIVO\n1. Atos administrativos\n2. Poderes administrativos\n# LICITAÇÕES:\n1. Modalidades de licitação`}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowBulkPaste(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 hover:bg-slate-100 cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkPaste}
                      className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                    >
                      Adicionar à Tabela
                    </button>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto -mx-2 px-2">
                <table className="w-full text-xs text-left border-collapse min-w-[920px] tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 uppercase font-semibold">
                      <th className="py-2.5 px-1.5 text-center w-8">✔</th>
                      <th className="py-2.5 px-2 min-w-[270px]">Tópico / Assunto</th>
                      <th className="py-2.5 px-1.5 text-center">Tipo</th>
                      <th className="py-2.5 px-1.5 text-center text-blue-600 dark:text-blue-400 font-bold">
                        Vídeo
                      </th>
                      <th className="py-2.5 px-1.5 text-center">P. Ini</th>
                      <th className="py-2.5 px-1.5 text-center">P. Fim</th>
                      <th className="py-2.5 px-1.5 text-center">Págs</th>
                      <th className="py-2.5 px-1.5 text-center text-emerald-600">✓</th>
                      <th className="py-2.5 px-1.5 text-center text-rose-600">✗</th>
                      <th className="py-2.5 px-1.5 text-center">Total</th>
                      <th className="py-2.5 px-1.5 text-center">%</th>
                      <th className="py-2.5 px-2 text-center min-w-[165px]">PDF / Material</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {activeDisc.topics
                      .map((topic, idx) => ({ topic, idx }))
                      .filter(({ topic }) => {
                        const q = topicSearch.trim().toLowerCase();
                        if (q) {
                          const matchTopic = topic.name.toLowerCase().includes(q);
                          const matchSub = (topic.subs || []).some((s) =>
                            s.name.toLowerCase().includes(q)
                          );
                          if (!matchTopic && !matchSub) return false;
                        }
                        if (topicFilter === 'pending') return !topic.studied;
                        if (topicFilter === 'done') return !!topic.studied;
                        if (topicFilter === 'pdf') {
                          return (
                            !!topic.pdfId || (topic.subs || []).some((s) => !!s.pdfId)
                          );
                        }
                        return true;
                      })
                      .map(({ topic, idx }) => {
                        // Tópico = questões dele + questões de todos os subtópicos
                        const hitsSubs = (topic.subs || []).reduce((a, sb) => a + (sb.h || 0), 0);
                        const errSubs = (topic.subs || []).reduce((a, sb) => a + (sb.e || 0), 0);
                        const hitsTopico = (topic.h || 0) + hitsSubs;
                        const errosTopico = (topic.e || 0) + errSubs;
                        const totalQ = hitsTopico + errosTopico;
                        const pct = totalQ > 0 ? Math.round((hitsTopico / totalQ) * 100) : 0;
                        const pages = countPages(topic);
                        const pctCls =
                          totalQ === 0
                            ? 'text-slate-400'
                            : pct >= 80
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : pct >= 60
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-rose-600 dark:text-rose-400';
                        const isTopicExpanded = true;
                        const linkedMat = topic.pdfId
                          ? materials.find((m) => m.id === topic.pdfId)
                          : undefined;

                        return (
                          <React.Fragment key={topic.id}>
                            <tr className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition">
                              <td className="py-2.5 px-1.5 text-center align-top pt-3">
                                <input
                                  type="checkbox"
                                  checked={!!topic.studied}
                                  onChange={() => toggleTopicStudied(topic)}
                                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                />
                              </td>
                              <td className="py-2.5 px-2 align-top">
                                <div className="flex items-start gap-1.5">
                                  <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 pt-0.5 shrink-0">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => moveTopicOrder(idx, idx - 1)}
                                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer"
                                      title="Mover para cima"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === activeDisc.topics.length - 1}
                                      onClick={() => moveTopicOrder(idx, idx + 1)}
                                      className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-20 cursor-pointer"
                                      title="Mover para baixo"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  <NomeEditavel
                                    valor={topic.name}
                                    onSalvar={(val) =>
                                      updateCurrentTopics((ts) =>
                                        ts.map((t) => (t.id === topic.id ? { ...t, name: val } : t))
                                      )
                                    }
                                  />

                                  <div className="flex items-center gap-0.5 shrink-0 pt-0.5">
                                    {(topic.subs || []).length > 0 && (
                                      <span className="text-[10px] text-slate-400 font-bold mr-0.5">
                                        {topic.subs!.filter((s) => s.studied || s.done).length}/
                                        {topic.subs!.length}
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAddingSubToId(
                                          addingSubToId === topic.id ? null : topic.id
                                        )
                                      }
                                      className="p-1 text-slate-400 hover:text-blue-500 rounded cursor-pointer"
                                      title="Adicionar subtópico"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (window.confirm(`Excluir tópico "${topic.name}"?`)) {
                                          updateCurrentTopics((ts) =>
                                            ts.filter((t) => t.id !== topic.id)
                                          );
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                                      title="Excluir tópico"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <div className="flex items-center justify-center gap-0.5">
                                  {(
                                    [
                                      ['v', 'V', 'Videoaula'],
                                      ['p', 'P', 'PDF'],
                                      ['q', 'Q', 'Questões'],
                                    ] as const
                                  ).map(([k, abbr, label]) => {
                                    const on = !!(topic.tp && topic.tp[k]);
                                    return (
                                      <button
                                        key={k}
                                        type="button"
                                        onClick={() =>
                                          updateCurrentTopics((ts) =>
                                            ts.map((t) =>
                                              t.id === topic.id
                                                ? { ...t, tp: { ...(t.tp || {}), [k]: !on } }
                                                : t
                                            )
                                          )
                                        }
                                        title={`${label} (${on ? 'marcado' : 'desmarcado'})`}
                                        className={`w-6 h-6 rounded text-[10px] font-bold transition cursor-pointer ${
                                          on
                                            ? 'bg-blue-600 text-white'
                                            : 'opacity-45 hover:opacity-100 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                        }`}
                                      >
                                        {abbr}
                                      </button>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <input
                                  type="text"
                                  defaultValue={topic.videoTime || ''}
                                  placeholder="00:00"
                                  onBlur={(e) => {
                                    const v = e.target.value.trim();
                                    updateCurrentTopics((ts) =>
                                      ts.map((t) => (t.id === topic.id ? { ...t, videoTime: v } : t))
                                    );
                                  }}
                                  className="w-14 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <input
                                  key={`${topic.id}-pi-${topic.pi || 0}`}
                                  type="number"
                                  min={0}
                                  defaultValue={topic.pi || ''}
                                  placeholder="–"
                                  onBlur={(e) => {
                                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    updateCurrentTopics((ts) =>
                                      ts.map((t) => (t.id === topic.id ? { ...t, pi: v } : t))
                                    );
                                  }}
                                  className="w-11 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs"
                                />
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <input
                                  key={`${topic.id}-pf-${topic.pf || 0}`}
                                  type="number"
                                  min={0}
                                  defaultValue={topic.pf || ''}
                                  placeholder="–"
                                  onBlur={(e) => {
                                    const v = Math.max(0, parseInt(e.target.value, 10) || 0);
                                    updateCurrentTopics((ts) =>
                                      ts.map((t) => (t.id === topic.id ? { ...t, pf: v } : t))
                                    );
                                  }}
                                  className="w-11 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs"
                                />
                              </td>
                              <td className="py-2.5 px-1.5 text-center font-mono font-medium text-slate-500">
                                {pages > 0 ? pages : '–'}
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <span className="inline-block w-11 py-0.5 text-center font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                  {hitsTopico}
                                </span>
                              </td>
                              <td className="py-2.5 px-1.5 text-center">
                                <span className="inline-block w-11 py-0.5 text-center font-bold text-rose-600 dark:text-rose-400 text-xs">
                                  {errosTopico}
                                </span>
                              </td>
                              <td className="py-2.5 px-1.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                                {totalQ}
                              </td>
                              <td className={`py-2.5 px-1.5 text-center font-bold ${pctCls}`}>
                                {totalQ === 0 ? '–' : `${pct}%`}
                              </td>
                                                            <td className="py-2.5 px-2 text-center">
                                <div className="flex items-center justify-center gap-1 flex-wrap">
                                  {topic.pdfId ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          onAbrirPdf({
                                            pdfId: topic.pdfId!,
                                            pagina: topic.pdfPagina || 1,
                                            initialTool: 'nav',
                                            disciplineId: activeDisc.id,
                                            topicId: topic.id,
                                          })
                                        }
                                        className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                                        title={`Abrir PDF${linkedMat ? `: ${linkedMat.name}` : ''} (pág. ${topic.pdfPagina || 1})`}
                                      >
                                        <FileText className="w-3 h-3" />
                                        <span>Abrir p.{topic.pdfPagina || 1}</span>
                                      </button>
                                    </>
                                  ) : null}

                                  {topic.link ? (
                                    <div className="flex items-center gap-0.5">
                                      <a
                                        href={topic.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 font-bold text-[11px]"
                                        title={topic.link}
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateCurrentTopics((ts) =>
                                            ts.map((t) =>
                                              t.id === topic.id ? { ...t, link: '' } : t
                                            )
                                          )
                                        }
                                        className="p-0.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                                        title="Remover link externo"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const url = window.prompt(
                                          'Digite a URL externa (vídeo, site, etc.):'
                                        );
                                        if (url) {
                                          let clean = url.trim();
                                          if (!/^https?:\/\//i.test(clean)) clean = `https://${clean}`;
                                          updateCurrentTopics((ts) =>
                                            ts.map((t) =>
                                              t.id === topic.id ? { ...t, link: clean } : t
                                            )
                                          );
                                        }
                                      }}
                                      className="p-1 text-slate-400 hover:text-blue-500 transition cursor-pointer"
                                      title="Adicionar link externo"
                                    >
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>

                            {(topic.subs || []).map((sub) => {
                              const subTotalQ = (sub.h || 0) + (sub.e || 0);
                              const subPct =
                                subTotalQ > 0 ? Math.round(((sub.h || 0) / subTotalQ) * 100) : 0;
                              const subPages = countPages(sub);
                              const subDone = !!(sub.studied || sub.done);
                              const subPctCls =
                                subTotalQ === 0
                                  ? 'text-slate-400'
                                  : subPct >= 80
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : subPct >= 60
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-rose-600 dark:text-rose-400';
                              const isSubExpanded = true;

                              return (
                                <tr
                                  key={`sub-${sub.id}`}
                                  className={`bg-slate-50/70 dark:bg-slate-900/40 text-xs hover:bg-slate-100/60 dark:hover:bg-slate-800/50 transition ${
                                    subDone ? 'bg-emerald-500/5' : ''
                                  }`}
                                >
                                  <td className="py-2 px-1.5 text-center align-top pt-2.5">
                                    <input
                                      type="checkbox"
                                      checked={subDone}
                                      onChange={(e) =>
                                        updateSubTopic(topic.id, sub.id, {
                                          studied: e.target.checked ? today : null,
                                          done: e.target.checked,
                                        })
                                      }
                                      className="w-3.5 h-3.5 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                                    />
                                  </td>
                                  <td className="py-2 px-2 pl-8 align-top">
                                    <div className="flex items-start gap-1.5">
                                      <span className="text-slate-400 pt-0.5">↳</span>
                                      <NomeEditavel
                                        valor={sub.name}
                                        className="font-semibold text-slate-700 dark:text-slate-300"
                                        onSalvar={(val) =>
                                          updateCurrentTopics((ts) =>
                                            ts.map((t) =>
                                              t.id === topic.id
                                                ? {
                                                    ...t,
                                                    subs: (t.subs || []).map((x) =>
                                                      x.id === sub.id ? { ...x, name: val } : x
                                                    ),
                                                  }
                                                : t
                                            )
                                          )
                                        }
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateCurrentTopics((ts) =>
                                            ts.map((t) =>
                                              t.id === topic.id
                                                ? syncTopicFromSubtopics({
                                                    ...t,
                                                    subs: (t.subs || []).filter(
                                                      (s) => s.id !== sub.id
                                                    ),
                                                  })
                                                : t
                                            )
                                          )
                                        }
                                        className="p-0.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer shrink-0"
                                        title="Excluir subtópico"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </td>
                                  <td className="py-2 px-1.5 text-center">
                                    <div className="flex items-center justify-center gap-0.5">
                                      {(
                                        [
                                          ['v', 'V', 'Videoaula'],
                                          ['p', 'P', 'PDF'],
                                          ['q', 'Q', 'Questões'],
                                        ] as const
                                      ).map(([k, abbr, label]) => {
                                        const on = !!(sub.tp && sub.tp[k]);
                                        return (
                                          <button
                                            key={k}
                                            type="button"
                                            onClick={() =>
                                              updateSubTopic(topic.id, sub.id, {
                                                tp: { ...(sub.tp || {}), [k]: !on },
                                              })
                                            }
                                            title={`${label} (${on ? 'marcado' : 'desmarcado'})`}
                                            className={`w-6 h-6 rounded text-[10px] font-bold transition cursor-pointer ${
                                              on
                                                ? 'bg-blue-600 text-white'
                                                : 'opacity-45 hover:opacity-100 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                            }`}
                                          >
                                            {abbr}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </td>
<td className="py-2 px-1.5 text-center">
                                    <input
                                      type="text"
                                      defaultValue={sub.videoTime || ''}
                                      placeholder="00:00"
                                      onBlur={(e) =>
                                        updateSubTopic(topic.id, sub.id, {
                                          videoTime: e.target.value.trim(),
                                        })
                                      }
                                      className="w-14 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                  </td>
                                  <td className="py-2 px-1.5 text-center">
                                    <input
                                      key={`${sub.id}-pi-${sub.pi || 0}`}
                                      type="number"
                                      min={0}
                                      defaultValue={sub.pi || ''}
                                      placeholder="–"
                                      onBlur={(e) =>
                                        updateSubTopic(topic.id, sub.id, {
                                          pi: Math.max(0, parseInt(e.target.value, 10) || 0),
                                        })
                                      }
                                      className="w-11 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs"
                                    />
                                  </td>
                                  <td className="py-2 px-1.5 text-center">
                                    <input
                                      key={`${sub.id}-pf-${sub.pf || 0}`}
                                      type="number"
                                      min={0}
                                      defaultValue={sub.pf || ''}
                                      placeholder="–"
                                      onBlur={(e) =>
                                        updateSubTopic(topic.id, sub.id, {
                                          pf: Math.max(0, parseInt(e.target.value, 10) || 0),
                                        })
                                      }
                                      className="w-11 px-1 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-transparent text-center font-mono text-xs"
                                    />
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-mono text-[11px] text-slate-500">
                                    {subPages > 0 ? subPages : '–'}
                                  </td>
                                  <td className="py-2 px-1.5 text-center">
                                    <span className="inline-block w-11 py-0.5 text-center font-bold text-emerald-600 dark:text-emerald-400 text-xs">
                                      {sub.h || 0}
                                    </span>
                                  </td>
                                  <td className="py-2 px-1.5 text-center">
                                    <span className="inline-block w-11 py-0.5 text-center font-bold text-rose-600 dark:text-rose-400 text-xs">
                                      {sub.e || 0}
                                    </span>
                                  </td>
                                  <td className="py-2 px-1.5 text-center font-semibold text-slate-700 dark:text-slate-300">
                                    {subTotalQ}
                                  </td>
                                  <td className={`py-2 px-1.5 text-center font-bold ${subPctCls}`}>
                                    {subTotalQ === 0 ? '–' : `${subPct}%`}
                                  </td>
                                                                    <td className="py-2 px-2 text-center">
                                    <div className="flex items-center justify-center gap-1 flex-wrap">
                                      {sub.pdfId ? (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onAbrirPdf({
                                                pdfId: sub.pdfId!,
                                                pagina: sub.pdfPagina || 1,
                                                initialTool: 'nav',
                                                disciplineId: activeDisc.id,
                                                topicId: topic.id,
                                                subId: sub.id,
                                              })
                                            }
                                            className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                          >
                                            <FileText className="w-3 h-3" />
                                            <span>p.{sub.pdfPagina || 1}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onAbrirPdf({
                                                pdfId: sub.pdfId!,
                                                pagina: sub.pdfPagina || 1,
                                                initialTool: 'pen',
                                                disciplineId: activeDisc.id,
                                                topicId: topic.id,
                                                subId: sub.id,
                                              })
                                            }
                                            className="px-1.5 py-0.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                            title="Abrir e escrever no PDF"
                                          >
                                            <PenLine className="w-3 h-3" />
                                          </button>
                                        </>
                                      ) : null}

                                      {sub.link ? (
                                        <div className="flex items-center gap-0.5">
                                          <a
                                            href={sub.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center font-bold text-[10px]"
                                          >
                                            <ExternalLink className="w-3 h-3" />
                                          </a>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              updateSubTopic(topic.id, sub.id, { link: '' })
                                            }
                                            className="p-0.5 text-slate-400 hover:text-rose-500 rounded cursor-pointer"
                                          >
                                            <X className="w-3 h-3" />
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const url = window.prompt(
                                              'URL do material do subtópico:'
                                            );
                                            if (url) {
                                              let clean = url.trim();
                                              if (!/^https?:\/\//i.test(clean))
                                                clean = `https://${clean}`;
                                              updateSubTopic(topic.id, sub.id, { link: clean });
                                            }
                                          }}
                                          className="p-0.5 text-slate-400 hover:text-blue-500 cursor-pointer"
                                          title="Adicionar URL externa"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}

                            {addingSubToId === topic.id && (
                              <tr className="bg-blue-50/50 dark:bg-blue-950/20">
                                <td />
                                <td colSpan={12} className="py-2 px-3 pl-8">
                                  <input
                                    type="text"
                                    autoFocus
                                    value={subTopicName}
                                    onChange={(e) => setSubTopicName(e.target.value)}
                                    enterKeyHint="enter"
                                    placeholder="Novo subtópico (Enter para salvar, Esc para cancelar)"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        if (subTopicName.trim()) {
                                          addSubTopic(topic.id, subTopicName);
                                          setSubTopicName('');
                                        }
                                      }
                                      if (e.key === 'Escape') {
                                        setSubTopicName('');
                                        setAddingSubToId(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      // Ao sair do campo, salva o que foi digitado
                                      if (subTopicName.trim()) addSubTopic(topic.id, subTopicName);
                                      setSubTopicName('');
                                      setAddingSubToId(null);
                                    }}
                                    className="w-full px-2.5 py-1 rounded-lg border border-dashed border-blue-400 bg-white dark:bg-slate-800 text-xs uppercase outline-none"
                                  />
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-extrabold text-slate-800 dark:text-slate-100">
                      <td />
                      <td className="py-3 px-2 uppercase text-xs">Total Geral</td>
                      <td />
                      <td />
                      <td />
                      <td />
                      <td className="py-3 px-1.5 text-center font-mono text-xs">
                        {activeDisc.topics.reduce((acc, t) => {
                          let sum = countPages(t);
                          (t.subs || []).forEach((s) => (sum += countPages(s)));
                          return acc + sum;
                        }, 0) || '–'}
                      </td>
                      <td className="py-3 px-1.5 text-center text-emerald-600 text-xs">
                        {activeMetrics.hits}
                      </td>
                      <td className="py-3 px-1.5 text-center text-rose-600 text-xs">
                        {activeMetrics.errors}
                      </td>
                      <td className="py-3 px-1.5 text-center text-xs">
                        {activeMetrics.totalQuestions}
                      </td>
                      <td className="py-3 px-1.5 text-center text-xs font-bold">
                        {activeMetrics.totalQuestions > 0
                          ? `${Math.round((activeMetrics.hits / activeMetrics.totalQuestions) * 100)}%`
                          : '–'}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              <input
                type="text"
                enterKeyHint="enter"
                placeholder="+ Adicionar tópico à tabela (Enter)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    addTopic(e.currentTarget.value);
                    e.currentTarget.value = '';
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs font-semibold uppercase text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Revisões Espaçadas + Calendário */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-7 p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <RotateCcw className="w-4 h-4 text-blue-500" />
                  <span>Revisões Espaçadas ({intervals.map((i) => `${i}d`).join(' · ')})</span>
                </h3>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-bold text-slate-400 uppercase">
                    Intervalos:
                  </span>
                  {intervals.map((days) => (
                    <button
                      key={days}
                      type="button"
                      onClick={() => removeInterval(days)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-rose-100 hover:text-rose-600 transition cursor-pointer flex items-center gap-1"
                      title="Clique para remover este intervalo"
                    >
                      <span>{days} dias</span>
                      <X className="w-3 h-3 text-slate-400" />
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    placeholder="+ dias (Enter)"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addInterval(parseInt(e.currentTarget.value, 10) || 0);
                        e.currentTarget.value = '';
                      }
                    }}
                    className="w-24 px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-transparent text-xs text-center font-bold outline-none"
                  />
                </div>

                <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="p-1.5 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                        <RotateCw className="w-4 h-4" />
                      </span>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-200">
                          Revisão Periódica Contínua
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          Após o ciclo de {intervals[intervals.length - 1] || 45} dias, continuar revisando a cada:
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[15, 20, 30, 45, 60].map((d) => {
                        const active =
                          (discState.defaultRecurringDays || 30) === d &&
                          discState.recurringEnabled !== false;
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setRecurringInterval(d)}
                            className={`px-2.5 py-1 rounded-xl text-xs font-bold transition cursor-pointer ${
                              active
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-emerald-500'
                            }`}
                          >
                            {d}d
                          </button>
                        );
                      })}
                      <input
                        type="number"
                        min={1}
                        placeholder="+ dias"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const val = parseInt(e.currentTarget.value, 10) || 0;
                            if (val > 0) {
                              setRecurringInterval(val);
                              e.currentTarget.value = '';
                            }
                          }
                        }}
                        className="w-20 px-2 py-1 rounded-xl border border-dashed border-emerald-300 dark:border-emerald-700 bg-white dark:bg-slate-800 text-xs text-center font-bold outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2 max-h-96 overflow-y-auto pr-1 divide-y divide-slate-100 dark:divide-slate-800">
                  {!activeDisc.topics.some((t) => t.studied || (t.subs || []).some((s) => s.studied)) && (
                    <div className="text-xs text-slate-400 italic">
                      Marque um assunto como estudado para programar automaticamente as revisões espaçadas.
                    </div>
                  )}
                  {activeDisc.topics
                    .filter((t) => t.studied)
                    .map((topic) => {
                      const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 45;
                      const recDays = topic.recurringDays || discState.defaultRecurringDays || 30;
                      const showRec =
                        (topic.r && topic.r[maxInterval]) ||
                        today >= addDays(topic.studied!, maxInterval);
                      const recDue = nextPeriodicDate(
                        topic.studied!,
                        intervals,
                        recDays,
                        topic.recurringDates || []
                      );
                      const recCycle = (topic.recurringDates?.length || 0) + 1;

                      return (
                        <div key={topic.id} className="pt-2 first:pt-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase">
                            {topic.name}
                          </div>
                          <div className="text-[10px] text-slate-400 mb-1.5 font-medium">
                            Estudado em {formatShortDate(topic.studied)}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {intervals.map((days) => {
                              const due = addDays(topic.studied!, days);
                              const done = !!(topic.r && topic.r[days]);
                              return (
                                <button
                                  key={days}
                                  type="button"
                                  onClick={() =>
                                    updateCurrentTopics((ts) =>
                                      ts.map((t) =>
                                        t.id === topic.id
                                          ? { ...t, r: { ...(t.r || {}), [days]: done ? 0 : 1 } }
                                          : t
                                      )
                                    )
                                  }
                                  className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1 cursor-pointer tabular-nums ${
                                    done
                                      ? 'bg-emerald-600 text-white'
                                      : due < today
                                      ? 'border border-rose-500 text-rose-500 bg-rose-500/10'
                                      : due === today
                                      ? 'border border-blue-500 text-blue-600 bg-blue-500/10 font-extrabold'
                                      : 'border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                                  }`}
                                >
                                  {done && <Check className="w-3 h-3" />}
                                  <span>
                                    {days}d · {formatShortDate(due)}
                                  </span>
                                </button>
                              );
                            })}

                            {showRec && (
                              <button
                                type="button"
                                onClick={() => completeRecurring(topic.id)}
                                className={`px-2.5 py-1 rounded-xl text-[11px] font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                                  recDue < today
                                    ? 'border-rose-500 text-rose-500 bg-rose-500/10 font-extrabold'
                                    : recDue === today
                                    ? 'border-emerald-500 text-emerald-600 bg-emerald-500/10 font-black'
                                    : 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                                }`}
                                title={`Registrar conclusão da revisão periódica #${recCycle}`}
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>
                                  Recorrente #{recCycle} ({recDays}d) · {formatShortDate(recDue)}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Revisões do Dia + Calendário */}
              <div className="lg:col-span-5 space-y-4">
                <div className="p-5 rounded-3xl bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                      Revisões do Dia · {formatShortDate(today)}
                    </h3>
                    {pendingTodayReviews.length > 0 && (
                      <span className="text-xs font-extrabold text-rose-600 dark:text-rose-400 tabular-nums">
                        {pendingTodayReviews.length} pendentes
                      </span>
                    )}
                  </div>

                  {pendingTodayReviews.length ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {pendingTodayReviews.map((entry, i) => (
                        <div
                          key={`${entry.item.id}-${entry.interval}-${i}`}
                          className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-start gap-2.5 shadow-xs"
                        >
                          <input
                            type="checkbox"
                            checked={entry.isDone}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              if (entry.customId) {
                                toggleCustomReview(entry.item.id, entry.customId, checked);
                              } else {
                                updateCurrentTopics((ts) =>
                                  ts.map((t) =>
                                    t.id === entry.item.id
                                      ? {
                                          ...t,
                                          r: { ...(t.r || {}), [entry.interval]: checked ? 1 : 0 },
                                        }
                                      : t
                                  )
                                );
                              }
                            }}
                            className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTopicRevId(
                                  expandedTopicRevId === entry.item.id ? null : entry.item.id
                                )
                              }
                              className="text-left w-full text-xs font-bold text-slate-800 dark:text-slate-100 uppercase truncate hover:underline cursor-pointer"
                            >
                              {entry.item.name}
                            </button>
                            <div
                              className={`text-[10px] font-semibold ${
                                entry.isLate ? 'text-rose-500' : 'text-blue-600 dark:text-blue-400'
                              }`}
                            >
                              {entry.customId ? 'revisão extra' : `${entry.interval} dias`}
                              {entry.isLate
                                ? ` · atrasada desde ${formatShortDate(entry.dueDate)}`
                                : ' · hoje'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-blue-600/80 dark:text-blue-300/80 italic">
                      Nada para revisar nesta disciplina hoje!
                    </div>
                  )}

                  {expandedTopic && (
                    <div className="mt-3 p-4 rounded-2xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold uppercase text-slate-800 dark:text-slate-100 truncate">
                          Revisões de {expandedTopic.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setExpandedTopicRevId(null)}
                          className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Revisões extras / manuais
                        </div>
                        {(expandedTopic.customReviews || []).map((cr) => (
                          <div key={cr.id} className="flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              checked={!!cr.done}
                              onChange={(e) =>
                                toggleCustomReview(expandedTopic.id, cr.id, e.target.checked)
                              }
                              className="w-3.5 h-3.5 rounded text-blue-600 cursor-pointer"
                            />
                            <span
                              className={`flex-1 ${
                                cr.done
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-700 dark:text-slate-200'
                              }`}
                            >
                              {formatShortDate(cr.date)}
                            </span>
                            <button
                              type="button"
                              onClick={() => deleteCustomReview(expandedTopic.id, cr.id)}
                              className="p-1 rounded text-slate-400 hover:text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}

                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <input
                            type="date"
                            value={customRevDate}
                            onChange={(e) => setCustomRevDate(e.target.value)}
                            className="px-2 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => addCustomReview(expandedTopic.id)}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
                          >
                            Adicionar revisão
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Mini Calendário Mensal */}
                <div className="p-5 rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100">
                    <button
                      type="button"
                      onClick={() =>
                        setCalState((prev) =>
                          prev.m - 1 < 0
                            ? { ...prev, m: 11, y: prev.y - 1 }
                            : { ...prev, m: prev.m - 1 }
                        )
                      }
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <ChevronUp className="w-4 h-4 -rotate-90" />
                    </button>
                    <span>
                      {new Date(calState.y, calState.m, 1).toLocaleDateString('pt-BR', {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalState((prev) =>
                          prev.m + 1 > 11
                            ? { ...prev, m: 0, y: prev.y + 1 }
                            : { ...prev, m: prev.m + 1 }
                        )
                      }
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <ChevronDown className="w-4 h-4 -rotate-90" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 text-center text-xs tabular-nums">
                    {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((l, idx) => (
                      <span key={idx} className="text-[10px] font-bold text-slate-400 py-1">
                        {l}
                      </span>
                    ))}
                    {Array.from({ length: new Date(calState.y, calState.m, 1).getDay() }).map(
                      (_, idx) => (
                        <div key={`empty-${idx}`} className="aspect-square" />
                      )
                    )}
                    {Array.from({
                      length: new Date(calState.y, calState.m + 1, 0).getDate(),
                    }).map((_, idx) => {
                      const dayNum = idx + 1;
                      const iso = todayStr(new Date(calState.y, calState.m, dayNum));
                      const list = reviewsByDate[iso] || [];
                      const pending = list.filter((x) => !x.isDone).length;
                      const selected = iso === calState.sel;
                      return (
                        <button
                          key={dayNum}
                          type="button"
                          onClick={() => setCalState((prev) => ({ ...prev, sel: iso }))}
                          className={`aspect-square rounded-xl text-xs font-bold relative flex items-center justify-center transition cursor-pointer ${
                            selected
                              ? 'bg-blue-600 text-white shadow-xs'
                              : iso === today
                              ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                              : 'hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <span>{dayNum}</span>
                          {list.length > 0 && (
                            <span
                              className={`absolute bottom-0.5 text-[9px] font-extrabold ${
                                selected
                                  ? 'text-white'
                                  : pending > 0
                                  ? iso < today
                                    ? 'text-rose-500'
                                    : 'text-blue-500'
                                  : 'text-emerald-500'
                              }`}
                            >
                              {pending > 0 ? pending : '✓'}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div className="font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                      Revisões em {formatShortDate(calState.sel)}:
                    </div>
                    {reviewsByDate[calState.sel] && reviewsByDate[calState.sel].length > 0 ? (
                      <div className="space-y-1.5">
                        {reviewsByDate[calState.sel].map((rev, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 p-1.5 rounded-lg bg-slate-50 dark:bg-slate-800"
                          >
                            <span
                              className={`truncate flex-1 font-semibold ${
                                rev.isDone
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-800 dark:text-slate-100'
                              }`}
                            >
                              {rev.item.name} (
                              {rev.customId ? 'extra' : `${rev.interval}d`})
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-400 italic">Nenhuma revisão neste dia.</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Novo Edital */}
      {newEditalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[1rem] bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                Novo Edital
              </h3>
              <button
                type="button"
                onClick={() => setNewEditalModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Nome do Edital / Concurso
                </label>
                <input
                  type="text"
                  autoFocus
                  value={newEditalName}
                  onChange={(e) => setNewEditalName(e.target.value)}
                  placeholder="Ex.: Polícia Federal — Agente"
                  className={`${INPUT_CLS} mt-1`}
                />
              </div>
              <EditalDatesFields value={newEditalDates} onChange={setNewEditalDates} />
              {newEditalError && (
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>{newEditalError}</span>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNewEditalModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateEdital}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Cadastrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Datas do Edital */}
      {editDatesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[1rem] bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                Datas do edital · {activeEdital?.name}
              </h3>
              <button
                type="button"
                onClick={() => setEditDatesModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <EditalDatesFields value={editDatesVal} onChange={setEditDatesVal} />
            {editDatesError && (
              <div className="flex items-center gap-2 text-xs font-semibold text-rose-600">
                <AlertCircle className="w-4 h-4" />
                <span>{editDatesError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditDatesModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveDates}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer"
              >
                Salvar datas
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal: Vincular PDF ao Tópico/Subtópico */}
      {pdfLinkTarget && activeDisc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-[1rem] bg-black/55 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold uppercase tracking-wider text-slate-900 dark:text-white">
                  Vincular PDF ao tópico
                </h3>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                  {pdfLinkTarget.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPdfLinkTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={pdfPickerSearch}
                  onChange={(e) => setPdfPickerSearch(e.target.value)}
                  placeholder="Filtrar PDFs salvos..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={uploadingPdfInModal}
                onClick={() => modalPdfInputRef.current?.click()}
                className="px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-300 hover:bg-blue-100 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{uploadingPdfInModal ? 'Salvando…' : 'Enviar novo PDF'}</span>
              </button>
              <input
                ref={modalPdfInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingPdfInModal(true);
                  try {
                    const saved = await saveMaterialFile(file);
                    const updated = await listMaterials();
                    setMaterials(updated);
                    setPdfLinkTarget((prev) => (prev ? { ...prev, pdfId: saved.id } : prev));
                    onToast(`PDF "${saved.name}" salvo e selecionado.`);
                  } catch {
                    onToast('Não foi possível salvar este PDF.');
                  } finally {
                    setUploadingPdfInModal(false);
                    if (modalPdfInputRef.current) modalPdfInputRef.current.value = '';
                  }
                }}
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {materials.filter((m) =>
                m.name.toLowerCase().includes(pdfPickerSearch.trim().toLowerCase())
              ).length === 0 ? (
                <div className="p-4 text-xs text-slate-400 text-center">
                  Nenhum PDF encontrado. Clique em &ldquo;Enviar novo PDF&rdquo; acima para importar agora.
                </div>
              ) : (
                (() => {
                  const termo = pdfPickerSearch.trim().toLowerCase();
                  const filtrados = materials.filter((m) => m.name.toLowerCase().includes(termo));
                  const daMateria = filtrados.filter((m) => m.disciplineId === activeDisc.id);
                  const outras = filtrados.filter((m) => m.disciplineId !== activeDisc.id);
                  const renderItem = (mat: (typeof materials)[number]) => {
                    const selected = pdfLinkTarget.pdfId === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() =>
                        setPdfLinkTarget((prev) => (prev ? { ...prev, pdfId: mat.id } : prev))
                      }
                      className={`w-full px-3.5 py-2.5 flex items-center gap-2.5 text-left transition cursor-pointer ${
                        selected
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-200'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <FileText
                        className={`w-4 h-4 shrink-0 ${
                          selected ? 'text-blue-600' : 'text-slate-400'
                        }`}
                      />
                      <span className="flex-1 text-xs font-semibold truncate">{mat.name}</span>
                      {selected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  );
                  };
                  return (
                    <>
                      {daMateria.length > 0 && (
                        <div className="px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-slate-50 dark:bg-slate-800/60">
                          {activeDisc.name}
                        </div>
                      )}
                      {daMateria.map(renderItem)}
                      {outras.length > 0 && (
                        <div className="px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500 bg-slate-50 dark:bg-slate-800/60">
                          Outras matérias
                        </div>
                      )}
                      {outras.map(renderItem)}
                    </>
                  );
                })()
              )}
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                Página inicial:
              </label>
              <input
                type="number"
                min={1}
                value={pdfLinkTarget.page}
                onChange={(e) =>
                  setPdfLinkTarget((prev) => (prev ? { ...prev, page: e.target.value } : prev))
                }
                className="w-24 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-center outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              {pdfLinkTarget.pdfId ? (
                <button
                  type="button"
                  onClick={() => {
                    if (pdfLinkTarget.subId) {
                      updateSubTopic(pdfLinkTarget.topicId, pdfLinkTarget.subId, {
                        pdfId: undefined,
                        pdfPagina: undefined,
                      });
                    } else {
                      updateCurrentTopics((ts) =>
                        ts.map((t) =>
                          t.id === pdfLinkTarget.topicId
                            ? { ...t, pdfId: undefined, pdfPagina: undefined }
                            : t
                        )
                      );
                    }
                    setPdfLinkTarget(null);
                    onToast('Vínculo com PDF removido.');
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer"
                >
                  Desvincular
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setPdfLinkTarget(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!pdfLinkTarget.pdfId}
                  onClick={() => {
                    if (!pdfLinkTarget.pdfId) return;
                    const pg = Math.max(1, parseInt(pdfLinkTarget.page, 10) || 1);
                    if (pdfLinkTarget.subId) {
                      updateSubTopic(pdfLinkTarget.topicId, pdfLinkTarget.subId, {
                        pdfId: pdfLinkTarget.pdfId,
                        pdfPagina: pg,
                      });
                    } else {
                      updateCurrentTopics((ts) =>
                        ts.map((t) =>
                          t.id === pdfLinkTarget.topicId
                            ? { ...t, pdfId: pdfLinkTarget.pdfId, pdfPagina: pg }
                            : t
                        )
                      );
                    }
                    setPdfLinkTarget(null);
                    onToast('PDF vinculado ao tópico!');
                  }}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Salvar vínculo
                </button>
                <button
                  type="button"
                  disabled={!pdfLinkTarget.pdfId}
                  onClick={() => {
                    if (!pdfLinkTarget.pdfId) return;
                    const pg = Math.max(1, parseInt(pdfLinkTarget.page, 10) || 1);
                    const target = pdfLinkTarget;
                    if (target.subId) {
                      updateSubTopic(target.topicId, target.subId, {
                        pdfId: target.pdfId,
                        pdfPagina: pg,
                      });
                    } else {
                      updateCurrentTopics((ts) =>
                        ts.map((t) =>
                          t.id === target.topicId
                            ? { ...t, pdfId: target.pdfId, pdfPagina: pg }
                            : t
                        )
                      );
                    }
                    setPdfLinkTarget(null);
                    onAbrirPdf({
                      pdfId: target.pdfId,
                      pagina: pg,
                      initialTool: 'pen',
                      disciplineId: activeDisc.id,
                      topicId: target.topicId,
                      subId: target.subId,
                    });
                  }}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  <span>Salvar e escrever</span>
                </button>
              </div>
            </div>
          </div>
          {viewMode === 'det' && activeDisc && (
          <HistoricoSessoes
            sessoes={activeDisc.sessoes || []}
            onExcluir={(id) => {
              if (!activeDisc) return;
              onUpdateDiscState((prev) => ocultarSessao(prev, activeDisc.id, id));
            }}
            onEditar={editarSessao}
          />
          )}
        </div>
      )}
    </div>
  );
};
