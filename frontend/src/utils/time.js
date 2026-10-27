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

export const previewDeadline = (value, unit) => {
  const n = Number(value);
  if (!n || n <= 0) return '';
  const ms = unit === 'days' ? n * 86400000 : unit === 'minutes' ? n * 60000 : n * 3600000;
  return formatIST(new Date(Date.now() + ms));
};
