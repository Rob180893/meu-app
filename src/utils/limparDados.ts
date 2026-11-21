import type { DiscState, Topic } from '../types';

const zerarTopico = (t: Topic): Topic => ({
  ...t,
  h: 0,
  e: 0,
  subs: (t.subs || []).map((sb) => ({ ...sb, h: 0, e: 0 })),
});

/** Zera o tempo de estudo (disciplinas e registros). Questões e observações são mantidas. */
export const limparHoras = (d: DiscState): DiscState => ({
  ...d,
  eds: d.eds.map((ed) => ({
    ...ed,
    list: ed.list.map((disc) => ({
      ...disc,
      log: {},
      sessoes: (disc.sessoes || []).map((s) => ({ ...s, seconds: 0 })),
    })),
  })),
});

/** Zera acertos e erros (tópicos, subtópicos, disciplinas e registros). Tempo e observações são mantidos. */
export const limparQuestoes = (d: DiscState): DiscState => ({
  ...d,
  qlog: {},
  eds: d.eds.map((ed) => ({
    ...ed,
    list: ed.list.map((disc) => ({
      ...disc,
      qh: 0,
      qe: 0,
      topics: disc.topics.map(zerarTopico),
      sessoes: (disc.sessoes || []).map((s) => ({ ...s, acertos: 0, erros: 0 })),
    })),
  })),
});

/** Remove os tópicos e subtópicos de todas as disciplinas. Disciplinas e editais são mantidos. */
export const limparConteudos = (d: DiscState): DiscState => ({
  ...d,
  eds: d.eds.map((ed) => ({
    ...ed,
    list: ed.list.map((disc) => ({ ...disc, topics: [] })),
  })),
});
