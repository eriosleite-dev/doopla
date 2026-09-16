'use client';

import { useEffect, useRef } from 'react';

/**
 * Olhos grandes com pupila acompanhando o cursor. Mesmo algoritmo de
 * `initMascotEyes()` em `_home/home.js` (clamp de distância — a
 * pupila nunca sai do globo —, easing suave, wander ocioso quando o
 * mouse para, respeita prefers-reduced-motion), portado pra um
 * componente próprio porque home.js nunca carrega nas páginas
 * institucionais (ver PageShell.tsx) — não é lógica nova, é a mesma
 * reescrita num escopo local, adaptada ao tamanho deste bloco via
 * getBoundingClientRect (não a valores fixos).
 */
export function EyesShowcase() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const pupils = Array.from(root.querySelectorAll<HTMLElement>('.eyes-showcase-pupil'));
    if (pupils.length === 0) return;

    let idleTimer: ReturnType<typeof setTimeout>;

    function setPupilOffset(pupil: HTMLElement, ox: number, oy: number, durationMs: number) {
      pupil.style.transition = `transform ${durationMs}ms ease-out`;
      pupil.style.transform = `translate(${ox}px, ${oy}px)`;
    }

    // Sem mouse (touch), os olhos continuam vivos sozinhos — nunca
    // tentam simular um cursor por toque.
    function startIdleWander() {
      const rx = Math.random() * 2 - 1;
      const ry = Math.random() * 2 - 1;
      pupils.forEach((pupil) => {
        const eye = pupil.parentElement;
        const eyeSize = eye?.getBoundingClientRect().width || 20;
        const max = eyeSize * 0.16;
        setPupilOffset(pupil, rx * max, ry * max * 0.7, 900);
      });
      idleTimer = setTimeout(startIdleWander, 1400 + Math.random() * 1600);
    }
    function resetIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(startIdleWander, 2200);
    }

    function trackTo(x: number, y: number) {
      pupils.forEach((pupil) => {
        const eye = pupil.parentElement;
        if (!eye) return;
        const rect = eye.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.min(1, Math.hypot(dx, dy) / 500);
        const angle = Math.atan2(dy, dx);
        const max = rect.width * 0.16;
        setPupilOffset(pupil, Math.cos(angle) * max * dist, Math.sin(angle) * max * dist, 140);
      });
    }

    function handleMouseMove(e: MouseEvent) {
      resetIdle();
      trackTo(e.clientX, e.clientY);
    }

    window.addEventListener('mousemove', handleMouseMove);
    resetIdle();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(idleTimer);
    };
  }, []);

  return (
    <div className="eyes-showcase" ref={rootRef} aria-hidden="true">
      <span className="eyes-showcase-eye">
        <span className="eyes-showcase-pupil" />
      </span>
      <span className="eyes-showcase-eye">
        <span className="eyes-showcase-pupil" />
      </span>
    </div>
  );
}
