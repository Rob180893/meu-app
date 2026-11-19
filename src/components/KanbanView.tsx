import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, GripVertical, Pen, Plus, X } from 'lucide-react';
import type { KanbanCard, KanbanColumn, KanbanState } from '../types';
import { uid } from '../utils/date';

interface KanbanViewProps {
  boardsState: KanbanState;
  onUpdateBoards: React.Dispatch<React.SetStateAction<KanbanState>>;
  onToast: (msg: string) => void;
}

export const KanbanView: React.FC<KanbanViewProps> = ({
  boardsState,
  onUpdateBoards,
  onToast,
}) => {
  const activeBoard = boardsState.list.find((b) => b.id === boardsState.sel) || boardsState.list[0];
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [boardNameInput, setBoardNameInput] = useState('');
  const [newCardInputs, setNewCardInputs] = useState<Record<string, string>>({});
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingCardText, setEditingCardText] = useState('');
  const [draggedCard, setDraggedCard] = useState<{ cardId: string; sourceColId: string } | null>(
    null
  );
  const [draggedColId, setDraggedColId] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');

  const addBoard = (name: string) => {
    if (boardsState.list.length >= 8) {
      onToast('Limite máximo de 8 quadros atingido.');
      return;
    }
    const clean = name.trim() || `Quadro ${boardsState.list.length + 1}`;
    const newBoard = {
      id: uid(),
      name: clean,
      cols: [
        { id: uid(), title: 'A fazer', cards: [] },
        { id: uid(), title: 'Em andamento', cards: [] },
        { id: uid(), title: 'Concluído', cards: [] },
      ],
    };
    onUpdateBoards((prev) => ({ list: [...prev.list, newBoard], sel: newBoard.id }));
    setNewBoardName('');
    onToast(`Quadro "${clean}" criado.`);
  };

  const commitRenameBoard = () => {
    if (boardNameInput.trim()) {
      onUpdateBoards((prev) => ({
        ...prev,
        list: prev.list.map((b) =>
          b.id === activeBoard.id ? { ...b, name: boardNameInput.trim() } : b
        ),
      }));
    }
    setRenamingBoard(false);
  };

  const deleteBoard = () => {
    if (boardsState.list.length <= 1) return;
    if (!window.confirm(`Tem certeza que deseja excluir o quadro "${activeBoard.name}"?`)) return;
    onUpdateBoards((prev) => {
      const remaining = prev.list.filter((b) => b.id !== activeBoard.id);
      return { list: remaining, sel: remaining[0].id };
    });
    onToast('Quadro excluído.');
  };

  const addColumn = (title: string) => {
    if (activeBoard.cols.length >= 8) {
      onToast('Limite de 8 colunas atingido.');
      return;
    }
    const clean = title.trim();
    if (!clean) return;
    const col: KanbanColumn = { id: uid(), title: clean, cards: [] };
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) =>
        b.id === activeBoard.id ? { ...b, cols: [...b.cols, col] } : b
      ),
    }));
  };

  const renameColumn = (colId: string, title: string) => {
    const clean = title.trim();
    if (!clean) return;
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) =>
        b.id === activeBoard.id
          ? { ...b, cols: b.cols.map((c) => (c.id === colId ? { ...c, title: clean } : c)) }
          : b
      ),
    }));
  };

  const deleteColumn = (col: KanbanColumn) => {
    if (
      col.cards.length > 0 &&
      !window.confirm(`A coluna "${col.title}" contém ${col.cards.length} cartões. Deseja excluir mesmo assim?`)
    ) {
      return;
    }
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) =>
        b.id === activeBoard.id ? { ...b, cols: b.cols.filter((c) => c.id !== col.id) } : b
      ),
    }));
  };

  const addCards = (colId: string, text: string) => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    const cards: KanbanCard[] = lines.map((l) => ({ id: uid(), text: l }));
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) =>
        b.id === activeBoard.id
          ? {
              ...b,
              cols: b.cols.map((c) =>
                c.id === colId ? { ...c, cards: [...c.cards, ...cards] } : c
              ),
            }
          : b
      ),
    }));
    setNewCardInputs((prev) => ({ ...prev, [colId]: '' }));
  };

  const stepCard = (fromIdx: number, toIdx: number, card: KanbanCard) => {
    if (toIdx < 0 || toIdx >= activeBoard.cols.length) return;
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) => {
        if (b.id !== activeBoard.id) return b;
        const cols = b.cols.map((c) => ({ ...c, cards: [...c.cards] }));
        cols[fromIdx].cards = cols[fromIdx].cards.filter((c) => c.id !== card.id);
        cols[toIdx].cards.push(card);
        return { ...b, cols };
      }),
    }));
  };

  const removeCard = (colId: string, cardId: string) => {
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) =>
        b.id === activeBoard.id
          ? {
              ...b,
              cols: b.cols.map((c) =>
                c.id === colId ? { ...c, cards: c.cards.filter((x) => x.id !== cardId) } : c
              ),
            }
          : b
      ),
    }));
  };

  const saveEditCard = (colId: string, cardId: string) => {
    if (editingCardText.trim()) {
      onUpdateBoards((prev) => ({
        ...prev,
        list: prev.list.map((b) =>
          b.id === activeBoard.id
            ? {
                ...b,
                cols: b.cols.map((c) =>
                  c.id === colId
                    ? {
                        ...c,
                        cards: c.cards.map((x) =>
                          x.id === cardId ? { ...x, text: editingCardText.trim() } : x
                        ),
                      }
                    : c
                ),
              }
            : b
        ),
      }));
    }
    setEditingCardId(null);
  };

  const handleDropCard = (targetColId: string, targetIndex?: number) => {
    if (!draggedCard) return;
    const { cardId, sourceColId } = draggedCard;
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) => {
        if (b.id !== activeBoard.id) return b;
        const cols = b.cols.map((c) => ({ ...c, cards: [...c.cards] }));
        const src = cols.find((c) => c.id === sourceColId);
        const dst = cols.find((c) => c.id === targetColId);
        if (!src || !dst) return b;
        const idx = src.cards.findIndex((c) => c.id === cardId);
        if (idx < 0) return b;
        const [item] = src.cards.splice(idx, 1);
        if (targetIndex !== undefined && targetIndex >= 0) {
          dst.cards.splice(targetIndex, 0, item);
        } else {
          dst.cards.push(item);
        }
        return { ...b, cols };
      }),
    }));
    setDraggedCard(null);
  };

  const handleDropColumn = (targetColId: string) => {
    if (!draggedColId || draggedColId === targetColId) return;
    onUpdateBoards((prev) => ({
      ...prev,
      list: prev.list.map((b) => {
        if (b.id !== activeBoard.id) return b;
        const cols = [...b.cols];
        const from = cols.findIndex((c) => c.id === draggedColId);
        const to = cols.findIndex((c) => c.id === targetColId);
        if (from < 0 || to < 0) return b;
        const [moved] = cols.splice(from, 1);
        cols.splice(to, 0, moved);
        return { ...b, cols };
      }),
    }));
    setDraggedColId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200/60 dark:border-slate-800/60">
        {boardsState.list.map((board) => {
          const active = board.id === activeBoard.id;
          return (
            <div key={board.id} className="relative">
              {active && renamingBoard ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={boardNameInput}
                    autoFocus
                    onChange={(e) => setBoardNameInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRenameBoard();
                      if (e.key === 'Escape') setRenamingBoard(false);
                    }}
                    onBlur={commitRenameBoard}
                    className="px-3 py-1.5 rounded-xl border border-blue-500 bg-white dark:bg-slate-800 text-xs font-bold outline-none"
                  />
                </div>
              ) : (
                <div className="flex items-center">
                  <button
                    type="button"
                    onClick={() => onUpdateBoards((prev) => ({ ...prev, sel: board.id }))}
                    onDoubleClick={() => {
                      if (active) {
                        setBoardNameInput(board.name);
                        setRenamingBoard(true);
                      }
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-white/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700'
                    }`}
                  >
                    {board.name}
                  </button>
                  {active && (
                    <div className="flex items-center ml-1 gap-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setBoardNameInput(board.name);
                          setRenamingBoard(true);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 cursor-pointer"
                        title="Renomear quadro"
                      >
                        <Pen className="w-3.5 h-3.5" />
                      </button>
                      {boardsState.list.length > 1 && (
                        <button
                          type="button"
                          onClick={deleteBoard}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Excluir quadro"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {boardsState.list.length < 8 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addBoard(newBoardName);
            }}
            className="flex items-center gap-1 ml-auto"
          >
            <input
              type="text"
              placeholder="+ Novo quadro"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              className="w-32 px-3 py-1.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-800/60 text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="p-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              title="Criar quadro"
            >
              <Plus className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {activeBoard.cols.map((col, colIdx) => (
          <div
            key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDropCard(col.id)}
            className="w-72 shrink-0 rounded-2xl bg-slate-100/90 dark:bg-slate-900/70 border border-slate-200/80 dark:border-slate-800 flex flex-col max-h-[calc(100vh-11rem)] shadow-sm"
          >
            <div
              draggable
              onDragStart={(e) => {
                setDraggedColId(col.id);
                e.dataTransfer.setData('text/plain', col.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.stopPropagation();
                handleDropColumn(col.id);
              }}
              className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200/60 dark:border-slate-800 cursor-grab active:cursor-grabbing select-none"
            >
              <GripVertical className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                defaultValue={col.title}
                onBlur={(e) => renameColumn(col.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur();
                }}
                className="font-bold text-xs uppercase tracking-wider text-slate-800 dark:text-slate-100 bg-transparent outline-none flex-1 truncate focus:bg-white dark:focus:bg-slate-800 px-1 py-0.5 rounded"
              />
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">
                {col.cards.length}
              </span>
              <button
                type="button"
                onClick={() => deleteColumn(col)}
                className="p-1 rounded-lg text-slate-400 hover:text-rose-500 transition cursor-pointer"
                title="Excluir coluna"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
              {col.cards.map((card, cardIdx) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedCard({ cardId: card.id, sourceColId: col.id });
                    e.dataTransfer.setData('text/plain', card.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.stopPropagation();
                    handleDropCard(col.id, cardIdx);
                  }}
                  className="group p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs hover:shadow-md transition-all cursor-grab active:cursor-grabbing text-xs text-slate-800 dark:text-slate-100 break-words"
                >
                  {editingCardId === card.id ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={editingCardText}
                        onChange={(e) => setEditingCardText(e.target.value)}
                        className="w-full p-1.5 rounded-lg border border-blue-500 bg-slate-50 dark:bg-slate-900 text-xs outline-none"
                      />
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCardId(null)}
                          className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-bold cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={() => saveEditCard(col.id, card.id)}
                          className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold cursor-pointer"
                        >
                          Salvar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <span
                        onDoubleClick={() => {
                          setEditingCardId(card.id);
                          setEditingCardText(card.text);
                        }}
                        className="flex-1 select-text"
                      >
                        {card.text}
                      </span>
                      <div className="flex items-center gap-0.5 opacity-90 sm:opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          type="button"
                          onClick={() => stepCard(colIdx, colIdx - 1, card)}
                          disabled={colIdx === 0}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                          title="Mover para a coluna anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => stepCard(colIdx, colIdx + 1, card)}
                          disabled={colIdx === activeBoard.cols.length - 1}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20 cursor-pointer"
                          title="Mover para a próxima coluna"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCardId(card.id);
                            setEditingCardText(card.text);
                          }}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                          title="Editar cartão"
                        >
                          <Pen className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeCard(col.id, card.id)}
                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Excluir cartão"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-2 border-t border-slate-200/60 dark:border-slate-800">
              <input
                type="text"
                placeholder="+ Adicionar cartão (Enter para salvar)"
                value={newCardInputs[col.id] || ''}
                onChange={(e) =>
                  setNewCardInputs((prev) => ({ ...prev, [col.id]: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') addCards(col.id, e.currentTarget.value);
                }}
                onPaste={(e) => {
                  const pasted = e.clipboardData.getData('text');
                  if (pasted.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length > 1) {
                    e.preventDefault();
                    addCards(col.id, pasted);
                  }
                }}
                className="w-full px-3 py-1.5 rounded-xl border border-transparent hover:border-slate-300 dark:hover:border-slate-700 focus:border-blue-500 bg-transparent focus:bg-white dark:focus:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 outline-none transition"
              />
            </div>
          </div>
        ))}

        {activeBoard.cols.length < 8 ? (
          <div className="w-72 shrink-0 p-3 rounded-2xl bg-white/40 dark:bg-slate-800/40 border border-dashed border-slate-300 dark:border-slate-700">
            <input
              type="text"
              placeholder="+ Adicionar coluna (Enter)"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addColumn(e.currentTarget.value);
                  e.currentTarget.value = '';
                }
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800/80 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="text-[11px] text-slate-400 mt-2 text-center font-semibold tabular-nums">
              {activeBoard.cols.length}/8 colunas utilizadas
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 p-3 italic">
            Limite de 8 colunas atingido (8/8)
          </div>
        )}
      </div>
    </div>
  );
};
