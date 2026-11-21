import type { DiscState, SessaoEstudo, Topic } from '../types';
import { syncTopicFromSubtopics } from './date';

/**
 * Edita um registro de estudo e recalcula os totais:
 * - tempo: ajusta o log diário da disciplina (estatísticas de tempo);
 * - acertos/erros: ajustam o subtópico, o tópico ou a disciplina (sem tópico) e o total de questões do dia.
 * Registros antigos (sem vínculo com o tópico) não mexem nos totais de questões.
 */
export const aplicarEdicaoSessao = (
  prev: DiscState,
  discId: string,
  sessaoId: string,
  patch: Partial<SessaoEstudo>
): DiscState => {
  let antiga: SessaoEstudo | undefined;
  prev.eds.forEach((ed) =>
    ed.list.forEach((d) => {
      if (d.id === discId && !antiga) antiga = (d.sessoes || []).find((x) => x.id === sessaoId);
    })
  );
  if (!antiga) return prev;
  const s0 = antiga as SessaoEstudo;

  const legado = !s0.topicId && !!s0.topico;
  const dA = !legado && typeof patch.acertos === 'number' ? patch.acertos - s0.acertos : 0;
  const dE = !legado && typeof patch.erros === 'number' ? patch.erros - s0.erros : 0;
  const dS = typeof patch.seconds === 'number' ? patch.seconds - s0.seconds : 0;
  const dQ = dA + dE;

  return {
    ...prev,
    qlog:
      dQ !== 0
        ? {
            ...(prev.qlog || {}),
            [s0.date]: Math.max(0, ((prev.qlog || {})[s0.date] || 0) + dQ),
          }
        : prev.qlog,
    eds: prev.eds.map((ed) => ({
      ...ed,
      list: ed.list.map((d) => {
        if (d.id !== discId) return d;
        const sessoes = (d.sessoes || []).map((x) => (x.id === sessaoId ? { ...x, ...patch } : x));
        const log =
          dS !== 0
            ? {
                ...(d.log || {}),
                [s0.date]: Math.max(0, ((d.log || {})[s0.date] || 0) + dS),
              }
            : d.log;

        if (legado || dQ === 0 || (dA === 0 && dE === 0)) {
          return { ...d, sessoes, log };
        }
        if (s0.topicId && s0.subId) {
          return {
            ...d,
            sessoes,
            log,
            topics: d.topics.map((t: Topic) =>
              t.id !== s0.topicId
                ? t
                : syncTopicFromSubtopics({
                    ...t,
                    subs: (t.subs || []).map((sb) =>
                      sb.id === s0.subId
                        ? {
                            ...sb,
                            h: Math.max(0, (sb.h || 0) + dA),
                            e: Math.max(0, (sb.e || 0) + dE),
                          }
                        : sb
                    ),
                  })
            ),
          };
        }
        if (s0.topicId) {
          return {
            ...d,
            sessoes,
            log,
            topics: d.topics.map((t: Topic) =>
              t.id !== s0.topicId
                ? t
                : { ...t, h: Math.max(0, (t.h || 0) + dA), e: Math.max(0, (t.e || 0) + dE) }
            ),
          };
        }
        return {
          ...d,
          sessoes,
          log,
          qh: Math.max(0, (d.qh || 0) + dA),
          qe: Math.max(0, (d.qe || 0) + dE),
        };
      }),
    })),
  };
};

/** Oculta o registro do histórico. Não altera totais nem a aba Observações. */
export const ocultarSessao = (prev: DiscState, discId: string, sessaoId: string): DiscState => ({
  ...prev,
  eds: prev.eds.map((ed) => ({
    ...ed,
    list: ed.list.map((d) =>
      d.id !== discId
        ? d
        : {
            ...d,
            sessoes: (d.sessoes || []).map((x) =>
              x.id === sessaoId ? { ...x, oculto: true } : x
            ),
          }
    ),
  })),
});

/**
 * Apaga o registro por completo: desconta tempo e questões dos totais
 * (disciplina, tópico/subtópico e total do dia) e remove o registro da lista.
 */
export const excluirSessao = (prev: DiscState, discId: string, sessaoId: string): DiscState => {
  const zerado = aplicarEdicaoSessao(prev, discId, sessaoId, {
    acertos: 0,
    erros: 0,
    seconds: 0,
  });
  return {
    ...zerado,
    eds: zerado.eds.map((ed) => ({
      ...ed,
      list: ed.list.map((d) =>
        d.id !== discId
          ? d
          : { ...d, sessoes: (d.sessoes || []).filter((x) => x.id !== sessaoId) }
      ),
    })),
  };
};
