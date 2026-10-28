import React, { useEffect, useMemo, useRef, useState } from 'react';

const VIEW = 280;
const MAX_BYTES = 10 * 1024;

const encodeSquare = (source, sx, sy, side, dim, quality) => {
  const canvas = document.createElement('canvas');
  canvas.width = dim;
  canvas.height = dim;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, sx, sy, side, side, 0, 0, dim, dim);
  return canvas.toDataURL('image/jpeg', quality);
};

const compressSquare = (source, sx, sy, side) => {
  let data = encodeSquare(source, sx, sy, side, 96, 0.72);
  const binLen = (s) => Math.ceil((s.split(',')[1] || '').length * 0.75);
  if (binLen(data) > MAX_BYTES) data = encodeSquare(source, sx, sy, side, 72, 0.55);
  if (binLen(data) > MAX_BYTES) data = encodeSquare(source, sx, sy, side, 56, 0.42);
  if (binLen(data) > MAX_BYTES) data = encodeSquare(source, sx, sy, side, 48, 0.32);
  if (binLen(data) > MAX_BYTES) throw new Error('Could not shrink this photo under 10 KB');
  return data;
};

export default function ImageCropper({ file, onCancel, onCropped }) {
  const [image, setImage] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef(null);

  useEffect(() => {
    let gone = false;
    const load = async () => {
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        if (gone) {
          bitmap.close?.();
          return;
        }
        setImage(bitmap);
        setZoom(1);
        setOffset({ x: 0, y: 0 });
      } catch (_) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          if (!gone) setImage(img);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      }
    };
    load();
    return () => { gone = true; };
  }, [file]);

  const layout = useMemo(() => {
    if (!image) return null;
    const minScale = Math.max(VIEW / image.width, VIEW / image.height);
    const scale = minScale * zoom;
    const width = image.width * scale;
    const height = image.height * scale;
    const minX = Math.min(0, VIEW - width);
    const minY = Math.min(0, VIEW - height);
    const x = Math.min(0, Math.max(minX, offset.x));
    const y = Math.min(0, Math.max(minY, offset.y));
    return { scale, width, height, x, y, minX, minY };
  }, [image, zoom, offset]);

  const startDrag = (clientX, clientY) => {
    if (!layout) return;
    drag.current = { x: clientX, y: clientY, ox: layout.x, oy: layout.y };
  };

  const moveDrag = (clientX, clientY) => {
    if (!drag.current || !layout) return;
    setOffset({
      x: Math.min(0, Math.max(layout.minX, drag.current.ox + (clientX - drag.current.x))),
      y: Math.min(0, Math.max(layout.minY, drag.current.oy + (clientY - drag.current.y))),
    });
  };

  const apply = () => {
    if (!image || !layout) return;
    setBusy(true);
    try {
      const sx = -layout.x / layout.scale;
      const sy = -layout.y / layout.scale;
      const side = VIEW / layout.scale;
      onCropped(compressSquare(image, sx, sy, side));
    } catch (err) {
      setBusy(false);
      window.alert(err.message || 'Could not crop this photo');
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-brand-ink text-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-white/10">
          <p className="font-bold">Crop photo</p>
          <p className="text-xs text-slate-400 mt-1">Drag to frame the face, then pinch-zoom with the slider.</p>
        </div>
        <div className="p-5 flex flex-col items-center">
          <div
            className="relative overflow-hidden rounded-2xl bg-black touch-none select-none"
            style={{ width: VIEW, height: VIEW }}
            onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
            onMouseMove={(e) => moveDrag(e.clientX, e.clientY)}
            onMouseUp={() => { drag.current = null; }}
            onMouseLeave={() => { drag.current = null; }}
            onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
            onTouchMove={(e) => {
              e.preventDefault();
              moveDrag(e.touches[0].clientX, e.touches[0].clientY);
            }}
            onTouchEnd={() => { drag.current = null; }}
          >
            {image && layout && (
              <img
                src={image instanceof HTMLImageElement ? image.src : undefined}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: layout.width,
                  height: layout.height,
                  left: layout.x,
                  top: layout.y,
                  display: image instanceof HTMLImageElement ? 'block' : 'none',
                }}
              />
            )}
            {image && !(image instanceof HTMLImageElement) && layout && (
              <CanvasPreview image={image} layout={layout} />
            )}
            <div className="absolute inset-0 rounded-2xl ring-2 ring-brand-green pointer-events-none" />
          </div>
          <label className="w-full mt-4 text-xs text-slate-400">
            Zoom
            <input
              type="range"
              min="1"
              max="3"
              step="0.02"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full mt-2 accent-brand-green"
            />
          </label>
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-white/15 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !image}
            onClick={apply}
            className="flex-1 py-2.5 rounded-xl bg-brand-green text-brand-ink text-sm font-bold disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CanvasPreview({ image, layout }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    canvas.width = VIEW;
    canvas.height = VIEW;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, VIEW, VIEW);
    ctx.drawImage(image, layout.x, layout.y, layout.width, layout.height);
  }, [image, layout]);
  return <canvas ref={ref} className="absolute inset-0 pointer-events-none" width={VIEW} height={VIEW} />;
}
