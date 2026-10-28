import React, { useEffect, useState } from 'react';
import { Check, Palmtree, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canSeeAll, canViewTeamAnalytics, ROLE_LABELS } from '../utils/roles';
import { formatIST, toDateOnly } from '../utils/time';
import PageLoader from '../components/PageLoader';
import PersonName from '../components/PersonName';

const tone = {
  pending: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function LeavesPage() {
  const { user } = useAuth();
  const reviewer = canViewTeamAnalytics(user);
  const today = toDateOnly(new Date());
  const [mine, setMine] = useState([]);
  const [queue, setQueue] = useState([]);
  const [form, setForm] = useState({ startDate: today, endDate: today, reason: '' });
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = async () => {
    try {
      const mineRes = await api.get('/api/leaves?mine=true');
      setMine(mineRes.data || []);
      if (reviewer) {
        const all = await api.get('/api/leaves');
        setQueue((all.data || []).filter((r) => r.status === 'pending' && r.user?._id !== user?._id));
      }
    } catch (_) {}
    finally { setReady(true); }
  };

  useEffect(() => { load(); }, [reviewer, user?._id]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/api/leaves', form);
      toast.success('Leave request sent to your manager');
      setForm({ startDate: today, endDate: today, reason: '' });
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not send request');
    } finally {
      setBusy(false);
    }
  };

  const review = async (id, decision) => {
    try {
      await api.post(`/api/leaves/${id}/review`, { decision });
      toast.success(decision === 'approved' ? 'Leave approved' : 'Leave declined');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not review');
    }
  };

  const cancel = async (id) => {
    try {
      await api.post(`/api/leaves/${id}/cancel`);
      toast.success('Request cancelled');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not cancel');
    }
  };

  if (!ready) return <PageLoader label="Loading leave…" />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-brand-ink flex items-center gap-2">
          <Palmtree size={22} className="text-brand-green" /> Leave
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Ask your manager for time off. {canSeeAll(user) ? 'You can also approve team requests.' : 'Your manager reviews each request.'}
        </p>
      </div>

      <form onSubmit={submit} className="bg-white rounded-2xl border border-black/5 p-4 sm:p-5 shadow-sm space-y-3">
        <p className="font-semibold text-brand-ink text-sm">New request</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-slate-500">
            From
            <input
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </label>
          <label className="text-xs text-slate-500">
            To
            <input
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </label>
        </div>
        <textarea
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          rows={3}
          placeholder="Reason"
          className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold disabled:opacity-50"
        >
          Send request
        </button>
      </form>

      {reviewer && (
        <section className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <div className="px-4 sm:px-5 py-3 border-b border-black/5">
            <h2 className="font-semibold text-brand-ink text-sm">Waiting for approval</h2>
          </div>
          {!queue.length ? (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">No pending requests.</p>
          ) : queue.map((row) => (
            <div key={row._id} className="px-4 sm:px-5 py-4 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <PersonName user={row.user} size={28} nameClassName="font-semibold text-slate-800" />
                <p className="text-xs text-slate-400">{ROLE_LABELS[row.user?.role] || row.user?.role}</p>
                <p className="text-sm text-slate-600 mt-1">{row.startDate} → {row.endDate}</p>
                {row.reason && <p className="text-sm text-slate-500 mt-0.5">{row.reason}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => review(row._id, 'approved')}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-brand-green text-brand-ink text-sm font-semibold"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => review(row._id, 'rejected')}
                  className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl border border-rose-200 text-rose-600 text-sm font-semibold"
                >
                  <X size={14} /> Decline
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-black/5">
          <h2 className="font-semibold text-brand-ink text-sm">My requests</h2>
        </div>
        {!mine.length ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">You have not requested leave yet.</p>
        ) : mine.map((row) => (
          <div key={row._id} className="px-4 sm:px-5 py-4 border-b border-slate-50 flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-800">{row.startDate} → {row.endDate}</p>
              {row.reason && <p className="text-sm text-slate-500 mt-0.5">{row.reason}</p>}
              <p className="text-[11px] text-slate-400 mt-1">{formatIST(row.createdAt)}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={`px-2 py-1 rounded-lg text-[11px] font-semibold capitalize ${tone[row.status]}`}>
                {row.status}
              </span>
              {row.status === 'pending' && (
                <button type="button" onClick={() => cancel(row._id)} className="text-xs text-slate-400 hover:text-rose-500">
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
