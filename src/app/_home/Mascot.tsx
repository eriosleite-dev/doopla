'use client';

import { useEffect, useRef } from 'react';

/**
 * Mascote real da Home (.mascot — bola vermelha com glow, olhos
 * pretos, pupila branca, sorriso), reaproveitado aqui via as mesmas
 * classes de home.css (glow, cores e formato inclusos, nenhum estilo
 * novo). A piscada usa o mesmo timing de `initMascotBlink()`
 * (home.js) — que nunca carrega nas páginas institucionais —, portada
 * pra este componente. `size="cta"` reaproveita a variante de tamanho
 * já usada no CTA final da Home (.mascot-cta), nenhum tamanho novo.
 */
export function Mascot({ size = 'cta' }: { size?: 'cta' | 'hero' }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;

    const eyes = Array.from(root.querySelectorAll<HTMLElement>('.mascot-eye'));
    if (eyes.length === 0) return;

    let nextTimer: ReturnType<typeof setTimeout>;

    function blinkOnce() {
      eyes.forEach((eye) => eye.classList.add('blink'));
      setTimeout(() => {
        eyes.forEach((eye) => eye.classList.remove('blink'));
      }, 110);
    }
    function scheduleNext() {
      const delay = 2400 + Math.random() * 3600; // 2.4s–6s, irregular de propósito
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
  }, []);

  return (
    <div className={`mascot mascot-${size}`} ref={rootRef} aria-hidden="true">
      <div className="eyes-row">
        <span className="mascot-eye"><span className="mascot-pupil" /></span>
        <span className="mascot-eye"><span className="mascot-pupil" /></span>
      </div>
      <span className="mascot-smile" />
    </div>
  );
}
