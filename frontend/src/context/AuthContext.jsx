import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

const ADMIN_MINE_ONLY_KEY = 'adminMineOnly';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [adminMineOnly, setAdminMineOnly] = useState(
    () => localStorage.getItem(ADMIN_MINE_ONLY_KEY) === 'true'
  );

  const toggleAdminMineOnly = () => {
    setAdminMineOnly((prev) => {
      const next = !prev;
      localStorage.setItem(ADMIN_MINE_ONLY_KEY, String(next));
      return next;
    });
  };

  useEffect(() => {
    const stored = localStorage.getItem('auth');
    if (!stored) {
      setLoading(false);
      return;
    }

    try {
      const { token, user: storedUser } = JSON.parse(stored);
      if (!token || !storedUser) {
        localStorage.removeItem('auth');
        setLoading(false);
        return;
      }

      setUser(storedUser);

      // Verify token is still valid with server
      api.get('/api/auth/me')
        .then((res) => {
          const freshUser = res.data;
          setUser(freshUser);
          localStorage.setItem('auth', JSON.stringify({ token, user: freshUser }));
        })
        .catch(() => {
          localStorage.removeItem('auth');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } catch (_) {
      localStorage.removeItem('auth');
      setLoading(false);
    }
  }, []);

  const persist = (token, user) => {
    localStorage.setItem('auth', JSON.stringify({ token, user }));
  };

  const login = async (username, password) => {
    const res = await api.post('/api/auth/login', { username, password });
    const { token, user: u } = res.data;
    setUser(u);
    persist(token, u);
    return u;
  };

  const register = async (username, password, companyName) => {
    const res = await api.post('/api/auth/register', { username, password, companyName });
    const { token, user: u } = res.data;
    setUser(u);
    persist(token, u);
    return u;
  };

  const logout = () => {
    localStorage.removeItem('auth');
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        adminMineOnly,
        toggleAdminMineOnly,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
