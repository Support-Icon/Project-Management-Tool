import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, CheckCircle2, ClipboardList,
  RefreshCw, TrendingUp, Users, UserRound,
} from 'lucide-react';
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend,
  Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canViewTeamAnalytics } from '../utils/roles';

const STATUS_COLORS = {
  todo: '#6366f1',
  inprogress: '#f59e0b',
  review: '#8b5cf6',
  done: '#10b981',
};

const Charts = ({ charts }) => {
  if (!charts?.trend?.length) return null;
  const statusData = charts.status
    ? [
        { name: 'To Do', value: charts.status.todo || 0, color: STATUS_COLORS.todo },
        { name: 'In Progress', value: charts.status.inprogress || 0, color: STATUS_COLORS.inprogress },
        { name: 'Review', value: charts.status.review || 0, color: STATUS_COLORS.review },
        { name: 'Done', value: charts.status.done || 0, color: STATUS_COLORS.done },
      ].filter((row) => row.value > 0)
    : [];

  return (
    <div className="grid lg:grid-cols-2 gap-4 mb-6">
      <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <h3 className="font-bold text-slate-800 mb-1">Activity trend</h3>
        <p className="text-xs text-slate-400 mb-3">Daily updates, completions and new tasks</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={charts.trend}>
              <defs>
                <linearGradient id="upd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="updates" name="Updates" stroke="#4f46e5" fill="url(#upd)" />
              <Line type="monotone" dataKey="completed" name="Completed" stroke="#10b981" strokeWidth={2} />
              <Line type="monotone" dataKey="created" name="Created" stroke="#f59e0b" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>
      {statusData.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="font-bold text-slate-800 mb-1">Task status mix</h3>
          <p className="text-xs text-slate-400 mb-3">Current board distribution</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={3}>
                  {statusData.map((row) => <Cell key={row.name} fill={row.color} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      <section className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${statusData.length ? 'lg:col-span-2' : ''}`}>
        <h3 className="font-bold text-slate-800 mb-3">Updates per day</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="updates" name="Updates" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

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
  const isAdmin = canViewTeamAnalytics(user);
  const [tab, setTab] = useState(isAdmin ? 'team' : 'personal');
  const [days, setDays] = useState(7);
  const [overview, setOverview] = useState(null);
  const [personal, setPersonal] = useState(null);
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      if (isAdmin && tab === 'team') {
        const [overviewRes, updatesRes] = await Promise.all([
          api.get(`/api/analytics/overview?days=${days}`),
          api.get(`/api/analytics/daily-updates?days=${days}`),
        ]);
        setOverview(overviewRes.data);
        setUpdates(updatesRes.data);
      } else {
        const personalRes = await api.get(`/api/analytics/personal?days=${days}`);
        setPersonal(personalRes.data);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [days, tab, isAdmin]);

  const recentUpdates = useMemo(() => updates.slice(0, 25), [updates]);

  return (
    <div className="p-6 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {tab === 'team' ? 'Team Analytics' : 'My Personal Report'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {tab === 'team'
              ? 'Daily progress, update compliance, blockers and workload.'
              : 'Your open tasks, daily update compliance, and recent progress.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <div className="flex rounded-xl border border-slate-200 bg-white overflow-hidden">
              <button
                type="button"
                onClick={() => setTab('team')}
                className={`px-3 py-2 text-sm font-semibold flex items-center gap-1.5 ${
                  tab === 'team' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                }`}
              >
                <Users size={15} /> Team
              </button>
              <button
                type="button"
                onClick={() => setTab('personal')}
                className={`px-3 py-2 text-sm font-semibold flex items-center gap-1.5 ${
                  tab === 'personal' ? 'bg-indigo-600 text-white' : 'text-slate-600'
                }`}
              >
                <UserRound size={15} /> Personal
              </button>
            </div>
          )}
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

      {loading && !(overview || personal) ? (
        <div className="py-20 text-center text-slate-500">Loading analytics…</div>
      ) : tab === 'team' && overview ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <Stat icon={ClipboardList} label="In Progress tasks" value={overview.summary.openTasks} tone="bg-indigo-50 text-indigo-600" />
            <Stat icon={Activity} label="Daily updated correctly" value={overview.summary.updatesToday} tone="bg-emerald-50 text-emerald-600" />
            <Stat icon={AlertCircle} label="Missed update reports" value={overview.summary.missingToday} tone="bg-amber-50 text-amber-600" />
            <Stat icon={CheckCircle2} label="Completed in period" value={overview.summary.completedInPeriod} tone="bg-purple-50 text-purple-600" />
            <Stat icon={Users} label="Active people" value={overview.summary.activePeople} tone="bg-sky-50 text-sky-600" />
          </div>

          <Charts charts={overview.charts} />

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-6">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">Performance by Person</h3>
              <p className="text-xs text-slate-500 mt-1">
                Daily updated correctly = submitted today for In Progress tasks. To Do tasks do not need daily updates.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-slate-50">
                  <tr className="text-left text-xs uppercase text-slate-500">
                    <th className="px-5 py-3">Person</th>
                    <th className="px-4 py-3">Open</th>
                    <th className="px-4 py-3">Daily Updated Correctly</th>
                    <th className="px-4 py-3">Missed Update Report</th>
                    <th className="px-4 py-3">Update Reports in Period</th>
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
                    <span className="text-xs text-slate-400">· {update.updateDate}</span>
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
      ) : personal ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat icon={ClipboardList} label="My In Progress tasks" value={personal.summary.openTasks} tone="bg-indigo-50 text-indigo-600" />
            <Stat icon={Activity} label="Daily updated correctly" value={personal.summary.updatesToday} tone="bg-emerald-50 text-emerald-600" />
            <Stat icon={AlertCircle} label="Missed update reports" value={personal.summary.missingToday} tone="bg-amber-50 text-amber-600" />
            <Stat icon={CheckCircle2} label="Completed in period" value={personal.summary.completedInPeriod} tone="bg-purple-50 text-purple-600" />
          </div>

          <Charts charts={personal.charts} />

          <div className="grid lg:grid-cols-2 gap-6 mb-6">
            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <h3 className="font-bold text-slate-800 mb-1">Compliance</h3>
              <p className="text-xs text-slate-500 mb-4">Timezone: {personal.timezone}</p>
              <div className="flex items-center gap-3 mb-2">
                <div className="h-3 flex-1 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${personal.summary.compliancePercent >= 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${personal.summary.compliancePercent}%` }}
                  />
                </div>
                <span className="text-sm font-bold text-slate-700">{personal.summary.compliancePercent}%</span>
              </div>
              <p className="text-xs text-slate-500">Blockers logged: {personal.summary.blockerCount}</p>
            </section>

            <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="font-bold text-slate-800">In Progress tasks</h3>
              </div>
              <div className="divide-y divide-slate-50 max-h-72 overflow-y-auto">
                {personal.openTasks.length === 0 ? (
                  <p className="p-6 text-sm text-slate-400 text-center">No open tasks.</p>
                ) : personal.openTasks.map((task) => (
                  <div key={task._id} className="px-5 py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{task.title}</p>
                      <p className="text-xs text-slate-400">{task.project}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                      task.hasTodayUpdate ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    }`}>
                      {task.hasTodayUpdate ? 'Updated today' : 'Missing today'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-white rounded-2xl border border-slate-100 shadow-sm">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="font-bold text-slate-800">My recent updates</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {personal.recentUpdates.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-400">No updates in this period.</p>
              ) : personal.recentUpdates.map((update) => (
                <article key={update._id} className="p-5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
                    <span className="text-xs text-slate-400">{update.updateDate}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-semibold">
                      {update.progressPercent}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-1">
                    {update.task?.project?.title} / {update.task?.title}
                  </p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{update.content}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="py-20 text-center text-slate-500">No analytics data yet.</div>
      )}
    </div>
  );
}
