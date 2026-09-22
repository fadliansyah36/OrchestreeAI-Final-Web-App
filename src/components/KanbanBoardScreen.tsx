import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Kanban,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Layers,
  MoveRight,
  ShieldAlert,
  Flame,
  User,
  Bot,
  Radio,
  Wifi,
  WifiOff
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader } from '@orchestree/ui';

export interface BoardTask {
  id: string;
  tenant_id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  position: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  version: number;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assigned_agent_id?: string | null;
  assigned_agent_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BoardColumn {
  id: string;
  tenant_id: string;
  board_id: string;
  name: string;
  position: number;
  wip_limit: number | null;
  created_at: string;
}

export interface BoardData {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface KanbanBoardScreenProps {
  tenantId: string;
  currentUserId?: string;
  onBack?: () => void;
}

// Komponen Kartu Tugas Kanban Terurut
const SortableTaskCard: React.FC<{
  task: BoardTask;
  columns: BoardColumn[];
  onMoveNonDrag: (taskId: string, targetColId: string, currentVersion: number) => void;
}> = ({ task, columns, onMoveNonDrag }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data: { task } });

  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const getPriorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Mendesak</span>;
      case 'high':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Tinggi</span>;
      case 'medium':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">Sedang</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">Rendah</span>;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-xs hover:border-emerald-500/40 transition-all select-none"
    >
      {/* Drag handle area */}
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing pb-2">
        <div className="flex items-center justify-between gap-2 mb-1.5">
          {getPriorityBadge(task.priority)}
          <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
            v{task.version}
          </span>
        </div>
        <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
          {task.title}
        </h4>
        {task.description && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
            {task.description}
          </p>
        )}
      </div>

      {/* Footer penugasan */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500">
        <div className="flex items-center gap-1.5">
          {task.assigned_agent_name ? (
            <div className="flex items-center gap-1 text-purple-400 bg-purple-500/10 px-1.5 py-0.5 rounded font-medium">
              <Bot className="w-3 h-3" />
              <span className="truncate max-w-[85px]">{task.assigned_agent_name}</span>
            </div>
          ) : task.assignee_name ? (
            <div className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-medium">
              <User className="w-3 h-3" />
              <span className="truncate max-w-[85px]">{task.assignee_name}</span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Tanpa penugasan</span>
          )}
        </div>

        {/* Aksesibilitas: Menu Pindahkan Tugas (Alternatif Non-Drag) */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowMoveMenu(!showMoveMenu);
            }}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Pindahkan tugas (Aksesibilitas)"
          >
            <MoveRight className="w-3.5 h-3.5" />
          </button>

          {showMoveMenu && (
            <div className="absolute right-0 bottom-full mb-1 z-30 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-1 text-[11px]">
              <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 border-b border-slate-100 dark:border-slate-800">
                Pindahkan ke:
              </div>
              {columns
                .filter((c) => c.id !== task.column_id)
                .map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMoveMenu(false);
                      onMoveNonDrag(task.id, c.id, task.version);
                    }}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 hover:text-emerald-500 text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between"
                  >
                    <span className="truncate">{c.name}</span>
                    <MoveRight className="w-3 h-3 opacity-60" />
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Komponen Kolom Droppable
const DroppableColumn: React.FC<{
  column: BoardColumn;
  tasks: BoardTask[];
  allColumns: BoardColumn[];
  onMoveNonDrag: (taskId: string, targetColId: string, currentVersion: number) => void;
  onAddTask: (columnId: string) => void;
}> = ({ column, tasks, allColumns, onMoveNonDrag, onAddTask }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column },
  });

  const isWipExceeded = column.wip_limit && tasks.length > column.wip_limit;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-[280px] max-w-[340px] bg-slate-50 dark:bg-slate-900/60 rounded-2xl border transition-colors ${
        isOver
          ? 'border-emerald-500/60 bg-emerald-500/5'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header Kolom */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
            {column.name}
          </h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold ${
              isWipExceeded
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {tasks.length}
            {column.wip_limit ? ` / ${column.wip_limit}` : ''}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onAddTask(column.id)}
          className="p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          title="Tambah tugas di kolom ini"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Daftar Kartu */}
      <div className="flex-1 p-2.5 overflow-y-auto space-y-2 min-h-[300px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.length === 0 ? (
            <div className="h-28 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-[11px] text-slate-400">
              Belum ada tugas di kolom ini
            </div>
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                columns={allColumns}
                onMoveNonDrag={onMoveNonDrag}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
};

