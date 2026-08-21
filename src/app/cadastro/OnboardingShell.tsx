'use client';

import { useEffect } from 'react';

// Chrome compartilhado das 3 rotas do onboarding novo (Criar conta,
// Prepare sua Doopla, Escolher plano) — topbar com o logo de olhos que
// seguem o cursor (mesmo padrão vanilla-JS do mockup, sem GSAP), barra
// de progresso segmentada e rodapé fixo com o CTA principal. O
// conteúdo de cada etapa é passado como children; quem chama decide se
// usa um único .ob-step ou um carrossel .steps-track (Prepare sua
// Doopla, que tem 5 sub-etapas dentro de uma página só).
export function OnboardingShell({
  step,
  totalSteps = 7,
  onBack,
  footer,
  children,
}: {
  step: number;
  totalSteps?: number;
  onBack?: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const eyes = Array.from(document.querySelectorAll<HTMLElement>('#onboarding [data-eye]'));
    if (eyes.length === 0) return;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    function pointPupils(x: number, y: number) {
      eyes.forEach((eye) => {
        const rect = eye.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const dist = Math.min(Math.hypot(dx, dy), 40);
        const angle = Math.atan2(dy, dx);
        const max = rect.width * 0.18;
        const px = Math.cos(angle) * Math.min(max, dist * 0.12);
        const py = Math.sin(angle) * Math.min(max, dist * 0.12);
        const pupil = eye.querySelector<HTMLElement>('.pupil');
        if (pupil) pupil.style.transform = `translate(${px}px,${py}px)`;
      });
    }

    function wander() {
      eyes.forEach((eye) => {
        const pupil = eye.querySelector<HTMLElement>('.pupil');
        if (!pupil) return;
        const r = eye.getBoundingClientRect().width * 0.15;
        const a = Math.random() * Math.PI * 2;
        pupil.style.transform = `translate(${Math.cos(a) * r}px,${Math.sin(a) * r}px)`;
      });
    }

    function handleMove(e: MouseEvent) {
      pointPupils(e.clientX, e.clientY);
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(wander, 2200);
    }

    document.addEventListener('mousemove', handleMove);
    return () => {
      document.removeEventListener('mousemove', handleMove);
      if (idleTimer) clearTimeout(idleTimer);
    };
  }, []);

  return (
    <div id="onboarding">
      <div className="app">
        <div className="topbar">
          <span className="logo">
            d
            <span className="eye" data-eye>
              <span className="pupil" />
            </span>
            <span className="eye" data-eye>
              <span className="pupil" />
            </span>
            pla
          </span>
          {onBack && (
            <button type="button" className="back-btn show" onClick={onBack}>
              ← Voltar
            </button>
          )}
        </div>

        <div className="progress-track">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`progress-seg${i < step ? ' done' : ''}`} />
          ))}
        </div>

        <div className="stage">{children}</div>
      </div>

      <div className="footer">
        <div className="footer-inner">{footer}</div>
      </div>
    </div>
  );
}
