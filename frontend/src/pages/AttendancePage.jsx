import React, { useEffect, useState } from 'react';
import { CalendarDays, Clock, Coffee, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST } from '../utils/time';
import { Navigate } from 'react-router-dom';
import { ROLE_LABELS, canViewTeamAnalytics } from '../utils/roles';
import { useAuth } from '../context/AuthContext';
import PageLoader from '../components/PageLoader';
import PersonName from '../components/PersonName';

const tone = {
  working: 'bg-emerald-50 text-emerald-700',
  leave: 'bg-amber-50 text-amber-700',
  off: 'bg-slate-100 text-slate-600',
};

const todayIst = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
}).format(new Date());

const shiftIst = (iso, days) => {
  const d = new Date(`${iso}T12:00:00+05:30`);
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
};

const labelDay = (iso) => {
  const d = new Date(`${iso}T12:00:00+05:30`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
};

const PersonRow = ({ p }) => (
  <>
    <PersonName user={p} name={p.username} avatar={p.avatar} size={28} nameClassName="font-medium text-slate-800" />
  </>
);

export default function AttendancePage() {
  const { user } = useAuth();
  const today = todayIst();
  const [fromDate, setFromDate] = useState(() => shiftIst(todayIst(), -6));
  const [toDate, setToDate] = useState(today);
  const [days, setDays] = useState([]);
  const [range, setRange] = useState({ from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const query = `from=${fromDate}&to=${toDate}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/api/attendance?${query}`)
      .then((res) => {
        if (cancelled) return;
        const list = [...(res.data.days || [])].reverse();
        setDays(list);
        setRange({ from: res.data.from || fromDate, to: res.data.to || toDate });
      })
      .catch((err) => {
        if (!cancelled) {
          setDays([]);
          toast.error(err.response?.data?.message || 'Could not load attendance');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [query]);

  const downloadReport = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/api/attendance/export?${query}`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const name = fromDate === toDate
        ? `attendance-${fromDate}.csv`
        : `attendance-${fromDate}-to-${toDate}.csv`;
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Attendance report downloaded');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not download attendance');
    } finally {
      setDownloading(false);
    }
  };

  if (!canViewTeamAnalytics(user)) return <Navigate to="/" replace />;
  if (loading && days.length === 0) return <PageLoader label="Loading attendance…" />;

  const rangeLabel = range.from && range.to
    ? (range.from === range.to
      ? labelDay(range.from)
      : `${labelDay(range.from)} – ${labelDay(range.to)}`)
    : '';

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CalendarDays size={22} className="text-brand-green" /> Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {rangeLabel ? `Showing ${rangeLabel}` : 'Start / end day, breaks, and leave.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">
            From
            <input
              type="date"
              value={fromDate}
              max={toDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="ml-2 px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </label>
          <label className="text-sm text-slate-600">
            To
            <input
              type="date"
              value={toDate}
              min={fromDate}
              max={today}
              onChange={(e) => setToDate(e.target.value)}
              className="ml-2 px-3 py-2 rounded-xl border border-slate-200 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={downloadReport}
            disabled={downloading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-brand-ink text-white text-sm font-semibold disabled:opacity-60"
          >
            <Download size={15} /> {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-400 mb-3">Updating {rangeLabel}…</p>
      )}

      {days.length === 0 && (
        <p className="bg-white rounded-2xl border border-slate-100 px-4 py-10 text-center text-sm text-slate-400">
          No attendance in this date range.
        </p>
      )}

      <div className="space-y-6">
        {days.map((day) => (
          <section key={day.date} className="space-y-3">
            <h2 className="text-sm font-bold text-slate-700 px-1">{labelDay(day.date)}</h2>

            <div className="sm:hidden space-y-3">
              {(day.people || []).map((p) => (
                <div key={`${day.date}-${p.userId}`} className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <PersonRow p={p} />
                      <p className="text-xs text-slate-400 mt-1">{ROLE_LABELS[p.role] || p.role}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${tone[p.status] || tone.working}`}>
                      {p.onBreak ? 'break' : p.status}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <p>Start {p.startAt ? formatIST(p.startAt) : '—'}</p>
                    <p>End {p.endAt ? formatIST(p.endAt) : '—'}</p>
                    <p className="flex items-center gap-1"><Clock size={12} /> {p.hours == null ? '—' : `${p.hours}h`}</p>
                    <p className="flex items-center gap-1"><Coffee size={12} /> {p.breakHours ? `${p.breakHours}h break` : '—'}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="hidden sm:block bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold">Person</th>
                    <th className="text-left px-4 py-3 font-semibold">Role</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-left px-4 py-3 font-semibold">Start</th>
                    <th className="text-left px-4 py-3 font-semibold">End</th>
                    <th className="text-left px-4 py-3 font-semibold">Break</th>
                    <th className="text-left px-4 py-3 font-semibold">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {(day.people || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">No people found.</td>
                    </tr>
                  )}
                  {(day.people || []).map((p) => (
                    <tr key={`${day.date}-${p.userId}`} className="border-t border-slate-50">
                      <td className="px-4 py-3">
                        <PersonRow p={p} />
                      </td>
                      <td className="px-4 py-3 text-slate-500">{ROLE_LABELS[p.role] || p.role}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-lg text-xs font-semibold capitalize ${tone[p.status] || tone.working}`}>
                          {p.onBreak ? 'on break' : p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.startAt ? formatIST(p.startAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.endAt ? formatIST(p.endAt) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.breakHours ? `${p.breakHours}h` : '—'}
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
          </section>
        ))}
      </div>
    </div>
  );
}
