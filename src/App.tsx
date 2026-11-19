import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Timer, WifiOff } from 'lucide-react';
import { CycleView } from './components/CycleView';
import { CycleAlertToast, playAlertChime, type CycleAlertInfo } from './components/CycleAlertToast';
import { DisciplinesView } from './components/DisciplinesView';
import { FloatingReviews } from './components/FloatingReviews';
import { HomeView } from './components/HomeView';
import { KanbanView } from './components/KanbanView';
import { MaterialsView } from './components/MaterialsView';
import { PdfViewer } from './components/PdfViewer';
import { RegisterModal } from './components/RegisterModal';
import { ReviewsView } from './components/ReviewsView';
import { Sidebar } from './components/Sidebar';
import { StatsView } from './components/StatsView';
import { TimerModal } from './components/TimerModal';
import { Toast } from './components/Toast';
import { WeekPlanView } from './components/WeekPlanView';
import type { DiscState, KanbanState, NavTab, PdfOpenRequest, StudyLogPayload } from './types';
import { formatHMS, todayStr } from './utils/date';
import {
  exportBackupJSON,
  exportTopicsCSV,
  importAllMaterials,
  loadBoards,
  loadDiscState,
  LS_NAV,
  LS_THEME,
  normalizeDiscState,
  saveBoards,
  saveDiscState,
  type MaterialBackupEntry,
} from './utils/storage';

const VALID_TABS: NavTab[] = ['h', 'q', 'd', 'v', 'y', 'm', 'w', 's'];

