'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';

import { signupAction, type AuthFormState } from '@/app/auth/actions';
import {
  chipClass,
  eyebrowClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  textLinkClass,
} from '@/app/auth/ui';
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

// As mesmas perguntas do fluxo original do site (doopla-site.html),
// por tipo de conta — só o backend por trás mudou.
type WizardStep = {
  formKey: string;
  kind: 'text' | 'chip';
  label: string;
  hint?: string;
  placeholder?: string;
  options?: string[];
};

const ARTISTA_INTENCAO_STEP: WizardStep = {
  formKey: 'intencao',
  kind: 'chip',
  label: 'O que você está buscando?',
  options: ['Representação de carreira', 'Ajuda pontual num caso específico'],
};

const ARTISTA_PONTUAL_STEPS: WizardStep[] = [
  {
    formKey: 'pontualDetalhe',
    kind: 'text',
    label: 'O que você precisa de ajuda agora?',
    hint: 'Descreva em poucas palavras',
    placeholder: 'Ex: Preciso cobrar um cliente que não pagou',
  },
  {
    formKey: 'fullName',
    kind: 'text',
    label: 'Como você se chama ou qual é seu nome profissional?',
    placeholder: 'Ex: Bea Duarte',
  },
];

const ARTISTA_CARREIRA_STEPS: WizardStep[] = [
  {
    formKey: 'fullName',
    kind: 'text',
    label: 'Como você se chama ou qual é seu nome profissional?',
    placeholder: 'Ex: Bea Duarte',
  },
  {
    formKey: 'funcao',
    kind: 'chip',
    label: 'O que você faz?',
    options: [
      'DJ',
      'Músico / Banda',
      'Creator',
      'Modelo',
      'Ator',
      'Fotógrafo',
      'Palestrante',
      'Outro',
    ],
  },
  {
    formKey: 'local',
    kind: 'text',
    label: 'Onde você atua hoje?',
    hint: 'Cidade / país',
    placeholder: 'Ex: São Paulo, Brasil',
  },
  {
    formKey: 'mercados',
    kind: 'chip',
    label: 'Em quais mercados você gostaria de ser mais representado?',
    options: [
      'Minha cidade',
      'Brasil',
      'Internacional',
      'Marcas',
      'Eventos',
      'Festivais',
      'Corporativo',
    ],
  },
  {
    formKey: 'temBooker',
    kind: 'chip',
    label: 'Você já tem alguém ajudando nos seus bookings?',
    options: [
      'Sim, quero trazer essa pessoa pra doopla',
      'Não, quero encontrar bookers',
      'Tenho agência, quero complementar',
    ],
  },
];

const BOOKER_STEPS: WizardStep[] = [
  {
    formKey: 'fullName',
    kind: 'text',
    label: 'Como você se chama?',
    placeholder: 'Ex: Léo Martins',
  },
  {
    formKey: 'perfil',
    kind: 'chip',
    label: 'Qual dessas opções melhor te descreve?',
    options: [
      'Booker profissional',
      'Agência pequena',
      'Profissional de eventos',
      'Freelancer',
      'Quero começar como booker',
      'Pessoa bem conectada',
    ],
  },
  {
    formKey: 'mercados',
    kind: 'chip',
    label: 'Em quais mercados você tem relacionamento?',
    options: [
      'Clubs',
      'Festivais',
      'Eventos corporativos',
      'Marcas',
      'Fashion',
      'Casamentos / eventos sociais',
      'Creators',
      'Audiovisual',
      'Outro',
    ],
  },
  {
    formKey: 'quem',
    kind: 'text',
    label: 'Que tipo de profissionais você gostaria de representar?',
    placeholder: 'Ex: DJs de música eletrônica',
  },
  {
    formKey: 'cidades',
    kind: 'text',
    label: 'Em quais cidades ou países sua rede é mais forte?',
    placeholder: 'Ex: São Paulo e Lisboa',
  },
  {
    formKey: 'jaRepresenta',
    kind: 'chip',
    label: 'Você já representa alguém?',
    options: ['Sim', 'Ainda não'],
  },
];

const AGENCIA_STEPS: WizardStep[] = [
  {
    formKey: 'agencia',
    kind: 'text',
    label: 'Nome da agência',
    placeholder: 'Ex: Estúdio Norte',
  },
  {
    formKey: 'fullName',
    kind: 'text',
    label: 'Seu nome',
    placeholder: 'Ex: Camila Ribeiro',
  },
  {
    formKey: 'roster',
    kind: 'text',
    label: 'Número aproximado de artistas que vocês representam',
    placeholder: 'Ex: 15',
  },
  {
    formKey: 'agentes',
    kind: 'text',
    label: 'Número de agentes / bookers',
    placeholder: 'Ex: 4',
  },
  {
    formKey: 'mercado',
    kind: 'text',
    label: 'Principal mercado',
    placeholder: 'Ex: música, moda, esportes',
  },
];

