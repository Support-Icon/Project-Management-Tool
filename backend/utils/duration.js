const { DateTime } = require('luxon');

const IST = 'Asia/Kolkata';
const UNITS = ['minutes', 'hours', 'days'];

/** Normalise `{ value, unit }` from a request body. Returns null when not set. */
const parseDuration = (input) => {
  if (!input || input.value === '' || input.value === null || input.value === undefined) return null;
  const value = Number(input.value);
  const unit = UNITS.includes(input.unit) ? input.unit : 'hours';
  if (!Number.isFinite(value) || value <= 0) return { error: 'Duration must be a positive number' };
  if (value > 100000) return { error: 'Duration is too large' };
  return { value, unit };
};

/**
 * Compute the deadline from a start instant plus the duration, in the given timezone.
 * Days are added as calendar days (so "1 day" set at 3:30 PM IST is due 3:30 PM IST tomorrow).
 */
const computeDeadline = (duration, from = new Date(), timezone = IST) => {
  if (!duration || !duration.value) return null;
  const base = DateTime.fromJSDate(from).setZone(timezone);
  return base.plus({ [duration.unit]: duration.value }).toJSDate();
};

/** Human label, e.g. "2 hours", "1 day". */
const formatDuration = (duration) => {
  if (!duration || !duration.value) return '';
  const unit = duration.value === 1 ? duration.unit.replace(/s$/, '') : duration.unit;
  return `${duration.value} ${unit}`;
};

/** "27 Oct 2026, 3:30 PM IST" */
const formatIST = (date, timezone = IST) => {
  if (!date) return 'Not set';
  const dt = DateTime.fromJSDate(new Date(date)).setZone(timezone);
  const zone = timezone === IST ? 'IST' : dt.offsetNameShort;
  return `${dt.toFormat('d LLL yyyy, h:mm a')} ${zone}`;
};

module.exports = { IST, UNITS, parseDuration, computeDeadline, formatDuration, formatIST };
