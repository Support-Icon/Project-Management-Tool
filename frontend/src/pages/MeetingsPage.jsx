import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Clock, Link2, Mail, PhoneOff, Plus, Video, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST } from '../utils/time';
import { ROLE_LABELS, canSeeAll } from '../utils/roles';
import { useAuth } from '../context/AuthContext';
import { meetingInviteText, cleanSummaryText } from '../utils/meet';
import PageLoader from '../components/PageLoader';
import PersonName from '../components/PersonName';
import UserAvatar from '../components/UserAvatar';

function SchedulePicker({ type, value, onChange, label, icon: Icon }) {
  const ref = useRef(null);
  const openPicker = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const el = ref.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try { el.showPicker(); return; } catch (_) {}
    }
    el.focus();
    el.click();
  };
  return (
    <div className="text-xs text-slate-400">
      {label}
      <div className="mt-1 flex items-stretch rounded-xl bg-white/10 border border-white/10 overflow-hidden">
        <input
          ref={ref}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-white outline-none [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:hidden"
        />
        <button
          type="button"
          onClick={openPicker}
          className="px-2.5 text-brand-green hover:bg-white/10 border-l border-white/10"
          title={`Choose ${label.toLowerCase()}`}
        >
          <Icon size={16} />
        </button>
      </div>
    </div>
  );
}

