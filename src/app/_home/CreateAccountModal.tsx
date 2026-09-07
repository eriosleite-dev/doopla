'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { createAccountAction, type AuthFormState } from '@/app/auth/actions';
import { PrepareForm } from '@/app/cadastro/preparar/PrepareForm';
import { PlanForm } from '@/app/cadastro/plano/PlanForm';
import type { PlanId } from '@/lib/market';
import { EyeLogo } from './EyeLogo';
import './site-chrome.css';

const initialState: AuthFormState = {};

const inputWrapClass =
  'flex items-center gap-2.5 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-3.5 focus-within:border-[var(--pro-tx-45)]';
const inputClass = 'w-full bg-transparent py-3 text-[13.5px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)]';

type Step = 'account' | 'preparar' | 'plano';

// Criar conta em modal na Home pública (07/09/2026, corrigido) — bug
// encontrado: a versão anterior só mantinha a ETAPA 1 (criar conta)
// dentro do modal; assim que createAccountAction tinha sucesso, o
// redirect() dela derrubava a Home inteira pra navegar pra
// /cadastro/preparar, saindo do modal no meio do funil. A decisão de
// produto é que TODO o funil (etapa 1 -> Preparar sua Doopla -> Escolher
// plano -> conclusão) fique dentro do mesmo overlay, sem duplicar
// onboarding: cada etapa é EXATAMENTE o mesmo componente/Server Action
// que a rota real usa (PrepareForm/PlanForm, savePrepareAction/
// savePlanAction), só que chamados com modalMode=1 — nesse modo, as
// Server Actions retornam { success: true } em vez de redirect()
// (ver auth/actions.ts e cadastro/actions.ts), e este componente troca
// de etapa internamente ao detectar esse sucesso via callback.
// A etapa 1 continua com o card pequeno (mesma família visual do
// LoginModal); Preparar/Plano assumem a tela cheia própria delas
// (OnboardingShell, sem alteração nenhuma) como overlay POR CIMA da
// Home — a Home nunca desmonta, só fica coberta. Só a conclusão de
// verdade (fim da etapa 7) sai da Home de vez, com router.push (soft
// nav) pro painel — é o único ponto em que sair da Home é o
// comportamento certo, não um bug.
// /cadastro continua existindo como rota real e 100% inalterada —
// acesso direto, redirects de auth, convite (?invite=) e indicação
// (?ref=) continuam funcionando exatamente como hoje, sem passar por
// nada disto aqui.
export function CreateAccountModal({
  open,
  onClose,
  artistPlan,
}: {
  open: boolean;
  onClose: () => void;
  artistPlan?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('account');
  const scrollRef = useRef<HTMLDivElement>(null);

  // O miolo rolável (steps 'preparar'/'plano') é o MESMO elemento nos
  // dois casos — só o conteúdo dentro dele troca — então o scroll de
  // onde a pessoa parou na etapa anterior (ex.: fim do Preparar)
  // persistia ao entrar na próxima etapa, cortando a topbar/progress
  // bar da etapa nova até rolar manualmente pra cima. Reseta pro topo a
  // cada troca de etapa dentro do modal.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  // Reseta pra etapa 1 ao fechar (por qualquer caminho — ✕, Escape,
  // backdrop), pra um próximo "Criar conta" sempre começar do zero, nunca
  // reabrir no meio do funil de uma sessão de modal anterior. Feito no
  // PRÓPRIO handler de fechar (nunca num efeito reagindo a `open`) —
  // setState síncrono dentro de efeito encadeia renders à toa.
  function handleClose() {
    setStep('account');
    onClose();
  }

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handlePlanoComplete() {
    handleClose();
    router.push('/dashboard');
  }

  if (!open) return null;

  if (step === 'account') {
    return (
      <div className="pro-shell contents">
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6 sm:items-center" role="presentation">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
          <AccountStepCard artistPlan={artistPlan} onClose={handleClose} onAccountCreated={() => setStep('preparar')} />
        </div>
      </div>
    );
  }

  // Etapas 2+ (Preparar/Plano) reaproveitam o conteúdo próprio delas
  // (OnboardingShell, em modo "boxed" — ver onboarding.css) dentro de um
  // card com a MESMA linguagem visual da etapa 1 (backdrop escurecido,
  // card centralizado, cantos arredondados, altura que se adapta ao
  // conteúdo até um teto, scroll interno) — não mais tela cheia. Full-
  // bleed (versão anterior) tecnicamente nunca navegava pra fora do
  // modal, mas era visualmente indistinguível da rota antiga cheia de
  // página, o que lia como "saiu do modal" mesmo sem navegação real
  // (bug relatado depois do fix de navegação). O frame externo (com
  // overflow-hidden, pra não vazar cantos arredondados) fica parado; só
  // o miolo interno rola — assim o ✕ nunca soma junto com o conteúdo.
  return (
    <div className="pro-shell contents">
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6" role="presentation">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={step === 'preparar' ? 'Preparar sua Doopla' : 'Escolher plano'}
          className="relative flex max-h-[90vh] w-full max-w-[600px] flex-col overflow-hidden rounded-[24px] border border-[rgba(226,41,28,.3)] shadow-[0_0_70px_rgba(226,41,28,.25)]"
        >
          {/* Cor literal (não var(--offwhite)) de propósito — este botão é
             IRMÃO do #onboarding, não descendente dele, então não herda
             os custom properties escopados em onboarding.css. */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm hover:bg-black/45"
          >
            ✕
          </button>

          <div ref={scrollRef} className="overflow-y-auto">
            {step === 'preparar' && (
              <PrepareForm
                modalMode
                boxed
                onStepComplete={() => setStep('plano')}
                initialStageName=""
                initialProfession=""
                initialLocal=""
                initialBio=""
                initialLink=""
                initialFeeCents={null}
                initialPricingNotes=""
                initialIssuesInvoice={null}
                initialNegotiationNotes=""
                initialChannel={null}
              />
            )}

            {step === 'plano' && (
              <PlanForm
                modalMode
                boxed
                onStepComplete={handlePlanoComplete}
                initialPlan={(artistPlan === 'pro' ? 'pro' : 'doopla') as PlanId}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountStepCard({
  artistPlan,
  onClose,
  onAccountCreated,
}: {
  artistPlan?: string;
  onClose: () => void;
  onAccountCreated: () => void;
}) {
  const [state, formAction, pending] = useActionState(createAccountAction, initialState);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const focusTimer = setTimeout(() => {
      const nameInput = document.getElementById('signup-fullName') as HTMLInputElement | null;
      nameInput?.focus();
    }, 0);
    return () => clearTimeout(focusTimer);
  }, []);

  useEffect(() => {
    if (state.success) onAccountCreated();
  }, [state.success, onAccountCreated]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !cardRef.current) return;
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
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
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
        <input type="hidden" name="modalMode" value="1" />
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
  );
}
