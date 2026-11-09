'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Fonte única de tracking de olhos por cursor pras páginas
 * institucionais (EyesShowcase, e opcionalmente Mascot) — mesmo
 * algoritmo que existia duplicado nesses dois componentes antes desta
 * consolidação, ele mesmo portado de `initMascotEyes()` em
 * `_home/home.js` (que nunca carrega fora da rota "/"). Sem
 * amortecimento por distância: cada pupila calcula o ângulo do centro
 * do PRÓPRIO olho (getBoundingClientRect, recalculado a cada
 * movimento — correto sob resize/scroll) até a posição real do
 * cursor, com deslocamento de raio fixo (`maxRatio` × largura do
 * olho) sempre nesse ângulo — nunca atravessa a borda do globo desde
 * que `maxRatio` deixe folga pra pupila (globo tem metade da largura
 * de raio; some o raio da pupila; o resto é a margem de segurança).
 *
 * O listener de mousemove é registrado direto no mount do efeito —
 * não depende de click, foco ou qualquer interação anterior — e as
 * atualizações de posição são agrupadas por requestAnimationFrame
 * (no máximo uma escrita de estilo por frame), sem debounce
 * perceptível. Sem mouse (touch), os olhos vagam sozinhos via
 * `startIdleWander` depois de um período ocioso, sem tentar simular
 * um cursor por toque.
 */
export function useEyeTracking(
  rootRef: RefObject<HTMLElement | null>,
  pupilSelector: string,
  maxRatio: number
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const pupils = Array.from(root.querySelectorAll<HTMLElement>(pupilSelector));
    if (pupils.length === 0) return;

    let idleTimer: ReturnType<typeof setTimeout>;
    let rafId: number | null = null;
    let pendingX = 0;
    let pendingY = 0;
    let hasPending = false;

    function setPupilOffset(pupil: HTMLElement, ox: number, oy: number, durationMs: number) {
      pupil.style.transition = `transform ${durationMs}ms ease-out`;
      pupil.style.transform = `translate(${ox}px, ${oy}px)`;
    }

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

    function applyTrack(x: number, y: number) {
      pupils.forEach((pupil) => {
        const eye = pupil.parentElement;
        if (!eye) return;
        const rect = eye.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        if (Math.hypot(dx, dy) < 1) return; // dead-zone mínima: evita ângulo instável bem no centro
        const angle = Math.atan2(dy, dx);
        const max = rect.width * maxRatio;
        setPupilOffset(pupil, Math.cos(angle) * max, Math.sin(angle) * max, 140);
      });
    }

    function flushFrame() {
      rafId = null;
      if (!hasPending) return;
      hasPending = false;
      applyTrack(pendingX, pendingY);
    }

    function handleMouseMove(e: MouseEvent) {
      resetIdle();
      pendingX = e.clientX;
      pendingY = e.clientY;
      hasPending = true;
      if (rafId === null) rafId = requestAnimationFrame(flushFrame);
    }

    // Registrado direto no mount — sem esperar nenhuma interação.
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    resetIdle();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(idleTimer);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [rootRef, pupilSelector, maxRatio]);
}