export default function MeetingsPage() {
  const { user } = useAuth();
  const canCut = canSeeAll(user);
  const navigate = useNavigate();
  const [live, setLive] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [ended, setEnded] = useState([]);
  const [title, setTitle] = useState('');
  const [directory, setDirectory] = useState([]);
  const [invitees, setInvitees] = useState([]);
  const [emails, setEmails] = useState([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [mode, setMode] = useState('now');
  const [whenDate, setWhenDate] = useState(() => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date()));
  const [whenTime, setWhenTime] = useState('10:00');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/api/meetings');
      setLive(res.data.live || []);
      setScheduled(res.data.scheduled || []);
      setEnded(res.data.ended || []);
    } catch (_) {}
    finally { setReady(true); }
  };

  useEffect(() => {
    load();
    api.get('/api/users/directory').then((res) => setDirectory(res.data || [])).catch(() => {});
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const addEmail = () => {
    const addr = emailDraft.trim().toLowerCase();
    if (!addr) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      toast.error('Enter a valid email');
      return;
    }
    setEmails((prev) => (prev.includes(addr) ? prev : [...prev, addr]));
    setEmailDraft('');
  };

  const startMeet = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        title: title.trim() || 'Team meeting',
        invitees: invitees.map((id) => String(id)).filter(Boolean),
        emails,
      };
      if (mode === 'schedule') {
        payload.scheduledAt = new Date(`${whenDate}T${whenTime}:00+05:30`).toISOString();
      }
      const res = await api.post('/api/meetings', payload);
      const mailed = res.data.emailed || 0;
      if (res.data.status === 'scheduled') {
        toast.success(mailed ? `Scheduled. Invite sent to ${mailed} email${mailed === 1 ? '' : 's'}.` : 'Meeting scheduled');
        setTitle('');
        setInvitees([]);
        setEmails([]);
        await load();
      } else {
        if (mailed) toast.success(`Invite sent to ${mailed} email${mailed === 1 ? '' : 's'}`);
        navigate(`/meet/${res.data._id}`);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start meeting');
    } finally {
      setBusy(false);
    }
  };

  const startScheduled = async (meeting, event) => {
    event.stopPropagation();
    setBusy(true);
    try {
      const res = await api.post(`/api/meetings/${meeting._id}/start`);
      navigate(`/meet/${res.data._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start meeting');
    } finally {
      setBusy(false);
    }
  };

  const toggleInvite = (id) => {
    setInvitees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const endLive = async (meeting, event) => {
    event.stopPropagation();
    if (!window.confirm(`End “${meeting.title}” for everyone?`)) return;
    try {
      await api.post(`/api/meetings/${meeting._id}/end`);
      toast.success('Meeting ended');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not end meeting');
    }
  };

  const copyInvite = async (meeting, event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(meetingInviteText(meeting.title, meeting.guestToken));
      toast.success('Invite copied — this link is for this meeting only');
    } catch (_) {
      toast.error('Could not copy link');
    }
  };

  if (!ready) return <PageLoader label="Loading meetings…" />;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-brand-ink flex items-center gap-2">
          <Video size={22} className="text-brand-green" /> Live Meet
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Start now or schedule a call. Add people or email IDs — we send the invite to their mail.
        </p>
      </div>

      <form onSubmit={startMeet} className="bg-brand-ink text-white rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title (optional)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-sm outline-none focus:ring-2 focus:ring-brand-green"
        />
        <div className="flex rounded-xl overflow-hidden border border-white/10 w-fit">
          <button
            type="button"
            onClick={() => setMode('now')}
            className={`px-3 py-1.5 text-xs font-semibold ${mode === 'now' ? 'bg-brand-green text-brand-ink' : 'text-slate-300'}`}
          >
            Start now
          </button>
          <button
            type="button"
            onClick={() => setMode('schedule')}
            className={`px-3 py-1.5 text-xs font-semibold ${mode === 'schedule' ? 'bg-brand-green text-brand-ink' : 'text-slate-300'}`}
          >
            Schedule
          </button>
        </div>
        {mode === 'schedule' && (
          <div className="grid grid-cols-2 gap-2">
            <SchedulePicker
              type="date"
              label="Date"
              value={whenDate}
              onChange={setWhenDate}
              icon={CalendarDays}
            />
            <SchedulePicker
              type="time"
              label="Time (IST)"
              value={whenTime}
              onChange={setWhenTime}
              icon={Clock}
            />
          </div>
        )}
        <div>
          <p className="text-xs text-slate-400 mb-2">Invite people</p>
          <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
            {directory.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => toggleInvite(String(p._id))}
                className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium border ${
                  invitees.includes(String(p._id))
                    ? 'bg-brand-green text-brand-ink border-brand-green'
                    : 'border-white/15 text-slate-300'
                }`}
              >
                <UserAvatar user={p} size={16} className="rounded-full" />
                {p.username}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-2">Invite by email ID</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addEmail();
                }
              }}
              placeholder="name@company.com"
              className="flex-1 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-sm outline-none"
            />
            <button
              type="button"
              onClick={addEmail}
              className="px-3 py-2 rounded-xl bg-white/10 text-sm font-semibold"
            >
              Add
            </button>
          </div>
          {emails.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {emails.map((addr) => (
                <span key={addr} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 text-[11px]">
                  <Mail size={11} /> {addr}
                  <button type="button" onClick={() => setEmails((prev) => prev.filter((x) => x !== addr))}>
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold disabled:opacity-50"
        >
          <Plus size={16} /> {mode === 'schedule' ? 'Schedule & send invite' : 'Start meeting'}
        </button>
      </form>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Scheduled</h2>
        {!scheduled.length ? (
          <p className="text-sm text-slate-400 bg-white rounded-2xl border border-black/5 p-6 text-center">
            No scheduled meetings.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 mb-2">
            {scheduled.map((m) => (
              <div key={m._id} className="bg-white rounded-2xl border border-black/5 p-4 shadow-sm">
                <p className="font-semibold text-brand-ink">{m.title}</p>
                <p className="text-xs text-brand-blue mt-1 flex items-center gap-1.5">
                  <Clock size={12} /> {m.scheduledAt ? formatIST(m.scheduledAt) : 'Time not set'}
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Host <PersonName user={m.host} size={16} nameClassName="text-slate-500" />
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {String(m.host?._id || m.host) === String(user?._id) || canCut ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(e) => startScheduled(m, e)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-ink bg-brand-green px-3 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      <Video size={13} /> Start
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Waiting for host</span>
                  )}
                  {m.guestToken && (
                    <button
                      type="button"
                      onClick={(e) => copyInvite(m, e)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue"
                    >
                      <Link2 size={13} /> Copy guest invite
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Live now</h2>
        {!live.length ? (
          <p className="text-sm text-slate-400 bg-white rounded-2xl border border-black/5 p-6 text-center">
            No live meetings. Start one above.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {live.map((m) => (
              <div
                key={m._id}
                className="text-left bg-white rounded-2xl border border-black/5 p-4 shadow-sm hover:border-brand-green"
              >
                <button type="button" onClick={() => navigate(`/meet/${m._id}`)} className="w-full text-left">
                  <p className="font-semibold text-brand-ink">{m.title}</p>
                  <div className="text-xs text-brand-blue mt-1 flex items-center gap-1.5">
                    Host <PersonName user={m.host} size={16} nameClassName="text-brand-blue" /> · {m.liveParticipants?.length || 0} in call
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{formatIST(m.startedAt)}</p>
                </button>
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.guestToken && (
                    <button
                      type="button"
                      onClick={(e) => copyInvite(m, e)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-blue"
                    >
                      <Link2 size={13} /> Copy guest invite
                    </button>
                  )}
                  {canCut && (
                    <button
                      type="button"
                      onClick={(e) => endLive(m, e)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-red"
                    >
                      <PhoneOff size={13} /> End meeting
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Recent summaries</h2>
        {!ended.length ? (
          <p className="text-sm text-slate-400 bg-white rounded-2xl border border-black/5 p-6 text-center">
            Ended meetings will show an AI summary here.
          </p>
        ) : (
          <div className="space-y-3">
            {ended.map((m) => (
              <button
                key={m._id}
                type="button"
                onClick={() => navigate(`/meet/${m._id}/summary`)}
                className="w-full text-left bg-white rounded-2xl border border-black/5 p-4 shadow-sm hover:border-brand-blue"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-brand-ink">{m.title}</p>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                      <PersonName user={m.host} size={16} nameClassName="text-slate-500" /> · {ROLE_LABELS[m.host?.role] || ''}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock size={12} /> {formatIST(m.endedAt)}
                  </span>
                </div>
                {m.summary && (
                  <p className="text-sm text-slate-600 mt-2 line-clamp-3 whitespace-pre-wrap">{cleanSummaryText(m.summary)}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
