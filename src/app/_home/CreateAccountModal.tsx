'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';

import { createAccountAction, type AuthFormState } from '@/app/auth/actions';
import { EyeLogo } from './EyeLogo';
import './site-chrome.css';

const initialState: AuthFormState = {};

const inputWrapClass =
  'flex items-center gap-2.5 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-3.5 focus-within:border-[var(--pro-tx-45)]';
const inputClass = 'w-full bg-transparent py-3 text-[13.5px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)]';

// Criar conta em modal na Home pública (07/09/2026) — mesma decisão já
// aplicada ao "Entrar" (ver LoginModal.tsx): clicar num CTA de cadastro
// na Home não pode navegar pra outra página, precisa abrir por cima.
// Reaproveita createAccountAction (auth/actions.ts) — a MESMA Server
// Action e as mesmas 5 perguntas do passo 1 do funil (CreateAccountForm,
// ver src/app/cadastro/CreateAccountForm.tsx) — só a apresentação muda:
// o card do onboarding completo (OnboardingShell, com topbar/progresso/
// rodapé fixo em tela cheia, CSS escopado sob #onboarding) não cabe
// dentro de um modal, então este componente é um card novo, na mesma
// família visual do LoginModal (pro-shell/pro-panel-solid), com só os 5
// campos da etapa 1. Depois que a conta é criada, createAccountAction já
// faz redirect() de verdade pro resto do funil (/cadastro/preparar ou
// /cadastro/confirme-seu-email) — o modal não precisa (nem deve) tentar
// controlar isso, é navegação real de página, saindo da Home de vez.
// /cadastro continua existindo como rota real (acesso direto, links de
// indicação `?ref=`, convite de booker) — nada aqui substitui a rota.
export function CreateAccountModal({
  open,
  onClose,
  artistPlan,
}: {
  open: boolean;
  onClose: () => void;
  artistPlan?: string;
}) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = setTimeout(() => {
      const nameInput = document.getElementById('signup-fullName') as HTMLInputElement | null;
      nameInput?.focus();
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
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label="Criar conta na Doopla"
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
              Comece grátis
            </span>
            <h2 className="font-pro-display text-[28px] uppercase leading-[1.05] text-[var(--pro-off)] sm:text-[32px]">
              Crie sua conta Doopla.
            </h2>
            <p className="text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">
              Leva menos de um minuto. O resto, sua Doopla aprende com você na próxima etapa.
            </p>
          </div>

          <form action={formAction} className="mt-6 flex flex-col gap-4">
            {artistPlan && <input type="hidden" name="artistPlan" value={artistPlan} />}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-fullName" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
                Nome
              </label>
              <div className={inputWrapClass}>
                <input
                  id="signup-fullName"
                  name="fullName"
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Seu nome"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-email" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
                E-mail
              </label>
              <div className={inputWrapClass}>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="seu@email.com"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-whatsapp" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
                WhatsApp
              </label>
              <div className={inputWrapClass}>
                <input
                  id="signup-whatsapp"
                  name="whatsapp"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="(00) 00000-0000"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-password" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
                Senha
              </label>
              <div className={inputWrapClass}>
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Crie uma senha"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="signup-confirmPassword" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
                Confirmar senha
              </label>
              <div className={inputWrapClass}>
                <input
                  id="signup-confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="Repita a senha"
                  className={inputClass}
                />
              </div>
            </div>

            {state.error && (
              <p role="alert" className="text-[12.5px] text-[var(--pro-red)]">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="font-pro-sub mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-[var(--pro-red)] py-3.5 text-[13.5px] font-bold uppercase tracking-[.04em] text-white shadow-[0_0_22px_rgba(226,41,28,.4)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? 'Criando conta…' : 'Criar minha conta'}
            </button>

            <p className="text-center text-[12.5px] text-[var(--pro-tx-50)]">
              Já tem conta?{' '}
              <Link href="/login" className="font-semibold text-[var(--pro-red)] hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
