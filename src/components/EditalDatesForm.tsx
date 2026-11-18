import React from 'react';
import { EditalDatas } from '../types';

export const fmtDataBR = (s?: string): string => {
  if (!s || s.length < 10) return '';
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

/** Valida as datas. Retorna uma mensagem de erro ou null se estiver tudo certo. */
export const validarDatasEdital = (d: EditalDatas): string | null => {
  if (d.inscricaoInicio && d.inscricaoFim && d.inscricaoFim < d.inscricaoInicio) {
    return 'A data final das inscrições não pode ser antes da data inicial.';
  }
  return null;
};

/** Remove campos vazios para não guardar lixo no estado. */
export const limparDatasEdital = (d: EditalDatas): EditalDatas | undefined => {
  const out: EditalDatas = {};
  (Object.keys(d) as (keyof EditalDatas)[]).forEach((k) => {
    if (d[k]) out[k] = d[k];
  });
  return Object.keys(out).length > 0 ? out : undefined;
};

interface Props {
  value: EditalDatas;
  onChange: (v: EditalDatas) => void;
}

const campo =
  'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500';

export const EditalDatesForm: React.FC<Props> = ({ value, onChange }) => {
  const set = (k: keyof EditalDatas) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Início das inscrições</label>
        <input type="date" value={value.inscricaoInicio || ''} onChange={set('inscricaoInicio')} className={campo} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fim das inscrições</label>
        <input type="date" value={value.inscricaoFim || ''} onChange={set('inscricaoFim')} className={campo} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pagamento da taxa</label>
        <input type="date" value={value.taxa || ''} onChange={set('taxa')} className={campo} />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Data da prova</label>
        <input type="date" value={value.prova || ''} onChange={set('prova')} className={campo} />
      </div>
    </div>
  );
};

/** Linha de resumo com as datas já preenchidas. */
export const EditalDatesResumo: React.FC<{ datas?: EditalDatas }> = ({ datas }) => {
  if (!datas) return null;
  const itens: { label: string; valor: string }[] = [];
  if (datas.inscricaoInicio || datas.inscricaoFim) {
    itens.push({
      label: 'Inscrições',
      valor: `${fmtDataBR(datas.inscricaoInicio) || '?'} até ${fmtDataBR(datas.inscricaoFim) || '?'}`,
    });
  }
  if (datas.taxa) itens.push({ label: 'Taxa', valor: fmtDataBR(datas.taxa) });
  if (datas.prova) itens.push({ label: 'Prova', valor: fmtDataBR(datas.prova) });
  if (itens.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-1">
      {itens.map((it) => (
        <span
          key={it.label}
          className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-blue-900"
        >
          <span className="font-bold">{it.label}:</span> {it.valor}
        </span>
      ))}
    </div>
  );
};
