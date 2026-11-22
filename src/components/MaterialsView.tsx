import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Download, FileText, Trash2, Upload } from 'lucide-react';
import type { DiscState, MaterialMeta, Topic } from '../types';
import { formatBytes } from '../utils/date';
import { exportAnnotatedPdfBytes, hasAnyAnnotations } from '../utils/pdfExport';
import {
  deleteMaterial,
  downloadBlob,
  extractPdfBytes,
  getAnnotations,
  getMaterialFile,
  listMaterials,
  saveMaterialFile,
  updateMaterialMeta,
} from '../utils/storage';

interface MaterialsViewProps {
  discState: DiscState;
  onUpdateDiscState: React.Dispatch<React.SetStateAction<DiscState>>;
  onAbrirPdf: (pdfId: string, pagina?: number) => void;
  onToast: (msg: string) => void;
}

const linkTopicToPdf = (
  state: DiscState,
  topicId: string,
  patch: Partial<Pick<Topic, 'pdfId' | 'pdfPagina'>>
): DiscState => ({
  ...state,
  eds: state.eds.map((ed) => ({
    ...ed,
    list: ed.list.map((disc) => ({
      ...disc,
      topics: disc.topics.map((topic) =>
        topic.id === topicId ? { ...topic, ...patch } : topic
      ),
    })),
  })),
});

