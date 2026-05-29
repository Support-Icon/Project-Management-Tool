/**
 * Browsers send Origin without a path (e.g. https://support-icon.github.io).
 * FRONTEND_URL must NOT include /Project-Management-Tool/ — only the site origin.
 */
const normalizeOrigin = (url) => {
  if (!url) return '';
  try {
    const u = new URL(url.trim());
    return `${u.protocol}//${u.host}`;
  } catch {
    return url.trim().replace(/\/$/, '');
  }
};

const getAllowedOrigins = () => {
  const raw = process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '';
  const list = raw.split(',').map((s) => normalizeOrigin(s)).filter(Boolean);
  return [...new Set(list)];
};

const corsOptions = {
  credentials: true,
  origin(origin, callback) {
    const allowed = getAllowedOrigins();

    // No Origin: same-origin tools, Postman, health checks
    if (!origin) return callback(null, true);

    if (allowed.length === 0) {
      return callback(null, true);
    }

    const requestOrigin = normalizeOrigin(origin);
    if (allowed.includes(requestOrigin)) {
      return callback(null, true);
    }

    callback(new Error(`CORS blocked for origin: ${origin}. Allowed: ${allowed.join(', ')}`));
  },
};

module.exports = { corsOptions, getAllowedOrigins, normalizeOrigin };
