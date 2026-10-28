import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, StickyNote, Send, MonitorUp, MonitorOff,
  Pin, PinOff, Maximize, Minimize, Hand, Smile, Link2, Languages, Type
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canSeeAll } from '../utils/roles';
import BrandLogo from '../components/BrandLogo';
import UserAvatar from '../components/UserAvatar';
import PersonName from '../components/PersonName';
import {
  MEET_LANGS, SPEECH_LANG, REACTIONS, meetT, meetingInviteText, cleanSummaryText
} from '../utils/meet';

const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const CAMERA_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  },
  video: {
    width: { ideal: 1280, min: 640 },
    height: { ideal: 720, min: 360 },
    frameRate: { ideal: 30, min: 15 },
    facingMode: 'user'
  }
};

const SCREEN_CONSTRAINTS = {
  video: {
    cursor: 'always',
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 15, max: 30 }
  },
  audio: false
};

const streamIsScreen = (stream) => {
  const track = stream?.getVideoTracks?.()[0];
  if (!track) return false;
  if (track.contentHint === 'detail') return true;
  const settings = track.getSettings?.() || {};
  return Boolean(settings.displaySurface);
};

const applyVideoParams = async (pc, screen) => {
  for (const sender of pc.getSenders()) {
    if (sender.track?.kind !== 'video') continue;
    try {
      const params = sender.getParameters();
      if (!params.encodings?.length) params.encodings = [{}];
      params.degradationPreference = screen ? 'maintain-resolution' : 'balanced';
      params.encodings[0].maxBitrate = screen ? 2_500_000 : 1_500_000;
      params.encodings[0].maxFramerate = screen ? 15 : 30;
      await sender.setParameters(params);
    } catch (_) {}
  }
};

const readGuest = () => {
  try { return JSON.parse(localStorage.getItem('meetGuest') || 'null'); } catch { return null; }
};

