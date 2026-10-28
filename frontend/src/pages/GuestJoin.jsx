import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api/axios';
import BrandLogo from '../components/BrandLogo';
import PersonName from '../components/PersonName';
import { cleanSummaryText } from '../utils/meet';

export default function GuestJoin() {
  const { guestToken } = useParams();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/api/meetings/guest/${guestToken}`)
      .then((res) => setInfo(res.data))
      .catch((err) => setError(err.response?.data?.message || 'This meeting link is not valid'));
  }, [guestToken]);

  const join = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post(`/api/meetings/guest/${guestToken}/session`, { name: name.trim() });
      localStorage.setItem('meetGuest', JSON.stringify({
        token: res.data.token,
        guestId: res.data.guestId,
        meetingId: res.data.meetingId,
        name: name.trim()
      }));
      navigate(`/join/${guestToken}/room`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not join');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-ink flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/10 border border-white/15 rounded-3xl p-6 text-white">
        <BrandLogo className="h-12 w-auto mx-auto mb-4" />
        {error && <p className="text-center text-sm text-rose-300">{error}</p>}
        {!error && !info && (
          <div className="py-8 flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full border-4 border-white/20 border-t-brand-green animate-spin" />
            <p className="text-center text-sm text-slate-300">Checking meeting link…</p>
          </div>
        )}
        {info?.status === 'ended' && (
          <div>
            <p className="text-xs uppercase tracking-wide text-brand-blue">Meeting ended</p>
            <h1 className="text-xl font-bold mt-1">{info.title}</h1>
            <p className="mt-4 text-sm text-slate-200 whitespace-pre-wrap">
              {cleanSummaryText(info.summary) || 'This meeting has ended.'}
            </p>
          </div>
        )}
        {info?.status === 'live' && (
          <form onSubmit={join} className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-brand-blue">Guest meeting</p>
              <h1 className="text-xl font-bold mt-1">{info.title}</h1>
              <p className="text-sm text-slate-300 mt-2 flex items-center gap-2">
                Hosted by {info.host?.username
                  ? <PersonName user={info.host} size={20} nameClassName="text-white" />
                  : 'the team'}. This link only lets you join this call.
              </p>
            </div>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl bg-white text-slate-800 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="w-full py-3 rounded-xl bg-brand-green text-brand-ink font-semibold disabled:opacity-50"
            >
              Join meeting
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
