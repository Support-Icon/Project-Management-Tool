import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, StickyNote, Send, MonitorUp,
  Pin, PinOff, Maximize, Minimize, Hand, Smile, Link2, Languages
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canSeeAll } from '../utils/roles';
import BrandLogo from '../components/BrandLogo';
import {
  MEET_LANGS, REACTIONS, meetT, meetingInviteText, cleanSummaryText
} from '../utils/meet';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const readGuest = () => {
  try { return JSON.parse(localStorage.getItem('meetGuest') || 'null'); } catch { return null; }
};

const VideoTile = ({
  stream, name, mine, muted, camOff, mirrored, pinned, speaking, handRaised, reaction, onPin, t
}) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-[#1a1a1e] h-full min-h-[96px] group ${
      speaking ? 'ring-2 ring-brand-green' : ''
    }`}>
      <video
        ref={ref}
        autoPlay
        muted={mine || muted}
        playsInline
        className={`w-full h-full object-cover ${mirrored ? '-scale-x-100' : ''} ${camOff ? 'opacity-0' : ''}`}
      />
      {camOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1e]">
          <span className="w-14 h-14 rounded-full bg-brand-green text-brand-ink font-bold text-xl flex items-center justify-center">
            {(name || '?')[0].toUpperCase()}
          </span>
        </div>
      )}
      {reaction && (
        <span className="absolute top-3 right-3 text-3xl drop-shadow-lg animate-bounce">{reaction}</span>
      )}
      {handRaised && (
        <span className="absolute top-3 left-3 bg-brand-yellow text-brand-ink rounded-full p-1.5">
          <Hand size={14} />
        </span>
      )}
      <div className="absolute inset-x-0 bottom-0 p-2 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent">
        <span className="text-xs font-semibold text-white truncate">
          {name}{mine ? ` (${t('you')})` : ''}{muted && mine ? ` · ${t('muted')}` : ''}
          {speaking ? ` · ${t('speaking')}` : ''}
        </span>
        {onPin && (
          <button
            type="button"
            onClick={onPin}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-black/50 text-white"
            title={pinned ? t('unpin') : t('pin')}
          >
            {pinned ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
        )}
      </div>
    </div>
  );
};

export default function MeetingRoom() {
  const { meetingId: routeId, guestToken } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth() || {};
  const guest = readGuest();
  const isGuest = Boolean(guestToken);
  const meetingId = routeId || guest?.meetingId;
  const myId = user?._id || guest?.guestId;

  const [meeting, setMeeting] = useState(null);
  const [phase, setPhase] = useState('loading');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState([]);
  const [unreadNotes, setUnreadNotes] = useState(0);
  const [remotes, setRemotes] = useState([]);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const [pinnedId, setPinnedId] = useState(null);
  const [speakerId, setSpeakerId] = useState(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [lang, setLang] = useState('en');

  const streamRef = useRef(null);
  const [localStream, setLocalStream] = useState(null);
  const [displayStream, setDisplayStream] = useState(null);
  const pcs = useRef(new Map());
  const pendingIce = useRef(new Map());
  const lastSignal = useRef('');
  const names = useRef(new Map());
  const alive = useRef(true);
  const seenNotes = useRef(0);
  const notesOpenRef = useRef(false);
  const t = (key) => meetT(lang, key);

  const attachLocal = (stream) => {
    streamRef.current = stream;
    setLocalStream(stream);
  };

  const closePc = (peerId) => {
    const pc = pcs.current.get(peerId);
    if (pc) {
      pc.close();
      pcs.current.delete(peerId);
    }
    pendingIce.current.delete(peerId);
    setRemotes((prev) => prev.filter((r) => r.userId !== peerId));
  };

  const flushIce = async (peerId, pc) => {
    const queued = pendingIce.current.get(peerId) || [];
    pendingIce.current.delete(peerId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    }
  };

  const sendSignal = async (to, kind, payload) => {
    try {
      await api.post(`/api/meetings/${meetingId}/signal`, { to, kind, payload });
    } catch (_) {}
  };

  const ensurePc = useCallback(async (peerId) => {
    if (pcs.current.has(peerId)) return pcs.current.get(peerId);
    const pc = new RTCPeerConnection(ICE);
    (streamRef.current?.getTracks() || []).forEach((track) => pc.addTrack(track, streamRef.current));
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setRemotes((prev) => {
        const rest = prev.filter((r) => r.userId !== peerId);
        return [...rest, { userId: peerId, stream, username: names.current.get(peerId) || 'Guest' }];
      });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) closePc(peerId);
    };
    pcs.current.set(peerId, pc);
    return pc;
  }, [meetingId]);

  const callPeer = async (peerId) => {
    const pc = await ensurePc(peerId);
    if (pc.signalingState !== 'stable') return;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await sendSignal(peerId, 'offer', { type: offer.type, sdp: offer.sdp });
  };

  const handleSignal = async (row) => {
    const peerId = String(row.from);
    if (peerId === String(myId)) return;
    if (row.kind === 'hangup') {
      closePc(peerId);
      return;
    }
    const pc = await ensurePc(peerId);
    if (row.kind === 'offer') {
      await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
      await flushIce(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendSignal(peerId, 'answer', { type: answer.type, sdp: answer.sdp });
    } else if (row.kind === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(row.payload));
        await flushIce(peerId, pc);
      }
    } else if (row.kind === 'ice') {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(row.payload)); } catch (_) {}
      } else {
        const q = pendingIce.current.get(peerId) || [];
        q.push(row.payload);
        pendingIce.current.set(peerId, q);
      }
    }
  };

  const syncPeers = async (liveList) => {
    (liveList || []).forEach((p) => {
      const id = String(p.user?._id || p.user);
      if (id) names.current.set(id, p.username);
    });
    const others = (liveList || [])
      .map((p) => String(p.user?._id || p.user))
      .filter((id) => id && id !== String(myId));
    const liveSet = new Set(others);
    [...pcs.current.keys()].forEach((id) => {
      if (!liveSet.has(id)) closePc(id);
    });
    for (const id of others) {
      if (String(myId) > id && !pcs.current.has(id)) {
        try { await callPeer(id); } catch (_) {}
      }
    }
  };

  const applyMeeting = (data, { countNotes = true } = {}) => {
    setMeeting(data);
    if (data.language) setLang(data.language);
    if (data.notes) setNotes(data.notes);
    const count = data.notesCount ?? (data.notes || []).length;
    if (countNotes && count > seenNotes.current) {
      if (!notesOpenRef.current) setUnreadNotes((n) => n + (count - seenNotes.current));
      seenNotes.current = count;
    } else if (count > seenNotes.current) {
      seenNotes.current = count;
    }
    const me = (data.liveParticipants || []).find((p) => String(p.user) === String(myId));
    if (me) setHandRaised(Boolean(me.handRaised));
  };

  useEffect(() => {
    if (isGuest && !guest?.token) {
      navigate(`/join/${guestToken}`);
      return undefined;
    }
    alive.current = true;
    let pollTimer;

    const boot = async () => {
      try {
        const existing = await api.get(`/api/meetings/${meetingId}`);
        if (!alive.current) return;
        if (existing.data.status === 'ended') {
          setMeeting(existing.data);
          setPhase('ended');
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!alive.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        attachLocal(stream);
        const joined = await api.post(`/api/meetings/${meetingId}/join`);
        seenNotes.current = joined.data.notesCount || (joined.data.notes || []).length;
        applyMeeting(joined.data, { countNotes: false });
        setNotes(joined.data.notes || []);
        setPhase('live');
        await syncPeers(joined.data.liveParticipants);
      } catch (err) {
        setError(err.response?.data?.message || 'Camera / mic permission is required for live meet');
        setPhase('error');
        return;
      }

      const tick = async () => {
        if (!alive.current) return;
        try {
          const hb = await api.post(`/api/meetings/${meetingId}/heartbeat`);
          applyMeeting(hb.data);
          if (hb.data.notes) setNotes(hb.data.notes);
          if (hb.data.status === 'ended') {
            setPhase('ended');
            streamRef.current?.getTracks().forEach((t) => t.stop());
            return;
          }
          await syncPeers(hb.data.liveParticipants);
          const sigs = await api.get(`/api/meetings/${meetingId}/signals`, {
            params: lastSignal.current ? { after: lastSignal.current } : {}
          });
          for (const row of sigs.data || []) {
            lastSignal.current = row._id;
            await handleSignal(row);
          }
        } catch (_) {}
        if (alive.current) pollTimer = setTimeout(tick, 1200);
      };
      tick();
    };

    boot();
    return () => {
      alive.current = false;
      clearTimeout(pollTimer);
      pcs.current.forEach((pc) => pc.close());
      pcs.current.clear();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (meetingId) api.post(`/api/meetings/${meetingId}/leave`).catch(() => {});
    };
  }, [meetingId, myId, isGuest, guestToken]);

  useEffect(() => {
    if (!remotes.length) return undefined;
    let ctx;
    try { ctx = new AudioContext(); } catch { return undefined; }
    const meters = [];
    remotes.forEach((peer) => {
      try {
        const src = ctx.createMediaStreamSource(peer.stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        meters.push({ id: peer.userId, analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      } catch (_) {}
    });
    let raf;
    const loop = () => {
      let best = null;
      let bestVal = 20;
      meters.forEach((m) => {
        m.analyser.getByteFrequencyData(m.data);
        const avg = m.data.reduce((a, b) => a + b, 0) / m.data.length;
        if (avg > bestVal) {
          bestVal = avg;
          best = m.id;
        }
      });
      if (best) setSpeakerId(best);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      ctx.close().catch(() => {});
    };
  }, [remotes]);

  const tiles = useMemo(() => {
    const live = meeting?.liveParticipants || [];
    const reactionFor = (id) => {
      const hit = (meeting?.reactions || []).find((r) => String(r.user) === String(id));
      return hit?.emoji || '';
    };
    const handFor = (id) => Boolean(live.find((p) => String(p.user) === String(id))?.handRaised);
    const local = {
      id: String(myId || 'me'),
      name: user?.username || guest?.name || 'You',
      stream: displayStream || localStream,
      mine: true,
      muted,
      camOff,
      mirrored: !sharing,
      handRaised,
      reaction: reactionFor(myId),
      speaking: false
    };
    const others = remotes.map((p) => ({
      id: p.userId,
      name: p.username || names.current.get(p.userId) || 'Guest',
      stream: p.stream,
      mine: false,
      muted: false,
      camOff: false,
      mirrored: false,
      handRaised: handFor(p.userId),
      reaction: reactionFor(p.userId),
      speaking: speakerId === p.userId
    }));
    return [local, ...others];
  }, [remotes, meeting, myId, user, guest, muted, camOff, sharing, handRaised, speakerId, localStream, displayStream]);

  const stageId = pinnedId || speakerId || (tiles.find((t) => !t.mine)?.id) || tiles[0]?.id;
  const stage = tiles.find((t) => t.id === stageId) || tiles[0];
  const strip = tiles.filter((t) => t.id !== stage?.id);

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((tr) => { tr.enabled = !next; });
    setMuted(next);
  };
  const toggleCam = () => {
    const next = !camOff;
    streamRef.current?.getVideoTracks().forEach((tr) => { tr.enabled = !next; });
    setCamOff(next);
  };

  const shareScreen = async () => {
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = screen.getVideoTracks()[0];
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(track);
      });
      setDisplayStream(screen);
      setSharing(true);
      track.onended = () => {
        const cam = streamRef.current?.getVideoTracks()[0];
        pcs.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && cam) sender.replaceTrack(cam);
        });
        setDisplayStream(null);
        setSharing(false);
      };
    } catch (_) {}
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      const res = await api.post(`/api/meetings/${meetingId}/notes`, { text: noteText.trim() });
      setNotes(res.data);
      seenNotes.current = res.data.length;
      setNoteText('');
    } catch (_) {
      toast.error('Could not save note');
    }
  };

  const openNotes = () => {
    setNotesOpen((v) => {
      const next = !v;
      notesOpenRef.current = next;
      if (next) setUnreadNotes(0);
      return next;
    });
  };

  const copyInvite = async () => {
    const token = meeting?.guestToken;
    if (!token) return;
    try {
      await navigator.clipboard.writeText(meetingInviteText(meeting.title, token));
      toast.success(t('copied'));
    } catch (_) {
      toast.error('Could not copy');
    }
  };

  const toggleHand = async () => {
    const next = !handRaised;
    setHandRaised(next);
    try { await api.post(`/api/meetings/${meetingId}/hand`, { raised: next }); } catch (_) {}
  };

  const sendEmoji = async (emoji) => {
    setEmojiOpen(false);
    try { await api.post(`/api/meetings/${meetingId}/react`, { emoji }); } catch (_) {}
  };

  const changeLang = async (value) => {
    setLang(value);
    try { await api.put(`/api/meetings/${meetingId}/language`, { language: value }); } catch (_) {}
  };

  const toggleFs = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        setIsFs(true);
      } else {
        await document.exitFullscreen();
        setIsFs(false);
      }
    } catch (_) {}
  };

  const leave = () => {
    if (isGuest) {
      localStorage.removeItem('meetGuest');
      navigate(`/join/${guestToken}`);
      return;
    }
    navigate('/meet');
  };

  const endMeet = async () => {
    setEnding(true);
    try {
      const res = await api.post(`/api/meetings/${meetingId}/end`, { notes: noteText.trim() });
      setMeeting(res.data);
      setPhase('ended');
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not end meeting');
    } finally {
      setEnding(false);
    }
  };

  const isHost = String(meeting?.host?._id || meeting?.host) === String(myId);
  const canEnd = !isGuest && (isHost || canSeeAll(user));

  if (isGuest && !guest?.token) return <Navigate to={`/join/${guestToken}`} replace />;

  if (phase === 'ended' && meeting) {
    if (!isGuest && meetingId) return <Navigate to={`/meet/${meetingId}/summary`} replace />;
    return (
      <div className="min-h-screen bg-brand-ink text-white flex items-center justify-center p-4">
        <div className="max-w-xl w-full bg-white text-slate-800 rounded-2xl p-6">
          <BrandLogo className="h-10 mb-4" />
          <p className="text-xs font-semibold text-brand-blue uppercase">Meeting ended</p>
          <h1 className="text-xl font-bold mt-1">{meeting.title}</h1>
          <p className="mt-4 text-sm whitespace-pre-wrap">{cleanSummaryText(meeting.summary)}</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-screen bg-brand-ink text-white flex items-center justify-center p-6">
        <div className="text-center">
          <p className="font-semibold">{error}</p>
          <button type="button" onClick={leave} className="mt-4 text-brand-green text-sm">Back</button>
        </div>
      </div>
    );
  }

  if (phase !== 'live') {
    return (
      <div className="min-h-screen bg-brand-ink flex flex-col items-center justify-center gap-3 text-white">
        <BrandLogo className="h-12" />
        <div className="w-10 h-10 rounded-full border-4 border-brand-green/30 border-t-brand-green animate-spin" />
        <p className="text-sm text-slate-300">{t('connecting')}</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-brand-ink text-white overflow-hidden">
      <header className="px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3 border-b border-white/10">
        <BrandLogo className="h-8 w-auto max-w-[140px] flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate text-sm sm:text-base">{meeting?.title || t('connecting')}</p>
          <p className="text-[11px] text-slate-400">{(meeting?.liveParticipants || []).length} {t('inCall')}</p>
        </div>
        <label className="flex items-center gap-1 text-xs text-slate-300">
          <Languages size={14} />
          <select
            value={lang}
            onChange={(e) => changeLang(e.target.value)}
            className="bg-white/10 border border-white/10 rounded-lg px-2 py-1 text-xs outline-none"
          >
            {MEET_LANGS.map((item) => (
              <option key={item.id} value={item.id} className="text-slate-800">{item.label}</option>
            ))}
          </select>
        </label>
        {!isGuest && meeting?.guestToken && (
          <button type="button" onClick={copyInvite} className="p-2 rounded-xl bg-white/10" title={t('invite')}>
            <Link2 size={16} />
          </button>
        )}
        <button type="button" onClick={toggleFs} className="p-2 rounded-xl bg-white/10" title={t('fullscreen')}>
          {isFs ? <Minimize size={16} /> : <Maximize size={16} />}
        </button>
        <button type="button" onClick={openNotes} className="relative p-2 rounded-xl bg-white/10 text-brand-green">
          <StickyNote size={18} />
          {unreadNotes > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand-red text-[10px] font-bold flex items-center justify-center">
              {unreadNotes > 9 ? '9+' : unreadNotes}
            </span>
          )}
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col p-2 sm:p-3 gap-2">
          <div className="flex-1 min-h-0">
            {stage && (
              <VideoTile
                {...stage}
                pinned={pinnedId === stage.id}
                onPin={() => setPinnedId((id) => (id === stage.id ? null : stage.id))}
                t={t}
              />
            )}
          </div>
          {strip.length > 0 && (
            <div className="h-24 sm:h-28 flex gap-2 overflow-x-auto scrollbar-thin">
              {strip.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setPinnedId(tile.id)}
                  className="w-36 sm:w-44 flex-shrink-0"
                >
                  <VideoTile
                    {...tile}
                    pinned={pinnedId === tile.id}
                    t={t}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {notesOpen && (
          <aside className="w-full sm:w-80 max-w-full bg-white text-slate-800 flex flex-col border-l border-black/5 absolute sm:relative inset-0 sm:inset-auto z-20">
            <div className="p-3 border-b border-black/5 flex items-center justify-between">
              <p className="font-semibold text-sm">{t('notes')}</p>
              <button type="button" className="text-slate-400 text-sm" onClick={() => setNotesOpen(false)}>Close</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {notes.map((n, i) => (
                <div key={`${n.at}-${i}`} className="bg-slate-50 rounded-xl p-2.5">
                  <p className="text-[11px] font-semibold text-brand-blue">{n.username}</p>
                  <p className="text-sm whitespace-pre-wrap">{n.text}</p>
                </div>
              ))}
            </div>
            <form onSubmit={addNote} className="p-3 border-t border-black/5 flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('addNote')}
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <button type="submit" className="w-10 h-10 rounded-xl bg-brand-green text-brand-ink flex items-center justify-center">
                <Send size={15} />
              </button>
            </form>
          </aside>
        )}
      </div>

      <div className="px-2 sm:px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-1.5 sm:gap-2 border-t border-white/10 relative">
        <button type="button" onClick={toggleMute} className={`p-3 rounded-full ${muted ? 'bg-brand-red' : 'bg-white/10'}`}>
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button type="button" onClick={toggleCam} className={`p-3 rounded-full ${camOff ? 'bg-brand-red' : 'bg-white/10'}`}>
          {camOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
        <button type="button" onClick={shareScreen} className="hidden sm:inline-flex p-3 rounded-full bg-white/10" title={t('share')}>
          <MonitorUp size={18} />
        </button>
        <button
          type="button"
          onClick={toggleHand}
          className={`p-3 rounded-full ${handRaised ? 'bg-brand-yellow text-brand-ink' : 'bg-white/10'}`}
          title={handRaised ? t('lower') : t('raise')}
        >
          <Hand size={18} />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setEmojiOpen((v) => !v)} className="p-3 rounded-full bg-white/10">
            <Smile size={18} />
          </button>
          {emojiOpen && (
            <div className="absolute bottom-14 left-1/2 -translate-x-1/2 bg-[#2a2a30] rounded-2xl px-2 py-2 flex gap-1 shadow-xl">
              {REACTIONS.map((emoji) => (
                <button key={emoji} type="button" onClick={() => sendEmoji(emoji)} className="text-xl p-1 hover:scale-125">
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={leave} className="px-3 py-3 rounded-full bg-white/10 text-sm font-semibold">
          {t('leave')}
        </button>
        {canEnd && (
          <button
            type="button"
            disabled={ending}
            onClick={endMeet}
            className="inline-flex items-center gap-2 px-3 sm:px-4 py-3 rounded-full bg-brand-red text-white text-sm font-semibold disabled:opacity-50"
          >
            <PhoneOff size={16} /> <span className="hidden sm:inline">{t('end')}</span>
          </button>
        )}
      </div>
    </div>
  );
}