export default function App() {
  const [boards, setBoards] = useState<KanbanState>(() => loadBoards());
  const [discState, setDiscState] = useState<DiscState>(() => loadDiscState());

  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    try {
      const saved = localStorage.getItem(LS_NAV) as NavTab | null;
      return saved && VALID_TABS.includes(saved) ? saved : 'h';
    } catch {
      return 'h';
    }
  });

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(LS_THEME);
      if (saved === 'dark') return true;
      if (saved === 'light') return false;
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
    } catch {
      return false;
    }
  });

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [cycleAlert, setCycleAlert] = useState<CycleAlertInfo | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  const [registerModal, setRegisterModal] = useState<{
    open: boolean;
    disciplineId?: string;
    seconds?: number;
  }>({ open: false });
  const [pdfViewer, setPdfViewer] = useState<PdfOpenRequest | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [tickNow, setTickNow] = useState<number>(() => Date.now());

  const toastTimerRef = useRef<number | null>(null);
  const alertedCycleRef = useRef<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3500);
  }, []);

  useEffect(() => {
    saveBoards(boards);
  }, [boards]);

  useEffect(() => {
    saveDiscState(discState);
  }, [discState]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_NAV, currentTab);
    } catch {
      // Ignore storage error
    }
  }, [currentTab]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem(LS_THEME, isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage error
    }
  }, [isDark]);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!discState.run?.start) return;
    const id = window.setInterval(() => setTickNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [discState.run?.start]);

  const activeRun = discState.run;
  const currentElapsedSeconds = activeRun
    ? activeRun.acc + (activeRun.start ? Math.max(0, Math.floor((tickNow - activeRun.start) / 1000)) : 0)
    : 0;

  // Alerta de conclusão da meta do ciclo ativo para a disciplina atual
  useEffect(() => {
    if (!activeRun || !activeRun.start) {
      alertedCycleRef.current = null;
      return;
    }
    const edital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
    const cycle = edital?.cycles?.find((c) => c.id === edital.csel) || edital?.cycles?.[0];
    if (!cycle) return;
    const item = cycle.items.find((i) => i.id === activeRun.id);
    if (!item || item.min <= 0) return;

    const disc = edital.list.find((d) => d.id === activeRun.id);
    if (!disc) return;

    const logged = Object.values(disc.log || {}).reduce((acc, s) => acc + s, 0);
    const base = cycle.base?.[disc.id] || 0;
    const inCycleSec = Math.max(0, logged + currentElapsedSeconds - base);
    const targetSec = item.min * 60;
    const alertKey = `${cycle.id}-${cycle.n}-${disc.id}`;

    if (inCycleSec >= targetSec && alertedCycleRef.current !== alertKey) {
      alertedCycleRef.current = alertKey;
      playAlertChime();
      setCycleAlert({
        title: `Meta concluída: ${disc.name}`,
        subtitle: `Você atingiu os ${item.min} min programados no ciclo ${cycle.name}.`,
      });
    }
  }, [activeRun, currentElapsedSeconds, discState.eds, discState.edsel]);

  const handleStartSession = useCallback((discId: string) => {
    const now = Date.now();
    setTickNow(now);
    setDiscState((prev) => {
      const current = prev.run;
      if (current && current.id === discId) {
        if (current.start) return prev;
        return { ...prev, run: { ...current, start: now } };
      }
      return {
        ...prev,
        run: {
          id: discId,
          start: now,
          acc: 0,
          day: todayStr(),
        },
      };
    });
  }, []);

  const handlePauseSession = useCallback(() => {
    const now = Date.now();
    setDiscState((prev) => {
      if (!prev.run || !prev.run.start) return prev;
      const elapsed = Math.max(0, Math.floor((now - prev.run.start) / 1000));
      return {
        ...prev,
        run: {
          ...prev.run,
          acc: prev.run.acc + elapsed,
          start: null,
        },
      };
    });
  }, []);

  const handleCancelSession = useCallback(() => {
    setDiscState((prev) => ({ ...prev, run: null }));
  }, []);

  const handleSaveStudyLog = useCallback(
    (payload: StudyLogPayload) => {
      const today = payload.date || todayStr();
      const totalQuestions = payload.correctQuestions + payload.wrongQuestions;

      setDiscState((prev) => {
        const nextEds = prev.eds.map((ed) => {
          if (ed.id !== prev.edsel && !ed.list.some((d) => d.id === payload.disciplineId)) {
            return ed;
          }
          return {
            ...ed,
            list: ed.list.map((disc) => {
              if (disc.id !== payload.disciplineId) return disc;
              const nextLog = { ...(disc.log || {}) };
              if (payload.seconds > 0) {
                nextLog[today] = (nextLog[today] || 0) + payload.seconds;
              }
              const nextTopics = payload.topicId
                ? disc.topics.map((t) => {
                    if (t.id !== payload.topicId) return t;
                    const updated = { ...t };
                    if (payload.correctQuestions > 0) {
                      updated.h = (updated.h || 0) + payload.correctQuestions;
                    }
                    if (payload.wrongQuestions > 0) {
                      updated.e = (updated.e || 0) + payload.wrongQuestions;
                    }
                    if (totalQuestions > 0) updated.q = true;
                    if (payload.initialPage > 0) updated.pi = payload.initialPage;
                    if (payload.finalPage > 0) updated.pf = payload.finalPage;
                    if (payload.finishTheory) {
                      updated.studied = payload.scheduleReviews ? today : updated.studied || today;
                      if (payload.scheduleReviews) updated.r = {};
                    }
                    return updated;
                  })
                : disc.topics;
              return { ...disc, log: nextLog, topics: nextTopics };
            }),
          };
        });

        const nextQlog = { ...(prev.qlog || {}) };
        if (totalQuestions > 0) {
          nextQlog[today] = (nextQlog[today] || 0) + totalQuestions;
        }

        const discName =
          nextEds.flatMap((e) => e.list).find((d) => d.id === payload.disciplineId)?.name ||
          'Disciplina';

        const summaryParts = [discName];
        if (payload.category) summaryParts.push(payload.category);
        if (payload.seconds > 0) summaryParts.push(formatHMS(payload.seconds));
        if (totalQuestions > 0) {
          summaryParts.push(`${payload.correctQuestions}/${totalQuestions} questões`);
        }

        const nextActs = [
          {
            t: Date.now(),
            d: today,
            txt: summaryParts.join(' · '),
            s: payload.seconds,
          },
          ...(prev.acts || []),
        ].slice(0, 200);

        const clearRun = prev.run && prev.run.id === payload.disciplineId ? null : prev.run;

        return {
          ...prev,
          eds: nextEds,
          qlog: nextQlog,
          acts: nextActs,
          run: clearRun,
        };
      });

      setRegisterModal({ open: false });
      showToast('Sessão de estudo registrada!');
    },
    [showToast]
  );

  const handleCheckReview = useCallback(
    (discId: string, topicId: string, intervalDays: number, isPeriodic: boolean) => {
      const today = todayStr();
      setDiscState((prev) => ({
        ...prev,
        eds: prev.eds.map((ed) => ({
          ...ed,
          list: ed.list.map((disc) =>
            disc.id !== discId
              ? disc
              : {
                  ...disc,
                  topics: disc.topics.map((topic) => {
                    if (topic.id !== topicId) return topic;
                    if (isPeriodic) {
                      const nextDates = [...(topic.recurringDates || []), today];
                      return { ...topic, recurringDates: nextDates };
                    }
                    return {
                      ...topic,
                      r: { ...(topic.r || {}), [intervalDays]: 1 },
                    };
                  }),
                }
          ),
        })),
      }));
      showToast('Revisão marcada como concluída!');
    },
    [showToast]
  );

  const handleToggleManualReview = useCallback(
    (discId: string, topicId: string, customId: string, done: boolean) => {
      setDiscState((prev) => ({
        ...prev,
        eds: prev.eds.map((ed) => ({
          ...ed,
          list: ed.list.map((disc) =>
            disc.id !== discId
              ? disc
              : {
                  ...disc,
                  topics: disc.topics.map((topic) =>
                    topic.id !== topicId
                      ? topic
                      : {
                          ...topic,
                          customReviews: (topic.customReviews || []).map((cr) =>
                            cr.id === customId ? { ...cr, done } : cr
                          ),
                        }
                  ),
                }
          ),
        })),
      }));
      showToast(done ? 'Revisão concluída!' : 'Revisão reaberta.');
    },
    [showToast]
  );

  const handleExportJSON = useCallback(async () => {
    try {
      await exportBackupJSON(boards, discState);
      showToast('Backup JSON exportado!');
    } catch (err) {
      console.error(err);
      showToast('Não foi possível exportar o backup.');
    }
  }, [boards, discState, showToast]);

  const handleExportCSV = useCallback(() => {
    exportTopicsCSV(discState);
    showToast('Planilha CSV exportada!');
  }, [discState, showToast]);

  const handleImportJSON = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as {
          app?: string;
          boards?: KanbanState;
          disc?: unknown;
          materiais?: MaterialBackupEntry[];
        };
        if (data.boards && Array.isArray(data.boards.list)) {
          setBoards(data.boards);
        }
        if (data.disc) {
          setDiscState(normalizeDiscState(data.disc));
        }
        let pdfCount = 0;
        if (Array.isArray(data.materiais) && data.materiais.length > 0) {
          pdfCount = await importAllMaterials(data.materiais);
        }
        showToast(
          pdfCount > 0
            ? `Backup importado com ${pdfCount} PDF(s)!`
            : 'Backup restaurado com sucesso!'
        );
      } catch (err) {
        console.error(err);
        showToast('Arquivo JSON inválido ou incompatível.');
      }
    },
    [showToast]
  );

  const activeEdital = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
  const activeRunDiscipline = activeRun
    ? discState.eds.flatMap((e) => e.list).find((d) => d.id === activeRun.id)
    : undefined;

  return (
    <div className="min-h-screen flex app-shell text-slate-900 dark:text-slate-100">
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={sidebarOpen}
        onToggleOpen={() => setSidebarOpen((v) => !v)}
        isDark={isDark}
        onToggleTheme={() => setIsDark((v) => !v)}
        onExportJSON={handleExportJSON}
        onExportCSV={handleExportCSV}
        onImportJSON={handleImportJSON}
      />

      <main className="flex-1 min-w-0 flex flex-col">
        {isOffline && (
          <div className="px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center gap-2">
            <WifiOff className="w-3.5 h-3.5" />
            <span>Modo offline ativo — seus dados e PDFs continuam salvos localmente.</span>
          </div>
        )}

        <div className="flex-1 px-4 sm:px-6 lg:px-8 py-5 sm:py-7">
          {currentTab === 'h' && (
            <HomeView
              discState={discState}
              onUpdateDiscState={setDiscState}
              onNavigateToDiscipline={(discId) => {
                setDiscState((prev) => ({ ...prev, sel: discId }));
                setCurrentTab('d');
              }}
              currentElapsedSeconds={currentElapsedSeconds}
              onOpenRegisterModal={() =>
                setRegisterModal({
                  open: true,
                  disciplineId: activeRun?.id || discState.sel,
                  seconds: currentElapsedSeconds,
                })
              }
            />
          )}

          {currentTab === 'q' && (
            <KanbanView boardsState={boards} onUpdateBoards={setBoards} onToast={showToast} />
          )}

          {currentTab === 'd' && (
            <DisciplinesView
              discState={discState}
              onUpdateDiscState={setDiscState}
              activeRun={activeRun}
              onStartSession={handleStartSession}
              onPauseSession={handlePauseSession}
              onCancelSession={handleCancelSession}
              onOpenRegisterModal={() =>
                setRegisterModal({
                  open: true,
                  disciplineId: activeRun?.id || discState.sel,
                  seconds: currentElapsedSeconds,
                })
              }
              onAbrirPdf={(req) => setPdfViewer(req)}
              onToast={showToast}
              currentElapsedSeconds={currentElapsedSeconds}
            />
          )}

          {currentTab === 'v' && (
            <ReviewsView
              discState={discState}
              onCheckReview={handleCheckReview}
              onToggleManualReview={handleToggleManualReview}
            />
          )}

          {currentTab === 'y' && (
            <CycleView
              discState={discState}
              onUpdateDiscState={setDiscState}
              activeRun={activeRun}
              onToast={showToast}
              currentElapsedSeconds={currentElapsedSeconds}
            />
          )}

          {currentTab === 'm' && (
            <MaterialsView
              discState={discState}
              onUpdateDiscState={setDiscState}
              onAbrirPdf={(pdfId, pagina = 1) => setPdfViewer({ pdfId, pagina })}
              onToast={showToast}
            />
          )}

          {currentTab === 'w' && (
            <WeekPlanView
              discState={discState}
              onUpdateDiscState={setDiscState}
              onToast={showToast}
            />
          )}

          {currentTab === 's' && (
            <StatsView
              discState={discState}
              activeRun={activeRun}
              currentElapsedSeconds={currentElapsedSeconds}
            />
          )}
        </div>
      </main>

      {/* Botão flutuante do Cronômetro */}
      <button
        type="button"
        onClick={() => setTimerOpen(true)}
        className={`fixed bottom-4 left-4 lg:left-auto lg:right-4 lg:bottom-20 z-[55] px-4 py-3 rounded-2xl shadow-xl border flex items-center gap-2.5 transition cursor-pointer ${
          activeRun?.start
            ? 'bg-blue-600 text-white border-blue-500 hover:bg-blue-700'
            : 'bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
        }`}
        title="Abrir Cronômetro de Estudos"
      >
        <Timer className="w-4 h-4 shrink-0" />
        <span className="font-mono text-xs font-extrabold tabular-nums">
          {activeRun ? formatHMS(currentElapsedSeconds) : 'Cronômetro'}
        </span>
        {activeRunDiscipline && (
          <span className="hidden sm:inline text-[11px] font-semibold opacity-85 max-w-[110px] truncate">
            · {activeRunDiscipline.name}
          </span>
        )}
      </button>

      {currentTab !== 'v' && (
        <FloatingReviews
          discState={discState}
          onCheckReview={handleCheckReview}
          onToggleManualReview={handleToggleManualReview}
          onGoToReviews={() => setCurrentTab('v')}
        />
      )}

      <TimerModal
        isOpen={timerOpen}
        onClose={() => setTimerOpen(false)}
        discState={discState}
        activeRun={activeRun}
        currentElapsedSeconds={currentElapsedSeconds}
        onStartSession={handleStartSession}
        onPauseSession={handlePauseSession}
        onCancelSession={handleCancelSession}
        onOpenRegisterFromTimer={(discId, seconds) => {
          setTimerOpen(false);
          setRegisterModal({ open: true, disciplineId: discId, seconds });
        }}
      />

      <RegisterModal
        isOpen={registerModal.open}
        onClose={() => setRegisterModal({ open: false })}
        discState={discState}
        initialDisciplineId={registerModal.disciplineId || activeEdital?.list[0]?.id}
        initialSeconds={registerModal.seconds ?? 0}
        onSave={handleSaveStudyLog}
      />

      {pdfViewer && (
        <PdfViewer
          pdfId={pdfViewer.pdfId}
          paginaInicial={pdfViewer.pagina}
          initialTool={pdfViewer.initialTool}
          contextLabel={(() => {
            if (!pdfViewer.topicId) return undefined;
            const d = activeEdital?.list.find((item) => item.id === pdfViewer.disciplineId);
            const t = d?.topics.find((item) => item.id === pdfViewer.topicId);
            const s = pdfViewer.subId ? t?.subs?.find((item) => item.id === pdfViewer.subId) : undefined;
            if (!d || !t) return undefined;
            return s ? `${d.name} · ${t.name} › ${s.name}` : `${d.name} · ${t.name}`;
          })()}
          disciplines={activeEdital?.list.map((d) => ({ id: d.id, name: d.name })) || []}
          defaultDisciplineId={pdfViewer.disciplineId || activeEdital?.list[0]?.id}
          activeRun={activeRun}
          currentElapsedSeconds={currentElapsedSeconds}
          onStartSession={handleStartSession}
          onPauseSession={handlePauseSession}
          onCancelSession={handleCancelSession}
          onRegisterFromPdf={(discId, seconds) => {
            setPdfViewer(null);
            setRegisterModal({ open: true, disciplineId: discId, seconds });
          }}
          onPageProgress={
            pdfViewer.topicId
              ? (page) => {
                  const targetTopicId = pdfViewer.topicId;
                  const targetSubId = pdfViewer.subId;
                  setDiscState((prev) => {
                    let changed = false;
                    const nextEds = prev.eds.map((ed) => ({
                      ...ed,
                      list: ed.list.map((disc) => ({
                        ...disc,
                        topics: disc.topics.map((t) => {
                          if (t.id !== targetTopicId) return t;
                          if (targetSubId) {
                            return {
                              ...t,
                              subs: (t.subs || []).map((s) => {
                                if (s.id !== targetSubId || s.pdfPagina === page) return s;
                                changed = true;
                                return { ...s, pdfPagina: page };
                              }),
                            };
                          }
                          if (t.pdfPagina === page) return t;
                          changed = true;
                          return { ...t, pdfPagina: page };
                        }),
                      })),
                    }));
                    return changed ? { ...prev, eds: nextEds } : prev;
                  });
                }
              : undefined
          }
          onApplyPageEnd={
            pdfViewer.topicId
              ? (pageEnd) => {
                  const targetTopicId = pdfViewer.topicId;
                  const targetSubId = pdfViewer.subId;
                  setDiscState((prev) => ({
                    ...prev,
                    eds: prev.eds.map((ed) => ({
                      ...ed,
                      list: ed.list.map((disc) => ({
                        ...disc,
                        topics: disc.topics.map((t) => {
                          if (t.id !== targetTopicId) return t;
                          if (targetSubId) {
                            return {
                              ...t,
                              subs: (t.subs || []).map((s) =>
                                s.id === targetSubId
                                  ? { ...s, pi: s.pi || 1, pf: pageEnd, pdfPagina: pageEnd }
                                  : s
                              ),
                            };
                          }
                          return { ...t, pi: t.pi || 1, pf: pageEnd, pdfPagina: pageEnd };
                        }),
                      })),
                    })),
                  }));
                  showToast(`Página final (${pageEnd}) aplicada ao tópico!`);
                }
              : undefined
          }
          onFechar={() => setPdfViewer(null)}
        />
      )}

      <CycleAlertToast alert={cycleAlert} onDismiss={() => setCycleAlert(null)} />
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />
    </div>
  );
}
