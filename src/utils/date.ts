import type { Edital, EditalDatas, ReviewEntry, SubTopic, Topic } from '../types';

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const todayStr = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return todayStr(new Date(y, m - 1, d + days));
};

export const formatShortDate = (iso?: string | null): string =>
  !iso || iso.length < 10 ? iso || '' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export const formatFullDate = (iso?: string): string =>
  !iso || iso.length < 10 ? '' : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export const daysDiff = (fromIso: string, toIso: string): number => {
  const [y1, m1, d1] = fromIso.split('-').map(Number);
  const [y2, m2, d2] = toIso.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
};

export const daysFromToday = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now.getTime()) / 864e5);
};

export const formatCountdown = (diff: number): string =>
  diff < 0 ? 'já passou' : diff === 0 ? 'hoje' : diff === 1 ? 'amanhã' : `faltam ${diff} dias`;

export const nextPeriodicDate = (
  studied: string,
  intervals: number[] = [7, 15, 30, 60],
  recurringDays = 30,
  recurringDates: string[] = []
): string => {
  if (recurringDates.length > 0) {
    const sorted = [...recurringDates].sort();
    return addDays(sorted[sorted.length - 1], recurringDays);
  }
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 45;
  return addDays(addDays(studied, maxInterval), recurringDays);
};

export const formatHMS = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

