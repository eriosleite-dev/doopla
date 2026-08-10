'use client';

import Link from 'next/link';
import { useActionState } from 'react';

import { loginAction, type AuthFormState } from '@/app/auth/actions';
import {
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  textLinkClass,
} from '@/app/auth/ui';

const initialState: AuthFormState = {};

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(
    loginAction,
    initialState
  );

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className={fieldLabelClass}>
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={fieldInputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className={fieldLabelClass}>
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={fieldInputClass}
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={`${primaryButtonClass} mt-2 w-full`}
      >
        {pending ? 'Entrando…' : 'Entrar'}
      </button>

      <p className="text-center text-sm text-[var(--ink)]/60">
        Ainda não tem conta?{' '}
        <Link href="/cadastro" className={textLinkClass}>
          Cadastre-se
        </Link>
      </p>
    </form>
  );
}
