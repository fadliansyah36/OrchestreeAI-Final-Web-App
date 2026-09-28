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
  WifiOff,
  CheckSquare,
  Square,
  Paperclip,
  MessageSquare,
  Tag,
  Calendar,
  Palette,
  Trash2,
  Edit3,
  X,
  Check,
  Search,
  Filter,
  ExternalLink,
  ChevronDown,
  Sparkles,
  Send,
  SlidersHorizontal,
  Download,
} from 'lucide-react';
import { EmptyState, ErrorState, SkeletonLoader, FileUploadField, UploadedFileArtifact } from '@orchestree/ui';

export interface ChecklistItem {
  id: string;
  checklist_id: string;
  title: string;
  is_completed: boolean;
  completed_by_type?: string | null;
  completed_by_id?: string | null;
  completed_at?: string | null;
  position: number;
  created_at: string;
}

export interface TaskChecklist {
  id: string;
  task_id: string;
  title: string;
  position: number;
  created_at: string;
  items: ChecklistItem[];
}

export interface TaskAttachment {
  id: string;
  task_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type?: string | null;
  created_at: string;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id?: string | null;
  author_name?: string | null;
  content: string;
  created_at: string;
}

export interface TimelineEntry {
  id: string;
  entry_type: 'event' | 'comment';
  event_type: string;
  actor_type: 'agent' | 'human' | 'system';
  actor_id: string;
  actor_name: string;
  persona_type?: string;
  content?: string;
  payload?: any;
  from_column_name?: string;
  to_column_name?: string;
  created_at: string;
}

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
  labels?: string[];
  due_date?: string | null;
  cover_color?: string | null;
  progress_percentage?: number;
  source_channel?: string;
  source_ref_id?: string | null;
  created_by_type?: string;
  created_by_id?: string | null;
  checklist_count?: number;
  checklist_total_items?: number;
  checklist_completed_items?: number;
  attachment_count?: number;
  comment_count?: number;
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
  boardId?: string;
  currentUserId?: string;
  onBack?: () => void;
}