export const MaterialsView: React.FC<MaterialsViewProps> = ({
  discState,
  onUpdateDiscState,
  onAbrirPdf,
  onToast,
}) => {
  const [materials, setMaterials] = useState<MaterialMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [discId, setDiscId] = useState('');
  const [topicId, setTopicId] = useState('');
  const [pdfId, setPdfId] = useState('');
  const [pageStr, setPageStr] = useState('1');
  const [uploadDiscId, setUploadDiscId] = useState('');
  // Janela "Vincular PDF a um tópico"
  const [vinculoMat, setVinculoMat] = useState<MaterialMeta | null>(null);
  const [vinculoDisc, setVinculoDisc] = useState('');
  const [vinculoTopic, setVinculoTopic] = useState('');
  const [vinculoPagina, setVinculoPagina] = useState('1');

  const abrirVinculo = (mat: MaterialMeta) => {
    setVinculoMat(mat);
    setVinculoDisc(mat.disciplineId || '');
    setVinculoTopic('');
    setVinculoPagina('1');
  };

  const salvarVinculo = () => {
    if (!vinculoMat || !vinculoTopic) {
      onToast('Escolha a matéria e o tópico.');
      return;
    }
    const pg = Math.max(1, parseInt(vinculoPagina, 10) || 1);
    onUpdateDiscState((prev) =>
      linkTopicToPdf(prev, vinculoTopic, { pdfId: vinculoMat.id, pdfPagina: pg })
    );
    onToast('Tópico vinculado ao PDF.');
    setVinculoMat(null);
  };

  const vinculoTopicos =
    ((discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0])?.list || []).find((d) => d.id === vinculoDisc)?.topics || [];

  const edAtual = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplinasAtuais = edAtual?.list || [];
  const grupos = [
    ...disciplinasAtuais.map((d) => ({
      id: d.id,
      nome: d.name,
      mats: materials.filter((m) => m.disciplineId === d.id),
    })),
    {
      id: '_sem',
      nome: 'Sem matéria',
      mats: materials.filter((m) => !m.disciplineId || !disciplinasAtuais.some((d) => d.id === m.disciplineId)),
    },
  ];

  const handleMover = async (mat: MaterialMeta, disciplineId: string) => {
    await updateMaterialMeta(mat.id, { disciplineId: disciplineId || undefined });
    await refreshMaterials();
  };

  const refreshMaterials = () => listMaterials().then(setMaterials);

  useEffect(() => {
    refreshMaterials();
  }, []);

  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const disciplines = activeEdital?.list || [];
  const selectedTopics = disciplines.find((d) => d.id === discId)?.topics || [];

  const linkedTopics: { topic: Topic; discName: string }[] = [];
  discState.eds.forEach((ed) =>
    ed.list.forEach((d) =>
      d.topics.forEach((topic) => {
        if (topic.pdfId) linkedTopics.push({ topic, discName: d.name });
      })
    )
  );

  const getPdfName = (id: string) =>
    materials.find((m) => m.id === id)?.name || '(PDF removido)';

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setSaving(true);
    let savedCount = 0;
    try {
      for (const file of Array.from(files)) {
        if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
          onToast(`"${file.name}" não é um arquivo PDF.`);
          continue;
        }
        await saveMaterialFile(file, uploadDiscId || undefined);
        savedCount++;
      }
      await refreshMaterials();
      if (savedCount > 0) {
        onToast(
          savedCount === 1
            ? 'PDF adicionado aos materiais.'
            : `${savedCount} PDFs adicionados aos materiais.`
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      onToast(msg ? `Não foi possível salvar o PDF (${msg}).` : 'Não foi possível salvar o PDF.');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (mat: MaterialMeta) => {
    if (!window.confirm(`Excluir "${mat.name}"? As anotações também serão apagadas.`)) return;
    await deleteMaterial(mat.id);
    onUpdateDiscState((prev) => {
      let next = prev;
      prev.eds.forEach((ed) =>
        ed.list.forEach((d) =>
          d.topics.forEach((t) => {
            if (t.pdfId === mat.id) {
              next = linkTopicToPdf(next, t.id, { pdfId: undefined, pdfPagina: undefined });
            }
          })
        )
      );
      return next;
    });
    await refreshMaterials();
    onToast('Material excluído.');
  };

  const handleDownload = async (mat: MaterialMeta) => {
    const [file, anns] = await Promise.all([getMaterialFile(mat.id), getAnnotations(mat.id)]);
    const bytes = await extractPdfBytes(file);
    if (!bytes) {
      onToast('Arquivo PDF não encontrado no armazenamento local.');
      return;
    }
    if (hasAnyAnnotations(anns)) {
      try {
        const merged = await exportAnnotatedPdfBytes(bytes, anns);
        downloadBlob(new Uint8Array(merged), `${mat.name}-anotado.pdf`, 'application/pdf');
        onToast('PDF baixado com suas marcações!');
        return;
      } catch {
        // Fallback para download original se o PDF tiver restrição de gravação
      }
    }
    downloadBlob(new Uint8Array(bytes), `${mat.name}.pdf`, 'application/pdf');
  };

  const handleLink = () => {
    if (!topicId || !pdfId) {
      onToast('Escolha a disciplina, o tópico e o PDF.');
      return;
    }
    const page = Math.max(1, parseInt(pageStr, 10) || 1);
    onUpdateDiscState((prev) => linkTopicToPdf(prev, topicId, { pdfId, pdfPagina: page }));
    onToast('Tópico vinculado ao PDF.');
    setTopicId('');
  };

  const inputCls =
    'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500';
  const cardCls =
    'rounded-3xl bg-white/90 dark:bg-slate-800/90 border border-slate-200/80 dark:border-slate-700/80 shadow-sm';

  return (
    <div className="space-y-6">
      <div className="pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        <h2 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-900 dark:text-white">
          Materiais
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          PDFs salvos localmente no navegador com leitor integrado, caneta, marca-texto e inclusão automática no backup.
        </p>
      </div>

      {/* Área de upload / arrastar e soltar */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`${cardCls} p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-2 border-dashed transition ${
          dragging
            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-950/30'
            : 'border-slate-200/90 dark:border-slate-700/90'
        }`}
      >
        <div>
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
            Adicionar PDF
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Arraste um ou mais arquivos PDF para cá ou clique no botão ao lado.
          </div>
        </div>
        <select
          value={uploadDiscId}
          onChange={(e) => setUploadDiscId(e.target.value)}
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs outline-none"
        >
          <option value="">Sem matéria</option>
          {disciplinasAtuais.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={saving}
          className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Upload className="w-4 h-4" />
          <span>{saving ? 'Salvando…' : 'Anexar PDF'}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {/* Lista de PDFs separada por matéria */}
      <div className={`${cardCls} p-5 space-y-6`}>
        <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
          Seus PDFs ({materials.length})
        </h3>
        {materials.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum PDF adicionado ainda. Anexe um arquivo acima para ler e fazer marcações.
          </p>
        ) : (
          grupos
            .filter((g) => g.mats.length > 0)
            .map((g) => (
              <div key={g.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-blue-700 dark:text-blue-300">{g.nome}</span>
                  <span className="text-[11px] text-slate-500">({g.mats.length})</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                </div>
                <div className="divide-y divide-slate-200 dark:divide-slate-700">
                  {g.mats.map((mat) => (
                <div key={mat.id} className="py-3 flex items-center gap-3 flex-wrap">
                  <FileText className="w-5 h-5 text-blue-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                      {mat.name}
                    </div>
                    <div className="text-xs text-slate-500 tabular-nums">
                      {formatBytes(mat.size)}
                    </div>
                  </div>
                  <select
                    value={mat.disciplineId || ''}
                    onChange={(e) => handleMover(mat, e.target.value)}
                    className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] max-w-[9rem] outline-none"
                    title="Mover para outra matéria"
                  >
                    <option value="">Sem matéria</option>
                    {disciplinasAtuais.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => onAbrirPdf(mat.id)}
                    className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer whitespace-nowrap shrink-0 transition"
                  >
                    Abrir PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => abrirVinculo(mat)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/60 cursor-pointer whitespace-nowrap shrink-0 transition"
                    title="Vincular este PDF a um tópico"
                  >
                    Vincular
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(mat)}
                    className="p-2 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer shrink-0 transition"
                    title={`Baixar ${mat.name}`}
                    aria-label={`Baixar ${mat.name}`}
                  >
                    <Download className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(mat)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0 transition"
                    aria-label={`Excluir ${mat.name}`}
                    title={`Excluir ${mat.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                  ))}
                </div>
              </div>
            ))
        )}
      </div>


      {vinculoMat && (
        <div className="fixed inset-0 z-[90] bg-slate-900/60 flex items-center justify-center p-4 pt-[calc(1rem+var(--safe-top))]" onClick={() => setVinculoMat(null)}>
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">Vincular PDF a um tópico</h3>
              <p className="text-xs text-slate-500 mt-1 truncate">{vinculoMat.name}</p>
            </div>

            <div className="space-y-3">
              <select
                value={vinculoDisc}
                onChange={(e) => {
                  setVinculoDisc(e.target.value);
                  setVinculoTopic('');
                }}
                className={inputCls}
              >
                <option value="">Matéria…</option>
                {disciplinasAtuais.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
              <select
                value={vinculoTopic}
                onChange={(e) => setVinculoTopic(e.target.value)}
                className={inputCls}
                disabled={!vinculoDisc}
              >
                <option value="">Tópico…</option>
                {vinculoTopicos.map((tp) => (
                  <option key={tp.id} value={tp.id}>{tp.name}</option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                value={vinculoPagina}
                onChange={(e) => setVinculoPagina(e.target.value)}
                placeholder="Página inicial"
                className={inputCls}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVinculoMat(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarVinculo}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Salvar vínculo
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
