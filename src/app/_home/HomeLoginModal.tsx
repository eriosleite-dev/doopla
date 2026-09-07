'use client';

import { useEffect, useRef, useState } from 'react';

import { EyeLogo } from './EyeLogo';
import './site-chrome.css';
import { LoginForm } from '../login/login-form';

// Login como modal na Home pública (07/09/2026) — decisão explícita do
// usuário revertendo a anterior: clicar em "Entrar" na Home não pode
// navegar pra outra página, precisa abrir por cima, mesma identidade
// visual do /login redesenhado. /login continua existindo como rota
// funcional de verdade (acesso direto, redirects de auth com `next=`,
// guards do servidor) — ver src/app/login/page.tsx.
//
// A Home real (home.html) não é uma árvore React — é HTML cru injetado
// via dangerouslySetInnerHTML (ver page.tsx), com animações vanilla-JS
// (home.js/GSAP). Por isso o link "Entrar" (id="home-login-trigger",
// adicionado só pra isso) não tem handler React nenhum: este componente
// é montado como uma ilha React separada, do lado do HTML cru, e
// intercepta o clique via listener nativo no DOM depois do mount —
// nunca reescreve a Home pra virar React.
//
// Reaproveita LoginForm (mesmo loginAction, mesmo estado, nenhuma
// lógica de auth duplicada) — só o chrome ao redor (card + overlay)
// é próprio daqui, porque o container é fundamentalmente diferente
// (overlay com foco/scroll-lock/Escape, não uma página estática).
export function HomeLoginModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trigger = document.getElementById('home-login-trigger');
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      event.preventDefault();
      triggerRef.current = trigger;
      setOpen(true);
    }
    trigger.addEventListener('click', handleClick);
    return () => trigger.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      emailInputRef.current = document.getElementById('email') as HTMLInputElement | null;
      emailInputRef.current?.focus();
    }, 0);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
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
      triggerRef.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="pro-shell fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:items-center" role="presentation">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setOpen(false)}
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
          onClick={() => setOpen(false)}
          aria-label="Fechar"
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
        >
          ✕
        </button>

        <div id="site-chrome">
          <EyeLogo onDark className="text-[22px] text-[var(--pro-off)]" />
        </div>

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
  );
}
