import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2, FileText, MessageSquare, Paperclip,
  Search, Send, Users, X, Plus
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { formatIST } from '../utils/time';
import { ROLE_LABELS, canAssignOthers } from '../utils/roles';
import MediaViewer from '../components/MediaViewer';

const FileChip = ({ file, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">
    <FileText size={12} />
    <span className="max-w-[140px] truncate">{file.name}</span>
    <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500">
      <X size={12} />
    </button>
  </span>
);

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh: refreshNotifications } = useNotifications() || {};
  const canCreateTeam = canAssignOthers(user);
  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [teamModal, setTeamModal] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamPicks, setTeamPicks] = useState([]);
  const listEndRef = useRef(null);
  const fileRef = useRef(null);
  const afterRef = useRef(null);
  const knownIds = useRef(new Set());
  const sendingRef = useRef(false);
  const activeIdRef = useRef(null);

  const loadConversations = useCallback(async () => {
    try {
      const res = await api.get('/api/messages/conversations');
      setConversations(res.data);
      return res.data;
    } catch (_) {
      return [];
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openConversation = useCallback(async (id) => {
    setLoadingThread(true);
    setMessages([]);
    try {
      const res = await api.get(`/api/messages/conversations/${id}/messages?limit=50`);
      const list = res.data.messages || [];
      knownIds.current = new Set(list.map((m) => m._id));
      setActive(res.data.conversation);
      activeIdRef.current = res.data.conversation?._id;
      setMessages(list);
      afterRef.current = list.at(-1)?.createdAt || new Date().toISOString();
      await api.post(`/api/messages/conversations/${id}/read`).catch(() => {});
      setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, unread: 0 } : c)));
      refreshNotifications?.();
    } catch (_) {
      toast.error('Could not open conversation');
    } finally {
      setLoadingThread(false);
    }
  }, [refreshNotifications]);

  useEffect(() => {
    loadConversations();
    api.get('/api/users/directory')
      .then((res) => setDirectory(res.data.filter((u) => u._id !== user?._id)))
      .catch(() => {});
  }, [loadConversations, user?._id]);

  useEffect(() => {
    if (conversationId) openConversation(conversationId);
  }, [conversationId, openConversation]);

  useEffect(() => {
    if (!conversationId) return undefined;
    const tick = async () => {
      const id = activeIdRef.current;
      if (!id || sendingRef.current) return;
      try {
        const since = afterRef.current ? `?after=${encodeURIComponent(afterRef.current)}&limit=20` : '?limit=20';
        const res = await api.get(`/api/messages/conversations/${id}/messages${since}`);
        const incoming = (res.data.messages || []).filter((m) => !knownIds.current.has(m._id));
        if (!incoming.length) return;
        incoming.forEach((m) => knownIds.current.add(m._id));
        afterRef.current = incoming.at(-1).createdAt;
        setMessages((prev) => [...prev, ...incoming]);
      } catch (_) {}
    };
    const timer = setInterval(tick, 8000);
    return () => clearInterval(timer);
  }, [conversationId]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const startDirect = async (otherId) => {
    try {
      const res = await api.post('/api/messages/conversations/direct', { userId: otherId });
      await loadConversations();
      navigate(`/messages/${res.data._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start chat');
    }
  };

  const createTeamChat = async () => {
    try {
      const res = await api.post('/api/messages/conversations/team', {
        name: teamName.trim(),
        participantIds: teamPicks,
      });
      setTeamModal(false);
      setTeamName('');
      setTeamPicks([]);
      await loadConversations();
      navigate(`/messages/${res.data._id}`);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not create team chat');
    }
  };

  const send = async (event) => {
    event?.preventDefault();
    if (sendingRef.current) return;
    if (!active?._id || (!text.trim() && files.length === 0)) return;
    sendingRef.current = true;
    setSending(true);
    const payloadText = text.trim();
    const payloadFiles = [...files];
    setText('');
    setFiles([]);
    try {
      const body = new FormData();
      body.append('text', payloadText);
      payloadFiles.forEach((file) => body.append('files', file));
      const res = await api.post(`/api/messages/conversations/${active._id}/messages`, body);
      if (!knownIds.current.has(res.data._id)) {
        knownIds.current.add(res.data._id);
        setMessages((prev) => [...prev, res.data]);
      }
      afterRef.current = res.data.createdAt;
      setConversations((prev) => prev.map((c) => (
        c._id === active._id
          ? { ...c, lastMessageText: res.data.text || 'Attachment', lastMessageAt: res.data.createdAt }
          : c
      )));
    } catch (error) {
      setText(payloadText);
      setFiles(payloadFiles);
      toast.error(error.response?.data?.message || 'Failed to send');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const peopleToStart = useMemo(() => {
    const existing = new Set(
      conversations
        .filter((c) => c.type === 'direct' && c.other?._id)
        .map((c) => c.other._id)
    );
    const q = search.trim().toLowerCase();
    return directory
      .filter((p) => !existing.has(p._id))
      .filter((p) => !q || p.username.toLowerCase().includes(q) || (p.role || '').includes(q));
  }, [directory, conversations, search]);

  const filteredConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.name || '').toLowerCase().includes(q));
  }, [conversations, search]);

  const iconFor = (c) => {
    if (c.type === 'company') return <Building2 size={14} />;
    if (c.type === 'team') return <Users size={14} />;
    return (c.other?.username?.[0] || '?').toUpperCase();
  };

  return (
    <div className="h-full flex bg-[#e8eee6]">
      <aside className="w-[20rem] flex-shrink-0 bg-white/90 backdrop-blur border-r border-black/5 flex flex-col">
        <div className="p-4 border-b border-black/5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-brand-ink flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-brand-ink text-brand-green flex items-center justify-center">
                <MessageSquare size={16} />
              </span>
              Messages
            </h2>
            {canCreateTeam && (
              <button
                type="button"
                onClick={() => setTeamModal(true)}
                className="p-1.5 rounded-lg bg-brand-green/15 text-brand-greenDark hover:bg-brand-green hover:text-brand-ink"
                title="New team chat"
              >
                <Plus size={16} />
              </button>
            )}
          </div>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full pl-9 pr-3 py-2 rounded-full border border-black/10 bg-[#f6f8f4] text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {loadingList ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : (
            <>
              {filteredConversations.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => {
                    setLoadingThread(true);
                    navigate(`/messages/${c._id}`);
                  }}
                  className={`w-full text-left px-4 py-3 border-b border-black/5 transition ${
                    active?._id === c._id ? 'bg-brand-green/15' : 'hover:bg-black/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-white text-sm font-bold shadow-sm ${
                      c.type === 'company' ? 'bg-brand-ink text-brand-green' : c.type === 'team' ? 'bg-brand-yellow text-brand-ink' : 'bg-brand-blue'
                    }`}>
                      {iconFor(c)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-brand-ink truncate">
                        {c.type === 'company' ? `# ${c.name || 'company'}` : c.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{c.lastMessageText || 'No messages yet'}</p>
                    </div>
                    {c.unread > 0 && (
                      <span className="text-[10px] font-bold bg-brand-red text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {c.unread}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {peopleToStart.length > 0 && (
                <div className="px-4 py-2 text-[11px] uppercase tracking-wide text-slate-400 font-semibold flex items-center gap-1">
                  <Users size={11} /> New conversation
                </div>
              )}
              {peopleToStart.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => startDirect(p._id)}
                  className="w-full text-left px-4 py-2.5 hover:bg-black/[0.03] flex items-center gap-3"
                >
                  <div className="w-11 h-11 rounded-2xl bg-brand-blue/15 text-brand-blue flex items-center justify-center text-sm font-bold">
                    {p.username[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">{p.username}</p>
                    <p className="text-[11px] text-slate-400">{ROLE_LABELS[p.role] || p.role}</p>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col min-w-0 chat-canvas">
        {!active && !loadingThread ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <img
              src={`${import.meta.env.BASE_URL}supporticon-logo.png`}
              alt=""
              className="h-16 w-auto opacity-90 mb-5"
            />
            <p className="text-brand-ink font-semibold">Your team chat</p>
            <p className="text-sm text-slate-500 mt-1 max-w-sm">
              Pick a company channel, team chat, or start a direct message.
            </p>
          </div>
        ) : (
          <>
            <header className="h-16 bg-white/90 backdrop-blur border-b border-black/5 px-5 flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-brand-ink text-brand-green flex items-center justify-center">
                {active?.type === 'company' ? <Building2 size={16} /> : active?.type === 'team' ? <Users size={16} /> : <MessageSquare size={16} />}
              </div>
              <div>
                <p className="font-bold text-brand-ink text-sm">
                  {loadingThread && !active
                    ? 'Opening chat…'
                    : active?.type === 'company'
                      ? `# ${active.name || 'company'}`
                      : conversations.find((c) => c._id === active?._id)?.name}
                </p>
                <p className="text-[11px] text-brand-blue">
                  {active?.type === 'company' && 'Everyone in the company'}
                  {active?.type === 'direct' && 'Direct message'}
                  {active?.type === 'team' && 'Team chat'}
                  {loadingThread && !active && 'Loading history'}
                </p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 scrollbar-thin">
              {loadingThread && (
                <div className="h-full min-h-[240px] flex flex-col items-center justify-center gap-4">
                  <div className="w-10 h-10 rounded-full border-4 border-brand-green/30 border-t-brand-green animate-spin" />
                  <p className="text-sm text-slate-500">Loading messages…</p>
                  <div className="w-full max-w-md space-y-3 pt-2">
                    {[1, 2, 3, 4].map((n) => (
                      <div
                        key={n}
                        className={`h-12 rounded-2xl bg-white/70 animate-pulse ${n % 2 === 0 ? 'ml-12' : 'mr-12'}`}
                      />
                    ))}
                  </div>
                </div>
              )}
              {!loadingThread && messages.map((m) => {
                const mine = m.sender?._id === user?._id;
                return (
                  <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      mine
                        ? 'bg-brand-green text-brand-ink rounded-br-md'
                        : 'bg-white border border-black/5 text-slate-800 rounded-bl-md'
                    }`}>
                      {!mine && (
                        <p className="text-[11px] font-semibold mb-0.5 text-brand-blue">
                          {m.sender?.username}
                        </p>
                      )}
                      {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.attachments?.map((file) => (
                        <MediaViewer key={file.attachment} file={file} compact={mine} />
                      ))}
                      <p className={`text-[10px] mt-1 ${mine ? 'text-brand-ink/60' : 'text-slate-400'}`}>
                        {formatIST(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>
            <form onSubmit={send} className="bg-white/90 backdrop-blur border-t border-black/5 p-3">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((file, index) => (
                    <FileChip
                      key={`${file.name}-${index}`}
                      file={file}
                      onRemove={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    />
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="p-2.5 rounded-full border border-black/10 text-slate-500 hover:text-brand-greenDark hover:border-brand-green"
                  title="Attach documents or images"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const next = [...files, ...Array.from(e.target.files || [])].slice(0, 5);
                    setFiles(next);
                    e.target.value = '';
                  }}
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={1}
                  placeholder="Write a message…"
                  className="flex-1 px-4 py-2.5 rounded-full border border-black/10 bg-[#f6f8f4] text-sm resize-none outline-none focus:ring-2 focus:ring-brand-green"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!sendingRef.current) send(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || (!text.trim() && files.length === 0)}
                  className="w-11 h-11 rounded-full bg-brand-green text-brand-ink font-semibold disabled:opacity-50 flex items-center justify-center hover:bg-brand-greenDark"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </>
        )}
      </section>

      {teamModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-800">New team chat</h3>
              <button type="button" onClick={() => setTeamModal(false)} className="text-slate-400"><X size={18} /></button>
            </div>
            <input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder={user?.role === 'team_lead' ? "Your team's chat name" : 'Team name'}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm mb-3"
            />
            <p className="text-xs text-slate-500 mb-2">
              {user?.role === 'team_lead'
                ? 'Leave people empty to include all of your team members.'
                : 'Select people for this team chat.'}
            </p>
            <div className="max-h-56 overflow-y-auto space-y-1 mb-4">
              {directory.map((p) => (
                <label key={p._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm">
                  <input
                    type="checkbox"
                    checked={teamPicks.includes(p._id)}
                    onChange={(e) => setTeamPicks((prev) => (
                      e.target.checked ? [...prev, p._id] : prev.filter((id) => id !== p._id)
                    ))}
                  />
                  {p.username}
                  <span className="text-[11px] text-slate-400">{ROLE_LABELS[p.role]}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={createTeamChat}
              className="w-full py-2.5 rounded-xl bg-brand-green text-brand-ink font-semibold"
            >
              Create team chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
