import axios from 'axios';

/**
 * Must be the Render API origin, e.g. https://project-management-tool-c6f9.onrender.com
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

const fromEnv = normalizeApiUrl(import.meta.env.VITE_API_URL);
const API_URL = fromEnv || (import.meta.env.DEV ? 'http://localhost:5000' : '');

if (!API_URL && import.meta.env.PROD) {
  console.error(
    '[ProjectFlow] VITE_API_URL is missing or invalid. Set the GitHub Actions secret to your Render URL (https://….onrender.com), then redeploy.'
  );
}

const api = axios.create({
  baseURL: API_URL || undefined,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  if (!api.defaults.baseURL) {
    return Promise.reject(
      new Error(
        'API URL is not configured. Set GitHub secret VITE_API_URL to your Render backend URL and redeploy.'
      )
    );
  }
  try {
    const stored = localStorage.getItem('auth');
    if (stored) {
      const { token } = JSON.parse(stored);
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
  } catch (_) {}
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth');
      window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;
