import React, { useState } from 'react';
import { Trash2, X } from 'lucide-react';

export type AcaoApagar = 'horas' | 'questoes' | 'conteudos' | 'tudo';

interface Props {
  onFechar: () => void;
  onApagar: (acao: AcaoApagar) => void;
}

const OPCOES: { acao: AcaoApagar; titulo: string; descricao: string }[] = [
  {
    acao: 'horas',
    titulo: 'Limpar horas',
    descricao: 'Zera o tempo de estudo de todas as disciplinas e registros. Questões e observações são mantidas.',
  },
  {
    acao: 'questoes',
    titulo: 'Limpar questões',
    descricao: 'Zera acertos e erros de tópicos, subtópicos, disciplinas e registros. Tempo e observações são mantidos.',
  },
  {
    acao: 'conteudos',
    titulo: 'Limpar conteúdos',
    descricao: 'Remove todos os tópicos e subtópicos. As disciplinas e os editais são mantidos.',
  },
  {
    acao: 'tudo',
    titulo: 'Limpar tudo',
    descricao: 'Apaga editais, disciplinas, registros, quadro Kanban e PDFs. Backups e arquivos exportados não são apagados.',
  },
];

export const ApagarDadosModal: React.FC<Props> = ({ onFechar, onApagar }) => {
  const [confirmando, setConfirmando] = useState<AcaoApagar | null>(null);

  return (
    <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 pt-[1rem]">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-900/50 text-rose-600 dark:text-rose-300">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Apagar dados</h2>
              <p className="text-xs text-slate-500">Escolha o que deseja apagar. Esta ação não pode ser desfeita.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <ul className="space-y-2">
          {OPCOES.map((op) => (
            <li
              key={op.acao}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{op.titulo}</div>
                  <p className="text-[11px] text-slate-500 leading-snug">{op.descricao}</p>
                </div>
                {confirmando !== op.acao && (
                  <button
                    type="button"
                    onClick={() => setConfirmando(op.acao)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    Apagar
                  </button>
                )}
              </div>
              {confirmando === op.acao && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    Tem certeza? Não dá para desfazer.
                  </span>
                  <button
                    type="button"
                    onClick={() => onApagar(op.acao)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmando(null)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
