const escapeCsv = (val) => {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
};

const toCsv = (headers, rows) => {
  const lines = [headers.map(escapeCsv).join(',')];
  rows.forEach((row) => {
    lines.push(row.map(escapeCsv).join(','));
  });
  return lines.join('\n');
};

const sendCsv = (res, filename, headers, rows) => {
  const csv = toCsv(headers, rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('\uFEFF' + csv);
};

module.exports = { escapeCsv, toCsv, sendCsv };
