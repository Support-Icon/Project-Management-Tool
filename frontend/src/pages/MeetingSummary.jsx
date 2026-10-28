import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import { cleanSummaryText } from '../utils/meet';
import { formatIST } from '../utils/time';

export default function MeetingSummary() {
  const { meetingId } = useParams();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.get(`/api/meetings/${meetingId}`)
      .then((res) => {
        if (!cancelled) setMeeting(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load summary');
      });
    return () => { cancelled = true; };
  }, [meetingId]);

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
        <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide">Meeting summary</p>
        <h1 className="text-xl font-bold text-brand-ink mt-1">{meeting.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {meeting.participants?.length || 0} participant(s)
          {meeting.endedAt ? ` · ${formatIST(meeting.endedAt)}` : ''}
        </p>
        <div className="mt-5 whitespace-pre-wrap text-slate-700 text-sm leading-relaxed">
          {cleanSummaryText(meeting.summary) || 'No summary was saved.'}
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
