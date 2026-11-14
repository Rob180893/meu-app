/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  ActiveRun,
  BoardsState,
  DiscState,
  Discipline,
} from './types';
import {
  exportAllDataJSON,
  exportAllTopicsCSV,
  KEY_NAV,
  KEY_THEME,
  loadBoardsFromStorage,
  loadDiscFromStorage,
  normalizeDiscState,
  saveBoardsToStorage,
  saveDiscToStorage,
} from './utils/storage';
import { iso } from './utils/formatters';
import { Header, TabKey } from './components/Header';
import { HomeView } from './components/HomeView';
import { KanbanView } from './components/KanbanView';
import { DisciplinesView } from './components/DisciplinesView';
import { CycleView } from './components/CycleView';
import { WeeklyPlanView } from './components/WeeklyPlanView';
import { StatsView } from './components/StatsView';
import { ReviewView } from './components/ReviewView';
import { markTopicSubs, syncTopicWithSubs } from './utils/topics';
import { FocusModal } from './components/FocusModal';
import { StudyRegisterModal } from './components/StudyRegisterModal';
import { FloatingReviewsWidget } from './components/FloatingReviewsWidget';
import { Toast } from './components/Toast';

export default function App() {
  // Navigation & Theme State (starts collapsed on all devices including PC)
  const [currentTab, setCurrentTab] = useState<TabKey>('h');
  const [isNavOpen, setIsNavOpen] = useState<boolean>(false);

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(KEY_THEME);
      if (stored) return stored === 'dark';
      return (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      );
    } catch {
      return false;
    }
  });

  // Data State
  const [boardsState, setBoardsState] = useState<BoardsState>(() => loadBoardsFromStorage());
  const [discState, setDiscState] = useState<DiscState>(() => loadDiscFromStorage());

  // Timer Tick State
  const [timerNow, setTimerNow] = useState<number>(Date.now());

  // Modals & Notifications
  const [isFocusModalOpen, setIsFocusModalOpen] = useState<boolean>(false);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Sync theme attribute on documentElement
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    try {
      localStorage.setItem(KEY_THEME, isDark ? 'dark' : 'light');
    } catch {}
  }, [isDark]);

  // Sync nav state to localStorage
  const handleToggleNav = () => {
    setIsNavOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEY_NAV, next ? '1' : '0');
      } catch {}
      return next;
    });
  };


  // Save changes to localStorage (everything stays on this device)
  useEffect(() => {
    saveBoardsToStorage(boardsState);
  }, [boardsState]);

  useEffect(() => {
    saveDiscToStorage(discState);
  }, [discState]);

  // Timer ticker every second
  useEffect(() => {
    const interval = setInterval(() => {
      if (discState.run?.start) {
        setTimerNow(Date.now());
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [discState.run?.start]);

  // Calculate current elapsed seconds for active run
  const activeRun = discState.run || null;
  const currentElapsedSeconds = activeRun
    ? Math.max(
        0,
        (activeRun.acc || 0) +
          (activeRun.start ? (timerNow - activeRun.start) / 1000 : 0)
      )
    : 0;

  // Toast helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 3500);
  };

  // Timer actions
  const handleStartSession = (disciplineId: string) => {
    setDiscState((prev) => {
      if (prev.run && prev.run.id === disciplineId) {
        if (!prev.run.start) {
          return {
            ...prev,
            run: { ...prev.run, start: Date.now() },
          };
        }
        return prev;
      }

      // If another session was running, accumulate it into its discipline log
      let updatedEds = prev.eds;
      if (prev.run) {
        const oldRun = prev.run;
        const totalOldSec =
          (oldRun.acc || 0) + (oldRun.start ? (Date.now() - oldRun.start) / 1000 : 0);
        const curDay = oldRun.day || iso(new Date());

        updatedEds = prev.eds.map((ed) => ({
          ...ed,
          list: ed.list.map((d) => {
            if (d.id !== oldRun.id) return d;
            const newLog = { ...(d.log || {}) };
            newLog[curDay] = (newLog[curDay] || 0) + totalOldSec;
            return { ...d, log: newLog };
          }),
        }));
      }

      const newRun: ActiveRun = {
        id: disciplineId,
        start: Date.now(),
        acc: 0,
        day: iso(new Date()),
      };

      return {
        ...prev,
        eds: updatedEds,
        run: newRun,
      };
    });
  };

  const handlePauseSession = () => {
    setDiscState((prev) => {
      if (!prev.run || !prev.run.start) return prev;
      const additional = (Date.now() - prev.run.start) / 1000;
      return {
        ...prev,
        run: {
          ...prev.run,
          acc: (prev.run.acc || 0) + additional,
          start: null,
        },
      };
    });
  };

  const handleCancelSession = () => {
    setDiscState((prev) => ({ ...prev, run: null }));
    showToast('Sessão cancelada.');
  };

  // Opening the register while a session is running: stop the clock first so the
  // elapsed time is stored in the session before the form reads it.
  const handleOpenRegister = () => {
    handlePauseSession();
    setIsRegisterModalOpen(true);
  };

  // Save session record (from modal)
  const handleSaveSessionData = (data: {
    disciplineId: string;
    topicId: string;
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
  }) => {
    const curEd = discState.eds.find((e) => e.id === discState.edsel) || discState.eds[0];
    const targetDiscipline = curEd?.list.find((d) => d.id === data.disciplineId);

    const parts: string[] = [data.category];
    if (data.topicId && targetDiscipline) {
      const topic = targetDiscipline.topics.find((t) => t.id === data.topicId);
      const sub = targetDiscipline.topics
        .flatMap((t) => t.subs || [])
        .find((sb) => sb.id === data.topicId);
      if (topic) parts.push(topic.name);
      else if (sub) parts.push(sub.name);
    }
    if (data.material) parts.push(`Material: ${data.material}`);
    if (data.correctQuestions || data.wrongQuestions) {
      parts.push(`${data.correctQuestions} acertos / ${data.wrongQuestions} erros`);
    }
    if (data.initialPage || data.finalPage) {
      parts.push(`págs. ${data.initialPage}–${data.finalPage}`);
    }
    if (data.videoTitle) {
      parts.push(`${data.videoTitle} (${data.videoStart || '00:00'}–${data.videoEnd || '00:00'})`);
    }
    if (data.comments) {
      parts.push(`“${data.comments}”`);
    }

    setDiscState((prev) => {
      const updatedEds = prev.eds.map((ed) => {
        if (ed.id !== prev.edsel) return ed;
        return {
          ...ed,
          list: ed.list.map((d) => {
            if (d.id !== data.disciplineId) return d;
            const newLog = { ...(d.log || {}) };
            newLog[data.date] = (newLog[data.date] || 0) + data.seconds;

            // Same stats rule for a topic or a subtopic
            const applyStats = (item: any) => {
              const newHits = (item.h || 0) + data.correctQuestions;
              const newErrors = (item.e || 0) + data.wrongQuestions;
              const shouldMarkStudied =
                (data.finishTheory || data.scheduleReviews) && !item.studied
                  ? data.date
                  : item.studied;

              return {
                ...item,
                h: newHits,
                e: newErrors,
                q: newHits + newErrors > 0 || item.q,
                pi: data.initialPage > 0 ? data.initialPage : item.pi,
                pf: data.finalPage > 0 ? data.finalPage : item.pf,
                studied: shouldMarkStudied,
              };
            };

            let updatedTopics = [...d.topics];
            if (data.topicId) {
              updatedTopics = d.topics.map((t) => {
                if (t.id === data.topicId) {
                  const stats = applyStats(t);
                  // Finishing a topic with subtopics finishes them too
                  const finished =
                    (data.finishTheory || data.scheduleReviews) && stats.studied
                      ? markTopicSubs(stats, stats.studied)
                      : stats;
                  return syncTopicWithSubs(finished);
                }
                if (t.subs?.some((sb) => sb.id === data.topicId)) {
                  return syncTopicWithSubs({
                    ...t,
                    subs: t.subs.map((sb) => (sb.id === data.topicId ? applyStats(sb) : sb)),
                  });
                }
                return t;
              });
            }

            return {
              ...d,
              log: newLog,
              topics: updatedTopics,
            };
          }),
        };
      });

      const newQlog = { ...(prev.qlog || {}) };
      if (data.correctQuestions || data.wrongQuestions) {
        newQlog[data.date] =
          (newQlog[data.date] || 0) + data.correctQuestions + data.wrongQuestions;
      }

      const newActivity = {
        t: Date.now(),
        d: data.disciplineId,
        txt: parts.join(' • '),
        s: data.seconds,
      };

      return {
        ...prev,
        eds: updatedEds,
        qlog: newQlog,
        acts: [...(prev.acts || []), newActivity],
        run: null,
      };
    });

    showToast('Estudo registrado com sucesso!');
  };

  // Check off review from floating widget or panel
  const handleCheckReview = (
    disciplineId: string,
    topicId: string,
    intervalDays: number,
    isRecurring?: boolean
  ) => {
    const today = iso(new Date());
    setDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) =>
        ed.list.some((d) => d.id === disciplineId)
          ? {
              ...ed,
              list: ed.list.map((d) =>
                d.id === disciplineId
                  ? {
                      ...d,
                      topics: d.topics.map((t) => {
                        if (t.id === topicId) {
                          if (isRecurring) {
                            return {
                              ...t,
                              recurringDates: [...(t.recurringDates || []), today],
                            };
                          }
                          return {
                            ...t,
                            r: { ...(t.r || {}), [intervalDays]: 1 },
                          };
                        }
                        // Also check subtopics
                        if (t.subs?.some((s) => s.id === topicId)) {
                          return {
                            ...t,
                            subs: t.subs.map((s) => {
                              if (s.id !== topicId) return s;
                              if (isRecurring) {
                                return {
                                  ...s,
                                  recurringDates: [...(s.recurringDates || []), today],
                                };
                              }
                              return {
                                ...s,
                                r: { ...(s.r || {}), [intervalDays]: 1 },
                              };
                            }),
                          };
                        }
                        return t;
                      }),
                    }
                  : d
              ),
            }
          : ed
      ),
    }));
    showToast(
      isRecurring
        ? `Revisão periódica de ${intervalDays} dias concluída! ✓`
        : 'Revisão marcada como concluída! ✓'
    );
  };

  // Import JSON Backup
  // Marca/desmarca uma revisão manual (criada em Disciplinas)
  const handleToggleManualReview = (
    disciplineId: string,
    topicId: string,
    customId: string,
    done: boolean
  ) => {
    setDiscState((prev) => ({
      ...prev,
      eds: prev.eds.map((ed) => ({
        ...ed,
        list: ed.list.map((d) =>
          d.id !== disciplineId
            ? d
            : {
                ...d,
                topics: d.topics.map((t) =>
                  t.id !== topicId
                    ? t
                    : {
                        ...t,
                        customReviews: (t.customReviews || []).map((cr) =>
                          cr.id === customId ? { ...cr, done } : cr
                        ),
                      }
                ),
              }
        ),
      })),
    }));
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (
          !parsed ||
          parsed.app !== 'quadro-estudos' ||
          !parsed.boards ||
          !parsed.disc
        ) {
          throw new Error('Formato inválido');
        }

        const normalizedBoards = parsed.boards;
        const normalizedDisc = normalizeDiscState(parsed.disc);

        setBoardsState(normalizedBoards);
        setDiscState(normalizedDisc);
        showToast('Backup importado com sucesso!');
      } catch (err) {
        showToast('Arquivo inválido. Certifique-se de usar um backup exportado por este aplicativo.');
      }
    };
    reader.readAsText(file);
  };

  // Online / offline awareness
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  return (
    <div className="min-h-screen flex text-slate-800 dark:text-slate-100 transition-colors">
      {/* Sidebar Navigation */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpen={isNavOpen}
        onToggleOpen={handleToggleNav}
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        onExportJSON={() => exportAllDataJSON(boardsState, discState)}
        onExportCSV={() => exportAllTopicsCSV(discState)}
        onImportJSON={handleImportJSON}
      />

      {/* Main Content Area */}
      <main className="flex-1 transition-all duration-300 min-w-0 px-4 sm:px-6 lg:px-8 py-5 pb-24 pt-16 sm:pt-16">
        <div className="max-w-7xl mx-auto">
          {currentTab === 'h' && (
            <HomeView
              discState={discState}
              onUpdateDiscState={setDiscState}
              onNavigateToDiscipline={(dId) => {
                setDiscState((prev) => ({ ...prev, sel: dId }));
                setCurrentTab('d');
              }}
              onToast={showToast}
              currentElapsedSeconds={currentElapsedSeconds}
              onOpenRegisterModal={handleOpenRegister}
            />
          )}

          {currentTab === 'q' && (
            <KanbanView
              boardsState={boardsState}
              onUpdateBoards={setBoardsState}
              onToast={showToast}
            />
          )}

          {currentTab === 'd' && (
            <DisciplinesView
              discState={discState}
              onUpdateDiscState={setDiscState}
              activeRun={activeRun}
              onStartSession={handleStartSession}
              onPauseSession={handlePauseSession}
              onCancelSession={handleCancelSession}
              onOpenRegisterModal={handleOpenRegister}
              onToast={showToast}
              currentElapsedSeconds={currentElapsedSeconds}
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

          {currentTab === 'v' && (
            <ReviewView
              discState={discState}
              onCheckReview={handleCheckReview}
              onToggleManualReview={handleToggleManualReview}
            />
          )}

          {currentTab === 'w' && (
            <WeeklyPlanView
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

      {/* Floating Action Button (FAB ⏱) for Focus & Stopwatch */}
      <button
        onClick={() => setIsFocusModalOpen(true)}
        className="fixed right-4 sm:right-6 bottom-4 sm:bottom-6 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white shadow-xl hover:scale-105 active:scale-95 transition flex items-center justify-center text-2xl font-bold cursor-pointer"
        title="Abrir cronômetro de estudo e modo foco"
      >
        ⏱
      </button>

      {/* Floating Spaced Reviews Widget (🔔) */}
      <FloatingReviewsWidget
        discState={discState}
        onCheckReview={handleCheckReview}
        onNavigateToDiscipline={(dId) => {
          setDiscState((prev) => ({ ...prev, sel: dId }));
          setCurrentTab('d');
        }}
      />

      {!isOnline && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full bg-slate-800 text-white text-[11px] font-semibold shadow-lg">
          Sem internet • seus dados continuam salvos neste aparelho
        </div>
      )}

      {/* Focus / Pomodoro Modal */}
      <FocusModal
        isOpen={isFocusModalOpen}
        onClose={() => setIsFocusModalOpen(false)}
        discState={discState}
        activeRun={activeRun}
        onStartSession={handleStartSession}
        onPauseSession={handlePauseSession}
        onCancelSession={handleCancelSession}
        onOpenRegisterModal={handleOpenRegister}
        currentElapsedSeconds={currentElapsedSeconds}
      />

      {/* Study Register Modal */}
      <StudyRegisterModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        discState={discState}
        activeRun={activeRun}
        onSaveSession={handleSaveSessionData}
      />

      {/* Toast Feedback Notification */}
      <Toast message={toastMessage} />
    </div>
  );
}
