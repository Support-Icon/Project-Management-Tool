import React, { useState } from 'react';
import { Download, FileText, Play, X } from 'lucide-react';
import { attachmentUrl } from '../api/axios';

const kindOf = (mime, name = '') => {
  const type = String(mime || '').toLowerCase();
  const lower = String(name || '').toLowerCase();
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/.test(lower)) return 'image';
  if (type.startsWith('video/') || /\.(mp4|webm|ogg|mov|m4v)$/.test(lower)) return 'video';
  if (type === 'application/pdf' || lower.endsWith('.pdf')) return 'pdf';
  return 'file';
};

export default function MediaViewer({ file, compact }) {
  const [open, setOpen] = useState(false);
  const kind = kindOf(file.mimeType, file.filename);
  const previewUrl = attachmentUrl(file.attachment, true);
  const downloadUrl = attachmentUrl(file.attachment, false);
  const tone = compact ? 'bg-black/10 text-brand-ink border-black/10' : 'bg-white text-brand-blue border-slate-200';

  return (
    <>
      <div className="mt-2 space-y-1.5">
        {kind === 'image' && (
          <button type="button" onClick={() => setOpen(true)} className="block max-w-full">
            <img
              src={previewUrl}
              alt={file.filename}
              loading="lazy"
              className="max-h-48 max-w-full rounded-xl object-cover border border-black/10 cursor-zoom-in"
            />
          </button>
        )}
        {kind === 'video' && (
          <video
            src={previewUrl}
            controls
            preload="metadata"
            className="max-h-52 max-w-full rounded-xl bg-black"
          />
        )}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${tone}`}
          >
            {kind === 'video' ? <Play size={12} /> : <FileText size={12} />}
            View
          </button>
          <a
            href={downloadUrl}
            download={file.filename}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold ${tone}`}
          >
            <Download size={12} />
            Download
          </a>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl max-h-[90vh] bg-slate-950 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <p className="text-sm text-white truncate pr-4">{file.filename}</p>
              <div className="flex items-center gap-2">
                <a
                  href={downloadUrl}
                  download={file.filename}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-ink text-white text-xs font-semibold"
                >
                  <Download size={13} /> Download
                </a>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="p-3 overflow-auto max-h-[calc(90vh-56px)] flex items-center justify-center bg-black">
              {kind === 'image' && (
                <img src={previewUrl} alt={file.filename} className="max-h-[80vh] max-w-full object-contain" />
              )}
              {kind === 'video' && (
                <video src={previewUrl} controls autoPlay className="max-h-[80vh] max-w-full" />
              )}
              {kind === 'pdf' && (
                <iframe title={file.filename} src={previewUrl} className="w-full h-[80vh] bg-white rounded-lg" />
              )}
              {kind === 'file' && (
                <div className="text-center text-slate-300 py-16 px-6">
                  <FileText size={40} className="mx-auto mb-3" />
                  <p className="font-semibold">{file.filename}</p>
                  <p className="text-sm text-slate-400 mt-1">Preview is not available. Use Download.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
