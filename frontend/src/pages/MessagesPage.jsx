import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Building2, FileText, Image as ImageIcon, MessageSquare, Paperclip,
  Search, Send, Users, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import api, { attachmentUrl } from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { formatIST } from '../utils/time';
import { ROLE_LABELS } from '../utils/roles';

const isImage = (mime) => String(mime || '').startsWith('image/');

const FileChip = ({ file, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-xs text-slate-600">
    {isImage(file.type) ? <ImageIcon size={12} /> : <FileText size={12} />}
    <span className="max-w-[140px] truncate">{file.name}</span>
    <button type="button" onClick={onRemove} className="text-slate-400 hover:text-red-500">
      <X size={12} />
    </button>
  </span>
);

const AttachmentLink = ({ file }) => {
  const href = attachmentUrl(file.attachment, isImage(file.mimeType));
  if (isImage(file.mimeType)) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block mt-2">
        <img src={href} alt={file.filename} className="max-h-48 rounded-lg border border-slate-200" />
      </a>
    );
  }
  return (
    <a
      href={attachmentUrl(file.attachment)}
      className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/70 border border-slate-200 text-xs font-semibold text-indigo-600 hover:bg-white"
    >
      <Paperclip size={12} />
      {file.filename}
    </a>
  );
};

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refresh } = useNotifications() || {};
  const [conversations, setConversations] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const listEndRef = useRef(null);
  const fileRef = useRef(null);
  const afterRef = useRef(null);

  const loadConversations = async () => {
    try {
      const res = await api.get('/api/messages/conversations');
      setConversations(res.data);
      return res.data;
    } catch (_) {
      toast.error('Failed to load conversations');
      return [];
    } finally {
      setLoadingList(false);
    }
  };

  const loadDirectory = async () => {
    try {
      const res = await api.get('/api/users/directory');
      setDirectory(res.data.filter((u) => u._id !== user?._id));
    } catch (_) {}
  };

  const openConversation = async (id, list = conversations) => {
    try {
      const res = await api.get(`/api/messages/conversations/${id}/messages?limit=80`);
      setActive(res.data.conversation);
      setMessages(res.data.messages);
      afterRef.current = res.data.messages.at(-1)?.createdAt || new Date().toISOString();
      await api.post(`/api/messages/conversations/${id}/read`);
      refresh?.();
      setConversations((prev) => prev.map((c) => (c._id === id ? { ...c, unread: 0 } : c)));
      if (!list.some((c) => c._id === id)) loadConversations();
    } catch (_) {
      toast.error('Could not open conversation');
    }
  };

  useEffect(() => {
    loadConversations();
    loadDirectory();
  }, []);

  useEffect(() => {
    if (conversationId) openConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    if (!active?._id) return undefined;
    const tick = async () => {
      try {
        const since = afterRef.current ? `?after=${encodeURIComponent(afterRef.current)}` : '';
        const res = await api.get(`/api/messages/conversations/${active._id}/messages${since}`);
        const incoming = (res.data.messages || []).filter(
          (m) => !messages.some((existing) => existing._id === m._id)
        );
        if (incoming.length) {
          setMessages((prev) => [...prev, ...incoming]);
          afterRef.current = incoming.at(-1).createdAt;
          await api.post(`/api/messages/conversations/${active._id}/read`);
        }
      } catch (_) {}
    };
    const id = setInterval(tick, 4000);
    return () => clearInterval(id);
  }, [active?._id]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const startDirect = async (otherId) => {
    try {
      const res = await api.post('/api/messages/conversations/direct', { userId: otherId });
      const list = await loadConversations();
      navigate(`/messages/${res.data._id}`);
      if (!list.some((c) => c._id === res.data._id)) {
        setConversations((prev) => [res.data, ...prev.filter((c) => c._id !== res.data._id)]);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not start chat');
    }
  };

  const send = async (event) => {
    event.preventDefault();
    if (!active?._id || (!text.trim() && files.length === 0)) return;
    setSending(true);
    try {
      const body = new FormData();
      body.append('text', text.trim());
      files.forEach((file) => body.append('files', file));
      const res = await api.post(`/api/messages/conversations/${active._id}/messages`, body);
      setMessages((prev) => [...prev, res.data]);
      afterRef.current = res.data.createdAt;
      setText('');
      setFiles([]);
      setConversations((prev) => prev.map((c) => (
        c._id === active._id
          ? { ...c, lastMessageText: res.data.text || 'Attachment', lastMessageAt: res.data.createdAt }
          : c
      )));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send');
    } finally {
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

  return (
    <div className="h-full flex bg-slate-100">
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <MessageSquare size={18} className="text-indigo-600" /> Messages
          </h2>
          <div className="relative mt-3">
            <Search size={14} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search people…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <p className="p-4 text-sm text-slate-400">Loading…</p>
          ) : (
            <>
              {filteredConversations.map((c) => (
                <button
                  key={c._id}
                  type="button"
                  onClick={() => navigate(`/messages/${c._id}`)}
                  className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 ${
                    active?._id === c._id ? 'bg-indigo-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold ${
                      c.type === 'company' ? 'bg-indigo-600' : 'bg-sky-500'
                    }`}>
                      {c.type === 'company' ? <Building2 size={14} /> : (c.other?.username?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {c.type === 'company' ? `# ${c.name || 'company'}` : c.name}
                      </p>
                      <p className="text-xs text-slate-400 truncate">{c.lastMessageText || 'No messages yet'}</p>
                    </div>
                    {c.unread > 0 && (
                      <span className="text-[10px] font-bold bg-rose-500 text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
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
                  className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center gap-2"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center text-xs font-bold">
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

      <section className="flex-1 flex flex-col min-w-0">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Pick a company channel or start a direct message.
          </div>
        ) : (
          <>
            <header className="h-14 bg-white border-b border-slate-200 px-5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
                {active.type === 'company' ? <Building2 size={14} /> : <MessageSquare size={14} />}
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  {active.type === 'company' ? `# ${active.name || 'company'}` : conversations.find((c) => c._id === active._id)?.name}
                </p>
                <p className="text-[11px] text-slate-400">
                  {active.type === 'company' ? 'Everyone in the company' : 'Direct message'}
                </p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {messages.map((m) => {
                const mine = m.sender?._id === user?._id;
                return (
                  <div key={m._id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      mine ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-100 text-slate-800'
                    }`}>
                      {!mine && (
                        <p className={`text-[11px] font-semibold mb-0.5 ${mine ? 'text-indigo-100' : 'text-indigo-600'}`}>
                          {m.sender?.username}
                        </p>
                      )}
                      {m.text && <p className="text-sm whitespace-pre-wrap break-words">{m.text}</p>}
                      {m.attachments?.map((file) => (
                        <AttachmentLink key={file.attachment} file={file} />
                      ))}
                      <p className={`text-[10px] mt-1 ${mine ? 'text-indigo-200' : 'text-slate-400'}`}>
                        {formatIST(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>
            <form onSubmit={send} className="bg-white border-t border-slate-200 p-3">
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
                  className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:text-indigo-600"
                  title="Attach documents or images"
                >
                  <Paperclip size={18} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
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
                  placeholder="Write a message… documents welcome"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(e);
                    }
                  }}
                />
                <button
                  type="submit"
                  disabled={sending || (!text.trim() && files.length === 0)}
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Send size={16} /> Send
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
