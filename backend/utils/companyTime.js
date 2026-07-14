const { DateTime } = require('luxon');

const isValidTimezone = (timezone) => DateTime.now().setZone(timezone).isValid;

const todayInZone = (timezone = 'Asia/Kolkata') =>
  DateTime.now().setZone(timezone).toISODate();

const currentTimeInZone = (timezone = 'Asia/Kolkata') =>
  DateTime.now().setZone(timezone).toFormat('HH:mm');

const dateRangeInZone = (startDate, endDate, timezone = 'Asia/Kolkata') => {
  const start = DateTime.fromISO(startDate, { zone: timezone }).startOf('day');
  const end = DateTime.fromISO(endDate, { zone: timezone }).endOf('day');
  if (!start.isValid || !end.isValid || start > end) return null;
  return { start: start.toJSDate(), end: end.toJSDate() };
};

module.exports = { isValidTimezone, todayInZone, currentTimeInZone, dateRangeInZone };
