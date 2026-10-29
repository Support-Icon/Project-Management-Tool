import React, { useEffect, useState } from 'react';
import { Check, Circle, Coffee, LogIn, Sunset, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST } from '../utils/time';
import DailyUpdateModal from './DailyUpdateModal';

const STATUS = [
  { id: 'working', label: 'Working', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'off', label: 'Off', className: 'bg-slate-100 text-slate-600 border-slate-200' },
];

export default function DayStatusBar() {
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [eodOpen, setEodOpen] = useState(false);
  const [pending, setPending] = useState([]);
  const [done, setDone] = useState([]);
  const [loadingEod, setLoadingEod] = useState(false);
  const [updateTask, setUpdateTask] = useState(null);

  const load = async () => {
    try {
      const res = await api.get('/api/attendance/today');
      setRow(res.data);
    } catch (_) {}
  };

  useEffect(() => { load(); }, []);

  const act = async (fn, ok) => {
    setBusy(true);
    try {
      const res = await fn();
      setRow(res.data);
      if (ok) toast.success(ok);
      return true;
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const loadEodTasks = async () => {
    setLoadingEod(true);
    try {
      const res = await api.get('/api/task-updates/pending/mine');
      setPending(res.data.pending || res.data.tasks || []);
      setDone(res.data.done || []);
    } catch (_) {
      setPending([]);
      setDone([]);
    } finally {
      setLoadingEod(false);
    }
  };

  const openEod = async () => {
    setEodOpen(true);
    await loadEodTasks();
  };

  const completeEod = async () => {
    if (pending.length > 0) {
      toast.error('Add daily updates for every In Progress task first');
      return;
    }
    const ok = await act(() => api.post('/api/attendance/end'), 'Work day complete');
    if (ok) setEodOpen(false);
  };

  const approvedLeave = row?.leave?.status === 'approved';
  const pendingLeave = row?.leave?.status === 'pending';
  const started = Boolean(row?.startAt);
  const ended = Boolean(row?.endAt) || row?.status === 'completed';
  const onBreak = Boolean(row?.onBreak);
  const blocked = approvedLeave || row?.status === 'leave' || row?.status === 'off' || ended;
  const current = approvedLeave
    ? { id: 'leave', label: 'On leave', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    : ended
      ? { id: 'completed', label: 'Completed', className: 'bg-brand-green/20 text-brand-ink border-brand-green' }
      : (STATUS.find((s) => s.id === (row?.status || 'working')) || STATUS[0]);

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto scrollbar-thin py-0.5 max-w-[70vw] sm:max-w-none">
        {approvedLeave || ended ? (
          <span className={`text-xs font-semibold px-2 py-1.5 rounded-lg border whitespace-nowrap ${current.className}`}>
            {ended ? 'Completed' : 'On leave'}
          </span>
        ) : (
          <select
            disabled={busy}
            value={row?.status === 'leave' ? 'working' : (row?.status || 'working')}
            onChange={(e) => act(() => api.put('/api/attendance/status', { status: e.target.value }), 'Status updated')}
            className={`text-xs font-semibold px-2 py-1.5 rounded-lg border outline-none ${current.className}`}
            title="Today's work status"
          >
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={busy || blocked || started}
          onClick={() => act(() => api.post('/api/attendance/start'), 'Day started')}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-40 whitespace-nowrap"
          title={started ? `Started ${formatIST(row.startAt)}` : 'Start day'}
        >
          <LogIn size={13} /> <span className="hidden xs:inline sm:inline">Start</span>
        </button>
        {started && !ended && !blocked && (
          <button
            type="button"
            disabled={busy}
            onClick={() => act(
              () => api.post(onBreak ? '/api/attendance/break/end' : '/api/attendance/break/start'),
              onBreak ? 'Break ended' : 'On break'
            )}
            className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap ${
              onBreak
                ? 'border-brand-yellow bg-brand-yellow/20 text-brand-ink'
                : 'border-amber-200 text-amber-700 bg-white hover:bg-amber-50'
            }`}
            title={onBreak ? 'Resume work' : 'Start a break'}
          >
            <Coffee size={13} /> {onBreak ? 'Resume' : 'Break'}
          </button>
        )}
        <button
          type="button"
          disabled={busy || blocked || !started || ended}
          onClick={openEod}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-brand-ink/15 text-brand-ink bg-white hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          title={ended ? `EOD ${formatIST(row.endAt)}` : 'End of day — daily updates then complete'}
        >
          <Sunset size={13} /> EOD
        </button>
        {started && (
          <span className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
            <Circle size={8} className={
              ended ? 'text-slate-400' : onBreak ? 'text-amber-500 fill-amber-500' : 'text-emerald-500 fill-emerald-500'
            } />
            {ended ? 'EOD' : onBreak ? 'Break' : 'In'}
          </span>
        )}
        {pendingLeave && (
          <span className="text-[11px] text-amber-600 font-medium whitespace-nowrap">Leave pending</span>
        )}
      </div>

      {eodOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-bold text-brand-ink">End of day</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add today’s daily update for every In Progress task, then complete EOD.
                </p>
              </div>
              <button type="button" onClick={() => setEodOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>

            {loadingEod ? (
              <p className="py-8 text-center text-sm text-slate-400">Loading today’s updates…</p>
            ) : (
              <div className="space-y-4">
                {pending.length === 0 && done.length === 0 && (
                  <p className="text-sm text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                    No In Progress tasks today. You can complete EOD.
                  </p>
                )}

                {pending.length > 0 && (
                  <section>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-2">
                      Need daily update ({pending.length})
                    </p>
                    <div className="space-y-2">
                      {pending.map((task) => (
                        <button
                          key={task._id}
                          type="button"
                          onClick={() => setUpdateTask(task)}
                          className="w-full text-left px-3 py-3 rounded-xl border border-amber-200 bg-amber-50 hover:border-amber-400"
                        >
                          <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{task.project?.title}</p>
                          <p className="text-[11px] text-amber-700 font-semibold mt-1">Add daily update</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {done.length > 0 && (
                  <section>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 mb-2">
                      Updated today ({done.length})
                    </p>
                    <div className="space-y-2">
                      {done.map((task) => (
                        <button
                          key={task._id}
                          type="button"
                          onClick={() => setUpdateTask(task)}
                          className="w-full text-left px-3 py-3 rounded-xl border border-emerald-100 bg-emerald-50/70"
                        >
                          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                            <Check size={14} className="text-emerald-600" /> {task.title}
                          </p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{task.project?.title}</p>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            <button
              type="button"
              disabled={busy || loadingEod || pending.length > 0}
              onClick={completeEod}
              className="mt-5 w-full py-2.5 rounded-xl bg-brand-ink text-white font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Sunset size={16} /> {pending.length > 0 ? 'Finish daily updates to EOD' : 'Complete EOD'}
            </button>
          </div>
        </div>
      )}

      {updateTask && (
        <DailyUpdateModal
          task={updateTask}
          onClose={() => setUpdateTask(null)}
          onSaved={() => {
            setUpdateTask(null);
            loadEodTasks();
          }}
        />
      )}
    </>
  );
}
