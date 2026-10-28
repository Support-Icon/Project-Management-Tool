import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock } from 'lucide-react';
import api from '../api/axios';
import { formatIST } from '../utils/time';
import { Navigate } from 'react-router-dom';
import { ROLE_LABELS, canViewTeamAnalytics } from '../utils/roles';
import { useAuth } from '../context/AuthContext';

const tone = {
  working: 'bg-emerald-50 text-emerald-700',
  leave: 'bg-amber-50 text-amber-700',
  off: 'bg-slate-100 text-slate-600',
};

export default function AttendancePage() {
  const { user } = useAuth();
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()));
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/api/attendance?date=${date}`)
      .then((res) => {
        if (!cancelled) setPeople(res.data.people || []);
      })
      .catch(() => {
        if (!cancelled) setPeople([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [date]);

  if (!canViewTeamAnalytics(user)) return <Navigate to="/" replace />;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays size={22} className="text-indigo-600" /> Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-1">Start / end day and working, leave, or off status.</p>
        </div>
        <label className="text-sm text-slate-600">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ml-2 px-3 py-2 rounded-xl border border-slate-200 text-sm"
          />
        </label>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Person</th>
              <th className="text-left px-4 py-3 font-semibold">Role</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Start</th>
              <th className="text-left px-4 py-3 font-semibold">End</th>
              <th className="text-left px-4 py-3 font-semibold">Hours</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                  <div className="w-8 h-8 mx-auto mb-2 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
                  Loading attendance…
                </td>
              </tr>
            )}
            {!loading && people.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">No people found.</td>
              </tr>
            )}
            {!loading && people.map((p) => (
              <tr key={p.userId} className="border-t border-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{p.username}</td>
                <td className="px-4 py-3 text-slate-500">{ROLE_LABELS[p.role] || p.role}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${tone[p.status] || tone.working}`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {p.startAt ? formatIST(p.startAt) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {p.endAt ? formatIST(p.endAt) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} />
                    {p.hours == null ? '—' : `${p.hours}h`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
