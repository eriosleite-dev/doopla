'use client';

import { useEffect, useRef } from 'react';

import { EyeLogo } from './EyeLogo';
import './site-chrome.css';
import { LoginForm } from '../login/login-form';

// Card do modal de login, extraído de HomeLoginModal (07/09/2026) pra
// ser reaproveitado também pelo "Entrar" do SiteHeader (Sobre,
// Segurança e demais páginas institucionais via PageShell) — bug
// reportado: só o "Entrar" do home.html abria o modal, o das outras
// páginas continuava navegando pra /login de verdade. Mesmo
// LoginForm/loginAction, zero lógica de auth duplicada — só quem
// dispara o open/close muda por chamador (ver HomeLoginModal.tsx e
// SiteHeader.tsx).
//
// Não embrulha o EyeLogo num `id="site-chrome"` próprio: espera um
// ancestral `#site-chrome` de verdade pro escopo de --off/--black/
// .eye-logo (site-chrome.css). SiteHeader já vive dentro do
// `#site-chrome` do PageShell — não precisa de nada extra. Quem NÃO
// tem esse ancestral (a Home real, home.html não usa PageShell) precisa
// prover o próprio wrapper no call site (ver HomeLoginModal.tsx).
export function LoginModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      const emailInput = document.getElementById('email') as HTMLInputElement | null;
      emailInput?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && cardRef.current) {
        const focusable = cardRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="pro-shell contents">
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:items-center" role="presentation">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label="Entrar na sua conta Doopla"
          className="relative max-h-[92vh] w-full max-w-[440px] overflow-y-auto rounded-[24px] border border-[rgba(226,41,28,.3)] bg-[var(--pro-panel-solid)] p-7 shadow-[0_0_70px_rgba(226,41,28,.25)] sm:p-10"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>

          <EyeLogo onDark className="text-[22px] text-[var(--pro-off)]" />

          <div className="mt-7 flex flex-col gap-2">
            <span className="font-doopla-mono text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--pro-red)]">
              Bem-vinda de volta
            </span>
            <h2 className="font-pro-display text-[28px] uppercase leading-[1.05] text-[var(--pro-off)] sm:text-[32px]">
              Entre na sua conta Doopla.
            </h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">
              Continue de onde parou e deixe a Doopla cuidar do resto.
            </p>
          </div>

          <div className="mt-6">
            <LoginForm next="/dashboard" />
          </div>
        </div>
      </div>
    </div>
  );
}
