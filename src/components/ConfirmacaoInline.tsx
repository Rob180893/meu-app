import React, { useState } from 'react';

interface ConfirmacaoInlineProps {
  mensagem: string;
  textoConfirmar?: string;
  textoCancelar?: string;
  perigoso?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
  className?: string;
}

/**
 * Aviso de confirmação dentro da própria tela.
 * Usado no lugar de window.confirm, que não funciona no APK (WebView).
 */
export const ConfirmacaoInline: React.FC<ConfirmacaoInlineProps> = ({
  mensagem,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  perigoso = false,
  onConfirmar,
  onCancelar,
  className = '',
}) => (
  <div
    role="alertdialog"
    className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
      perigoso
        ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800'
        : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700'
    } ${className}`}
  >
    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{mensagem}</p>
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={onCancelar}
        className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-bold cursor-pointer"
      >
        {textoCancelar}
      </button>
      <button
        type="button"
        onClick={onConfirmar}
        className={`px-3 py-1.5 rounded-xl text-white text-xs font-bold cursor-pointer ${
          perigoso ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
        }`}
      >
        {textoConfirmar}
      </button>
    </div>
  </div>
);

interface EntradaTextoInlineProps {
  rotulo: string;
  placeholder?: string;
  valorInicial?: string;
  textoSalvar?: string;
  onSalvar: (valor: string) => void;
  onCancelar: () => void;
}

/**
 * Campo de texto inline com Salvar/Cancelar.
 * Usado no lugar de window.prompt, que não funciona no APK (WebView).
 */
export const EntradaTextoInline: React.FC<EntradaTextoInlineProps> = ({
  rotulo,
  placeholder,
  valorInicial = '',
  textoSalvar = 'Salvar',
  onSalvar,
  onCancelar,
}) => {
  const [valor, setValor] = useState<string>(valorInicial);
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 shrink-0">{rotulo}</span>
      <input
        autoFocus
        type="text"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSalvar(valor);
          if (e.key === 'Escape') onCancelar();
        }}
        className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs outline-none"
      />
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-600 text-xs font-bold cursor-pointer"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => onSalvar(valor)}
          className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
        >
          {textoSalvar}
        </button>
      </div>
    </div>
  );
};
