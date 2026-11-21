import React, { useEffect, useState } from 'react';
import { Download, RotateCw, Trash2, X } from 'lucide-react';
import { excluirSnapshot, listarSnapshots, obterSnapshot, type SnapshotMeta } from '../utils/backupAuto';
import { salvarEmQualquerLugar } from '../utils/storage';

interface Props {
  onFechar: () => void;
  onRestaurar: (texto: string) => void;
}

const fmtData = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
};

export const BackupsAutomaticosModal: React.FC<Props> = ({ onFechar, onRestaurar }) => {
  const [lista, setLista] = useState<SnapshotMeta[]>([]);
  const [carregando, setCarregando] = useState<boolean>(true);
  const [confirmacao, setConfirmacao] = useState<{ id: string; acao: 'restaurar' | 'excluir' } | null>(null);

  const recarregar = () =>
    listarSnapshots()
      .then(setLista)
      .finally(() => setCarregando(false));

  useEffect(() => {
    recarregar();
  }, []);

  const baixar = async (id: string) => {
    const texto = await obterSnapshot(id);
    if (!texto) return;
    await salvarEmQualquerLugar(`backup-automatico-${id.slice(0, 10)}.json`, texto, 'application/json');
  };

  const restaurar = async (id: string) => {
    const texto = await obterSnapshot(id);
    if (texto) onRestaurar(texto);
    onFechar();
  };

  const excluir = async (id: string) => {
    await excluirSnapshot(id);
    setConfirmacao(null);
    recarregar();
  };

  return (
    <div className="fixed inset-0 z-[85] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-300">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">Backups automáticos</h2>
              <p className="text-xs text-slate-500">
                Cópias guardadas no aparelho a cada 6 horas, quando há alterações. Guardamos as 2 mais recentes.
              </p>
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

        {carregando && <p className="text-sm text-slate-500">Carregando…</p>}
        {!carregando && lista.length === 0 && (
          <p className="text-sm text-slate-500">
            Nenhum backup automático ainda. Ele é criado depois de alterações feitas com pelo menos 6 horas de intervalo.
          </p>
        )}

        <ul className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
          {lista.map((b) => (
            <li
              key={b.id}
              className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-700/70 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{fmtData(b.id)}</div>
                  <div className="text-[11px] text-slate-500">{Math.max(1, Math.round(b.tamanho / 1024))} KB</div>
                </div>
                {confirmacao?.id !== b.id && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => baixar(b.id)}
                      title="Baixar arquivo"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmacao({ id: b.id, acao: 'excluir' })}
                      title="Excluir backup"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmacao({ id: b.id, acao: 'restaurar' })}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      Restaurar
                    </button>
                  </div>
                )}
              </div>

              {confirmacao?.id === b.id && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                    {confirmacao.acao === 'restaurar'
                      ? 'Substituir os dados atuais por este backup?'
                      : 'Excluir este backup?'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      confirmacao.acao === 'restaurar' ? restaurar(b.id) : excluir(b.id)
                    }
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                  >
                    Confirmar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmacao(null)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="text-[11px] text-slate-500">
          Este backup fica só no aparelho. Continue exportando o arquivo de vez em quando para ter uma cópia fora dele.
        </p>
      </div>
    </div>
  );
};
