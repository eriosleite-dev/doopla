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

const initialState: AuthFormState = {};

// Agência não é mais um tipo de conta separado: quem representa vários
// artistas se cadastra como booker e indica isso na pergunta de perfil.
type SignupRole = 'artista' | 'booker';

const ROLE_OPTIONS: { value: SignupRole; label: string; hint: string }[] = [
  {
    value: 'artista',
    label: 'Artista',
    hint: 'Quero ter alguém pra me representar.',
  },
  {
    value: 'booker',
    label: 'Booker',
    hint: 'Quero representar artistas.',
  },
];

// As mesmas perguntas do fluxo original do site (doopla-site.html),
// por tipo de conta — só o backend por trás mudou.
// 'chip-multi': pode marcar mais de uma opção, sempre com "Outro" + texto livre.
// 'invites': lista repetível de nome + contato (convite pra quem já
// trabalha com o booker fora da doopla).
type WizardStep = {
  formKey: string;
  kind: 'text' | 'chip' | 'chip-multi' | 'invites';
  label: string;
  hint?: string;
  placeholder?: string;
  options?: string[];
};

export type PendingInvite = { name: string; contact: string };

const OUTRO = 'Outro';

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
    kind: 'chip-multi',
    label: 'O que você faz?',
    options: [
      'DJ',
      'Músico / Banda',
      'Creator',
      'Modelo',
      'Ator',
      'Fotógrafo',
      'Palestrante',
      OUTRO,
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
    kind: 'chip-multi',
    label: 'Em quais mercados você gostaria de ser mais representado?',
    options: [
      'Minha cidade',
      'Brasil',
      'Internacional',
      'Marcas',
      'Eventos',
      'Festivais',
      'Corporativo',
      OUTRO,
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

const BOOKER_NAME_STEP: WizardStep = {
  formKey: 'fullName',
  kind: 'text',
  label: 'Como você se chama?',
  placeholder: 'Ex: Léo Martins',
};

const BOOKER_PERFIL_STEP: WizardStep = {
  formKey: 'perfil',
  kind: 'chip-multi',
  label: 'Qual dessas opções melhor te descreve?',
  options: [
    'Booker profissional',
    'Agência pequena',
    'Profissional de eventos',
    'Freelancer',
    'Quero começar como booker',
    'Pessoa bem conectada',
    OUTRO,
  ],
};

// Agência não é mais um tipo de conta separado — quando a pessoa se
// descreve como "Agência pequena" no passo acima, pedimos o roster aqui.
const BOOKER_ROSTER_STEP: WizardStep = {
  formKey: 'roster',
  kind: 'text',
  label: 'Número aproximado de artistas que vocês representam',
  placeholder: 'Ex: 15',
};

const BOOKER_REMAINING_STEPS: WizardStep[] = [
  {
    formKey: 'mercados',
    kind: 'chip-multi',
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
      OUTRO,
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

const BOOKER_INVITES_STEP: WizardStep = {
  formKey: 'pendingInvites',
  kind: 'invites',
  label: 'Convidar artistas',
  hint: 'Adicione quem já trabalha com você.',
};

function getBookerSteps(answers: Record<string, string>): WizardStep[] {
  const steps = [BOOKER_NAME_STEP, BOOKER_PERFIL_STEP];
  if ((answers.perfil ?? '').includes('Agência pequena')) {
    steps.push(BOOKER_ROSTER_STEP);
  }
  steps.push(...BOOKER_REMAINING_STEPS);
  if (answers.jaRepresenta === 'Sim') {
    steps.push(BOOKER_INVITES_STEP);
  }
  return steps;
}

function getQuestionSteps(
  role: SignupRole,
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
  return getBookerSteps(answers);
}

export function SignupForm({ defaultRole }: { defaultRole: SignupRole }) {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState
  );
  const [role, setRole] = useState<SignupRole>(defaultRole);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [multiSelections, setMultiSelections] = useState<
    Record<string, string[]>
  >({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [inviteRows, setInviteRows] = useState<PendingInvite[]>([
    { name: '', contact: '' },
  ]);

  const questionSteps = getQuestionSteps(role, answers);
  const onAccountStep = stepIndex >= questionSteps.length;
  const currentStep = onAccountStep ? null : questionSteps[stepIndex];
  const totalSteps = questionSteps.length + 1;

  function handleRoleChange(next: SignupRole) {
    setRole(next);
    setAnswers({});
    setMultiSelections({});
    setOtherText({});
    setStepIndex(0);
  }

  function setAnswer(key: string, value: string) {
    setAnswers((prev) =>
      key === 'intencao' ? { intencao: value } : { ...prev, [key]: value }
    );
  }

  function toggleMultiOption(key: string, option: string) {
    setMultiSelections((prev) => {
      const current = prev[key] ?? [];
      const next = current.includes(option)
        ? current.filter((o) => o !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
  }

  function computeMultiValue(key: string): string {
    const selected = multiSelections[key] ?? [];
    const other = otherText[key]?.trim();
    return selected
      .filter((o) => o !== OUTRO)
      .concat(selected.includes(OUTRO) && other ? [other] : [])
      .join(', ');
  }

  function updateInviteRow(index: number, field: keyof PendingInvite, value: string) {
    setInviteRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addInviteRow() {
    setInviteRows((prev) => [...prev, { name: '', contact: '' }]);
  }

  function removeInviteRow(index: number) {
    setInviteRows((prev) => prev.filter((_, i) => i !== index));
  }

  function goNext() {
    if (currentStep?.kind === 'chip-multi') {
      setAnswer(currentStep.formKey, computeMultiValue(currentStep.formKey));
    }
    if (currentStep?.kind === 'invites') {
      const filled = inviteRows.filter(
        (row) => row.name.trim() && row.contact.trim()
      );
      setAnswer(
        currentStep.formKey,
        filled.length > 0 ? JSON.stringify(filled) : ''
      );
    }
    setStepIndex((i) => Math.min(i + 1, questionSteps.length));
  }

  function goBack() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  const currentValue = currentStep ? (answers[currentStep.formKey] ?? '') : '';
  const currentMultiSelected = currentStep
    ? (multiSelections[currentStep.formKey] ?? [])
    : [];
  const currentOtherText = currentStep
    ? (otherText[currentStep.formKey] ?? '')
    : '';
  const canContinue =
    currentStep?.kind === 'invites'
      ? true
      : currentStep?.kind === 'chip-multi'
        ? currentMultiSelected.length > 0 &&
          (!currentMultiSelected.includes(OUTRO) || currentOtherText.trim().length > 0)
        : currentValue.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--ink)]">
          Tipo de conta
        </legend>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

            {currentStep.kind === 'text' && (
              <input
                autoFocus
                value={currentValue}
                onChange={(e) => setAnswer(currentStep.formKey, e.target.value)}
                placeholder={currentStep.placeholder}
                className={fieldInputClass}
              />
            )}

            {currentStep.kind === 'chip' && (
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

            {currentStep.kind === 'chip-multi' && (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-[var(--ink)]/50">
                  Pode marcar mais de uma opção.
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentStep.options!.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleMultiOption(currentStep.formKey, option)}
                      className={chipClass(currentMultiSelected.includes(option))}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                {currentMultiSelected.includes(OUTRO) && (
                  <input
                    autoFocus
                    value={currentOtherText}
                    onChange={(e) =>
                      setOtherText((prev) => ({
                        ...prev,
                        [currentStep.formKey]: e.target.value,
                      }))
                    }
                    placeholder="Qual?"
                    className={fieldInputClass}
                  />
                )}
              </div>
            )}

            {currentStep.kind === 'invites' && (
              <div className="flex flex-col gap-3">
                {inviteRows.map((row, index) => (
                  <div key={index} className="flex flex-col gap-2 sm:flex-row">
                    <input
                      value={row.name}
                      onChange={(e) =>
                        updateInviteRow(index, 'name', e.target.value)
                      }
                      placeholder="Nome do artista"
                      className={`${fieldInputClass} sm:flex-1`}
                    />
                    <input
                      value={row.contact}
                      onChange={(e) =>
                        updateInviteRow(index, 'contact', e.target.value)
                      }
                      placeholder="WhatsApp ou e-mail"
                      className={`${fieldInputClass} sm:flex-1`}
                    />
                    {inviteRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeInviteRow(index)}
                        aria-label="Remover"
                        className="self-start text-sm text-[var(--ink)]/40 hover:text-[var(--ink)] sm:self-center"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addInviteRow}
                  className="self-start text-sm font-medium text-[var(--ink)] underline underline-offset-2"
                >
                  + Adicionar outro
                </button>
                <p className="text-xs text-[var(--ink)]/45">
                  Pode deixar em branco e convidar depois, a qualquer momento.
                </p>
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
                {currentStep.kind === 'invites'
                  ? 'Enviar convites'
                  : 'Continuar'}
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
