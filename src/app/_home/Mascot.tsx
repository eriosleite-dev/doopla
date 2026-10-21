'use client';

import { useRef } from 'react';

import { useBlink } from './useBlink';
import { useEyeTracking } from './useEyeTracking';

/**
 * Mascote real da Home (.mascot — bola vermelha com glow, olhos
 * pretos, pupila branca, sorriso), reaproveitado aqui via as mesmas
 * classes de home.css (glow, cores e formato inclusos, nenhum estilo
 * novo). Piscada automática via `useBlink` (fonte única, compartilhada
 * com EyesShowcase.tsx) — os mascotes reais da Home (`.mascot-hero`/
 * `.mascot-cta` em home.html) só piscam, nunca seguem o cursor
 * ("o logo olha, os mascotes piscam", grade de animação original).
 *
 * `tracking` (opcional, default false): liga o mesmo tracking de
 * cursor de `useEyeTracking` nas pupilas deste mascote — usado só no
 * mascote de Contato, que pediu esse comportamento especificamente;
 * não muda o comportamento canônico do mascote em nenhum outro lugar
 * (prop desligada por padrão).
 *
 * `size="cta"` reaproveita a variante de tamanho já usada no CTA
 * final da Home (.mascot-cta), nenhum tamanho novo.
 */
export function Mascot({ size = 'cta', tracking = false }: { size?: 'cta' | 'hero'; tracking?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useBlink(rootRef, '.mascot-eye');
  // maxRatio 0.2: pupila do mascote é ~45% da largura do olho (bem
  // maior, proporcionalmente, que a da EyesShowcase) — margem mais
  // conservadora pra nunca atravessar a borda do globo em nenhum dos
  // dois tamanhos (.mascot-cta/.mascot-hero). Hooks não podem ser
  // chamados condicionalmente — com tracking=false, o seletor não
  // casa com nenhum elemento real e o hook sai cedo sem registrar
  // listener nenhum (mesmo efeito de não chamá-lo).
  useEyeTracking(rootRef, tracking ? '.mascot-pupil' : '[data-eye-tracking-disabled]', 0.2);

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
