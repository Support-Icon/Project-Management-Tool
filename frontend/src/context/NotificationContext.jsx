import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from './AuthContext';
import { playNotifySound, unlockNotifySound } from '../utils/notifySound';

const NotificationContext = createContext(null);
const POLL_MS = 20000;
const SEEN_KEY = 'pf-seen-notif';

const desktopNotify = (item) => {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;
  try {
    const n = new window.Notification(item.title, {
      body: item.body,
      tag: item._id,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (_) {}
};

export const NotificationProvider = ({ children }) => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const seenRef = useRef(new Set());
  const readyRef = useRef(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
      if (Array.isArray(stored)) seenRef.current = new Set(stored);
    } catch (_) {}
  }, []);

  useEffect(() => {
    const unlock = () => unlockNotifySound();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  const persistSeen = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seenRef.current].slice(-200)));
    } catch (_) {}
  };

  const poll = async () => {
    if (!user) return;
    try {
      const res = await api.get('/api/notifications?limit=30');
      const list = res.data.items || [];
      setItems(list);
      setUnreadCount(res.data.unreadCount || 0);
      setUnreadMessages(res.data.unreadMessages || 0);

      if (readyRef.current) {
        const fresh = list.filter((item) => !seenRef.current.has(item._id) && !item.read);
        if (fresh.length) {
          const assigned = fresh.some((item) => item.type === 'task_assigned');
          if (assigned || fresh.some((item) => item.type === 'message')) {
            playNotifySound();
          }
          fresh.slice(0, 3).forEach(desktopNotify);
        }
      }
      list.forEach((item) => seenRef.current.add(item._id));
      persistSeen();
      readyRef.current = true;
    } catch (_) {}
  };

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      setUnreadMessages(0);
      readyRef.current = false;
      return undefined;
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => clearInterval(id);
  }, [user?._id]);

  const markRead = async (id) => {
    setItems((prev) => prev.filter((item) => item._id !== id));
    setUnreadCount((n) => Math.max(0, n - 1));
    try {
      await api.delete(`/api/notifications/${id}`);
    } catch (_) {}
  };

  const markAllRead = async () => {
    const ids = items.map((item) => item._id);
    setItems([]);
    setUnreadCount(0);
    try {
      await Promise.all(ids.map((id) => api.delete(`/api/notifications/${id}`)));
    } catch (_) {}
  };

  const requestDesktopPermission = async () => {
    if (!('Notification' in window)) return 'unsupported';
    if (window.Notification.permission === 'granted') return 'granted';
    return window.Notification.requestPermission();
  };

  return (
    <NotificationContext.Provider
      value={{
        items,
        unreadCount,
        unreadMessages,
        refresh: poll,
        markRead,
        markAllRead,
        requestDesktopPermission,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => useContext(NotificationContext);
