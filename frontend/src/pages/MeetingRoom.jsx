import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, StickyNote, Send, MonitorUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { canSeeAll } from '../utils/roles';

const ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const RemoteTile = ({ peer }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = peer.stream;
  }, [peer.stream]);
  return (
    <div className="relative rounded-2xl overflow-hidden bg-black min-h-[180px] sm:min-h-[220px]">
      <video ref={ref} autoPlay playsInline className="w-full h-full object-cover" />
      <span className="absolute bottom-2 left-2 text-xs font-semibold bg-black/60 text-white px-2 py-1 rounded-lg">
        {peer.username}
      </span>
    </div>
  );
};

export default function MeetingRoom() {
  const { meetingId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [notes, setNotes] = useState([]);
  const [remotes, setRemotes] = useState([]);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');

  const localRef = useRef(null);
  const streamRef = useRef(null);
  const pcs = useRef(new Map());
  const pendingIce = useRef(new Map());
  const lastSignal = useRef('');
  const names = useRef(new Map());
  const alive = useRef(true);

  const myId = user?._id;

  const attachLocal = (stream) => {
    streamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
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
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        closePc(peerId);
      }
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
    const peerId = row.from;
    if (peerId === myId) return;
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
      const id = p.user?._id || p.user;
      if (id) names.current.set(String(id), p.username);
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

  useEffect(() => {
    alive.current = true;
    let pollTimer;

    const boot = async () => {
      try {
        const existing = await api.get(`/api/meetings/${meetingId}`);
        if (!alive.current) return;
        if (existing.data.status === 'ended') {
          setMeeting(existing.data);
          setNotes(existing.data.notes || []);
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (!alive.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        attachLocal(stream);
        const joined = await api.post(`/api/meetings/${meetingId}/join`);
        setMeeting(joined.data);
        setNotes(joined.data.notes || []);
        await syncPeers(joined.data.liveParticipants);
      } catch (err) {
        setError(err.response?.data?.message || 'Camera / mic permission is required for live meet');
        return;
      }

      const tick = async () => {
        if (!alive.current) return;
        try {
          const hb = await api.post(`/api/meetings/${meetingId}/heartbeat`);
          setMeeting(hb.data);
          if (hb.data.status === 'ended') {
            setNotes(hb.data.notes || []);
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
      api.post(`/api/meetings/${meetingId}/leave`).catch(() => {});
    };
  }, [meetingId, myId]);

  const toggleMute = () => {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setMuted(next);
  };

  const toggleCam = () => {
    const next = !camOff;
    streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !next; });
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
      if (localRef.current) localRef.current.srcObject = screen;
      track.onended = () => {
        const cam = streamRef.current?.getVideoTracks()[0];
        pcs.current.forEach((pc) => {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender && cam) sender.replaceTrack(cam);
        });
        if (localRef.current) localRef.current.srcObject = streamRef.current;
      };
    } catch (_) {}
  };

  const addNote = async (e) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    try {
      const res = await api.post(`/api/meetings/${meetingId}/notes`, { text: noteText.trim() });
      setNotes(res.data);
      setNoteText('');
    } catch (_) {
      toast.error('Could not save note');
    }
  };

  const leave = async () => {
    navigate('/meet');
  };

  const endMeet = async () => {
    setEnding(true);
    try {
      const res = await api.post(`/api/meetings/${meetingId}/end`, { notes: noteText.trim() });
      setMeeting(res.data);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not end meeting');
    } finally {
      setEnding(false);
    }
  };

  const isHost = String(meeting?.host?._id || meeting?.host) === String(myId);
  const canEnd = isHost || canSeeAll(user);

  if (error) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center">
        <p className="text-slate-700 font-semibold">{error}</p>
        <button type="button" onClick={() => navigate('/meet')} className="mt-4 text-brand-blue text-sm">
          Back to meetings
        </button>
      </div>
    );
  }

  if (meeting?.status === 'ended') {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="bg-white rounded-2xl border border-black/5 p-5 sm:p-6 shadow-sm">
          <p className="text-xs font-semibold text-brand-blue uppercase tracking-wide">Meeting ended</p>
          <h1 className="text-xl font-bold text-brand-ink mt-1">{meeting.title}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {meeting.participants?.length || 0} participant(s)
          </p>
          <div className="mt-5 prose prose-sm max-w-none whitespace-pre-wrap text-slate-700">
            {meeting.summary || 'Summary is being prepared.'}
          </div>
          <button
            type="button"
            onClick={() => navigate('/meet')}
            className="mt-6 px-4 py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold"
          >
            Back to meetings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-brand-ink text-white">
      <header className="px-3 sm:px-4 py-3 flex items-center justify-between gap-2 border-b border-white/10">
        <div className="min-w-0">
          <p className="font-semibold truncate">{meeting?.title || 'Connecting…'}</p>
          <p className="text-[11px] text-slate-400">{(meeting?.liveParticipants || []).length} in call</p>
        </div>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          className="p-2 rounded-xl bg-white/10 text-brand-green"
        >
          <StickyNote size={18} />
        </button>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className={`flex-1 overflow-y-auto p-3 grid gap-3 ${
          remotes.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        }`}>
          <div className="relative rounded-2xl overflow-hidden bg-black min-h-[200px] sm:min-h-[280px]">
            <video ref={localRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-2 left-2 text-xs font-semibold bg-black/60 px-2 py-1 rounded-lg">
              You{muted ? ' · muted' : ''}
            </span>
          </div>
          {remotes.map((peer) => <RemoteTile key={peer.userId} peer={peer} />)}
        </div>

        {notesOpen && (
          <aside className="w-full sm:w-80 max-w-full bg-white text-slate-800 flex flex-col border-l border-black/5 absolute sm:relative inset-0 sm:inset-auto z-10">
            <div className="p-3 border-b border-black/5 flex items-center justify-between">
              <p className="font-semibold text-sm">Meeting notes</p>
              <button type="button" className="sm:hidden text-slate-400 text-sm" onClick={() => setNotesOpen(false)}>
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {(notes.length ? notes : meeting?.notes || []).map((n, i) => (
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
                placeholder="Add a note for the summary…"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-sm"
              />
              <button type="submit" className="w-10 h-10 rounded-xl bg-brand-green text-brand-ink flex items-center justify-center">
                <Send size={15} />
              </button>
            </form>
          </aside>
        )}
      </div>

      <div className="px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-2 sm:gap-3 border-t border-white/10">
        <button type="button" onClick={toggleMute} className={`p-3 rounded-full ${muted ? 'bg-brand-red' : 'bg-white/10'}`}>
          {muted ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button type="button" onClick={toggleCam} className={`p-3 rounded-full ${camOff ? 'bg-brand-red' : 'bg-white/10'}`}>
          {camOff ? <VideoOff size={18} /> : <Video size={18} />}
        </button>
        <button type="button" onClick={shareScreen} className="hidden sm:inline-flex p-3 rounded-full bg-white/10">
          <MonitorUp size={18} />
        </button>
        <button type="button" onClick={leave} className="px-4 py-3 rounded-full bg-white/10 text-sm font-semibold">
          Leave
        </button>
        {canEnd && (
          <button
            type="button"
            disabled={ending}
            onClick={endMeet}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-full bg-brand-red text-white text-sm font-semibold disabled:opacity-50"
          >
            <PhoneOff size={16} /> End + summary
          </button>
        )}
      </div>
    </div>
  );
}