export const KanbanBoardScreen: React.FC<KanbanBoardScreenProps> = ({
  tenantId,
  currentUserId,
  onBack,
}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [activeDragTask, setActiveDragTask] = useState<BoardTask | null>(null);

  // Modal Tambah Tugas
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');

  const sseRef = useRef<EventSource | null>(null);

  // Sensor DndKit
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Ambil Data Board
  const loadBoardData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/boards`);
      if (!res.ok) throw new Error('Gagal memuat papan kerja tenant.');
      const boardsList = await res.json();
      if (!boardsList || boardsList.length === 0) {
        throw new Error('Papan kerja tidak tersedia.');
      }

      const activeBoard = boardsList[0];
      setBoard(activeBoard);

      const detailRes = await fetch(`/api/v1/tenants/${tenantId}/boards/${activeBoard.id}`);
      if (!detailRes.ok) throw new Error('Gagal memuat rincian kolom dan tugas.');
      const detail = await detailRes.json();
      setColumns(detail.columns || []);
      setTasks(detail.tasks || []);
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat papan.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Pasang SSE Realtime Sync
  useEffect(() => {
    if (!board) return;

    const sseUrl = `/api/v1/tenants/${tenantId}/boards/${board.id}/events`;
    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.onopen = () => {
      setRealtimeConnected(true);
    };

    es.onerror = () => {
      setRealtimeConnected(false);
    };

    es.addEventListener('column_changed', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload && payload.task) {
          setTasks((prev) => {
            const idx = prev.findIndex((t) => t.id === payload.task.id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = payload.task;
              return updated;
            }
            return [...prev, payload.task];
          });
        }
      } catch (e) {
        console.error('Gagal memproses event realtime:', e);
      }
    });

    es.addEventListener('task_created', (evt: MessageEvent) => {
      try {
        const payload = JSON.parse(evt.data);
        if (payload && payload.task) {
          setTasks((prev) => {
            if (prev.some((t) => t.id === payload.task.id)) return prev;
            return [...prev, payload.task];
          });
        }
      } catch (e) {
        console.error('Gagal memproses event task_created:', e);
      }
    });

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [board, tenantId]);

  useEffect(() => {
    loadBoardData();
  }, [loadBoardData]);

  // Eksekusi Pemindahan Tugas dengan Optimistic Update & Rollback
  const executeMoveTask = async (taskId: string, targetColId: string, currentVersion: number) => {
    const originalTasks = [...tasks];
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    if (targetTask.column_id === targetColId) return;

    // Optimistic Update: Langsung ubah di state lokal
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? { ...t, column_id: targetColId, version: t.version + 1 }
          : t
      )
    );

    try {
      const res = await fetch(`/api/v1/tasks/${taskId}/move`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': `"${currentVersion}"`,
          'X-User-Id': currentUserId || 'usr_client',
        },
        body: JSON.stringify({
          target_column_id: targetColId,
          new_position: 0,
          tenant_id: tenantId,
        }),
      });

      if (res.status === 409) {
        // Rollback jika konflik versi terdeteksi (409 Conflict)
        const errData = await res.json().catch(() => ({}));
        setTasks(originalTasks);
        setConflictWarning(
          `Konflik versi terdeteksi: Tugas telah dipindahkan atau disunting oleh sesi lain. Posisi kartu dikembalikan.`
        );
        setTimeout(() => setConflictWarning(null), 5000);
        return;
      }

      if (!res.ok) {
        // Rollback untuk error lainnya
        setTasks(originalTasks);
        throw new Error('Gagal memperbarui status tugas di server.');
      }

      const updatedTask = await res.json();
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t))
      );
    } catch (err: any) {
      setTasks(originalTasks);
      setErrorMsg(err.message || 'Terjadi kesalahan saat memindahkan tugas.');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) setActiveDragTask(task);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragTask(null);

    if (!over) return;

    const activeTaskId = String(active.id);
    const overId = String(over.id);

    // Cek apakah di-drop ke kolom atau ke kartu lain
    const targetColumn = columns.find((c) => c.id === overId);
    let targetColId = targetColumn?.id;

    if (!targetColId) {
      const overTask = tasks.find((t) => t.id === overId);
      if (overTask) {
        targetColId = overTask.column_id;
      }
    }

    if (!targetColId) return;

    const sourceTask = tasks.find((t) => t.id === activeTaskId);
    if (!sourceTask || sourceTask.column_id === targetColId) return;

    executeMoveTask(activeTaskId, targetColId, sourceTask.version);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !board) return;

    try {
      const res = await fetch(`/api/v1/tenants/${tenantId}/boards/${board.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          column_id: selectedColumnId || columns[0]?.id,
          priority: newPriority,
        }),
      });

      if (!res.ok) throw new Error('Gagal membuat tugas baru.');
      const created = await res.json();

      setTasks((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('medium');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan tugas baru.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 flex flex-col">
      {/* Top Header */}
      <div className="max-w-7xl w-full mx-auto mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Kanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {board?.name || 'Papan Tugas Operasional'}
                </h1>
                <div
                  className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                    realtimeConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                  }`}
                  title={
                    realtimeConnected
                      ? 'Tersinkronisasi secara langsung (< 1 detik)'
                      : 'Mencoba menghubungkan kembali...'
                  }
                >
                  {realtimeConnected ? (
                    <>
                      <Wifi className="w-3 h-3 animate-pulse" />
                      <span>Realtime Aktif</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3 h-3" />
                      <span>Menghubungkan...</span>
                    </>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {board?.description || 'Manajemen tahapan kerja kolaboratif staf dan agen kecerdasan buatan'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadBoardData}
            className="p-2 rounded-xl border border-slate-800 bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Muat ulang papan"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSelectedColumnId(columns[0]?.id || '');
              setShowAddModal(true);
            }}
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Tugas</span>
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-3 py-2 rounded-xl border border-slate-800 bg-slate-800 text-slate-300 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Kembali
            </button>
          )}
        </div>
      </div>

      {/* Banner Konflik Versi (Optimistic Rollback Alert) */}
      {conflictWarning && (
        <div className="max-w-7xl w-full mx-auto mb-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5 animate-fadeIn">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
          <span>{conflictWarning}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="max-w-7xl w-full mx-auto mb-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-slate-400 hover:text-white text-xs"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Kanban Board Container */}
      <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col">
        {loading ? (
          <div className="p-8">
            <SkeletonLoader />
          </div>
        ) : columns.length === 0 ? (
          <EmptyState
            title="Belum Ada Kolom Papan"
            description="Papan kerja belum memiliki kolom tahapan. Silakan inisialisasi kolom operasional."
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 flex gap-4 overflow-x-auto pb-6">
              {columns.map((column) => (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  tasks={tasks.filter((t) => t.column_id === column.id)}
                  allColumns={columns}
                  onMoveNonDrag={executeMoveTask}
                  onAddTask={(colId) => {
                    setSelectedColumnId(colId);
                    setShowAddModal(true);
                  }}
                />
              ))}
            </div>

            <DragOverlay>
              {activeDragTask ? (
                <div className="bg-slate-800 border-2 border-emerald-500 rounded-xl p-3 shadow-2xl w-[280px] pointer-events-none opacity-95">
                  <h4 className="text-xs font-semibold text-white leading-snug">
                    {activeDragTask.title}
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">
                    {activeDragTask.description}
                  </p>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Modal Tambah Tugas Baru */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 shadow-2xl animate-scaleUp">
            <h3 className="text-sm font-bold text-white mb-3">Buat Tugas Baru</h3>
            <form onSubmit={handleCreateTask} className="space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Judul Tugas
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Deskripsi Rinci
                </label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Tahapan Kolom
                  </label>
                  <select
                    value={selectedColumnId}
                    onChange={(e) => setSelectedColumnId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {columns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Prioritas
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    <option value="low">Rendah</option>
                    <option value="medium">Sedang</option>
                    <option value="high">Tinggi</option>
                    <option value="urgent">Mendesak</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors"
                >
                  Simpan Tugas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
