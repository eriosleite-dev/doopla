'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { signupAction, type AuthFormState } from '@/app/auth/actions';
import type { UserRole } from '@/lib/supabase/types';

const initialState: AuthFormState = {};

const ROLE_OPTIONS: { value: UserRole; label: string; hint: string }[] = [
  {
    value: 'artista',
    label: 'Artista',
    hint: 'Quero divulgar meu trabalho e receber propostas.',
  },
  {
    value: 'booker',
    label: 'Booker',
    hint: 'Contrato artistas para shows e eventos.',
  },
  {
    value: 'agencia',
    label: 'Agência',
    hint: 'Represento um ou mais artistas.',
  },
];

export function SignupForm({ defaultRole }: { defaultRole: UserRole }) {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState
  );
  const [role, setRole] = useState<UserRole>(defaultRole);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">Tipo de conta</legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors ${
                role === option.value
                  ? 'border-black bg-black/5 dark:border-white dark:bg-white/10'
                  : 'border-black/15 dark:border-white/20'
              }`}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={role === option.value}
                onChange={() => setRole(option.value)}
                className="sr-only"
              />
              <span className="block font-medium">{option.label}</span>
              <span className="block text-xs text-black/60 dark:text-white/60">
                {option.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor="fullName" className="text-sm font-medium">
          Nome completo
        </label>
        <input
          id="fullName"
          name="fullName"
          type="text"
          required
          autoComplete="name"
          className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="confirmPassword" className="text-sm font-medium">
          Confirmar senha
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-black/15 px-3 py-2 outline-none focus:border-black/40 dark:border-white/20 dark:focus:border-white/40"
        />
      </div>

      {state.error && (
        <p role="alert" className="text-sm text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-black px-4 py-2 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-black"
      >
        {pending ? 'Criando conta…' : 'Criar conta'}
      </button>

      <p className="text-center text-sm text-black/60 dark:text-white/60">
        Já tem conta?{' '}
        <Link href="/login" className="font-medium underline">
          Entrar
        </Link>
      </p>
    </form>
  );
}
