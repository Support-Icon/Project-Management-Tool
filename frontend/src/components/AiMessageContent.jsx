import React, { useMemo } from 'react';

function inlineFormat(text) {
  const parts = [];
  const re = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
  let last = 0;
  let match;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[2]) {
      parts.push(<strong key={key++} className="font-semibold text-slate-900">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<em key={key++}>{match[3]}</em>);
    } else if (match[4]) {
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-slate-100 text-[11px] font-mono">
          {match[4]}
        </code>
      );
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function isTableSeparator(line) {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/.test(line.trim());
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function parseBlocks(content) {
  const lines = String(content || '').split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = parseTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(parseTableRow(lines[i]));
        i += 1;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (/^#{1,3}\s+/.test(line)) {
      const level = line.match(/^#+/)[0].length;
      blocks.push({ type: 'heading', level, text: line.replace(/^#{1,3}\s+/, '') });
      i += 1;
      continue;
    }

    if (/^[-*•]\s+/.test(line.trim())) {
      const items = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'list', items });
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith('|') && !/^#{1,3}\s+/.test(lines[i]) && !/^[-*•]\s+/.test(lines[i].trim())) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

export default function AiMessageContent({ content }) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="space-y-2.5 text-sm leading-relaxed">
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h3' : 'h4';
          return (
            <Tag key={index} className="font-bold text-slate-900 text-base">
              {inlineFormat(block.text)}
            </Tag>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={index} className="space-y-1.5 pl-1">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2 text-slate-700">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                  <span>{inlineFormat(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={index} className="overflow-x-auto rounded-xl border border-slate-200 -mx-0.5">
              <table className="w-full min-w-[480px] text-left text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {block.headers.map((header, hIndex) => (
                      <th key={hIndex} className="px-3 py-2.5 font-semibold text-slate-600 whitespace-nowrap">
                        {inlineFormat(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rIndex) => (
                    <tr key={rIndex} className="border-t border-slate-100">
                      {row.map((cell, cIndex) => (
                        <td key={cIndex} className="px-3 py-2.5 text-slate-700 whitespace-nowrap">
                          {inlineFormat(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return (
          <p key={index} className="text-slate-700 whitespace-pre-wrap">
            {inlineFormat(block.text)}
          </p>
        );
      })}
    </div>
  );
}
