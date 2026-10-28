import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Languages } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { MEET_LANGS, cleanSummaryText, meetT } from '../utils/meet';
import { formatIST } from '../utils/time';

export default function MeetingSummary() {
  const { meetingId } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState('en');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/meetings/${meetingId}`)
      .then((res) => {
        if (cancelled) return;
        setMeeting(res.data);
        const nextLang = res.data.language || 'en';
        setLang(nextLang);
        const cached = res.data.summaries?.[nextLang];
        setText(cached || res.data.summary || '');
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load summary');
      });
    return () => { cancelled = true; };
  }, [meetingId]);

  const changeLang = async (value) => {
    setLang(value);
    const cached = meeting?.summaries?.[value];
    if (cached) {
      setText(cached);
      return;
    }
    setBusy(true);
    try {
      const res = await api.post(`/api/meetings/${meetingId}/summary`, { language: value });
      setMeeting(res.data);
      setText(res.data.summary || '');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change summary language');
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-slate-700 font-semibold">{error}</p>
        <Link to="/meet" className="mt-4 inline-block text-brand-blue text-sm">Back to meetings</Link>
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="p-10 flex justify-center">
        <div className="w-10 h-10 rounded-full border-4 border-brand-green/30 border-t-brand-green animate-spin" />
      </div>
    );
  }

  if (meeting.status === 'live') {
    return <Navigate to={`/meet/${meetingId}`} replace />;
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="bg-white rounded-2xl border border-black/5 p-5 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide">Meeting summary</p>
            <h1 className="text-xl font-bold text-brand-ink mt-1">{meeting.title}</h1>
            <p className="text-sm text-slate-500 mt-1">
              {meeting.participants?.length || 0} participant(s)
              {meeting.endedAt ? ` · ${formatIST(meeting.endedAt)}` : ''}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Languages size={16} />
            <span className="hidden sm:inline">{meetT(lang, 'summaryLang')}</span>
            <select
              value={lang}
              disabled={busy}
              onChange={(e) => changeLang(e.target.value)}
              className="border border-black/10 rounded-xl px-2 py-1.5 text-sm bg-white outline-none focus:ring-2 focus:ring-brand-green"
            >
              {MEET_LANGS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-5 whitespace-pre-wrap text-slate-700 text-sm leading-relaxed min-h-[8rem]">
          {busy ? (
            <span className="inline-flex items-center gap-2 text-slate-400">
              <span className="w-4 h-4 rounded-full border-2 border-brand-green/30 border-t-brand-green animate-spin" />
              Translating summary…
            </span>
          ) : (cleanSummaryText(text) || 'No summary was saved.')}
        </div>
        <Link
          to="/meet"
          className="mt-6 inline-block px-4 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold"
        >
          Back to meetings
        </Link>
      </div>
    </div>
  );
}
