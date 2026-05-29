const getDateRange = (period, startDate, endDate) => {
  if (!period || period === 'all') return null;

  const now = new Date();
  let start;
  let end;

  if (period === 'weekly') {
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
    start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === 'monthly') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  } else if (period === 'custom') {
    if (!startDate || !endDate) return { error: 'startDate and endDate required for custom range' };
    start = new Date(startDate);
    end = new Date(endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return { error: 'Invalid date format' };
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (start > end) return { error: 'startDate must be before endDate' };
  } else {
    return { error: 'Invalid period. Use weekly, monthly, custom, or all' };
  }

  return { start, end };
};

const taskDateFilter = (range) => {
  if (!range) return {};
  return { createdAt: { $gte: range.start, $lte: range.end } };
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 10);
};

const formatDateTime = (d) => {
  if (!d) return '';
  return new Date(d).toISOString().replace('T', ' ').slice(0, 19);
};

module.exports = { getDateRange, taskDateFilter, formatDate, formatDateTime };
