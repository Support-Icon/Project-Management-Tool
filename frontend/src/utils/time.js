const IST = 'Asia/Kolkata';

export const formatIST = (value) => {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      timeZone: IST,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(new Date(value)) + ' IST';
  } catch {
    return new Date(value).toLocaleString();
  }
};

export const formatDuration = (duration) => {
  if (!duration?.value) return '';
  const unit = duration.value === 1 ? String(duration.unit || 'hour').replace(/s$/, '') : (duration.unit || 'hours');
  return `${duration.value} ${unit}`;
};

export const remainingLabel = (deadlineAt) => {
  if (!deadlineAt) return '';
  const ms = new Date(deadlineAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return '';
  if (ms <= 0) return 'Overdue';
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m left`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h left`;
};

/** datetime-local value in IST, e.g. 2026-10-27T19:30 */
export const toDateTimeLocal = (value) => {
  if (!value) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: IST,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date(value));
    const get = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  } catch {
    return '';
  }
};

/** Store IST wall time as an ISO instant */
export const fromDateTimeLocal = (value) => {
  if (!value) return null;
  const iso = value.length === 16 ? `${value}:00+05:30` : value;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export const previewDeadline = (value, unit) => {
  const n = Number(value);
  if (!n || n <= 0) return '';
  const ms = unit === 'days' ? n * 86400000 : unit === 'minutes' ? n * 60000 : n * 3600000;
  return formatIST(new Date(Date.now() + ms));
};
