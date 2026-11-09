'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Fonte única de piscada automática — mesmo timing de
 * `initMascotBlink()` em `_home/home.js` (2.4s–6s de intervalo
 * irregular, primeira piscada entre 0.9s e 3.9s pra nunca nascerem em
 * sincronia entre múltiplas instâncias), antes duplicado dentro de
 * Mascot.tsx. Começa sozinha no mount do efeito — nunca depende de
 * mouse, click ou qualquer interação — e continua rodando
 * independente do tracking de cursor (`useEyeTracking`, se usado
 * junto): a piscada aplica `.blink` no elemento do OLHO, o tracking
 * aplica `translate()` na PUPILA (filha) — propriedades/elementos
 * diferentes, nunca competem pelo mesmo estilo.
 */
export function useBlink(rootRef: RefObject<HTMLElement | null>, eyeSelector: string) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const eyes = Array.from(root.querySelectorAll<HTMLElement>(eyeSelector));
    if (eyes.length === 0) return;

    let nextTimer: ReturnType<typeof setTimeout>;

    function blinkOnce() {
      eyes.forEach((eye) => eye.classList.add('blink'));
      setTimeout(() => {
        eyes.forEach((eye) => eye.classList.remove('blink'));
      }, 110);
    }
    function scheduleNext() {
      const delay = 2400 + Math.random() * 3600;
      nextTimer = setTimeout(() => {
        blinkOnce();
        scheduleNext();
      }, delay);
    }
    const firstTimer = setTimeout(() => {
      blinkOnce();
      scheduleNext();
    }, 900 + Math.random() * 3000);

    return () => {
      clearTimeout(firstTimer);
      clearTimeout(nextTimer);
    };
  }, [rootRef, eyeSelector]);
}
