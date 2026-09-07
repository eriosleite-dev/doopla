'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { loginAction, type AuthFormState } from '@/app/auth/actions';

const initialState: AuthFormState = {};

const inputWrapClass = 'flex items-center gap-2.5 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-3.5 focus-within:border-[var(--pro-tx-45)]';
const inputClass = 'w-full bg-transparent py-3 text-[13.5px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)]';

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none text-[var(--pro-tx-30)]">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none text-[var(--pro-tx-30)]">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="flex-none">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="m3 3 18 18" />}
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Redesign do login (07/09/2026) — mesma lógica de sempre
// (loginAction/useActionState/next/erro/pending), só a apresentação
// mudou pra bater com a referência dark/vermelha aprovada. Mostrar/
// ocultar senha é puramente visual (input type toggla entre
// 'password'/'text', nunca guarda a senha em outro lugar). Sem
// "Esqueci minha senha" de propósito — não existe recuperação de senha
// real no produto ainda; um link aqui seria fake (decisão explícita do
// usuário, registrada como pendência separada, não implementada agora).
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
          E-mail
        </label>
        <div className={inputWrapClass}>
          <MailIcon />
          <input id="email" name="email" type="email" required autoComplete="email" placeholder="seu@email.com" className={inputClass} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-[11.5px] font-semibold text-[var(--pro-tx-50)]">
          Senha
        </label>
        <div className={inputWrapClass}>
          <LockIcon />
          <input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            required
            autoComplete="current-password"
            placeholder="Sua senha"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="flex-none text-[var(--pro-tx-30)] hover:text-[var(--pro-tx-50)]"
          >
            <EyeIcon open={showPassword} />
          </button>
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
        {pending ? 'Entrando…' : 'Entrar'}
        {!pending && <ArrowIcon />}
      </button>

      <p className="text-center text-[12.5px] text-[var(--pro-tx-50)]">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className="font-semibold text-[var(--pro-red)] hover:underline">
          Começar grátis
        </Link>
      </p>
    </form>
  );
}
