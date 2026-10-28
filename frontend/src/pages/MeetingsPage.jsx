import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clock, Link2, Plus, Video } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { formatIST } from '../utils/time';
import { ROLE_LABELS } from '../utils/roles';
import { meetingInviteText, cleanSummaryText } from '../utils/meet';

export default function MeetingsPage() {
  const navigate = useNavigate();
  const [live, setLive] = useState([]);
  const [ended, setEnded] = useState([]);
  const [title, setTitle] = useState('');
  const [directory, setDirectory] = useState([]);
  const [invitees, setInvitees] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const res = await api.get('/api/meetings');
      setLive(res.data.live || []);
      setEnded(res.data.ended || []);
    } catch (_) {}
  };

  useEffect(() => {
    load();
    api.get('/api/users/directory').then((res) => setDirectory(res.data || [])).catch(() => {});
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const startMeet = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post('/api/meetings', {
        title: title.trim() || 'Team meeting',
        invitees
      });
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

  const copyInvite = async (meeting, event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(meetingInviteText(meeting.title, meeting.guestToken));
      toast.success('Invite copied — this link is for this meeting only');
    } catch (_) {
      toast.error('Could not copy link');
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-brand-ink flex items-center gap-2">
          <Video size={22} className="text-brand-green" /> Live Meet
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Start a video call. When it ends, we save an AI summary from the notes.
        </p>
      </div>

      <form onSubmit={startMeet} className="bg-brand-ink text-white rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Meeting title (optional)"
          className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/10 text-sm outline-none focus:ring-2 focus:ring-brand-green"
        />
        <div>
          <p className="text-xs text-slate-400 mb-2">Invite people (leave empty for anyone in the company)</p>
          <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
            {directory.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => toggleInvite(p._id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                  invitees.includes(p._id)
                    ? 'bg-brand-green text-brand-ink border-brand-green'
                    : 'border-white/15 text-slate-300'
                }`}
              >
                {p.username}
              </button>
            ))}
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold disabled:opacity-50"
        >
          <Plus size={16} /> Start meeting
        </button>
      </form>

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
                  <p className="text-xs text-brand-blue mt-1">
                    Host {m.host?.username} · {m.liveParticipants?.length || 0} in call
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">{formatIST(m.startedAt)}</p>
                </button>
                {m.guestToken && (
                  <button
                    type="button"
                    onClick={(e) => copyInvite(m, e)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-blue"
                  >
                    <Link2 size={13} /> Copy guest invite
                  </button>
                )}
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
                    <p className="text-xs text-slate-500 mt-1">
                      {m.host?.username} · {ROLE_LABELS[m.host?.role] || ''}
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
