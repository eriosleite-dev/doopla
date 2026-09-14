'use client';

import { useEffect, useRef } from 'react';

// Mascote Doopla — regra visual absoluta (seção 7 da spec): corpo/bola
// vermelha, olho PRETO, pupila BRANCA menor dentro do olho preto.
// Comportamento: acompanha o cursor sutilmente; ~2s sem movimento volta
// a vagar sozinho, sutil. Respeita prefers-reduced-motion (sem tracking
// nenhum nesse caso — olhos ficam parados no centro).
export function ProMascot({ size = 108 }: { size?: number }) {
  const ballRef = useRef<HTMLDivElement>(null);
  const pupilRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    let wanderTimer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    function setPupils(ox: number, oy: number, duration: number) {
      pupilRefs.current.forEach((p) => {
        if (!p) return;
        p.style.transition = `transform ${duration}ms ease-in-out`;
        p.style.transform = `translate(${ox}px, ${oy}px)`;
      });
    }

    function wander() {
      if (cancelled) return;
      const ox = Math.random() * 10 - 5;
      const oy = Math.random() * 6 - 3;
      setPupils(ox, oy, 900);
      wanderTimer = setTimeout(wander, 1400 + Math.random() * 1600);
    }
    wanderTimer = setTimeout(wander, 1200);

    function onMouseMove(e: MouseEvent) {
      clearTimeout(wanderTimer);
      const ball = ballRef.current;
      if (!ball) return;
      const rect = ball.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.min(1, Math.hypot(dx, dy) / 400);
      const angle = Math.atan2(dy, dx);
      setPupils(Math.cos(angle) * 6 * dist, Math.sin(angle) * 6 * dist, 120);
      wanderTimer = setTimeout(wander, 2200);
    }

    document.addEventListener('mousemove', onMouseMove);
    return () => {
      cancelled = true;
      clearTimeout(wanderTimer);
      document.removeEventListener('mousemove', onMouseMove);
    };
  }, []);

  const eyeSize = Math.round(size * 0.24);
  const pupilSize = Math.round(size * 0.1);

  return (
    <div className="relative flex flex-none items-center justify-center" style={{ width: size * 1.65, height: size * 1.65 }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, rgba(226,41,28,.9), rgba(226,41,28,.25) 55%, transparent 72%)',
          filter: 'blur(2px)',
          animation: 'pro-mascot-breathe 3.4s ease-in-out infinite',
        }}
      />
      <div
        ref={ballRef}
        className="relative flex items-center justify-center gap-2 rounded-full"
        style={{
          width: size,
          height: size,
          background: 'radial-gradient(circle at 38% 32%, #ff4a38, var(--pro-red) 60%, #a81a10 100%)',
          boxShadow: '0 0 60px 10px var(--pro-red-glow), inset -8px -10px 24px rgba(0,0,0,.35)',
        }}
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="flex items-center justify-center rounded-full"
            style={{ width: eyeSize, height: eyeSize, background: 'var(--pro-black)' }}
          >
            <div
              ref={(el) => {
                pupilRefs.current[i] = el;
              }}
              className="rounded-full"
              style={{ width: pupilSize, height: pupilSize, background: 'var(--pro-off)' }}
            />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes pro-mascot-breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: .85; }
        }
      `}</style>
    </div>
  );
}
