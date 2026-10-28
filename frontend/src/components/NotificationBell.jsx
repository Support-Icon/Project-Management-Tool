import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useNotifications } from '../context/NotificationContext';
import { formatIST } from '../utils/time';
import PersonName from './PersonName';

export default function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead, requestDesktopPermission } = useNotifications() || {};
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const handleOpen = () => {
    setOpen((v) => !v);
    requestDesktopPermission?.();
  };

  const handleItem = async (item) => {
    if (!item.read) await markRead(item._id);
    setOpen(false);
    if (item.link) navigate(item.link);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={handleOpen}
        className="relative p-2 rounded-lg text-slate-500 hover:text-brand-greenDark hover:bg-brand-green/10 transition"
        title="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-[min(22rem,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-brand-blue hover:text-brand-greenDark flex items-center gap-1"
              >
                <CheckCheck size={13} /> Clear all
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!items?.length ? (
              <p className="p-6 text-sm text-slate-400 text-center">No notifications yet.</p>
            ) : items.map((item) => (
              <button
                key={item._id}
                type="button"
                onClick={() => handleItem(item)}
                className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition ${item.read ? '' : 'bg-brand-green/10'}`}
              >
                {item.actor?.username ? (
                  <PersonName user={item.actor} size={22} nameClassName="text-sm font-semibold text-slate-800" />
                ) : (
                  <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                )}
                {item.actor?.username && (
                  <p className="text-sm font-semibold text-slate-800 mt-1">{item.title}</p>
                )}
                {item.body && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{item.body}</p>}
                <p className="text-[11px] text-slate-400 mt-1">{formatIST(item.createdAt)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
