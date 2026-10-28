import React, { useEffect, useState } from 'react';
import { Circle, Coffee, LogIn, LogOut, Palmtree, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST, toDateOnly } from '../utils/time';

const STATUS = [
  { id: 'working', label: 'Working', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'off', label: 'Off', className: 'bg-slate-100 text-slate-600 border-slate-200' },
];

export default function DayStatusBar() {
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const today = toDateOnly(new Date());
  const [leaveForm, setLeaveForm] = useState({ startDate: today, endDate: today, reason: '' });

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
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  const requestLeave = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/leaves', leaveForm);
      toast.success('Leave request sent');
      setLeaveOpen(false);
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not request leave');
    } finally {
      setBusy(false);
    }
  };

  const approvedLeave = row?.leave?.status === 'approved';
  const pendingLeave = row?.leave?.status === 'pending';
  const current = approvedLeave
    ? { id: 'leave', label: 'On leave', className: 'bg-amber-50 text-amber-700 border-amber-200' }
    : (STATUS.find((s) => s.id === (row?.status || 'working')) || STATUS[0]);
  const started = Boolean(row?.startAt);
  const ended = Boolean(row?.endAt);
  const onBreak = Boolean(row?.onBreak);
  const blocked = approvedLeave || row?.status === 'leave' || row?.status === 'off';

  return (
    <>
      <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap overflow-x-auto scrollbar-thin py-0.5 max-w-[70vw] sm:max-w-none">
        {approvedLeave ? (
          <span className={`text-xs font-semibold px-2 py-1.5 rounded-lg border whitespace-nowrap ${current.className}`}>
            On leave
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
          onClick={() => act(() => api.post('/api/attendance/end'), 'Day ended')}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
          title={ended ? `Ended ${formatIST(row.endAt)}` : 'End day'}
        >
          <LogOut size={13} /> End
        </button>
        <button
          type="button"
          disabled={busy || approvedLeave}
          onClick={() => setLeaveOpen(true)}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-brand-blue/30 text-brand-blue bg-white hover:bg-sky-50 disabled:opacity-40 whitespace-nowrap"
          title="Ask your manager for leave"
        >
          <Palmtree size={13} /> Leave
        </button>
        {started && (
          <span className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
            <Circle size={8} className={
              ended ? 'text-slate-400' : onBreak ? 'text-amber-500 fill-amber-500' : 'text-emerald-500 fill-emerald-500'
            } />
            {ended ? 'Done' : onBreak ? 'Break' : 'In'}
          </span>
        )}
        {pendingLeave && (
          <span className="text-[11px] text-amber-600 font-medium whitespace-nowrap">Leave pending</span>
        )}
      </div>

      {leaveOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={requestLeave}
            className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-5 shadow-xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-brand-ink">Request leave</h3>
              <button type="button" onClick={() => setLeaveOpen(false)} className="text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs text-slate-500">
                From
                <input
                  type="date"
                  required
                  value={leaveForm.startDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, startDate: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800"
                />
              </label>
              <label className="text-xs text-slate-500">
                To
                <input
                  type="date"
                  required
                  value={leaveForm.endDate}
                  onChange={(e) => setLeaveForm((f) => ({ ...f, endDate: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm text-slate-800"
                />
              </label>
            </div>
            <textarea
              value={leaveForm.reason}
              onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))}
              rows={3}
              placeholder="Reason (optional)"
              className="mt-3 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="mt-4 w-full py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold disabled:opacity-50"
            >
              Send to manager
            </button>
          </form>
        </div>
      )}
    </>
  );
}
