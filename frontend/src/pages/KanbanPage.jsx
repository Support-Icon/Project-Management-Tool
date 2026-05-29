import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { withMineOnly } from '../utils/apiQuery';
import toast from 'react-hot-toast';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import { Plus, Settings, ArrowLeft, RefreshCw, Loader2 } from 'lucide-react';

const columnHeaderColors = {
  todo: 'from-indigo-500 to-indigo-600',
  inprogress: 'from-amber-500 to-orange-500',
  review: 'from-purple-500 to-violet-600',
  done: 'from-emerald-500 to-teal-600',
};

const getColumnGradient = (colId, customColor) => {
  return columnHeaderColors[colId] || 'from-slate-500 to-slate-600';
};

export default function KanbanPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { user, adminMineOnly } = useAuth();
  const isAdmin = user?.role === 'admin';
  const showMineOnly = isAdmin ? adminMineOnly : true;

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { mode: 'create', column } | { mode: 'edit', task }
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [projRes, tasksRes] = await Promise.all([
        api.get(`/api/projects/${projectId}`),
        api.get(`/api/tasks/${projectId}${withMineOnly(isAdmin, adminMineOnly)}`),
      ]);
      setProject(projRes.data);
      setTasks(tasksRes.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to load project';
      toast.error(msg);
      navigate('/');
    } finally {
      setLoading(false);
    }
  }, [projectId, navigate, isAdmin, adminMineOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const getTasksByColumn = (colId) =>
    tasks
      .filter((t) => t.column === colId)
      .sort((a, b) => a.order - b.order);

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceTasks = getTasksByColumn(source.droppableId);
    const destTasks =
      source.droppableId === destination.droppableId
        ? sourceTasks
        : getTasksByColumn(destination.droppableId);

    // Remove from source
    const [moved] = sourceTasks.splice(source.index, 1);

    // Insert into destination
    if (source.droppableId === destination.droppableId) {
      sourceTasks.splice(destination.index, 0, moved);
      const updatedSource = sourceTasks.map((t, i) => ({ ...t, order: i }));
      setTasks((prev) => {
        const others = prev.filter((t) => t.column !== source.droppableId);
        return [...others, ...updatedSource];
      });
    } else {
      const movedTask = { ...moved, column: destination.droppableId };
      destTasks.splice(destination.index, 0, movedTask);

      const updatedDest = destTasks.map((t, i) => ({ ...t, order: i }));
      const updatedSource = sourceTasks.map((t, i) => ({ ...t, order: i }));

      setTasks((prev) => {
        const others = prev.filter(
          (t) => t.column !== source.droppableId && t.column !== destination.droppableId
        );
        return [...others, ...updatedSource, ...updatedDest];
      });
    }

    // Persist to backend
    setSaving(true);
    try {
      const allAffected = tasks.reduce((acc, t) => {
        if (t._id === draggableId) {
          acc.push({ _id: t._id, column: destination.droppableId, order: destination.index });
        }
        return acc;
      }, []);

      // Build full update list
      const finalTasks = [...tasks];
      const movedIdx = finalTasks.findIndex((t) => t._id === draggableId);
      if (movedIdx !== -1) {
        finalTasks[movedIdx] = { ...finalTasks[movedIdx], column: destination.droppableId };
      }

      const updates = [];
      project.columns.forEach((col) => {
        const colTasks = finalTasks
          .filter((t) => t.column === col.id)
          .sort((a, b) => a.order - b.order);
        colTasks.forEach((t, idx) => {
          updates.push({ _id: t._id, column: col.id, order: idx });
        });
      });

      await api.post('/api/tasks/reorder', { updates });
    } catch (_) {
      toast.error('Failed to save task order');
      fetchData();
    } finally {
      setSaving(false);
    }
  };

  const handleTaskSaved = (savedTask, isEdit) => {
    if (isEdit) {
      setTasks((t) => t.map((x) => x._id === savedTask._id ? savedTask : x));
    } else {
      setTasks((t) => [...t, savedTask]);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/api/tasks/${taskId}`);
      setTasks((t) => t.filter((x) => x._id !== taskId));
      toast.success('Task deleted');
    } catch (_) {
      toast.error('Failed to delete task');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Loading board…</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {showMineOnly && (
        <div className="mx-6 mt-4 px-4 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-sm text-indigo-700 flex-shrink-0">
          {isAdmin
            ? 'My Tasks mode — showing only tasks assigned to you. Use the header button to see all tasks.'
            : 'Showing only your assigned tasks in this project.'}
        </div>
      )}

      {/* Board header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shadow-sm flex-shrink-0">
        <button
          onClick={() => navigate('/')}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-slate-800 truncate">{project.title}</h2>
          {project.description && (
            <p className="text-slate-500 text-xs truncate">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-slate-400">
              <Loader2 size={13} className="animate-spin" /> Saving…
            </span>
          )}
          <button
            onClick={fetchData}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
            title="Refresh"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setModal({ mode: 'create', column: project.columns[0]?.id || 'todo' })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-all shadow-sm"
          >
            <Plus size={16} /> Add Task
          </button>
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-4 h-full" style={{ minWidth: `${project.columns.length * 300}px` }}>
            {project.columns
              .sort((a, b) => a.order - b.order)
              .map((col) => {
                const colTasks = getTasksByColumn(col.id);
                return (
                  <div
                    key={col.id}
                    className="flex flex-col w-72 flex-shrink-0"
                    style={{ height: 'calc(100vh - 200px)' }}
                  >
                    {/* Column header */}
                    <div className={`bg-gradient-to-r ${getColumnGradient(col.id)} rounded-t-2xl px-4 py-3 flex items-center justify-between shadow-sm`}>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">{col.title}</span>
                        <span className="bg-white/20 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
                          {colTasks.length}
                        </span>
                      </div>
                      <button
                        onClick={() => setModal({ mode: 'create', column: col.id })}
                        className="text-white/70 hover:text-white hover:bg-white/20 p-1 rounded-lg transition-all"
                        title="Add task"
                      >
                        <Plus size={16} />
                      </button>
                    </div>

                    {/* Droppable area */}
                    <Droppable droppableId={col.id}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`flex-1 rounded-b-2xl p-3 space-y-3 overflow-y-auto scrollbar-thin transition-colors kanban-column ${
                            snapshot.isDraggingOver
                              ? 'bg-indigo-50 ring-2 ring-indigo-200 ring-inset'
                              : 'bg-slate-200/60'
                          }`}
                        >
                          {colTasks.map((task, index) => (
                            <TaskCard
                              key={task._id}
                              task={task}
                              index={index}
                              onEdit={(t) => setModal({ mode: 'edit', task: t })}
                              onDelete={handleDelete}
                            />
                          ))}
                          {provided.placeholder}

                          {colTasks.length === 0 && !snapshot.isDraggingOver && (
                            <div className="text-center py-8">
                              <p className="text-slate-400 text-sm">Drop tasks here</p>
                            </div>
                          )}

                          {/* Add task button at bottom */}
                          <button
                            onClick={() => setModal({ mode: 'create', column: col.id })}
                            className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 text-xs font-medium hover:border-indigo-400 hover:text-indigo-500 hover:bg-white transition-all flex items-center justify-center gap-1"
                          >
                            <Plus size={13} /> Add task
                          </button>
                        </div>
                      )}
                    </Droppable>
                  </div>
                );
              })}
          </div>
        </DragDropContext>
      </div>

      {modal && (
        <TaskModal
          task={modal.mode === 'edit' ? modal.task : null}
          projectId={projectId}
          column={modal.mode === 'create' ? modal.column : null}
          columns={project.columns}
          onClose={() => setModal(null)}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}