const COVER_COLORS: { [key: string]: { bg: string; border: string; text: string } } = {
  emerald: { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-500' },
  blue: { bg: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-500' },
  purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-500' },
  amber: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-500' },
  rose: { bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-500' },
  indigo: { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-500' },
};

// Komponen Kartu Tugas Bergaya Trello Terurut
const SortableTaskCard: React.FC<{
  task: BoardTask;
  columns: BoardColumn[];
  onMoveNonDrag: (taskId: string, targetColId: string, currentVersion: number) => void;
  onSelectTask: (task: BoardTask) => void;
}> = ({ task, columns, onMoveNonDrag, onSelectTask }) => {
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
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-0.5">
            <Flame className="w-2.5 h-2.5" /> Mendesak
          </span>
        );
      case 'high':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            Tinggi
          </span>
        );
      case 'medium':
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
            Sedang
          </span>
        );
      default:
        return (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-500/20 text-slate-400 border border-slate-500/30">
            Rendah
          </span>
        );
    }
  };

  const getChannelBadge = (ch?: string) => {
    if (!ch || ch === 'dashboard') return null;
    if (ch === 'telegram') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center gap-1" title="Sumber: Telegram">
          <Radio className="w-2.5 h-2.5 text-sky-400" /> Telegram
        </span>
      );
    }
    if (ch === 'whatsapp') {
      return (
        <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1" title="Sumber: WhatsApp">
          <Radio className="w-2.5 h-2.5 text-emerald-400" /> WhatsApp
        </span>
      );
    }
    return (
      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1" title="Sumber: Proactive AI Agent">
        <Bot className="w-2.5 h-2.5 text-purple-400" /> AI Proaktif
      </span>
    );
  };

  const formatDueDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const isOverdue = d < now;
    const isToday = d.toDateString() === now.toDateString();

    const formatted = d.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });

    let colorClass = 'text-slate-400 bg-slate-100 dark:bg-slate-800';
    if (isOverdue) {
      colorClass = 'text-rose-400 bg-rose-500/15 border border-rose-500/30';
    } else if (isToday) {
      colorClass = 'text-amber-400 bg-amber-500/15 border border-amber-500/30';
    }

    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${colorClass}`}>
        <Clock className="w-2.5 h-2.5" />
        {formatted}
      </span>
    );
  };

  const coverColorStyle = task.cover_color && COVER_COLORS[task.cover_color]
    ? COVER_COLORS[task.cover_color].bg
    : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelectTask(task)}
      className="group relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs hover:border-emerald-500/50 hover:shadow-md transition-all select-none cursor-pointer"
    >
      {/* Cover Color Bar */}
      {coverColorStyle && (
        <div className={`h-2 w-full ${coverColorStyle}`} />
      )}

      <div className="p-3">
        {/* Drag handle area */}
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing pb-2">
          {/* Baris Badge: Prioritas, Channel, Version */}
          <div className="flex items-center justify-between gap-1.5 mb-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {getPriorityBadge(task.priority)}
              {getChannelBadge(task.source_channel)}
            </div>
            <span className="text-[10px] font-mono text-slate-400 bg-slate-100 dark:bg-slate-800/80 px-1 py-0.5 rounded">
              v{task.version}
            </span>
          </div>

          {/* Labels Tags Bergaya Trello */}
          {task.labels && task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1.5">
              {task.labels.map((lbl, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                >
                  #{lbl}
                </span>
              ))}
            </div>
          )}

          {/* Judul & Deskripsi Tugas */}
          <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
            {task.title}
          </h4>
          {task.description && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Progres Bar jika ada checklist atau persentase */}
          {task.progress_percentage !== undefined && task.progress_percentage > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[9px] text-slate-400 mb-0.5">
                <span>Progres</span>
                <span className="font-semibold text-emerald-400">{task.progress_percentage}%</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                <div
                  className="bg-emerald-500 h-1 rounded-full transition-all duration-300"
                  style={{ width: `${task.progress_percentage}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer: Due date, counts, dan penugasan */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[10px] text-slate-500">
          {/* Sub-indikator: Checklist, Attachments, Comments */}
          <div className="flex items-center gap-2">
            {formatDueDate(task.due_date)}

            {task.checklist_total_items ? (
              <span
                className={`flex items-center gap-0.5 text-[10px] ${
                  task.checklist_completed_items === task.checklist_total_items
                    ? 'text-emerald-400 font-semibold'
                    : 'text-slate-400'
                }`}
                title="Daftar Periksa"
              >
                <CheckSquare className="w-3 h-3" />
                {task.checklist_completed_items}/{task.checklist_total_items}
              </span>
            ) : null}

            {task.attachment_count ? (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400" title="Lampiran Berkas">
                <Paperclip className="w-3 h-3" />
                {task.attachment_count}
              </span>
            ) : null}

            {task.comment_count ? (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400" title="Komentar">
                <MessageSquare className="w-3 h-3" />
                {task.comment_count}
              </span>
            ) : null}
          </div>

          {/* Penugasan (Human vs AI Agent) */}
          <div className="flex items-center gap-1.5">
            {task.assigned_agent_name ? (
              <div
                className="flex items-center gap-1 text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded font-medium shadow-xs"
                title={`AI Agent: ${task.assigned_agent_name}`}
              >
                <Bot className="w-3 h-3 text-purple-400" />
                <span className="truncate max-w-[75px]">{task.assigned_agent_name}</span>
              </div>
            ) : task.assignee_name ? (
              <div
                className="flex items-center gap-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium"
                title={`Staf: ${task.assignee_name}`}
              >
                <User className="w-3 h-3 text-emerald-400" />
                <span className="truncate max-w-[75px]">{task.assignee_name}</span>
              </div>
            ) : (
              <span className="text-slate-400 italic text-[9px]">Tanpa staf</span>
            )}

            {/* Tombol Aksesibilitas Pindahkan Tugas */}
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
                <MoveRight className="w-3 h-3" />
              </button>

              {showMoveMenu && (
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 bottom-full mb-1 z-30 w-44 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl p-1 text-[11px]"
                >
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
      </div>
    </div>
  );
};

// Komponen Kolom Droppable dengan Perbaikan Scroll Mandiri (BAGIAN A)
const DroppableColumn: React.FC<{
  column: BoardColumn;
  tasks: BoardTask[];
  allColumns: BoardColumn[];
  onMoveNonDrag: (taskId: string, targetColId: string, currentVersion: number) => void;
  onAddTask: (columnId: string) => void;
  onSelectTask: (task: BoardTask) => void;
}> = ({ column, tasks, allColumns, onMoveNonDrag, onAddTask, onSelectTask }) => {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { column },
  });

  const isWipExceeded = column.wip_limit && tasks.length > column.wip_limit;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col flex-1 min-w-[300px] max-w-[360px] bg-slate-50 dark:bg-slate-900/60 rounded-2xl border transition-colors max-h-[calc(100vh-220px)] ${
        isOver
          ? 'border-emerald-500/60 bg-emerald-500/5'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Header Kolom */}
      <div className="p-3.5 border-b border-slate-200 dark:border-slate-800/80 flex items-center justify-between shrink-0">
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
          className="p-1 rounded-md text-slate-400 hover:text-emerald-500 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Tambah tugas di kolom ini"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Daftar Kartu dengan Scroll Mandiri (BAGIAN A: overflow-y: auto + overscroll-behavior: contain) */}
      <div
        className="flex-1 p-2.5 min-h-0 overflow-y-auto space-y-2 overscroll-contain scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700 scrollbar-track-transparent"
        style={{ overscrollBehavior: 'contain' }}
      >
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
                onSelectTask={onSelectTask}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
};

