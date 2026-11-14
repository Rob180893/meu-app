import { Topic } from '../types';

// Mark every subtopic of a topic as studied on `date`, or as not studied (null).
// Subtopics that already have a date keep it.
export const markTopicSubs = (t: Topic, date: string | null): Topic => {
  if (!t.subs || t.subs.length === 0) return t;
  return {
    ...t,
    subs: t.subs.map((sb) =>
      date
        ? { ...sb, studied: sb.studied || date, done: true }
        : { ...sb, studied: null, done: false }
    ),
  };
};

// Keep the topic in sync with its subtopics:
// - all subtopics done  -> the topic is done (date of the last subtopic) and its review starts
// - any subtopic pending -> the topic is not done (its review is cleared)
// Only the topic's date drives spaced review; subtopics never get review schedules.
export const syncTopicWithSubs = (t: Topic): Topic => {
  if (!t.subs || t.subs.length === 0) return t;

  const allDone = t.subs.every((sb) => !!sb.studied);
  if (allDone) {
    const latest = t.subs.map((sb) => sb.studied as string).sort().pop() as string;
    if (t.studied === latest) return t;
    return { ...t, studied: latest, r: {} };
  }

  if (t.studied) return { ...t, studied: null, r: {} };
  return t;
};
