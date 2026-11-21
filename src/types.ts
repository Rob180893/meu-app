export type NavTab = 'h' | 'q' | 'd' | 'v' | 'y' | 'm' | 'w' | 's';

export interface KanbanCard {
  id: string;
  text: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  cards: KanbanCard[];
}

export interface KanbanBoard {
  id: string;
  name: string;
  cols: KanbanColumn[];
}

export interface KanbanState {
  list: KanbanBoard[];
  sel: string;
}

export interface CustomReview {
  id: string;
  date: string;
  done?: boolean;
}

export interface TopicTypes {
  v?: boolean;
  p?: boolean;
  q?: boolean;
}

export interface SubTopic {
  id: string;
  name: string;
  studied: string | null;
  done?: boolean;
  videoTime?: string;
  pi?: number;
  pf?: number;
  h?: number;
  e?: number;
  q?: boolean;
  tp?: TopicTypes;
  link?: string;
  r?: Record<number, number>;
  pdfId?: string;
  pdfPagina?: number;
}

export interface Topic {
  id: string;
  name: string;
  g?: string;
  studied: string | null;
  q?: boolean;
  r?: Record<number, number>;
  h?: number;
  e?: number;
  pi?: number;
  pf?: number;
  videoTime?: string;
  tp?: TopicTypes;
  link?: string;
  subs?: SubTopic[];
  recurringDays?: number;
  recurringDates?: string[];
  customReviews?: CustomReview[];
  pdfId?: string;
  pdfPagina?: number;
}

export interface SessaoEstudo {
  id: string;
  date: string;
  seconds: number;
  acertos: number;
  erros: number;
  categoria: string;
  topicId?: string;
  subId?: string;
  oculto?: boolean; // oculto do histórico (continua na aba Observações)
  topico?: string;
  subtopico?: string;
  material: string;
  videoTitulo: string;
  videoInicio: string;
  videoFim: string;
  paginaInicial: number;
  paginaFinal: number;
  observacoes: string;
}

export interface Discipline {
  id: string;
  name: string;
  topics: Topic[];
  log?: Record<string, number>;
  sessoes?: SessaoEstudo[];
  qh?: number; // acertos registrados sem tópico
  qe?: number; // erros registrados sem tópico
}

export interface CycleItem {
  id: string;
  min: number;
}

export interface StudyCycle {
  id: string;
  name: string;
  items: CycleItem[];
  base: Record<string, number>;
  n: number;
}

export interface EditalDatas {
  inscricaoInicio?: string;
  inscricaoFim?: string;
  taxa?: string;
  prova?: string;
}

export interface Edital {
  id: string;
  name: string;
  datas?: EditalDatas;
  list: Discipline[];
  cycles?: StudyCycle[];
  csel?: string;
}

export interface WeekPlanItem {
  id: string;
  disciplineId: string;
  min: number;
}

export type WeekPlan = Record<string, WeekPlanItem[]>;

export interface ActiveRun {
  id: string;
  start: number | null;
  acc: number;
  day: string;
}

export interface ActivityLog {
  t: number;
  d: string;
  txt: string;
  s: number;
}

export interface DiscState {
  eds: Edital[];
  edsel: string;
  sel: string;
  intv: number[];
  acts: ActivityLog[];
  goals: { h: number; q: number };
  rem?: unknown[];
  qlog: Record<string, number>;
  run: ActiveRun | null;
  weekPlan?: WeekPlan;
  recurringEnabled?: boolean;
  defaultRecurringDays?: number;
}

export interface StudyLogPayload {
  disciplineId: string;
  topicId: string;
  subId?: string; // subtópico (opcional, dentro do tópico escolhido)
  date: string;
  seconds: number;
  category: string;
  material: string;
  correctQuestions: number;
  wrongQuestions: number;
  initialPage: number;
  finalPage: number;
  videoTitle: string;
  videoStart: string;
  videoEnd: string;
  comments: string;
  finishTheory: boolean;
  scheduleReviews: boolean;
}

export interface MaterialMeta {
  id: string;
  name: string;
  addedAt: number;
  size: number;
  disciplineId?: string; // matéria (disciplina) à qual o PDF pertence
}

export interface NormalizedRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Stroke {
  t: 'pen' | 'hl' | 'text' | 'rect';
  c: string;
  w: number;
  p: [number, number][];
  txt?: string;
  fs?: number;
  rects?: NormalizedRect[];
}

export type AnnotationsMap = Record<string, Stroke[]>;

export interface PdfOpenRequest {
  pdfId: string;
  pagina?: number;
  initialTool?: 'nav' | 'pen' | 'hl' | 'text';
  disciplineId?: string;
  topicId?: string;
  subId?: string;
}

export interface ReviewEntry {
  key: string;
  kind: 'spaced' | 'periodic' | 'manual';
  disciplineId: string;
  disciplineName: string;
  topicId: string;
  topicName: string;
  topic: Topic;
  studiedDate: string;
  intervalDays: number;
  dueDate: string;
  status: 'done' | 'late' | 'today' | 'scheduled';
  cycle?: number;
  customId?: string;
}
