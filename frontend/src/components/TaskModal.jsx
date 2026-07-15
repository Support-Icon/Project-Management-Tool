import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { X, Check, Flag, Calendar, User, Tag, Link2 } from 'lucide-react';

const priorities = [
  { value: 'low', label: 'Low', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
  { value: 'medium', label: 'Medium', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { value: 'high', label: 'High', color: 'text-red-600 bg-red-50 border-red-200' },
];

const toDateInput = (value) => {
  if (!value) return '';
  const str = typeof value === 'string' ? value : new Date(value).toISOString();
  return str.slice(0, 10);
};

export default function TaskModal({ task, projectId, column, columns, projectTasks = [], onClose, onSaved }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    column: task?.column || column || 'todo',
    priority: task?.priority || 'medium',
    assigneeId: task?.assignee?._id || user?._id || '',
    startDate: toDateInput(task?.startDate),
    dueDate: toDateInput(task?.dueDate),
    dependsOn: task?.dependsOn?._id || task?.dependsOn || '',
    tags: task?.tags?.join(', ') || '',
  });
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      api.get('/api/users').then((r) => setMembers(r.data)).catch(() => {});
    }
  }, [isAdmin]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const dependencyOptions = projectTasks.filter((t) => t._id !== task?._id);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('Task title is required');
      return;
    }
    if (form.startDate && form.dueDate && form.startDate > form.dueDate) {
      toast.error('Start date must be on or before due date');
      return;
    }
    setLoading(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        column: form.column,
        priority: form.priority,
        assigneeId: isAdmin ? (form.assigneeId || null) : user._id,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        dependsOn: form.dependsOn || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      };

      let res;
      if (task) {
        res = await api.put(`/api/tasks/${task._id}`, payload);
        toast.success('Task updated');
      } else {
        res = await api.post('/api/tasks', { ...payload, projectId });
        toast.success('Task created');
      }
      onSaved(res.data, !!task);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-bold text-slate-800">
            {task ? 'Edit Task' : 'Create Task'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="What needs to be done?"
              required
              autoFocus
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={set('description')}
              placeholder="Add more details…"
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Flag size={12} /> Priority
              </label>
              <div className="flex gap-2">
                {priorities.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                    className={`flex-1 py-2 px-1 rounded-lg border text-xs font-semibold transition-all ${
                      form.priority === p.value
                        ? `${p.color} border-current`
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Column
              </label>
              <select
                value={form.column}
                onChange={set('column')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white"
              >
                {(columns || []).map((c) => (
                  <option key={c.id} value={c.id}>{c.title}</option>
                ))}
              </select>
            </div>
          </div>

          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <User size={12} /> Assignee
              </label>
              <select
                value={form.assigneeId}
                onChange={set('assigneeId')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white"
              >
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m._id} value={m._id}>{m.username}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Calendar size={12} /> Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={set('startDate')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
                <Calendar size={12} /> Due Date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={set('dueDate')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <Link2 size={12} /> Start after task completes
            </label>
            <select
              value={form.dependsOn}
              onChange={set('dependsOn')}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition bg-white"
            >
              <option value="">None — can start anytime</option>
              {dependencyOptions.map((t) => (
                <option key={t._id} value={t._id}>
                  {t.title}{t.column === 'done' ? ' (done)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1.5">
              This task waits until the selected task is completed, then start date unlocks automatically.
            </p>
          </div>

          {!isAdmin && (
            <p className="text-xs text-indigo-600 bg-indigo-50 px-3 py-2 rounded-lg">
              This task will be assigned to you automatically.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide flex items-center gap-1">
              <Tag size={12} /> Tags
            </label>
            <input
              type="text"
              value={form.tags}
              onChange={set('tags')}
              placeholder="bug, frontend, urgent (comma separated)"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><Check size={16} /> {task ? 'Update' : 'Create'} Task</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