function getQuestionSteps(
  role: UserRole,
  answers: Record<string, string>
): WizardStep[] {
  if (role === 'artista') {
    const steps = [ARTISTA_INTENCAO_STEP];
    if (answers.intencao === 'Ajuda pontual num caso específico') {
      steps.push(...ARTISTA_PONTUAL_STEPS);
    } else if (answers.intencao === 'Representação de carreira') {
      steps.push(...ARTISTA_CARREIRA_STEPS);
    }
    return steps;
  }
  if (role === 'booker') return BOOKER_STEPS;
  return AGENCIA_STEPS;
}

export function SignupForm({ defaultRole }: { defaultRole: UserRole }) {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState
  );
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const questionSteps = getQuestionSteps(role, answers);
  const onAccountStep = stepIndex >= questionSteps.length;
  const currentStep = onAccountStep ? null : questionSteps[stepIndex];
  const totalSteps = questionSteps.length + 1;

  function handleRoleChange(next: UserRole) {
    setRole(next);
    setAnswers({});
    setStepIndex(0);
  }

  function setAnswer(key: string, value: string) {
    setAnswers((prev) =>
      key === 'intencao' ? { intencao: value } : { ...prev, [key]: value }
    );
  }

  function goNext() {
    setStepIndex((i) => Math.min(i + 1, questionSteps.length));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const currentValue = currentStep ? (answers[currentStep.formKey] ?? '') : '';
  const canContinue = currentValue.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--ink)]">
          Tipo de conta
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                role === option.value
                  ? 'border-[var(--ink)] bg-[var(--paper-dim)]'
                  : 'border-[var(--line-light)]'
              }`}
            >
              <input
                type="radio"
                name="role-picker"
                value={option.value}
                checked={role === option.value}
                onChange={() => handleRoleChange(option.value)}
                className="sr-only"
              />
              <span className="block font-medium text-[var(--ink)]">
                {option.label}
              </span>
              <span className="block text-xs text-[var(--ink)]/60">
                {option.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="role" value={role} />
        {Object.entries(answers).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {currentStep && (
          <div className="flex flex-col gap-3">
            <span className={eyebrowClass}>
              Pergunta {stepIndex + 1} de {totalSteps}
            </span>
            <label className={fieldLabelClass}>{currentStep.label}</label>
            {currentStep.hint && (
              <p className="text-xs text-[var(--ink)]/60">
                {currentStep.hint}
              </p>
            )}

            {currentStep.kind === 'text' ? (
              <input
                autoFocus
                value={currentValue}
                onChange={(e) => setAnswer(currentStep.formKey, e.target.value)}
                placeholder={currentStep.placeholder}
                className={fieldInputClass}
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {currentStep.options!.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAnswer(currentStep.formKey, option)}
                    className={chipClass(currentValue === option)}
                  >
                    {option}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-2 flex items-center justify-between">
              {stepIndex > 0 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="text-sm text-[var(--ink)]/60 underline underline-offset-2"
                >
                  Voltar
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={goNext}
                disabled={!canContinue}
                className={primaryButtonClass}
              >
                Continuar
              </button>
            </div>
          </div>
        )}

        {onAccountStep && (
          <div className="flex flex-col gap-4">
            <span className={eyebrowClass}>Última etapa</span>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className={fieldLabelClass}>
                Qual seu e-mail?
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="voce@email.com"
                className={fieldInputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="password" className={fieldLabelClass}>
                Crie uma senha
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={fieldInputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className={fieldLabelClass}>
                Confirmar senha
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={fieldInputClass}
              />
            </div>

            {state.error && (
              <p role="alert" className="text-sm text-red-700">
                {state.error}
              </p>
            )}

            <div className="mt-2 flex items-center justify-between">
              <button
                type="button"
                onClick={goBack}
                className="text-sm text-[var(--ink)]/60 underline underline-offset-2"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={pending}
                className={primaryButtonClass}
              >
                {pending ? 'Criando conta…' : 'Criar conta'}
              </button>
            </div>
          </div>
        )}
      </form>

      <p className="text-center text-sm text-[var(--ink)]/60">
        Já tem conta?{' '}
        <Link href="/login" className={textLinkClass}>
          Entrar
        </Link>
      </p>
    </div>
  );
}
