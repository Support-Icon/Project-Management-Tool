import React, { useEffect, useState } from 'react';
import { Activity, CheckCircle2, ClipboardList, RefreshCw, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canViewTeamAnalytics, ROLE_LABELS } from '../utils/roles';

export default function TeamWorkPage() {
  const { user } = useAuth();
  const allowed = canViewTeamAnalytics(user);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/analytics/today-work');
      setData(res.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load team work');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  if (!allowed) {
    return <div className="p-8 text-center text-slate-500">Manager or team lead access required.</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Today’s team work</h2>
          <p className="text-sm text-slate-500 mt-1">
            Only work done today ({data?.date || '…'} {data?.timezone ? `· ${data.timezone}` : ''}).
            {user?.role === 'team_lead' ? ' Showing your team members only.' : ' Showing everyone in the company.'}
          </p>
        </div>
        <button type="button" onClick={load} className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && !data ? (
        <p className="py-16 text-center text-slate-400">Loading today’s work…</p>
      ) : (
        <div className="space-y-4">
          {(data?.people || []).map((person) => (
            <section key={person.username} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold">
                  {person.username[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800">{person.username}</p>
                  <p className="text-xs text-slate-400">{ROLE_LABELS[person.role] || person.role}</p>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 flex items-center gap-1">
                  <ClipboardList size={12} /> {person.tasks?.length || 0} today
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 size={12} /> {person.doneToday} done
                </span>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 flex items-center gap-1">
                  <Activity size={12} /> {person.missedUpdates} missed
                </span>
              </div>
              {!person.tasks?.length ? (
                <p className="p-5 text-sm text-slate-400">No work logged today.</p>
              ) : (
                <div className="divide-y divide-slate-50">
                  {person.tasks.map((task, index) => (
                    <div key={`${person.username}-${index}`} className="px-5 py-3 flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800 flex-1">{task.title}</p>
                      <span className="text-xs text-slate-400">{task.project}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{task.column}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{task.updateStatus}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
          {!data?.people?.length && (
            <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-12 text-center">
              <Users size={36} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500">No people in scope yet. Add team members first.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
