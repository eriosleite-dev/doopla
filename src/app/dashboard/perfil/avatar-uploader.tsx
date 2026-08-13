'use client';

import { useActionState, useRef, useState } from 'react';

import { uploadAvatarAction } from '../actions';
import { accentButtonClass, avatarClass, initialsFromName } from '../ui';

const VIEWPORT = 220;
const OUTPUT = 480;

export function AvatarUploader({
  currentUrl,
  fallbackName,
}: {
  currentUrl: string | null;
  fallbackName: string;
}) {
  const [state, formAction, pending] = useActionState(uploadAvatarAction, {});
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function baseScale() {
    if (naturalSize.w === 0) return 1;
    return VIEWPORT / Math.min(naturalSize.w, naturalSize.h);
  }

  function effectiveScale() {
    return baseScale() * scale;
  }

  function clampOffset(x: number, y: number, effScale: number) {
    const dispW = naturalSize.w * effScale;
    const dispH = naturalSize.h * effScale;
    return {
      x: Math.min(0, Math.max(VIEWPORT - dispW, x)),
      y: Math.min(0, Math.max(VIEWPORT - dispH, y)),
    };
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }

  function onImageLoad() {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    setNaturalSize({ w, h });
    const scale1 = VIEWPORT / Math.min(w, h);
    setOffset({ x: (VIEWPORT - w * scale1) / 2, y: (VIEWPORT - h * scale1) / 2 });
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    const next = clampOffset(dragRef.current.ox + dx, dragRef.current.oy + dy, effectiveScale());
    setOffset(next);
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function onScaleChange(next: number) {
    setScale(next);
    setOffset((prev) => clampOffset(prev.x, prev.y, baseScale() * next));
  }

  function handleSave() {
    const img = imgRef.current;
    if (!img) return;

    const effScale = effectiveScale();
    const sx = -offset.x / effScale;
    const sy = -offset.y / effScale;
    const sSize = VIEWPORT / effScale;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, OUTPUT, OUTPUT);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const fd = new FormData();
        fd.set('avatar', blob, 'avatar.jpg');
        formAction(fd);
        setObjectUrl(null);
      },
      'image/jpeg',
      0.9
    );
  }

  if (objectUrl) {
    const effScale = effectiveScale();
    return (
      <div className="flex flex-col gap-4">
        <div
          className="relative mx-auto overflow-hidden rounded-full bg-[var(--paper-dim)]"
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={objectUrl}
            alt=""
            onLoad={onImageLoad}
            draggable={false}
            className="pointer-events-none absolute select-none"
            style={{
              left: offset.x,
              top: offset.y,
              width: naturalSize.w * effScale,
              height: naturalSize.h * effScale,
              maxWidth: 'none',
            }}
          />
        </div>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={scale}
          onChange={(e) => onScaleChange(Number(e.target.value))}
          className="mx-auto w-[220px]"
        />
        <div className="flex justify-center gap-3">
          <button type="button" onClick={handleSave} disabled={pending} className={accentButtonClass}>
            {pending ? 'Salvando…' : 'Salvar foto'}
          </button>
          <button
            type="button"
            onClick={() => setObjectUrl(null)}
            className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50"
          >
            Cancelar
          </button>
        </div>
        {state.error && <p className="text-center text-sm text-red-700">{state.error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      {currentUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentUrl}
          alt=""
          className="h-16 w-16 flex-none rounded-full object-cover"
        />
      ) : (
        <span className={`${avatarClass} h-16 w-16 text-xl`}>{initialsFromName(fallbackName)}</span>
      )}
      <div>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="font-doopla-mono rounded-full border border-[var(--ink)]/20 px-4 py-2 text-[11px] uppercase tracking-[.05em] hover:border-[var(--accent)]"
        >
          Alterar foto
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
}