const VideoTile = ({
  stream, name, mine, muted, camOff, mirrored, pinned, speaking, handRaised, reaction, onPin, t,
  isScreen, compact, connecting, leaving, avatar
}) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream || null;
    el.playsInline = true;
    el.setAttribute('playsinline', 'true');
    el.play?.().catch(() => {});
  }, [stream]);
  return (
    <div className={`meet-tile relative rounded-2xl overflow-hidden bg-black w-full h-full group ${
      compact && !isScreen ? 'aspect-square' : ''
    } ${speaking && !isScreen ? 'ring-2 ring-brand-green' : ''} ${
      leaving ? 'meet-tile-out' : 'meet-tile-in'
    }`}>
      <video
        ref={ref}
        autoPlay
        muted={Boolean(mine || muted)}
        playsInline
        className={`w-full h-full ${isScreen ? 'object-contain bg-black' : 'object-cover'} ${
          mirrored && !isScreen ? '-scale-x-100' : ''
        } ${camOff ? 'opacity-0' : ''}`}
      />
      {(camOff || connecting || !stream) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1a1a1e] gap-3">
          <UserAvatar name={name} avatar={avatar} size={compact ? 40 : 64} className="rounded-full" />
          {connecting && (
            <>
              <div className="w-8 h-8 rounded-full border-4 border-brand-green/30 border-t-brand-green animate-spin" />
              <p className="text-xs text-slate-300">{t('connectingPeer')}</p>
            </>
          )}
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
  const [leavingIds, setLeavingIds] = useState(() => new Set());
  const [captionsOn, setCaptionsOn] = useState(true);
  const [shownCaptions, setShownCaptions] = useState([]);

  const streamRef = useRef(null);
  const displayStreamRef = useRef(null);
  const sharingRef = useRef(false);
  const [localStream, setLocalStream] = useState(null);
  const [displayStream, setDisplayStream] = useState(null);
  const pcs = useRef(new Map());
  const pendingIce = useRef(new Map());
  const lastSignal = useRef('');
  const names = useRef(new Map());
  const alive = useRef(true);
  const seenNotes = useRef(0);
  const notesOpenRef = useRef(false);
  const langReady = useRef(false);
  const seenLive = useRef(new Set());
  const livePrimed = useRef(false);
  const captionCache = useRef(new Map());
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
    setLeavingIds((prev) => {
      const next = new Set(prev);
      next.add(peerId);
      return next;
    });
    setTimeout(() => {
      setRemotes((prev) => prev.filter((r) => r.userId !== peerId));
      setLeavingIds((prev) => {
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
    }, 480);
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
    const cam = streamRef.current;
    const screen = displayStreamRef.current;
    const videoTrack = screen?.getVideoTracks()[0] || cam?.getVideoTracks()[0];
    if (videoTrack) pc.addTrack(videoTrack, screen || cam);
    (cam?.getAudioTracks() || []).forEach((track) => pc.addTrack(track, cam));
    try {
      const videoTransceiver = pc.getTransceivers().find((tr) => tr.sender?.track?.kind === 'video');
      const caps = RTCRtpSender.getCapabilities?.('video');
      if (videoTransceiver?.setCodecPreferences && caps?.codecs?.length) {
        const ranked = [...caps.codecs].sort((a, b) => {
          const score = (codec) => (/vp9/i.test(codec.mimeType) ? 0 : /h264/i.test(codec.mimeType) ? 1 : 2);
          return score(a) - score(b);
        });
        videoTransceiver.setCodecPreferences(ranked);
      }
    } catch (_) {}
    applyVideoParams(pc, Boolean(screen));
    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal(peerId, 'ice', event.candidate.toJSON());
    };
    pc.ontrack = (event) => {
      const stream = event.streams[0];
      setLeavingIds((prev) => {
        if (!prev.has(peerId)) return prev;
        const next = new Set(prev);
        next.delete(peerId);
        return next;
      });
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
    if (data.language && !langReady.current) {
      setLang(data.language);
      langReady.current = true;
    }
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
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);
        } catch (_) {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        }
        stream.getVideoTracks().forEach((track) => {
          track.contentHint = 'motion';
          track.applyConstraints({
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          }).catch(() => {});
        });
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
          const hb = await api.post(`/api/meetings/${meetingId}/heartbeat`, {
            sharing: Boolean(sharingRef.current)
          });
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
      if (!peer.stream) return;
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

  useEffect(() => {
    const live = meeting?.liveParticipants || [];
    const ids = new Set(live.map((p) => String(p.user?._id || p.user)).filter(Boolean));
    if (!livePrimed.current) {
      seenLive.current = ids;
      livePrimed.current = phase === 'live';
      return;
    }
    live.forEach((p) => {
      const id = String(p.user?._id || p.user);
      if (!id || id === String(myId) || seenLive.current.has(id)) return;
      toast(`${p.username || 'Someone'} ${meetT(lang, 'joined')}`, { duration: 1800 });
    });
    seenLive.current.forEach((id) => {
      if (ids.has(id) || id === String(myId)) return;
      toast(`${names.current.get(id) || 'Someone'} ${meetT(lang, 'left')}`, { duration: 1800 });
    });
    seenLive.current = ids;
  }, [meeting?.liveParticipants, phase, myId, lang]);

  useEffect(() => {
    if (phase !== 'live' || !captionsOn || muted) return undefined;
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      toast.error('Live subtitles need Chrome or Edge', { id: 'no-speech' });
      return undefined;
    }
    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = SPEECH_LANG[lang] || 'en-IN';
    let stop = false;
    let lastSent = 0;
    rec.onresult = (event) => {
      let interim = '';
      let finalText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const row = event.results[i];
        if (row.isFinal) finalText += row[0].transcript;
        else interim += row[0].transcript;
      }
      const text = (finalText || interim).trim();
      if (!text) return;
      const now = Date.now();
      if (!finalText && now - lastSent < 700) return;
      lastSent = now;
      api.post(`/api/meetings/${meetingId}/captions`, {
        text,
        lang,
        final: Boolean(finalText)
      }).catch(() => {});
    };
    rec.onend = () => {
      if (!stop) {
        try { rec.start(); } catch (_) {}
      }
    };
    try { rec.start(); } catch (_) {}
    return () => {
      stop = true;
      try { rec.stop(); } catch (_) {}
    };
  }, [phase, captionsOn, muted, lang, meetingId]);

  useEffect(() => {
    if (!captionsOn) {
      setShownCaptions([]);
      return undefined;
    }
    let cancelled = false;
    const run = async () => {
      const rows = meeting?.captions || [];
      const next = [];
      for (const row of rows.slice(-4)) {
        const key = `${row.lang}|${lang}|${row.text}`;
        let text = captionCache.current.get(key);
        if (!text) {
          if (!row.final || !row.lang || row.lang === lang) {
            text = row.text;
            captionCache.current.set(key, text);
          } else {
            try {
              const res = await api.post(`/api/meetings/${meetingId}/translate`, {
                text: row.text,
                language: lang
              });
              text = res.data.text || row.text;
            } catch (_) {
              text = row.text;
            }
            captionCache.current.set(key, text);
          }
        }
        next.push({
          id: `${row.user}-${row.at}`,
          name: row.username,
          text,
          mine: String(row.user) === String(myId)
        });
      }
      if (!cancelled) setShownCaptions(next);
    };
    run();
    return () => { cancelled = true; };
  }, [meeting?.captions, lang, captionsOn, meetingId, myId]);

  const tiles = useMemo(() => {
    const live = meeting?.liveParticipants || [];
    const reactionFor = (id) => {
      const hit = (meeting?.reactions || []).find((r) => String(r.user) === String(id));
      return hit?.emoji || '';
    };
    const handFor = (id) => Boolean(live.find((p) => String(p.user) === String(id))?.handRaised);
    const localCam = {
      id: String(myId || 'me'),
      name: user?.username || guest?.name || 'You',
      stream: localStream,
      mine: true,
      muted,
      camOff,
      mirrored: true,
      isScreen: false,
      connecting: false,
      leaving: false,
      avatar: user?.avatar || '',
      handRaised,
      reaction: reactionFor(myId),
      speaking: false
    };
    const localScreen = (sharing && displayStream) ? {
      id: 'screen-me',
      name: `${user?.username || guest?.name || 'You'} · screen`,
      stream: displayStream,
      mine: true,
      muted: true,
      camOff: false,
      mirrored: false,
      isScreen: true,
      connecting: false,
      leaving: false,
      avatar: '',
      handRaised: false,
      reaction: '',
      speaking: false
    } : null;
    const remoteMap = new Map(remotes.map((p) => [p.userId, p]));
    const liveIds = new Set();
    const others = [];
    live.forEach((p) => {
      const id = String(p.user?._id || p.user);
      if (!id || id === String(myId)) return;
      liveIds.add(id);
      const remote = remoteMap.get(id);
      others.push({
        id,
        name: p.username || names.current.get(id) || 'Guest',
        stream: remote?.stream || null,
        mine: false,
        muted: false,
        camOff: !remote?.stream,
        mirrored: false,
        isScreen: streamIsScreen(remote?.stream) || Boolean(p.isSharing),
        connecting: !remote?.stream,
        leaving: leavingIds.has(id),
        avatar: p.avatar || '',
        handRaised: handFor(id),
        reaction: reactionFor(id),
        speaking: speakerId === id
      });
    });
    remotes.forEach((p) => {
      if (liveIds.has(p.userId) || p.userId === String(myId)) return;
      others.push({
        id: p.userId,
        name: p.username || names.current.get(p.userId) || 'Guest',
        stream: p.stream,
        mine: false,
        muted: false,
        camOff: false,
        mirrored: false,
        isScreen: streamIsScreen(p.stream),
        connecting: false,
        leaving: true,
        avatar: '',
        handRaised: false,
        reaction: '',
        speaking: false
      });
    });
    return [...(localScreen ? [localScreen] : []), localCam, ...others];
  }, [remotes, meeting, myId, user, guest, muted, camOff, sharing, handRaised, speakerId, localStream, displayStream, leavingIds]);

  const screenTile = tiles.find((tile) => tile.isScreen);
  const stageId = pinnedId || screenTile?.id || speakerId || (tiles.find((tile) => !tile.mine)?.id) || tiles[0]?.id;
  const stage = tiles.find((tile) => tile.id === stageId) || tiles[0];
  const strip = tiles.filter((tile) => tile.id !== stage?.id);

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

  const stopShare = () => {
    const cam = streamRef.current?.getVideoTracks()[0];
    pcs.current.forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && cam) sender.replaceTrack(cam);
    });
    (displayStreamRef.current?.getTracks() || []).forEach((tr) => {
      tr.onended = null;
      tr.stop();
    });
    displayStreamRef.current = null;
    sharingRef.current = false;
    setDisplayStream(null);
    setSharing(false);
    setPinnedId((id) => (id === 'screen-me' ? null : id));
    pcs.current.forEach((pc) => applyVideoParams(pc, false));
  };

  const shareScreen = async () => {
    if (sharing) {
      stopShare();
      return;
    }
    try {
      let screen;
      try {
        screen = await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
      } catch (_) {
        screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      }
      const track = screen.getVideoTracks()[0];
      if (track) {
        track.contentHint = 'detail';
        track.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 15, max: 30 }
        }).catch(() => {});
      }
      pcs.current.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(track);
        applyVideoParams(pc, true);
      });
      displayStreamRef.current = screen;
      sharingRef.current = true;
      setDisplayStream(screen);
      setSharing(true);
      setPinnedId('screen-me');
      track.onended = () => stopShare();
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
        <button
          type="button"
          onClick={() => setCaptionsOn((v) => !v)}
          className={`p-2 rounded-xl ${captionsOn ? 'bg-brand-green text-brand-ink' : 'bg-white/10'}`}
          title={t('subtitles')}
        >
          <Type size={16} />
        </button>
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
          <div className="relative flex-1 min-h-0 flex items-center justify-center bg-black/40 rounded-2xl overflow-hidden">
            {stage && (
              <div className={stage.isScreen
                ? 'w-full h-full'
                : 'aspect-square h-full max-h-full max-w-full'
              }>
                <VideoTile
                  {...stage}
                  compact={!stage.isScreen}
                  pinned={pinnedId === stage.id}
                  onPin={() => setPinnedId((id) => (id === stage.id ? null : stage.id))}
                  t={t}
                />
              </div>
            )}
            {captionsOn && shownCaptions.length > 0 && (
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-[min(36rem,92%)] space-y-1 pointer-events-none">
                {shownCaptions.map((line) => (
                  <p
                    key={line.id}
                    className="px-3 py-1.5 rounded-xl bg-black/75 text-center text-sm text-white shadow-lg"
                  >
                    <span className="text-brand-green font-semibold">{line.name}: </span>
                    {line.text}
                  </p>
                ))}
              </div>
            )}
          </div>
          {strip.length > 0 && (
            <div className="h-24 sm:h-28 flex gap-2 overflow-x-auto scrollbar-thin justify-center">
              {strip.map((tile) => (
                <button
                  key={tile.id}
                  type="button"
                  onClick={() => setPinnedId(tile.id)}
                  className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0"
                >
                  <VideoTile
                    {...tile}
                    compact
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
                  <PersonName name={n.username} avatar={n.avatar} size={18} nameClassName="text-[11px] font-semibold text-brand-blue" />
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
        <button
          type="button"
          onClick={shareScreen}
          className={`inline-flex p-3 rounded-full ${sharing ? 'bg-brand-red' : 'bg-white/10'}`}
          title={sharing ? t('stopShare') : t('share')}
        >
          {sharing ? <MonitorOff size={18} /> : <MonitorUp size={18} />}
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
