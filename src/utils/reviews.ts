import { DiscState, Edital, Topic } from '../types';
import { addD, getNextRecurringReviewDate, iso } from './formatters';

export type ReviewStatus = 'late' | 'today' | 'scheduled' | 'done';
export type ReviewKind = 'spaced' | 'periodic' | 'manual';

export interface ReviewItem {
  key: string;
  kind: ReviewKind;
  disciplineId: string;
  disciplineName: string;
  topicId: string;
  topicName: string;
  topic: Topic;
  studiedDate: string;
  intervalDays: number; // dias do intervalo (0 para revisões manuais)
  dueDate: string; // YYYY-MM-DD
  status: ReviewStatus;
  cycle?: number; // número do ciclo periódico
  customId?: string; // id da revisão manual
}

// Gera todas as revisões (feitas, programadas e atrasadas) dos editais informados.
// Fonte única para a aba Revisão e para o widget flutuante.
export const buildReviewItems = (eds: Edital[], ds: DiscState): ReviewItem[] => {
  const today = iso(new Date());
  const intervals = ds.intv || [7, 15, 30, 60];
  const maxInterval = intervals.length > 0 ? Math.max(...intervals) : 45;

  const statusOf = (done: boolean, due: string): ReviewStatus =>
    done ? 'done' : due < today ? 'late' : due === today ? 'today' : 'scheduled';

  const items: ReviewItem[] = [];

  eds.forEach((ed) =>
    (ed.list || []).forEach((d) =>
      (d.topics || []).forEach((t) => {
        const base = {
          disciplineId: d.id,
          disciplineName: d.name,
          topicId: t.id,
          topicName: t.name,
          topic: t,
        };

        if (t.studied) {
          const sd = t.studied;

          // Revisões espaçadas (1, 15, 30, 60 dias...)
          intervals.forEach((iv) => {
            const done = Boolean(t.r && t.r[iv]);
            const due = addD(sd, iv);
            items.push({
              ...base,
              key: `${t.id}-s${iv}`,
              kind: 'spaced',
              studiedDate: sd,
              intervalDays: iv,
              dueDate: due,
              status: statusOf(done, due),
            });
          });

          // Revisão periódica depois do último intervalo
          const periodDays = t.recurringDays || (ds.recurringEnabled ? ds.defaultRecurringDays || 30 : 0);
          if (periodDays > 0) {
            const recDates = [...(t.recurringDates || [])].sort();
            recDates.forEach((rd, i) =>
              items.push({
                ...base,
                key: `${t.id}-p${i + 1}`,
                kind: 'periodic',
                studiedDate: sd,
                intervalDays: periodDays,
                dueDate: rd,
                status: 'done',
                cycle: i + 1,
              })
            );

            const cycleDone = Boolean(t.r && t.r[maxInterval]) || today >= addD(sd, maxInterval);
            if (cycleDone) {
              const next = getNextRecurringReviewDate(sd, intervals, periodDays, t.recurringDates || []);
              items.push({
                ...base,
                key: `${t.id}-p${recDates.length + 1}`,
                kind: 'periodic',
                studiedDate: sd,
                intervalDays: periodDays,
                dueDate: next,
                status: statusOf(false, next),
                cycle: recDates.length + 1,
              });
            }
          }
        }

        // Revisões manuais (criadas em Disciplinas)
        (t.customReviews || []).forEach((cr) =>
          items.push({
            ...base,
            key: `${t.id}-m${cr.id}`,
            kind: 'manual',
            customId: cr.id,
            studiedDate: t.studied || cr.date,
            intervalDays: 0,
            dueDate: cr.date,
            status: statusOf(Boolean(cr.done), cr.date),
          })
        );
      })
    )
  );

  return items;
};