export const formatHoursMin = (seconds: number): string => {
  const totalMin = Math.round(seconds / 60);
  return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`;
};

export const formatHoursMinFull = (seconds: number): string => {
  const totalMin = Math.floor(seconds / 60);
  return `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}min`;
};

export const formatDurationCompact = (seconds: number): string => {
  const totalMin = Math.round(seconds / 60);
  return totalMin < 60
    ? `${totalMin}min`
    : `${Math.floor(totalMin / 60)}h${String(totalMin % 60).padStart(2, '0')}`;
};

export const formatDurationStats = (seconds: number): string => {
  const totalMin = Math.max(0, Math.floor(seconds / 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h === 0 ? `${m}min` : `${h}h${String(m).padStart(2, '0')}min`;
};

export const parseHMS = (str: string): number => {
  const parts = String(str)
    .split(':')
    .map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.unshift(0);
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

export const countPages = (item: { pi?: number; pf?: number }): number =>
  item.pi && item.pf && item.pi > 0 && item.pf >= item.pi ? item.pf - item.pi + 1 : 0;

const LOWER_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'as', 'os',
  'em', 'na', 'no', 'nas', 'nos', 'para', 'por', 'com', 'ao', 'aos', 'ou',
]);

export const titleCase = (input: string): string =>
  input
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((word, idx) =>
      idx > 0 && LOWER_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(' ');

export const syncSubtopicsWithTopic = (topic: Topic, studiedDate: string | null): Topic =>
  !topic.subs || topic.subs.length === 0
    ? topic
    : {
        ...topic,
        subs: topic.subs.map((sub: SubTopic) =>
          studiedDate
            ? { ...sub, studied: sub.studied || studiedDate, done: true }
            : { ...sub, studied: null, done: false }
        ),
      };

export const syncTopicFromSubtopics = (topic: Topic): Topic => {
  if (!topic.subs || topic.subs.length === 0) return topic;
  if (topic.subs.every((s) => !!s.studied)) {
    const latest = topic.subs.map((s) => s.studied as string).sort().pop() || null;
    return topic.studied === latest ? topic : { ...topic, studied: latest, r: {} };
  }
  return topic.studied ? { ...topic, studied: null, r: {} } : topic;
};

export const validateEditalDates = (datas: EditalDatas): string | null =>
  datas.inscricaoInicio && datas.inscricaoFim && datas.inscricaoFim < datas.inscricaoInicio
    ? 'A data final das inscrições não pode ser antes da data inicial.'
    : null;

export const cleanEditalDates = (datas: EditalDatas): EditalDatas | undefined => {
  const out: EditalDatas = {};
  (Object.keys(datas) as (keyof EditalDatas)[]).forEach((k) => {
    if (datas[k]) out[k] = datas[k];
  });
  return Object.keys(out).length > 0 ? out : undefined;
};

export const buildReviewEntries = (
  editais: Edital[],
  settings: { intv?: number[]; recurringEnabled?: boolean; defaultRecurringDays?: number }
): ReviewEntry[] => {
  const today = todayStr();
  const intervals = settings.intv || [7, 15, 30, 60];
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 45;
  const calcStatus = (done: boolean, dueDate: string): ReviewEntry['status'] =>
    done ? 'done' : dueDate < today ? 'late' : dueDate === today ? 'today' : 'scheduled';

  const entries: ReviewEntry[] = [];
  editais.forEach((ed) => {
    (ed.list || []).forEach((disc) => {
      (disc.topics || []).forEach((topic) => {
        const base = {
          disciplineId: disc.id,
          disciplineName: disc.name,
          topicId: topic.id,
          topicName: topic.name,
          topic,
        };
        if (topic.studied) {
          const studiedDate = topic.studied;
          intervals.forEach((days) => {
            const done = !!(topic.r && topic.r[days]);
            const dueDate = addDays(studiedDate, days);
            entries.push({
              ...base,
              key: `${topic.id}-s${days}`,
              kind: 'spaced',
              studiedDate,
              intervalDays: days,
              dueDate,
              status: calcStatus(done, dueDate),
            });
          });
          const recDays =
            topic.recurringDays ||
            (settings.recurringEnabled ? settings.defaultRecurringDays || 30 : 0);
          if (recDays > 0) {
            const doneDates = [...(topic.recurringDates || [])].sort();
            doneDates.forEach((dt, idx) => {
              entries.push({
                ...base,
                key: `${topic.id}-p${idx + 1}`,
                kind: 'periodic',
                studiedDate,
                intervalDays: recDays,
                dueDate: dt,
                status: 'done',
                cycle: idx + 1,
              });
            });
            if ((topic.r && topic.r[maxInterval]) || today >= addDays(studiedDate, maxInterval)) {
              const due = nextPeriodicDate(studiedDate, intervals, recDays, topic.recurringDates || []);
              entries.push({
                ...base,
                key: `${topic.id}-p${doneDates.length + 1}`,
                kind: 'periodic',
                studiedDate,
                intervalDays: recDays,
                dueDate: due,
                status: calcStatus(false, due),
                cycle: doneDates.length + 1,
              });
            }
          }
        }
        (topic.customReviews || []).forEach((cr) => {
          entries.push({
            ...base,
            key: `${topic.id}-m${cr.id}`,
            kind: 'manual',
            customId: cr.id,
            studiedDate: topic.studied || cr.date,
            intervalDays: 0,
            dueDate: cr.date,
            status: calcStatus(!!cr.done, cr.date),
          });
        });
      });
    });
  });

  return entries;
};

const VERSES: [string, string][] = [
  ['Confia no Senhor de todo o coração e não te apoies na tua própria inteligência. Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.', 'Provérbios 3,5-6'],
  ['Tudo posso naquele que me fortalece.', 'Filipenses 4,13'],
  ['Sê forte e corajoso! Não tenhas medo nem desanimes, pois o Senhor teu Deus está contigo por onde quer que andes.', 'Josué 1,9'],
  ['A tua palavra é lâmpada para os meus passos e luz para o meu caminho.', 'Salmo 119,105'],
  ['É o Senhor quem dá a sabedoria; de sua boca vêm o conhecimento e a inteligência.', 'Provérbios 2,6'],
  ['Se algum de vós tem falta de sabedoria, peça-a a Deus, que a todos dá com generosidade, e ela lhe será dada.', 'Tiago 1,5'],
  ['Filho, desde a juventude procura a instrução, e até os cabelos brancos encontrarás a sabedoria.', 'Eclesiástico 6,18'],
  ['Orei, e a inteligência me foi dada; supliquei, e veio a mim o espírito de sabedoria.', 'Sabedoria 7,7'],
  ['Os que esperam no Senhor renovam as suas forças, sobem com asas como águias, correm sem se cansar, caminham sem desfalecer.', 'Isaías 40,31'],
  ['Tudo o que tua mão encontrar para fazer, faze-o com todas as tuas forças.', 'Eclesiastes 9,10'],
  ['Tudo o que fizerdes, fazei-o de coração, como para o Senhor e não para os homens.', 'Colossenses 3,23'],
  ['Não nos cansemos de fazer o bem, pois, se não desanimarmos, colheremos a seu tempo.', 'Gálatas 6,9'],
  ['Entrega o teu caminho ao Senhor, confia nele, e ele agirá.', 'Salmo 37,5'],
  ['Eu bem sei os planos que tenho para vós: planos de paz, e não de desgraça, para vos dar um futuro e uma esperança.', 'Jeremias 29,11'],
  ['Pedi, e vos será dado; buscai, e achareis; batei, e vos será aberto.', 'Mateus 7,7'],
  ['Deus não nos deu um espírito de covardia, mas de fortaleza, de amor e de equilíbrio.', '2 Timóteo 1,7'],
  ['Sede alegres na esperança, pacientes na tribulação, perseverantes na oração.', 'Romanos 12,12'],
  ['Que a bondade do Senhor nosso Deus esteja sobre nós; confirma a obra das nossas mãos.', 'Salmo 90,17'],
  ['Confia ao Senhor as tuas obras, e os teus projetos se realizarão.', 'Provérbios 16,3'],
  ['O coração inteligente adquire conhecimento, e o ouvido dos sábios procura a ciência.', 'Provérbios 18,15'],
  ['O temor do Senhor é o princípio da sabedoria.', 'Provérbios 1,7'],
  ['Eu te instruirei e te mostrarei o caminho que deves seguir; com os olhos fixos em ti, te darei conselho.', 'Salmo 32,8'],
  ['Sede firmes e inabaláveis, progredindo sempre na obra do Senhor, pois sabeis que o vosso esforço não é vão no Senhor.', '1 Coríntios 15,58'],
  ['Corro para a meta, rumo ao prêmio da vocação que Deus nos faz em Cristo Jesus.', 'Filipenses 3,14'],
  ['Corramos com perseverança a corrida que nos é proposta.', 'Hebreus 12,1'],
  ['Para Deus nada é impossível.', 'Lucas 1,37'],
  ['Levanto os olhos para os montes: de onde virá o meu socorro? O meu socorro vem do Senhor, que fez o céu e a terra.', 'Salmo 121,1-2'],
  ['O começo da sabedoria é adquirir a sabedoria; com tudo o que possuis, adquire a inteligência.', 'Provérbios 4,7'],
  ['A explicação das tuas palavras ilumina e dá entendimento aos simples.', 'Salmo 119,130'],
  ['Os sábios brilharão como o esplendor do firmamento.', 'Daniel 12,3'],
];

export const getDailyVerse = (): [string, string] =>
  VERSES[Math.floor((Date.now() - new Date().getTimezoneOffset() * 6e4) / 864e5) % VERSES.length];

export const formatBytes = (bytes: number): string =>
  bytes > 1048576 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
