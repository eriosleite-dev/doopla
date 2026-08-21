'use client';

import { useActionState } from 'react';

import { createAccountAction, type AuthFormState } from '@/app/auth/actions';
import { OnboardingShell } from './OnboardingShell';
import './onboarding.css';

const initialState: AuthFormState = {};

// Etapa 1 de 7 do funil público: só cria a conta (nome, e-mail,
// WhatsApp, senha). Sem pergunta de Artista/Booker — esse fluxo é
// sempre artista. "Prepare sua Doopla" e "Escolher plano" vêm depois,
// já autenticado.
export function CreateAccountForm({
  referralCode,
  artistPlan,
}: {
  referralCode?: string;
  artistPlan?: string;
}) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);

  return (
    <form action={formAction}>
      {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
      {artistPlan && <input type="hidden" name="artistPlan" value={artistPlan} />}

      <OnboardingShell
        step={1}
        footer={
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Criando conta…' : 'Continuar'}
          </button>
        }
      >
        <div className="ob-step">
          <div className="eyebrow">Etapa 1 de 7</div>
          <h1 className="headline">
            Vamos criar <em>sua conta.</em>
          </h1>
          <p className="sub">
            Leva menos de um minuto. O resto, sua Doopla aprende com você na próxima etapa.
          </p>

          {state.error && <div className="error">{state.error}</div>}

          <div className="field">
            <label htmlFor="f-nome">Nome</label>
            <input
              type="text"
              id="f-nome"
              name="fullName"
              placeholder="Seu nome"
              required
              autoComplete="name"
            />
          </div>
          <div className="field">
            <label htmlFor="f-email">E-mail</label>
            <input
              type="email"
              id="f-email"
              name="email"
              placeholder="voce@email.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label htmlFor="f-whats">WhatsApp</label>
            <input
              type="tel"
              id="f-whats"
              name="whatsapp"
              placeholder="(00) 00000-0000"
              required
              autoComplete="tel"
            />
          </div>
          <div className="field">
            <label htmlFor="f-senha">Senha</label>
            <input
              type="password"
              id="f-senha"
              name="password"
              placeholder="Crie uma senha"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label htmlFor="f-senha2">Confirmar senha</label>
            <input
              type="password"
              id="f-senha2"
              name="confirmPassword"
              placeholder="Repita a senha"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </div>
      </OnboardingShell>
    </form>
  );
}
