import React, { useEffect, useState } from 'react';
import { Circle, LogIn, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST } from '../utils/time';

const STATUS = [
  { id: 'working', label: 'Working', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { id: 'leave', label: 'Leave', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  { id: 'off', label: 'Off', className: 'bg-slate-100 text-slate-600 border-slate-200' },
];

export default function DayStatusBar() {
  const [row, setRow] = useState(null);
  const [busy, setBusy] = useState(false);

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
      toast.success(ok);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  };

  const current = STATUS.find((s) => s.id === (row?.status || 'working')) || STATUS[0];
  const started = Boolean(row?.startAt);
  const ended = Boolean(row?.endAt);
  const blocked = row?.status === 'leave' || row?.status === 'off';

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        disabled={busy}
        value={row?.status || 'working'}
        onChange={(e) => act(() => api.put('/api/attendance/status', { status: e.target.value }), 'Status updated')}
        className={`text-xs font-semibold px-2 py-1.5 rounded-lg border outline-none ${current.className}`}
        title="Today's work status"
      >
        {STATUS.map((s) => (
          <option key={s.id} value={s.id}>{s.label}</option>
        ))}
      </select>
      <button
        type="button"
        disabled={busy || blocked || started}
        onClick={() => act(() => api.post('/api/attendance/start'), 'Day started')}
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-40"
        title={started ? `Started ${formatIST(row.startAt)}` : 'Start day'}
      >
        <LogIn size={13} /> Start
      </button>
      <button
        type="button"
        disabled={busy || blocked || !started || ended}
        onClick={() => act(() => api.post('/api/attendance/end'), 'Day ended')}
        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40"
        title={ended ? `Ended ${formatIST(row.endAt)}` : 'End day'}
      >
        <LogOut size={13} /> End
      </button>
      {started && (
        <span className="flex items-center gap-1 text-[11px] text-slate-500">
          <Circle size={8} className={ended ? 'text-slate-400' : 'text-emerald-500 fill-emerald-500'} />
          {ended ? 'Done' : 'In'}
        </span>
      )}
    </div>
  );
}
