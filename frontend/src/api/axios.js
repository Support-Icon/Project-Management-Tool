import axios from 'axios';

/**
 * Must be the Lambda function URL, e.g. https://xxxx.lambda-url.us-east-1.on.aws
 * NEVER "/", the custom domain, or GitHub Pages URL — those are static hosts and return 405 on POST.
 */
const normalizeApiUrl = (value) => {
  const raw = String(value || '').trim().replace(/\/$/, '');
  if (!raw || raw === '/' || raw === '.') return '';
  if (!/^https?:\/\//i.test(raw)) return '';
  try {
    const url = new URL(raw);
    // Reject if someone pasted the frontend custom domain as the API
    if (/projectflow\.supporticon\.com$/i.test(url.hostname)) return '';
    if (/github\.io$/i.test(url.hostname)) return '';
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
};

const LAMBDA_API = 'https://76ypmheos3q5tjfmgj2zknsfd40pcrmy.lambda-url.us-east-1.on.aws';
const fromEnv = normalizeApiUrl(import.meta.env.VITE_API_URL);
const API_URL = fromEnv || (import.meta.env.DEV ? 'http://localhost:5000' : LAMBDA_API);

if (!API_URL && import.meta.env.PROD) {
  console.error(
    '[ProjectFlow] VITE_API_URL is missing or invalid. Set the GitHub Actions secret to your Lambda function URL, then redeploy.'
  );
}

const api = axios.create({
  baseURL: API_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
  timeout: 120000,
});

api.interceptors.request.use((config) => {
  if (!api.defaults.baseURL) {
    return Promise.reject(
      new Error(
        'API URL is not configured. Set GitHub secret VITE_API_URL to your Lambda function URL and redeploy.'
      )
    );
  }
  try {
    const onJoin = typeof window !== 'undefined' && window.location.pathname.includes('/join/');
    const guestRaw = localStorage.getItem('meetGuest');
    const guest = guestRaw ? JSON.parse(guestRaw) : null;
    if (onJoin && guest?.token) {
      config.headers.Authorization = `Bearer ${guest.token}`;
    } else {
      const stored = localStorage.getItem('auth');
      if (stored) {
        const { token } = JSON.parse(stored);
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    }
  } catch (_) {}
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const onJoin = typeof window !== 'undefined' && window.location.pathname.includes('/join/');
      if (onJoin) {
        localStorage.removeItem('meetGuest');
        return Promise.reject(error);
      }
      localStorage.removeItem('auth');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export const getApiBase = () => api.defaults.baseURL || '';

export const getAuthToken = () => {
  try {
    const stored = localStorage.getItem('auth');
    if (!stored) return '';
    return JSON.parse(stored).token || '';
  } catch {
    return '';
  }
};

export const attachmentUrl = (id, inline = false) => {
  const token = encodeURIComponent(getAuthToken());
  return `${getApiBase()}/api/messages/attachments/${id}?token=${token}${inline ? '&inline=1' : ''}`;
};

export default api;