// Komponen Drawer / Modal Detail Tugas Bergaya Trello Penuh
const TaskDetailDrawer: React.FC<{
  task: BoardTask | null;
  columns: BoardColumn[];
  onClose: () => void;
  onTaskUpdated: () => void;
  currentUserId?: string;
}> = ({ task, columns, onClose, onTaskUpdated, currentUserId }) => {
  const [taskDetail, setTaskDetail] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [newComment, setNewComment] = useState('');
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [editDesc, setEditDesc] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newChecklistTitle, setNewChecklistTitle] = useState('');
  const [newItemTitles, setNewItemTitles] = useState<{ [key: string]: string }>({});

  const loadDetails = useCallback(async () => {
    if (!task) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}`);
      if (res.ok) {
        const data = await res.json();
        setTaskDetail(data);
        setEditTitle(data.title);
        setEditDesc(data.description || '');
      }

      const timelineRes = await fetch(`/api/v1/tasks/${task.id}/timeline`);
      if (timelineRes.ok) {
        const tData = await timelineRes.json();
        setTimeline(tData.timeline || []);
      }
    } catch (err) {
      console.error('Gagal mengambil detail tugas:', err);
    } finally {
      setLoading(false);
    }
  }, [task]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  if (!task) return null;

  const handleUpdateField = async (fields: any) => {
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (res.ok) {
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal memperbarui atribut tugas:', e);
    }
  };

  const handleAddLabel = () => {
    if (!newLabel.trim()) return;
    const current = taskDetail?.labels || [];
    if (!current.includes(newLabel.trim())) {
      const updated = [...current, newLabel.trim()];
      handleUpdateField({ labels: updated });
    }
    setNewLabel('');
  };

  const handleRemoveLabel = (lbl: string) => {
    const current = taskDetail?.labels || [];
    const updated = current.filter((l: string) => l !== lbl);
    handleUpdateField({ labels: updated });
  };

  const handleAddChecklist = async () => {
    if (!newChecklistTitle.trim()) return;
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/checklists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newChecklistTitle.trim() }),
      });
      if (res.ok) {
        setNewChecklistTitle('');
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal membuat checklist:', e);
    }
  };

  const handleDeleteChecklist = async (cid: string) => {
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/checklists/${cid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal menghapus checklist:', e);
    }
  };

  const handleAddChecklistItem = async (cid: string) => {
    const text = newItemTitles[cid];
    if (!text || !text.trim()) return;
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/checklists/${cid}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: text.trim() }),
      });
      if (res.ok) {
        setNewItemTitles((prev) => ({ ...prev, [cid]: '' }));
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal menambahkan item checklist:', e);
    }
  };

  const handleToggleChecklistItem = async (cid: string, item: ChecklistItem) => {
    try {
      const nextState = !item.is_completed;
      const res = await fetch(`/api/v1/tasks/${task.id}/checklists/${cid}/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          is_completed: nextState,
          completed_by_type: 'user',
          completed_by_id: currentUserId || 'usr_client',
        }),
      });
      if (res.ok) {
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal memperbarui item checklist:', e);
    }
  };

  const handleDeleteChecklistItem = async (cid: string, iid: string) => {
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/checklists/${cid}/items/${iid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal menghapus item:', e);
    }
  };

  const handleFileUploadComplete = async (artifacts: UploadedFileArtifact[]) => {
    for (const art of artifacts) {
      try {
        const res = await fetch(`/api/v1/tasks/${task.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: art.file_name,
            file_url: art.signed_url || art.public_url,
          }),
        });
        if (res.ok) {
          loadDetails();
          onTaskUpdated();
        }
      } catch (e) {
        console.error('Gagal menambahkan lampiran:', e);
      }
    }
  };

  const handleDeleteAttachment = async (aid: string) => {
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/attachments/${aid}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal menghapus lampiran:', e);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const res = await fetch(`/api/v1/tasks/${task.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: newComment.trim(),
          author_id: currentUserId || null,
          author_type: 'user',
        }),
      });
      if (res.ok) {
        setNewComment('');
        loadDetails();
        onTaskUpdated();
      }
    } catch (e) {
      console.error('Gagal menambahkan komentar:', e);
    }
  };

  const currentCover = taskDetail?.cover_color;
  const coverBg = currentCover && COVER_COLORS[currentCover] ? COVER_COLORS[currentCover].bg : 'bg-slate-800';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-scaleUp">
        {/* Cover Strip Header */}
        <div className={`h-6 w-full ${coverBg} flex items-center justify-between px-3 shrink-0`}>
          <div className="flex items-center gap-1.5">
            {Object.keys(COVER_COLORS).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => handleUpdateField({ cover_color: c === currentCover ? null : c })}
                className={`w-3 h-3 rounded-full ${COVER_COLORS[c].bg} border border-white/40 hover:scale-125 transition-transform`}
                title={`Warna Sampul: ${c}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scroll Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-slate-700">
          {/* Header Judul & Kolom */}
          <div>
            <div className="flex items-center justify-between gap-4 mb-2">
              {isEditingTitle ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg border border-emerald-500 bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      handleUpdateField({ title: editTitle.trim() });
                    }}
                    className="p-1.5 bg-emerald-500 text-white rounded-lg text-xs"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <h2
                  onClick={() => setIsEditingTitle(true)}
                  className="text-lg font-bold text-slate-900 dark:text-white hover:text-emerald-500 cursor-pointer flex items-center gap-2"
                >
                  {taskDetail?.title || task.title}
                  <Edit3 className="w-3.5 h-3.5 text-slate-400 opacity-60" />
                </h2>
              )}

              {/* Status Kolom */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-400">Kolom:</span>
                <select
                  value={taskDetail?.column_id || task.column_id}
                  onChange={(e) => handleUpdateField({ column_id: e.target.value })}
                  className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1 text-slate-700 dark:text-slate-300"
                >
                  {columns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Atribut Cepat: Prioritas, Due Date, Sumber Omnichannel */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400">Prioritas:</span>
              <select
                value={taskDetail?.priority || task.priority}
                onChange={(e) => handleUpdateField({ priority: e.target.value })}
                className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300"
              >
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
                <option value="urgent">Mendesak</option>
              </select>

              <span className="text-slate-400 ml-2">Tenggat:</span>
              <input
                type="date"
                value={taskDetail?.due_date ? taskDetail.due_date.substring(0, 10) : ''}
                onChange={(e) => handleUpdateField({ due_date: e.target.value || null })}
                className="text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-0.5 text-slate-700 dark:text-slate-300"
              />

              <div className="ml-auto flex items-center gap-2">
                <span className="text-slate-400">Kanal Asal:</span>
                <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-300 uppercase">
                  {taskDetail?.source_channel || task.source_channel || 'DASHBOARD'}
                </span>
              </div>
            </div>
          </div>

          {/* Labels Manager */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Label & Kategori
            </h4>
            <div className="flex flex-wrap items-center gap-1.5">
              {(taskDetail?.labels || task.labels || []).map((lbl: string, idx: number) => (
                <span
                  key={idx}
                  className="px-2 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1"
                >
                  #{lbl}
                  <button
                    type="button"
                    onClick={() => handleRemoveLabel(lbl)}
                    className="hover:text-rose-400 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  placeholder="+ Label baru" // allowlist: standard UI input hint
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLabel();
                    }
                  }}
                  className="px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none w-28 focus:w-36 transition-all"
                />
              </div>
            </div>
          </div>

          {/* Deskripsi dengan Editor Markdown/Plain */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Edit3 className="w-3.5 h-3.5" /> Deskripsi Rinci
              </h4>
              <button
                type="button"
                onClick={() => {
                  if (isEditingDesc) {
                    handleUpdateField({ description: editDesc });
                  }
                  setIsEditingDesc(!isEditingDesc);
                }}
                className="text-xs text-emerald-500 hover:underline font-medium"
              >
                {isEditingDesc ? 'Simpan' : 'Sunting'}
              </button>
            </div>
            {isEditingDesc ? (
              <textarea
                rows={4}
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full p-3 rounded-xl border border-emerald-500 bg-slate-100 dark:bg-slate-800 text-xs text-slate-900 dark:text-white outline-none"
              />
            ) : (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {taskDetail?.description || 'Belum ada deskripsi rinci untuk tugas ini.'}
              </div>
            )}
          </div>

          {/* Daftar Periksa (Checklists) Bergaya Trello */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Daftar Periksa (Checklist)
              </h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nama checklist..." // allowlist: standard UI input hint
                  value={newChecklistTitle}
                  onChange={(e) => setNewChecklistTitle(e.target.value)}
                  className="px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none w-36"
                />
                <button
                  type="button"
                  onClick={handleAddChecklist}
                  className="px-2.5 py-1 rounded-md text-xs bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-colors"
                >
                  Tambah
                </button>
              </div>
            </div>

            {(taskDetail?.checklists || []).map((chk: TaskChecklist) => {
              const totalItems = chk.items?.length || 0;
              const completedItems = chk.items?.filter((i) => i.is_completed).length || 0;
              const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

              return (
                <div key={chk.id} className="p-3.5 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      {chk.title}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold text-emerald-400">{pct}%</span>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(chk.id)}
                        className="text-slate-400 hover:text-rose-400 transition-colors"
                        title="Hapus checklist"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar Checklist */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mb-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Item List */}
                  <div className="space-y-2 mb-3">
                    {(chk.items || []).map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
                      >
                        <div
                          onClick={() => handleToggleChecklistItem(chk.id, item)}
                          className="flex items-start gap-2 cursor-pointer flex-1"
                        >
                          {item.is_completed ? (
                            <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <div>
                            <span
                              className={`text-xs ${
                                item.is_completed
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-800 dark:text-slate-200'
                              }`}
                            >
                              {item.title}
                            </span>
                            {item.is_completed && item.completed_by_type && (
                              <div className="text-[9px] text-slate-500 dark:text-slate-400 flex items-center gap-1 mt-0.5">
                                {item.completed_by_type === 'ai_agent' ? (
                                  <span className="text-purple-400 flex items-center gap-0.5">
                                    <Bot className="w-2.5 h-2.5" /> Diverifikasi oleh AI Agent
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 flex items-center gap-0.5">
                                    <User className="w-2.5 h-2.5" /> Selesai oleh Staf
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteChecklistItem(chk.id, item.id)}
                          className="text-slate-400 hover:text-rose-400 p-1 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Tambah Item Baru ke Checklist */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-200 dark:border-slate-800/60">
                    <input
                      type="text"
                      placeholder="+ Tambah item periksa..." // allowlist: standard UI input hint
                      value={newItemTitles[chk.id] || ''}
                      onChange={(e) =>
                        setNewItemTitles((prev) => ({ ...prev, [chk.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItem(chk.id);
                        }
                      }}
                      className="flex-1 px-2.5 py-1 text-xs rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddChecklistItem(chk.id)}
                      className="px-2.5 py-1 rounded-md text-xs bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-emerald-500 hover:text-white transition-colors"
                    >
                      Tambah
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Lampiran Berkas (Attachments) */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Paperclip className="w-3.5 h-3.5" /> Lampiran Berkas
            </h4>
            <div className="space-y-2 mb-3">
              {(taskDetail?.attachments || []).map((att: TaskAttachment) => (
                <div
                  key={att.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate text-slate-800 dark:text-slate-200 font-medium">{att.file_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={`${att.file_url}${att.file_url.includes('?') ? '&' : '?'}download=1`}
                      download={att.file_name}
                      title="Unduh Berkas Lampiran"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-500 hover:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md font-medium transition"
                    >
                      <Download className="w-3 h-3" />
                      <span>Unduh</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteAttachment(att.id)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                      title="Hapus Lampiran"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <FileUploadField
                label="Tambah Lampiran Berkas"
                description="Pilih berkas dokumen atau gambar dari perangkat untuk dilampirkan ke kartu tugas ini."
                category="tasks"
                multiple
                onUploadComplete={handleFileUploadComplete}
              />
            </div>
          </div>

          {/* Linimasa Aktivitas Terpadu (Unified Activity Timeline) */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Linimasa Aktivitas & Diskusi
            </h4>

            {/* Form Tambah Komentar */}
            <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Tulis tanggapan atau instruksi kerja..." // allowlist: standard UI input hint
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className="flex-1 px-3 py-2 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-emerald-500 text-white rounded-xl text-xs font-semibold hover:bg-emerald-600 transition-colors flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" /> Kirim
              </button>
            </form>

            {/* List Linimasa */}
            <div className="space-y-3">
              {timeline.length === 0 ? (
                <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
                  Belum ada log aktivitas atau komentar pada tugas ini.
                </div>
              ) : (
                timeline.map((entry) => (
                  <div
                    key={entry.id}
                    className={`p-3 rounded-xl border text-xs transition-colors ${
                      entry.actor_type === 'agent'
                        ? 'bg-purple-500/5 border-purple-500/20'
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        {entry.actor_type === 'agent' ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                            <Bot className="w-3 h-3 text-purple-400" /> {entry.actor_name}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                            <User className="w-3 h-3 text-emerald-400" /> {entry.actor_name}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          {entry.entry_type === 'comment' ? 'mengomentari:' : 'peristiwa sistem:'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(entry.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    {entry.entry_type === 'comment' ? (
                      <p className="text-slate-800 dark:text-slate-200 mt-1 whitespace-pre-wrap">
                        {entry.content}
                      </p>
                    ) : (
                      <div className="text-slate-600 dark:text-slate-400 mt-1 font-mono text-[11px]">
                        {entry.event_type === 'column_changed'
                          ? `Dipindahkan dari [${entry.from_column_name || 'Awal'}] ke [${entry.to_column_name || 'Baru'}]`
                          : entry.event_type === 'checklist_item_completed'
                          ? `Item checklist diselesaikan`
                          : entry.event_type}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const KanbanBoardScreen: React.FC<KanbanBoardScreenProps> = ({
  tenantId,
  boardId: propBoardId,
  currentUserId,
  onBack,
}) => {
  const [activeBoardId, setActiveBoardId] = useState<string | undefined>(propBoardId);
  const [board, setBoard] = useState<BoardData | null>(null);
  const [columns, setColumns] = useState<BoardColumn[]>([]);
  const [tasks, setTasks] = useState<BoardTask[]>([]);
  const [tierScopeNotice, setTierScopeNotice] = useState<string | null>(null);
  const [accessTier, setAccessTier] = useState<string>('executive');
  const [loading, setLoading] = useState<boolean>(true);
  const [isNotFound, setIsNotFound] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [activeDragTask, setActiveDragTask] = useState<BoardTask | null>(null);

  // Filter & Pencarian
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAssignee, setFilterAssignee] = useState<'all' | 'human' | 'agent'>('all');
  const [filterChannel, setFilterChannel] = useState<string>('all');
  const [benchmarkTestActive, setBenchmarkTestActive] = useState<boolean>(false);

  // Selected Task untuk Trello Detail Modal
  const [selectedTask, setSelectedTask] = useState<BoardTask | null>(null);

  // Modal Tambah Tugas
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [selectedColumnId, setSelectedColumnId] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [newLabelsStr, setNewLabelsStr] = useState<string>('');
  const [newChannel, setNewChannel] = useState<string>('dashboard');

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

  const loadBoardData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setIsNotFound(false);
    try {
      const targetBoard = activeBoardId || 'default';
      const res = await fetch(`/api/v1/tenants/${tenantId}/boards/${targetBoard}`);

      if (res.status === 404) {
        setIsNotFound(true);
        setBoard(null);
        setColumns([]);
        setTasks([]);
        return;
      }

      if (!res.ok) {
        throw new Error('Gagal memuat konfigurasi papan tugas.');
      }

      const detail = await res.json();
      setBoard(detail.board);
      setColumns(detail.columns || []);
      setTasks(detail.tasks || []);
      if (detail.tier_scope_notice) {
        setTierScopeNotice(detail.tier_scope_notice);
      }
      if (detail.access_tier) {
        setAccessTier(detail.access_tier);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memuat papan.');
    } finally {
      setLoading(false);
    }
  }, [tenantId, activeBoardId]);

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
        setTasks(originalTasks);
        setConflictWarning(
          `Konflik versi terdeteksi: Tugas telah dipindahkan atau disunting oleh sesi lain. Posisi kartu dikembalikan.`
        );
        setTimeout(() => setConflictWarning(null), 5000);
        return;
      }

      if (!res.ok) {
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

    const targetColumn = columns.find((c) => c.id === overId);
    let targetColId = targetColumn?.id;

    if (!targetColId) {
      const targetTask = tasks.find((t) => t.id === overId);
      if (targetTask) {
        targetColId = targetTask.column_id;
      }
    }

    if (!targetColId) return;

    const taskObj = tasks.find((t) => t.id === activeTaskId);
    if (!taskObj || taskObj.column_id === targetColId) return;

    executeMoveTask(activeTaskId, targetColId, taskObj.version);
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !board) return;

    try {
      const labels = newLabelsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch(`/api/v1/tenants/${tenantId}/boards/${board.id}/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Id': currentUserId || 'usr_client',
        },
        body: JSON.stringify({
          title: newTitle.trim(),
          description: newDesc.trim() || null,
          column_id: selectedColumnId || undefined,
          priority: newPriority,
          labels,
          source_channel: newChannel,
        }),
      });

      if (!res.ok) {
        throw new Error('Gagal menambahkan tugas baru.');
      }

      const created = await res.json();
      setTasks((prev) => [...prev, created]);
      setShowAddModal(false);
      setNewTitle('');
      setNewDesc('');
      setNewPriority('medium');
      setNewLabelsStr('');
      setNewChannel('dashboard');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal menyimpan tugas baru.');
    }
  };

  // Filter Tasks berdasarkan Pencarian, Assignee, dan Kanal
  let displayedTasks = tasks.filter((t) => {
    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q) || false;
      const matchLabels = t.labels?.some((l) => l.toLowerCase().includes(q)) || false;
      if (!matchTitle && !matchDesc && !matchLabels) return false;
    }

    // Filter Assignee
    if (filterAssignee === 'agent' && !t.assigned_agent_id) return false;
    if (filterAssignee === 'human' && !t.assignee_id) return false;

    // Filter Channel
    if (filterChannel !== 'all' && (t.source_channel || 'dashboard') !== filterChannel) {
      return false;
    }

    return true;
  });

  // Benchmark / Verifikasi Bug Scroll Mandiri: Hasilkan 35 tugas dalam kolom jika aktif
  if (benchmarkTestActive && columns.length > 0) {
    const firstColId = columns[0].id;
    const benchmarkScrollTasks: BoardTask[] = Array.from({ length: 35 }).map((_, i) => ({
      id: `benchmark_task_${i + 1}`,
      tenant_id: tenantId,
      board_id: board?.id || 'bench_board',
      column_id: firstColId,
      title: `Tugas Uji Scroll Kolom #${i + 1}: Verifikasi Isolasi Scrollbar Mandiri`,
      description: `Kartu uji ke-${i + 1} untuk memastikan max-height dan overscroll-behavior: contain berjalan sempurna tanpa bocor ke halaman luar.`,
      position: i,
      priority: i % 4 === 0 ? 'urgent' : i % 3 === 0 ? 'high' : 'medium',
      version: 1,
      source_channel: i % 2 === 0 ? 'telegram' : 'whatsapp',
      labels: ['BENCHMARK', 'SCROLL_TEST'],
      progress_percentage: (i * 7) % 100,
      checklist_total_items: 4,
      checklist_completed_items: i % 4,
      comment_count: i % 3,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    displayedTasks = [...displayedTasks, ...benchmarkScrollTasks];
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Header & Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Kembali"
              >
                &larr;
              </button>
            )}
            <div className="p-2 bg-emerald-500/10 text-emerald-500 rounded-xl">
              <Kanban className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-bold text-slate-900 dark:text-white">
                  {board?.name || 'Papan Kendali Operasional'}
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                  <Sparkles className="w-2.5 h-2.5 text-purple-400" /> Trello Proactive
                </span>
                <span
                  className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    realtimeConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                >
                  {realtimeConnected ? (
                    <>
                      <Wifi className="w-2.5 h-2.5 text-emerald-400 animate-pulse" /> Realtime
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-2.5 h-2.5 text-amber-400" /> Terputus
                    </>
                  )}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 line-clamp-1">
                {board?.description || 'Kolaborasi Terpadu Staf Human x AI Agent Proaktif'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBenchmarkTestActive(!benchmarkTestActive)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors flex items-center gap-1.5 ${
                benchmarkTestActive
                  ? 'bg-purple-500 text-white border-purple-600'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-purple-500'
              }`}
              title="Aktifkan pengujian beban 35 kartu untuk menguji isolasi scrollbar kolom"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {benchmarkTestActive ? 'Mode Uji 35 Kartu Aktif' : 'Uji Scroll >30 Kartu'}
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedColumnId(columns[0]?.id || '');
                setShowAddModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Tugas Baru
            </button>
          </div>
        </div>

        {/* Filter Bar: Pencarian, Assignee, Kanal */}
        <div className="border-t border-slate-200 dark:border-slate-800/80 bg-slate-50 dark:bg-slate-900/40 px-4 py-2">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari judul, deskripsi, #label..." // allowlist: standard UI input hint
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Penugasan:</span>
                <select
                  value={filterAssignee}
                  onChange={(e: any) => setFilterAssignee(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 text-xs"
                >
                  <option value="all">Semua Pelaksana</option>
                  <option value="human">Staf Human</option>
                  <option value="agent">AI Agent</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-slate-400 text-[11px]">Kanal Sumber:</span>
                <select
                  value={filterChannel}
                  onChange={(e) => setFilterChannel(e.target.value)}
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 text-xs"
                >
                  <option value="all">Semua Kanal</option>
                  <option value="dashboard">Dashboard</option>
                  <option value="telegram">Telegram</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="proactive_agent">AI Proaktif</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Source Breakdown Bar (BAGIAN E: Dashboard, Telegram, WhatsApp, Proactive) */}
        <div className="border-t border-slate-200/60 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/20 px-4 py-1.5">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Radio className="w-3 h-3 text-emerald-500" />
              <span className="font-semibold text-slate-600 dark:text-slate-300">Distribusi Saluran SSOT:</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setFilterChannel(filterChannel === 'dashboard' ? 'all' : 'dashboard')}
                className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                  filterChannel === 'dashboard'
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:border-emerald-500/50'
                }`}
                title="Saring tugas dari Web Dashboard"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Dashboard: {tasks.length > 0 ? Math.round((tasks.filter(t => !t.source_channel || t.source_channel === 'dashboard').length / tasks.length) * 100) : 0}%</span>
                <span className="opacity-70 font-mono">({tasks.filter(t => !t.source_channel || t.source_channel === 'dashboard').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterChannel(filterChannel === 'telegram' ? 'all' : 'telegram')}
                className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                  filterChannel === 'telegram'
                    ? 'bg-sky-500 text-white border-sky-600'
                    : 'bg-sky-500/10 text-sky-400 border-sky-500/20 hover:border-sky-500/50'
                }`}
                title="Saring tugas dari Telegram"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                <span>Telegram: {tasks.length > 0 ? Math.round((tasks.filter(t => t.source_channel === 'telegram' || t.source_channel === 'telegram_proactive').length / tasks.length) * 100) : 0}%</span>
                <span className="opacity-70 font-mono">({tasks.filter(t => t.source_channel === 'telegram' || t.source_channel === 'telegram_proactive').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterChannel(filterChannel === 'whatsapp' ? 'all' : 'whatsapp')}
                className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                  filterChannel === 'whatsapp'
                    ? 'bg-emerald-600 text-white border-emerald-700'
                    : 'bg-emerald-600/10 text-emerald-400 border-emerald-600/20 hover:border-emerald-600/50'
                }`}
                title="Saring tugas dari WhatsApp"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span>WhatsApp: {tasks.length > 0 ? Math.round((tasks.filter(t => t.source_channel === 'whatsapp' || t.source_channel === 'whatsapp_proactive').length / tasks.length) * 100) : 0}%</span>
                <span className="opacity-70 font-mono">({tasks.filter(t => t.source_channel === 'whatsapp' || t.source_channel === 'whatsapp_proactive').length})</span>
              </button>

              <button
                type="button"
                onClick={() => setFilterChannel(filterChannel === 'proactive_agent' ? 'all' : 'proactive_agent')}
                className={`px-2 py-0.5 rounded-full border transition-all cursor-pointer flex items-center gap-1 ${
                  filterChannel === 'proactive_agent'
                    ? 'bg-purple-500 text-white border-purple-600'
                    : 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:border-purple-500/50'
                }`}
                title="Saring tugas dari AI Agent Proaktif"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                <span>AI Proaktif: {tasks.length > 0 ? Math.round((tasks.filter(t => t.source_channel === 'proactive_agent' || t.source_channel === 'ai_agent_autonomous').length / tasks.length) * 100) : 0}%</span>
                <span className="opacity-70 font-mono">({tasks.filter(t => t.source_channel === 'proactive_agent' || t.source_channel === 'ai_agent_autonomous').length})</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tier Notice & Conflict Notification */}
      {tierScopeNotice && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 text-[11px] text-emerald-400 text-center flex items-center justify-center gap-1.5">
          <Layers className="w-3.5 h-3.5" />
          {tierScopeNotice}
        </div>
      )}

      {conflictWarning && (
        <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-400 text-center flex items-center justify-center gap-1.5 animate-pulse">
          <AlertTriangle className="w-4 h-4" />
          {conflictWarning}
        </div>
      )}

      {errorMsg && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 px-4 py-2 text-xs text-rose-400 text-center flex items-center justify-between">
          <span>{errorMsg}</span>
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
      <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col p-4">
        {isNotFound ? (
          <div className="max-w-xl mx-auto py-12 w-full">
            <ErrorState
              title="Board Tidak Ditemukan"
              message="Board tidak ditemukan atau di luar cakupan akses Anda."
              retryLabel="Kembali ke Board Utama"
              onRetry={() => {
                setIsNotFound(false);
                setActiveBoardId(undefined);
              }}
            />
          </div>
        ) : loading ? (
          <div className="p-8">
            <SkeletonLoader />
          </div>
        ) : columns.length === 0 ? (
          <EmptyState
            title="Belum Ada Kolom Papan"
            description="Papan kerja belum memiliki kolom tahapan operasional. Silakan inisialisasi kolom tahapan."
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            {/* Horizontal Container Kolom */}
            <div className="flex-1 flex gap-4 overflow-x-auto pb-4 items-start">
              {columns.map((column) => (
                <DroppableColumn
                  key={column.id}
                  column={column}
                  tasks={displayedTasks.filter((t) => t.column_id === column.id)}
                  allColumns={columns}
                  onMoveNonDrag={executeMoveTask}
                  onAddTask={(colId) => {
                    setSelectedColumnId(colId);
                    setShowAddModal(true);
                  }}
                  onSelectTask={(task) => setSelectedTask(task)}
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

      {/* Modal / Drawer Detail Kartu Bergaya Trello */}
      {selectedTask && (
        <TaskDetailDrawer
          task={selectedTask}
          columns={columns}
          onClose={() => setSelectedTask(null)}
          onTaskUpdated={loadBoardData}
          currentUserId={currentUserId}
        />
      )}

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
                  placeholder="Mis. Verifikasi dokumen audit keuangan" // allowlist: standard UI input hint
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
                  placeholder="Detail instruksi penugasan..." // allowlist: standard UI input hint
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
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none"
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
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none"
                  >
                    <option value="low">Rendah</option>
                    <option value="medium">Sedang</option>
                    <option value="high">Tinggi</option>
                    <option value="urgent">Mendesak</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Label (pisahkan koma)
                  </label>
                  <input
                    type="text"
                    placeholder="FINANCE, AUDIT" // allowlist: standard UI input hint
                    value={newLabelsStr}
                    onChange={(e) => setNewLabelsStr(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">
                    Kanal Asal
                  </label>
                  <select
                    value={newChannel}
                    onChange={(e) => setNewChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-700 bg-slate-800 text-white text-xs outline-none"
                  >
                    <option value="dashboard">Dashboard</option>
                    <option value="telegram">Telegram</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="proactive_agent">AI Proaktif</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold shadow-xs"
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
