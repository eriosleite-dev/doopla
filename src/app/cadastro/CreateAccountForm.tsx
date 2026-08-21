'use client';

import { useActionState } from 'react';

import { createAccountAction, type AuthFormState } from '@/app/auth/actions';
import { fieldInputClass, fieldLabelClass, primaryButtonClass } from '@/app/auth/ui';

const initialState: AuthFormState = {};

// Passo 1 do funil público: só cria a conta (nome, e-mail, senha). Sem
// pergunta de Artista/Booker — esse fluxo é sempre artista. "Preparar
// sua Doopla" e "Escolher plano" vêm depois, já autenticado.
export function CreateAccountForm({
  referralCode,
  artistPlan,
}: {
  referralCode?: string;
  artistPlan?: string;
}) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
      {artistPlan && <input type="hidden" name="artistPlan" value={artistPlan} />}

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Nome completo</span>
        <input
          type="text"
          name="fullName"
          required
          autoComplete="name"
          className={fieldInputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>E-mail</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="voce@email.com"
          className={fieldInputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>WhatsApp</span>
        <input
          type="tel"
          name="whatsapp"
          required
          autoComplete="tel"
          placeholder="(11) 91234-5678"
          className={fieldInputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Senha</span>
        <input
          type="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldInputClass}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className={fieldLabelClass}>Confirmar senha</span>
        <input
          type="password"
          name="confirmPassword"
          required
          minLength={8}
          autoComplete="new-password"
          className={fieldInputClass}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}

      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? 'Criando conta…' : 'Criar conta'}
      </button>
    </form>
  );
}
