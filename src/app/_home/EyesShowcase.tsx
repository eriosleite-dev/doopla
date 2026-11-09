'use client';

import { useRef } from 'react';

import { useBlink } from './useBlink';
import { useEyeTracking } from './useEyeTracking';

/**
 * Olhos grandes com pupila acompanhando o cursor e piscada automática
 * — mesma lógica de `useEyeTracking`/`useBlink` (fonte única,
 * compartilhada com Mascot.tsx), portada de `initMascotEyes()`/
 * `initMascotBlink()` em `home.js` porque home.js nunca carrega nas
 * páginas institucionais (ver PageShell.tsx).
 *
 * `variant="panel"` (Sobre): globo off-white + pupila preta dentro de
 * um bloco vermelho cheio. `variant="plain"` (Termos/Privacidade):
 * mesmos olhos/comportamento, sem painel ao redor — o fundo é o preto
 * da própria página, igual ao resto do conteúdo institucional.
 */
export function EyesShowcase({ variant = 'panel' }: { variant?: 'panel' | 'plain' }) {
  const rootRef = useRef<HTMLDivElement>(null);

  // maxRatio 0.28: globo tem metade da largura de raio, pupila 17% de
  // raio (34% de largura) — 28% deixa uns 5 pontos percentuais de
  // margem até a borda, nunca atravessa.
  useEyeTracking(rootRef, '.eyes-showcase-pupil', 0.28);
  useBlink(rootRef, '.eyes-showcase-eye');

  return (
    <div className={`eyes-showcase eyes-showcase-${variant}`} ref={rootRef} aria-hidden="true">
      <span className="eyes-showcase-eye">
        <span className="eyes-showcase-pupil" />
      </span>
      <span className="eyes-showcase-eye">
        <span className="eyes-showcase-pupil" />
      </span>
    </div>
  );
}
