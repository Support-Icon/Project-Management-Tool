import React, { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Check, ChevronRight, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';

export default function DailyUpdateModal({ task, onClose, onSaved }) {
  const [history, setHistory] = useState([]);
  const [today, setToday] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    content: '',
    progressPercent: 0,
    blockers: '',
    nextPlan: '',
  });

  useEffect(() => {
    api.get(`/api/task-updates/${task._id}`)
      .then((res) => {
        setHistory(res.data.updates);
        setToday(res.data.today);
        const existing = res.data.updates.find((update) => update.updateDate === res.data.today);
        if (existing) {
          setForm({
            content: existing.content,
            progressPercent: existing.progressPercent,
            blockers: existing.blockers || '',
            nextPlan: existing.nextPlan || '',
          });
        }
      })
      .catch((error) => toast.error(error.response?.data?.message || 'Failed to load updates'))
      .finally(() => setLoading(false));
  }, [task._id]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const res = await api.post(`/api/task-updates/${task._id}`, form);
      setHistory((items) => [
        res.data,
        ...items.filter((item) => item.updateDate !== res.data.updateDate),
      ]);
      onSaved?.(res.data);
      toast.success('Daily update saved');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save daily update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        <header className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center gap-3 z-10">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Activity size={20} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800">Daily Task Update</h3>
            <p className="text-xs text-slate-500 truncate">{task.title}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </header>

        {loading ? (
          <div className="p-10 text-center text-slate-500">Loading updates…</div>
        ) : (
          <div className="p-6 space-y-7">
            {task.column !== 'done' ? (
              <form onSubmit={submit} className="space-y-4 bg-indigo-50/60 border border-indigo-100 rounded-2xl p-5">
                <div>
                  <h4 className="font-semibold text-indigo-900">Update for {today}</h4>
                  <p className="text-xs text-indigo-600 mt-1">You can edit today’s update until the task is completed.</p>
                </div>
                <label className="block">
                  <span className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">What did you work on?</span>
                  <textarea
                    value={form.content}
                    onChange={(e) => setForm((current) => ({ ...current, content: e.target.value }))}
                    rows={3}
                    required
                    maxLength={2000}
                    placeholder="Describe today's progress…"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs font-semibold text-slate-600 uppercase mb-1.5">
                    Progress <strong className="text-indigo-600">{form.progressPercent}%</strong>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={form.progressPercent}
                    onChange={(e) => setForm((current) => ({
                      ...current,
                      progressPercent: Number(e.target.value),
                    }))}
                    className="w-full accent-indigo-600"
                  />
                </label>
                <div className="grid sm:grid-cols-2 gap-3">
                  <label>
                    <span className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Blockers</span>
                    <textarea
                      value={form.blockers}
                      onChange={(e) => setForm((current) => ({ ...current, blockers: e.target.value }))}
                      rows={2}
                      placeholder="Anything blocking you?"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                  <label>
                    <span className="block text-xs font-semibold text-slate-600 uppercase mb-1.5">Next plan</span>
                    <textarea
                      value={form.nextPlan}
                      onChange={(e) => setForm((current) => ({ ...current, nextPlan: e.target.value }))}
                      rows={2}
                      placeholder="What will you do next?"
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-200 resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </label>
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Check size={16} /> {saving ? 'Saving…' : 'Save Daily Update'}
                </button>
              </form>
            ) : (
              <div className="bg-emerald-50 text-emerald-700 p-4 rounded-xl text-sm">
                This task is completed. Its update history is read-only.
              </div>
            )}

            <section>
              <h4 className="font-bold text-slate-800 mb-3">Update History</h4>
              {history.length === 0 ? (
                <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                  No daily updates yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {history.map((update) => (
                    <article key={update._id} className="border border-slate-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="text-sm font-semibold text-slate-700">{update.updateDate}</span>
                          <span className="text-xs text-slate-400 ml-2">by {update.author?.username}</span>
                        </div>
                        <span className="text-xs font-bold text-indigo-600">{update.progressPercent}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full mb-3 overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${update.progressPercent}%` }} />
                      </div>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap">{update.content}</p>
                      {update.blockers && (
                        <p className="mt-2 text-xs text-amber-700 flex gap-1.5">
                          <AlertTriangle size={13} /> <span><strong>Blocker:</strong> {update.blockers}</span>
                        </p>
                      )}
                      {update.nextPlan && (
                        <p className="mt-2 text-xs text-slate-500 flex gap-1.5">
                          <ChevronRight size={13} /> <span><strong>Next:</strong> {update.nextPlan}</span>
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
