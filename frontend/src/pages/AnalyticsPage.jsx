import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, ClipboardList,
  RefreshCw, TrendingUp, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex items-center gap-4">
    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tone}`}>
      <Icon size={20} />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-800">{value ?? 0}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  </div>
);

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [overviewRes, updatesRes] = await Promise.all([
        api.get(`/api/analytics/overview?days=${days}`),
        api.get(`/api/analytics/daily-updates?days=${days}`),
      ]);
      setOverview(overviewRes.data);
      setUpdates(updatesRes.data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days]);

  const recentUpdates = useMemo(() => updates.slice(0, 25), [updates]);
  if (user?.role !== 'admin') return null;

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Team Analytics</h2>
          <p className="text-sm text-slate-500 mt-1">
            Daily progress, update compliance, blockers and workload.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
            className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
          <button
            onClick={load}
            className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600"
            title="Refresh analytics"
          >
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {loading && !overview ? (
        <div className="py-20 text-center text-slate-500">Loading analytics…</div>
      ) : overview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Stat icon={ClipboardList} label="Open assigned tasks" value={overview.summary.openTasks} tone="bg-indigo-50 text-indigo-600" />
            <Stat icon={Activity} label="Updates today" value={overview.summary.updatesToday} tone="bg-emerald-50 text-emerald-600" />
            <Stat icon={AlertCircle} label="Missing today" value={overview.summary.missingToday} tone="bg-amber-50 text-amber-600" />
            <Stat icon={CheckCircle2} label="Completed in period" value={overview.summary.completedInPeriod} tone="bg-purple-50 text-purple-600" />
            <Stat icon={Users} label="Active people" value={overview.summary.activePeople} tone="bg-sky-50 text-sky-600" />
          </div>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Performance by Person</h3>
              <p className="text-xs text-slate-500 mt-1">
                Update compliance is based on days with at least one submitted update.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-4 py-3">Open</th>
                    <th className="px-4 py-3">Updated Today</th>
                    <th className="px-4 py-3">Missing Today</th>
                    <th className="px-4 py-3">Period Updates</th>
                    <th className="px-4 py-3">Compliance</th>
                    <th className="px-4 py-3">Blockers</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.people.map((person) => (
                    <tr key={person._id} className="border-t border-slate-50 text-sm">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{person.username}</p>
                        <p className="text-xs text-slate-400">{person.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-4 font-semibold">{person.assignedOpen}</td>
                      <td className="px-4 py-4 text-emerald-600 font-semibold">{person.updatesToday}</td>
                      <td className={`px-4 py-4 font-semibold ${person.missingToday ? 'text-amber-600' : 'text-slate-400'}`}>
                        {person.missingToday}
                      </td>
                      <td className="px-4 py-4">{person.updatesInPeriod}</td>
                      <td className="px-4 py-4 min-w-[150px]">
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${person.compliancePercent >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                              style={{ width: `${person.compliancePercent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600">{person.compliancePercent}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-4">{person.blockerCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
              <TrendingUp size={18} className="text-indigo-600" />
              <div>
                <h3 className="font-bold text-slate-800">Recent Daily Updates</h3>
                <p className="text-xs text-slate-500">Timezone: {overview.timezone}</p>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {recentUpdates.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">No daily updates in this period.</p>
              ) : recentUpdates.map((update) => (
                <article key={update._id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                    <span className="font-semibold text-slate-800">{update.author?.username}</span>
                    <span className="text-xs text-slate-400">• {update.updateDate}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                      {update.progressPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    {update.task?.project?.title} / {update.task?.title}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{update.content}</p>
                  {update.blockers && (
                    <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-2">
                      <strong>Blocker:</strong> {update.blockers}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
