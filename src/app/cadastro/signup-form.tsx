'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';

import { signupAction, type AuthFormState } from '@/app/auth/actions';
import {
  chipClass,
  eyebrowClass,
  fieldInputClass,
  fieldLabelClass,
  primaryButtonClass,
  textLinkClass,
} from '@/app/auth/ui';
import {
  ARTIST_CATEGORY_OPTIONS,
  buildRegionOptions,
  CAPACITY_OPTIONS,
  CAREER_STAGE_OPTIONS,
  CLIENT_TYPE_OPTIONS,
  COMMISSION_RANGE_OPTIONS,
  FEE_RANGE_OPTIONS,
  HELP_AREA_OPTIONS,
  LANGUAGE_OPTIONS,
  REGION_SCOPE_OPTIONS,
  SPECIALTY_AREA_OPTIONS,
} from '@/lib/matching-options';
import { MARKETS, TRIAL_DAYS, type PlanId } from '@/lib/market';

// Chave do localStorage pra lembrar a intenção de plano vinda do card
// clicado na Home (?plano=doopla|pro) mesmo se a página recarregar
// antes do cadastro terminar. Isso é só sobrevivência a refresh
// DENTRO deste formulário de uma página só — retomar um onboarding já
// iniciado depois de a conta existir é um sistema diferente (sessão
// resumível no servidor), que não existe ainda neste produto.
const PLAN_INTENT_KEY = 'doopla_plan_intent';

const initialState: AuthFormState = {};

// Agência não é mais um tipo de conta separado: quem representa vários
// artistas se cadastra como booker e indica isso no perfil.
type SignupRole = 'artista' | 'booker';

const ROLE_OPTIONS: { value: SignupRole; label: string; hint: string }[] = [
  {
    value: 'artista',
    label: 'Artista',
    hint: 'Quero alguém pra me representar.',
  },
  {
    value: 'booker',
    label: 'Booker / Assistente',
    hint: 'Quero representar artistas ou ajudá-los na gestão dos seus trabalhos.',
  },
];

// As mesmas perguntas pra todo mundo, independente do que a pessoa
// respondeu na primeira pergunta (o que busca / como quer trabalhar) —
// intenção diferente não significa perfil mais raso. Isso já foi um bug:
// "ajuda pontual" tinha um caminho curto de 2 perguntas, bem mais fraco
// que "recorrente". Corrigido: todo mundo responde o mesmo conjunto
// completo, o suficiente pro matching funcionar de verdade.
// 'chip-multi': mais de uma opção, sempre com "Outro" + texto livre.
//   `arrayOutput: true` manda a resposta como JSON array (vira text[] no
//   banco) em vez de string separada por vírgula — usado nos campos
//   novos de matching, que não podem ser texto livre.
// 'invites'/'single-invite': coleta de convite opcional (nunca bloqueia
//   o cadastro) — múltiplos artistas (booker) ou um único booker (artista).
// 'choice-cards': seleção única com descrição por opção.
// 'info': tela só informativa, sem pergunta — nunca bloqueia continuar.
type WizardStep = {
  formKey: string;
  kind:
    | 'text'
    | 'textarea'
    | 'chip'
    | 'chip-multi'
    | 'invites'
    | 'single-invite'
    | 'choice-cards'
    | 'plan'
    | 'plan-booker'
    | 'info';
  label: string;
  hint?: string;
  placeholder?: string;
  options?: string[];
  choices?: { value: string; label: string; description: string }[];
  arrayOutput?: boolean;
  // Complementar: dá pra pular e preencher depois no Perfil (card
  // "Complete suas preferências" no painel avisa o que falta). Só marca
  // como opcional o que não é essencial pro matching inicial funcionar.
  optional?: boolean;
};

export type ArtistChip = { name: string; sendNow: boolean };

const OUTRO = 'Outro';

const INTENCAO_RECORRENTE = 'Quero alguém para me representar de forma recorrente';
const INTENCAO_PONTUAL = 'Preciso de ajuda pontual';

const ARTISTA_INTENCAO_STEP: WizardStep = {
  formKey: 'intencao',
  kind: 'choice-cards',
  label: 'O que você está buscando?',
  choices: [
    {
      value: INTENCAO_RECORRENTE,
      label: INTENCAO_RECORRENTE,
      description:
        'Quero alguém para me acompanhar e ajudar nos meus trabalhos de forma recorrente.',
    },
    {
      value: INTENCAO_PONTUAL,
      label: INTENCAO_PONTUAL,
      description: 'Ex.: cobrar um cliente, fechar um contrato, negociar um cachê.',
    },
  ],
};

function choiceCardsFrom(options: { value: string; description: string }[]): {
  value: string;
  label: string;
  description: string;
}[] {
  return options.map((o) => ({ value: o.value, label: o.value, description: o.description }));
}

const ARTISTA_PONTUAL_DETALHE_STEP: WizardStep = {
  formKey: 'pontualDetalhe',
  kind: 'text',
  label: 'O que você precisa de ajuda agora?',
  hint: 'Descreva em poucas palavras — vamos te pedir o resto do perfil completo em seguida.',
  placeholder: 'Ex: Preciso cobrar um cliente que não pagou',
};

// Todo mundo (recorrente, pontual ou ambos) passa por este mesmo conjunto
// completo — é o que dá dado suficiente pro matching, independente da
// intenção declarada.
const ARTISTA_CARREIRA_STEPS: WizardStep[] = [
  {
    formKey: 'stageName',
    kind: 'text',
    label: 'Qual é seu nome artístico?',
    placeholder: 'Ex: Bea Duarte',
  },
  {
    formKey: 'fullName',
    kind: 'text',
    label: 'E seu nome completo?',
    placeholder: 'Ex: Beatriz Duarte Souza',
  },
  // Sem lista fixa de profissão/tipo de trabalho: a aquisição inicial é
  // nichada em DJs, mas o produto não é exclusivo pra DJs — fotógrafo,
  // ator, músico, creator etc. precisam sentir que também cabem aqui.
  // Uma pergunta aberta só, sem categoria pra escolher (mantém o
  // formKey 'bio' porque essa resposta também é o texto do perfil
  // público, exibido pra bookers e clientes).
  {
    formKey: 'bio',
    kind: 'textarea',
    label: 'Fale sobre o seu trabalho. O que você faz?',
    hint: 'Conte do seu jeito. Sua Doopla usa isso para entender seu trabalho e as oportunidades que chegam até você.',
    placeholder: 'Ex: Sou fotógrafa de moda e também faço campanhas para marcas.',
  },
  {
    formKey: 'local',
    kind: 'text',
    label: 'Em qual cidade e estado você está baseado?',
    hint: 'Cidade, estado',
    placeholder: 'Ex: São Paulo, SP',
  },
  {
    formKey: 'regions',
    kind: 'chip-multi',
    arrayOutput: true,
    label: 'Em quais regiões você topa atuar?',
    options: REGION_SCOPE_OPTIONS,
    optional: true,
  },
  {
    formKey: 'careerStage',
    kind: 'choice-cards',
    label: 'Como está o volume de trabalhos hoje?',
    choices: choiceCardsFrom(CAREER_STAGE_OPTIONS),
    optional: true,
  },
  // Cachê não entra mais aqui: é informação comercial que a Doopla
  // aprende no contexto de um booking real, quando precisar negociar —
  // não faz sentido perguntar isso logo no primeiro contato com a
  // plataforma. Continua editável depois em Minha Doopla (perfil).
  {
    formKey: 'helpAreas',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'Em quais atividades você precisa de ajuda?',
    options: HELP_AREA_OPTIONS,
  },
  {
    formKey: 'temBooker',
    kind: 'chip',
    label: 'Já tem um booker ou alguém que te representa?',
    options: ['Sim, quero trazer essa pessoa pra doopla', 'Não, quero encontrar bookers'],
  },
];

const ARTISTA_BOOKER_INVITE_STEP: WizardStep = {
  formKey: 'pendingBookerInvite',
  kind: 'single-invite',
  label: 'Traga sua dupla para a Doopla',
  hint: 'Convide agora seu booker para se conectar com você na plataforma.',
};

const BOOKER_MODO_STEP: WizardStep = {
  formKey: 'modoTrabalho',
  kind: 'choice-cards',
  label: 'Como você quer trabalhar na Doopla?',
  choices: [
    {
      value: 'Quero representar artistas de forma recorrente',
      label: 'Quero representar artistas de forma recorrente',
      description: 'Acompanhar artistas e cuidar dos seus trabalhos.',
    },
    {
      value: 'Quero pegar trabalhos pontuais',
      label: 'Quero pegar trabalhos pontuais',
      description: 'Ex.: cobranças, contratos, negociação de cachê e outras demandas.',
    },
    {
      value: 'Posso fazer os dois',
      label: 'Posso fazer os dois',
      description: 'Estou disponível tanto para acompanhar artistas quanto para trabalhos pontuais.',
    },
  ],
};

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
// descreve como "Agência pequena" no passo acima, ou quando responde que
// já representa artistas, pedimos o roster aqui (mesma pergunta serve
// pros dois gatilhos, sem duplicar a coleta).
const BOOKER_ROSTER_STEP: WizardStep = {
  formKey: 'roster',
  kind: 'text',
  label: 'Quantos artistas você representa atualmente?',
  placeholder: 'Ex: 15',
};

// Localidade real, usada como primeira opção concreta na pergunta de
// área de atuação logo depois, no lugar de "minha cidade/meu estado"
// abstrato. Reaproveita a coluna `cidades`, que já existia no schema.
const BOOKER_LOCAL_STEP: WizardStep = {
  formKey: 'cidades',
  kind: 'text',
  label: 'Em qual cidade e estado você está baseado?',
  hint: 'Cidade, estado',
  placeholder: 'Ex: São Paulo, SP',
};

const BOOKER_JA_REPRESENTA_STEP: WizardStep = {
  formKey: 'jaRepresenta',
  kind: 'chip',
  label: 'Você já representa algum artista?',
  options: ['Sim', 'Ainda não'],
};

const BOOKER_FOCO_STEP: WizardStep = {
  formKey: 'foco',
  kind: 'choice-cards',
  label: 'Você quer atender qualquer tipo de artista ou prefere focar em um nicho específico?',
  choices: [
    {
      value: 'Universal',
      label: 'Quero atender diferentes tipos de artistas',
      description:
        'Qualquer artista, qualquer nicho. Mais artistas e mercados disponíveis significam mais oportunidades.',
    },
    {
      value: 'Nichado',
      label: 'Prefiro focar em nichos específicos',
      description: 'Foco em um nicho específico, onde você já tem rede e experiência.',
    },
  ],
};

const BOOKER_HAS_EXPERIENCE_STEP: WizardStep = {
  formKey: 'hasExperience',
  kind: 'chip',
  label: 'Você já tem experiência com representação ou booking?',
  hint: 'Se ainda não tiver, tudo bem — a Doopla também vai te ajudar a começar.',
  options: ['Sim, já tenho experiência', 'Ainda não'],
};

const BOOKER_EXPERIENCE_DETAIL_STEP: WizardStep = {
  formKey: 'bio',
  kind: 'textarea',
  label: 'Conte um pouco sobre sua experiência',
  hint: 'Isso vai aparecer no seu perfil pra artistas.',
  placeholder: 'Ex: Booker há 3 anos, foco em música eletrônica e eventos corporativos',
};

// Mesmo conjunto completo pras 3 opções de modoTrabalho — nenhuma delas
// leva a um caminho mais curto que as outras.
const BOOKER_REMAINING_STEPS: WizardStep[] = [
  BOOKER_LOCAL_STEP,
  {
    formKey: 'mercados',
    kind: 'chip-multi',
    label: 'Em quais nichos você gostaria de atuar como representante?',
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
    formKey: 'artistCategories',
    kind: 'chip-multi',
    arrayOutput: true,
    label: 'Quais categorias de artistas você gostaria de representar?',
    options: ARTIST_CATEGORY_OPTIONS,
  },
  {
    formKey: 'clientTypes',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'De quais nichos você gostaria de receber oportunidades?',
    options: CLIENT_TYPE_OPTIONS,
  },
  {
    formKey: 'specialtyAreas',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'Quais são suas especialidades?',
    options: SPECIALTY_AREA_OPTIONS,
  },
  {
    formKey: 'regions',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'Em quais cidades, estados ou países sua rede é mais forte?',
    options: REGION_SCOPE_OPTIONS,
  },
  {
    formKey: 'languages',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'Quais idiomas você fala?',
    options: LANGUAGE_OPTIONS,
  },
  {
    formKey: 'capacity',
    kind: 'chip',
    optional: true,
    label: 'Quantos artistas você conseguiria atender hoje?',
    hint: 'Com a Doopla, você organiza melhor sua operação e pode aumentar esse número conforme crescer.',
    options: CAPACITY_OPTIONS.map((o) => o.value),
  },
  {
    formKey: 'feeRange',
    kind: 'chip-multi',
    arrayOutput: true,
    optional: true,
    label: 'Com quais faixas de cachê você gostaria de trabalhar?',
    options: FEE_RANGE_OPTIONS,
  },
  {
    formKey: 'commissionRange',
    kind: 'chip',
    optional: true,
    label: 'Qual faixa de comissão você costuma ou pretende praticar?',
    hint: 'É só indicativo pro seu perfil — a comissão de cada booking continua sendo negociada caso a caso.',
    options: COMMISSION_RANGE_OPTIONS,
  },
];

const BOOKER_INVITES_STEP: WizardStep = {
  formKey: 'pendingInvites',
  kind: 'invites',
  label: 'Convidar artistas',
  hint: 'Adicione quem já trabalha com você.',
};

// Explicação do modo Conservador: pertence à conclusão de "Prepare sua
// Doopla", não a uma etapa de cachê (removida — ver PROGRESS.md). Só
// informa, não pergunta nada — por isso 'info', não bloqueia continuar.
const ARTISTA_MODO_CONSERVADOR_STEP: WizardStep = {
  formKey: 'modoConservadorVisto',
  kind: 'info',
  label: 'Você continua no controle',
};

function ModoConservadorStep() {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[var(--ink)]/10 bg-[var(--paper-dim)] p-6">
      <span className="font-doopla-display text-lg font-semibold">Você continua no controle</span>
      <p className="text-sm text-[var(--ink)]/80">
        Sua Doopla começa no modo <strong>Conservador</strong> e consulta você antes de decisões
        comerciais importantes.
      </p>
      <p className="text-sm text-[var(--ink)]/80">
        Depois, se quiser, você pode dar mais autonomia a ela em Minha Doopla.
      </p>
    </div>
  );
}

const ARTISTA_PLANO_STEP: WizardStep = {
  formKey: 'artistPlan',
  kind: 'plan',
  label: 'Escolha seu plano',
};

const BOOKER_PLANO_STEP: WizardStep = {
  formKey: 'planoVisto',
  kind: 'plan-booker',
  label: 'Seu plano na doopla',
};

const PLAN_CARDS: { id: PlanId; name: string; description: string; features: string[] }[] = [
  {
    id: 'doopla',
    name: 'Doopla',
    description: 'Sua Doopla trabalha com você.',
    features: [
      'Até 5 novos bookings por mês',
      'Sua Doopla atende, negocia e acompanha cada booking até o fechamento',
      'Contratos e acompanhamento de pagamentos',
      'Comunidade Doopla',
    ],
  },
  {
    id: 'pro',
    name: 'Doopla Pro',
    description: 'Mais estrutura para fazer sua carreira crescer.',
    features: [
      'Bookings ilimitados',
      'Especialista humano se precisar',
      'Inteligência sobre cachês, clientes e negociações',
      'Materiais profissionais para sua carreira',
    ],
  },
];

// Sem cobrança de verdade ainda (nenhum processador de pagamento
// integrado) — "confirmar assinatura" grava estado real no banco
// (subscriptions.artist_plan, migration 0036), não cobra cartão.
// 7 dias grátis, sem cartão, pros dois planos — a escolha aqui só
// marca qual plano a assinatura em trial já nasce apontando; o
// artista continua podendo trocar depois em Minha Doopla, antes do
// trial acabar. O voucher Founder (condição especial, nunca pública)
// é aplicado no próprio cadastro se um código válido for informado
// aqui.
function PlanStep({ initialPlan }: { initialPlan: PlanId }) {
  const [selected, setSelected] = useState<PlanId>(initialPlan);
  const [showVoucher, setShowVoucher] = useState(false);
  const market = MARKETS.BR;

  function choose(plan: PlanId) {
    setSelected(plan);
    try {
      window.localStorage.setItem(PLAN_INTENT_KEY, plan);
    } catch {
      // localStorage indisponível (modo privado etc.) — a escolha ainda
      // vale pra essa sessão, só não sobrevive a um refresh.
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input type="hidden" name="artistPlan" value={selected} />
      <p className="font-doopla-mono text-[11px] uppercase tracking-[.1em] text-[var(--ink)]/50">
        {TRIAL_DAYS} dias grátis, sem cartão, nos dois planos
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PLAN_CARDS.map((card) => {
          const isSelected = selected === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => choose(card.id)}
              className={`flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors ${
                isSelected
                  ? 'border-[var(--ink)] bg-[var(--paper-dim)]'
                  : 'border-[var(--ink)]/10 hover:border-[var(--ink)]/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-doopla-display text-lg font-semibold">{card.name}</span>
                {isSelected && (
                  <span className="font-doopla-mono rounded-full bg-[var(--accent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--ink)]">
                    Selecionado
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-doopla-display text-2xl font-semibold text-[var(--accent-ink)]">
                  {market.currencySymbol}
                  {market.pricing[card.id].toFixed(2).replace('.', ',')}
                </span>
                <span className="text-sm text-[var(--ink)]/60">/mês</span>
              </div>
              <p className="text-sm text-[var(--ink)]/70">{card.description}</p>
              <ul className="flex flex-col gap-1.5 text-sm text-[var(--ink)]/75">
                {card.features.map((f) => (
                  <li key={f}>• {f}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {showVoucher ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-[var(--ink)]/70">Código do voucher Founder</span>
          <input
            type="text"
            name="founderVoucherCode"
            placeholder="Ex: FOUNDER-ABC123"
            className={fieldInputClass}
          />
          <span className="text-xs text-[var(--ink)]/50">
            Se o código for válido, o preço mensal do seu plano fica travado nessa condição
            enquanto a assinatura continuar ativa.
          </span>
        </label>
      ) : (
        <button
          type="button"
          onClick={() => setShowVoucher(true)}
          className="w-fit text-xs text-[var(--ink)]/50 underline underline-offset-2"
        >
          Tenho um código de voucher Founder
        </button>
      )}
    </div>
  );
}

function BookerPlanStep() {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--ink)]/10 bg-[var(--paper-dim)] p-6">
      <div className="flex items-center justify-between">
        <span className="font-doopla-display text-lg font-semibold">doopla</span>
        <span className="font-doopla-mono rounded-full bg-[var(--musgo)]/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--musgo)]">
          Booker Básico
        </span>
      </div>
      <span className="font-doopla-display text-3xl font-semibold text-[var(--accent-ink)]">
        R$0/mês
      </span>
      <p className="text-sm text-[var(--ink)]/70">
        Comece gratuitamente. Receba oportunidades, represente artistas e organize seus
        trabalhos pela Doopla.
      </p>
      <p className="text-sm text-[var(--ink)]/70">
        Sua comissão é negociada diretamente com o artista em cada trabalho — a Doopla não
        define uma comissão fixa para o booker. O percentual acordado fica registrado naquele
        booking.
      </p>
    </div>
  );
}

function getBookerSteps(answers: Record<string, string>): WizardStep[] {
  const steps = [BOOKER_MODO_STEP, BOOKER_NAME_STEP, BOOKER_PERFIL_STEP];
  const isAgencia = (answers.perfil ?? '').includes('Agência pequena');
  if (isAgencia) {
    steps.push(BOOKER_ROSTER_STEP);
  }
  steps.push(BOOKER_JA_REPRESENTA_STEP);
  if (!isAgencia && answers.jaRepresenta === 'Sim') {
    steps.push(BOOKER_ROSTER_STEP);
  }
  steps.push(BOOKER_FOCO_STEP);
  steps.push(BOOKER_HAS_EXPERIENCE_STEP);
  if (answers.hasExperience === 'Sim, já tenho experiência') {
    steps.push(BOOKER_EXPERIENCE_DETAIL_STEP);
  }
  steps.push(...BOOKER_REMAINING_STEPS);
  if (answers.jaRepresenta === 'Sim') {
    steps.push(BOOKER_INVITES_STEP);
  }
  steps.push(BOOKER_PLANO_STEP);
  return steps;
}

// Quem chega por link de convite de agência já tem uma relação real —
// não faz sentido perguntar de novo "tem booker?", nichos, faixa de
// cachê etc. Só o essencial de identidade (nome artístico + nome
// completo, já parte de ARTISTA_CARREIRA_STEPS) + plano. O resto do
// perfil completa depois, no Perfil — onboarding reduzido não é perfil
// reduzido pra sempre.
const ARTISTA_INVITED_STEPS: WizardStep[] = [
  ...ARTISTA_CARREIRA_STEPS.slice(0, 2),
  ARTISTA_MODO_CONSERVADOR_STEP,
  ARTISTA_PLANO_STEP,
];

function getQuestionSteps(
  role: SignupRole,
  answers: Record<string, string>,
  inviteToken?: string
): WizardStep[] {
  if (role === 'artista') {
    if (inviteToken) return ARTISTA_INVITED_STEPS;
    const steps = [ARTISTA_INTENCAO_STEP];
    if (answers.intencao === INTENCAO_PONTUAL) {
      steps.push(ARTISTA_PONTUAL_DETALHE_STEP);
    }
    if (answers.intencao) {
      steps.push(...ARTISTA_CARREIRA_STEPS);
      if (answers.temBooker === 'Sim, quero trazer essa pessoa pra doopla') {
        steps.push(ARTISTA_BOOKER_INVITE_STEP);
      }
      steps.push(ARTISTA_MODO_CONSERVADOR_STEP);
      steps.push(ARTISTA_PLANO_STEP);
    }
    return steps;
  }
  return getBookerSteps(answers);
}

export function SignupForm({
  defaultRole,
  referralCode,
  inviteToken,
  showRolePicker = false,
  planIntent,
}: {
  defaultRole: SignupRole;
  referralCode?: string;
  inviteToken?: string;
  // Só true quando alguém chega por um link explícito de booker
  // (?tipo=booker / ?role=booker) — o funil público da Home (Começar
  // grátis) nunca pergunta Artista ou Booker antes de mais nada.
  showRolePicker?: boolean;
  // Intenção de plano vinda do card clicado na Home (?plano=doopla|pro).
  planIntent?: PlanId;
}) {
  const [state, formAction, pending] = useActionState(
    signupAction,
    initialState
  );
  const [role, setRole] = useState<SignupRole>(defaultRole);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Prioridade: ?plano= da URL > localStorage (sobrevive a um refresh
  // no meio do cadastro) > 'doopla' como padrão. Lido uma vez, de forma
  // lazy, no próprio useState — seguro porque esse valor só afeta o
  // PlanStep, que nunca faz parte da árvore renderizada na primeira
  // tela do wizard (stepIndex começa em 0, o plano vem bem depois),
  // então não existe risco de mismatch de hidratação aqui.
  const [resolvedPlan] = useState<PlanId>(() => {
    if (planIntent) return planIntent;
    if (typeof window === 'undefined') return 'doopla';
    try {
      const saved = window.localStorage.getItem(PLAN_INTENT_KEY);
      if (saved === 'doopla' || saved === 'pro') return saved;
    } catch {
      // sem localStorage — fica no padrão 'doopla'.
    }
    return 'doopla';
  });
  useEffect(() => {
    if (!planIntent) return;
    try {
      window.localStorage.setItem(PLAN_INTENT_KEY, planIntent);
    } catch {
      // sem localStorage — a intenção ainda vale pra essa visita.
    }
  }, [planIntent]);
  const [multiSelections, setMultiSelections] = useState<
    Record<string, string[]>
  >({});
  const [otherText, setOtherText] = useState<Record<string, string>>({});
  const [artistChips, setArtistChips] = useState<ArtistChip[]>([]);
  const [chipInput, setChipInput] = useState('');
  const [bookerInviteName, setBookerInviteName] = useState('');
  const [bookerInviteContact, setBookerInviteContact] = useState('');

  const questionSteps = getQuestionSteps(role, answers, inviteToken);
  const onAccountStep = stepIndex >= questionSteps.length;
  const currentStep = onAccountStep ? null : questionSteps[stepIndex];
  const totalSteps = questionSteps.length + 1;

  function handleRoleChange(next: SignupRole) {
    setRole(next);
    setAnswers({});
    setMultiSelections({});
    setOtherText({});
    setArtistChips([]);
    setChipInput('');
    setBookerInviteName('');
    setBookerInviteContact('');
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

  function computeMultiValue(key: string, arrayOutput?: boolean): string {
    const selected = multiSelections[key] ?? [];
    const other = otherText[key]?.trim();
    const values = selected
      .filter((o) => o !== OUTRO)
      .concat(selected.includes(OUTRO) && other ? [other] : []);
    return arrayOutput ? JSON.stringify(values) : values.join(', ');
  }

  function addArtistChip() {
    const name = chipInput.trim();
    if (!name) return;
    setArtistChips((prev) => [...prev, { name, sendNow: false }]);
    setChipInput('');
  }

  function setChipSendNow(index: number, sendNow: boolean) {
    setArtistChips((prev) =>
      prev.map((chip, i) => (i === index ? { ...chip, sendNow } : chip))
    );
  }

  function removeArtistChip(index: number) {
    setArtistChips((prev) => prev.filter((_, i) => i !== index));
  }

  function goNext() {
    if (currentStep?.kind === 'chip-multi') {
      setAnswer(currentStep.formKey, computeMultiValue(currentStep.formKey, currentStep.arrayOutput));
    }
    if (currentStep?.kind === 'invites') {
      setAnswer(
        currentStep.formKey,
        artistChips.length > 0
          ? JSON.stringify(artistChips.map((chip) => ({ name: chip.name })))
          : ''
      );
    }
    if (currentStep?.kind === 'single-invite') {
      setAnswer(
        currentStep.formKey,
        bookerInviteName.trim()
          ? JSON.stringify({ name: bookerInviteName.trim(), contact: bookerInviteContact.trim() })
          : ''
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
  // 'regions' troca "minha cidade/meu estado" abstratos pela localidade
  // real que a pessoa acabou de informar (formKey 'local' pro artista,
  // 'cidades' pro booker — cada fluxo só preenche um dos dois).
  const currentChipOptions =
    currentStep?.formKey === 'regions'
      ? buildRegionOptions(answers.local || answers.cidades)
      : (currentStep?.options ?? []);
  const canContinue =
    currentStep?.optional ||
    currentStep?.kind === 'invites' ||
    currentStep?.kind === 'single-invite' ||
    currentStep?.kind === 'plan' ||
    currentStep?.kind === 'plan-booker' ||
    currentStep?.kind === 'info'
      ? true
      : currentStep?.kind === 'chip-multi'
        ? currentMultiSelected.length > 0 &&
          (!currentMultiSelected.includes(OUTRO) || currentOtherText.trim().length > 0)
        : currentValue.trim().length > 0;

  return (
    <div className="flex flex-col gap-6">
      {inviteToken ? (
        <p className="rounded-[12px] bg-[var(--paper-dim)] p-3 text-[13px] text-[var(--ink)]/70">
          Você está criando uma conta de artista pra aceitar um convite. Isso não muda depois.
        </p>
      ) : showRolePicker ? (
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
      ) : null}

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="role" value={role} />
        {referralCode && <input type="hidden" name="referralCode" value={referralCode} />}
        {inviteToken && <input type="hidden" name="pendingInviteToken" value={inviteToken} />}
        {Object.entries(answers).map(([key, value]) => (
          <input key={key} type="hidden" name={key} value={value} />
        ))}

        {currentStep && (
          <div className="flex flex-col gap-3">
            {currentStep.kind !== 'plan' && currentStep.kind !== 'plan-booker' && currentStep.kind !== 'info' && (
              <span className={eyebrowClass}>
                Pergunta {stepIndex + 1} de {totalSteps}
              </span>
            )}
            {currentStep.kind !== 'plan' && currentStep.kind !== 'plan-booker' && currentStep.kind !== 'info' && (
              <>
                <label className={fieldLabelClass}>{currentStep.label}</label>
                {currentStep.hint && (
                  <p className="text-xs text-[var(--ink)]/60">
                    {currentStep.hint}
                  </p>
                )}
                {currentStep.optional && (
                  <p className="text-xs text-[var(--ink)]/45">
                    Opcional — dá pra responder depois no seu perfil, sem pressa.
                  </p>
                )}
              </>
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

            {currentStep.kind === 'textarea' && (
              <textarea
                autoFocus
                rows={4}
                value={currentValue}
                onChange={(e) => setAnswer(currentStep.formKey, e.target.value)}
                placeholder={currentStep.placeholder}
                className={`${fieldInputClass} resize-none`}
              />
            )}

            {currentStep.kind === 'plan' && <PlanStep initialPlan={resolvedPlan} />}

            {currentStep.kind === 'plan-booker' && <BookerPlanStep />}

            {currentStep.kind === 'info' && <ModoConservadorStep />}

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

            {currentStep.kind === 'choice-cards' && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {currentStep.choices!.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setAnswer(currentStep.formKey, choice.value)}
                    className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                      currentValue === choice.value
                        ? 'border-[var(--ink)] bg-[var(--paper-dim)]'
                        : 'border-[var(--line-light)] hover:border-[var(--ink)]/40'
                    }`}
                  >
                    <span className="block font-medium text-[var(--ink)]">
                      {choice.label}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--ink)]/60">
                      {choice.description}
                    </span>
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
                  {currentChipOptions.map((option) => (
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
              <div className="flex flex-col gap-4">
                <div className="flex gap-2">
                  <input
                    autoFocus
                    value={chipInput}
                    onChange={(e) => setChipInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addArtistChip();
                      }
                    }}
                    placeholder="Nome do artista, aperte Enter"
                    className={`${fieldInputClass} flex-1`}
                  />
                </div>

                {artistChips.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-[var(--ink)]/60">
                      Artistas que você já trabalha
                    </p>
                    {artistChips.map((chip, index) => (
                      <div
                        key={index}
                        className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--line-light)] bg-[var(--paper-dim)] px-3 py-2"
                      >
                        <span className="mr-auto text-sm font-medium text-[var(--ink)]">
                          {chip.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => setChipSendNow(index, true)}
                          className={chipClass(chip.sendNow)}
                        >
                          Convidar agora
                        </button>
                        <button
                          type="button"
                          onClick={() => setChipSendNow(index, false)}
                          className={chipClass(!chip.sendNow)}
                        >
                          Convidar depois
                        </button>
                        <button
                          type="button"
                          onClick={() => removeArtistChip(index)}
                          aria-label="Remover"
                          className="text-sm text-[var(--ink)]/40 hover:text-[var(--ink)]"
                        >
                          ×
                        </button>
                        {chip.sendNow && (
                          <p className="w-full text-xs text-[var(--accent-ink)]">
                            Na fila — convite será enviado assim que o artista confirmar.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  onClick={addArtistChip}
                  className="self-start text-sm font-medium text-[var(--ink)] underline underline-offset-2"
                >
                  + Adicionar outro artista
                </button>
                <p className="text-xs text-[var(--ink)]/45">
                  Pode deixar em branco e convidar depois, a qualquer momento.
                </p>
              </div>
            )}

            {currentStep.kind === 'single-invite' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    autoFocus
                    value={bookerInviteName}
                    onChange={(e) => setBookerInviteName(e.target.value)}
                    placeholder="Nome do seu booker"
                    className={`${fieldInputClass} flex-1`}
                  />
                  <input
                    value={bookerInviteContact}
                    onChange={(e) => setBookerInviteContact(e.target.value)}
                    placeholder="E-mail (opcional)"
                    className={`${fieldInputClass} flex-1`}
                  />
                </div>
                <p className="text-xs text-[var(--ink)]/45">
                  Prefere fazer isso depois? Você poderá convidar seu booker a qualquer momento
                  pelo seu perfil.
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
                {currentStep.kind === 'invites' || currentStep.kind === 'single-invite'
                  ? 'Próximo'
                  : currentStep.kind === 'plan'
                    ? 'Começar 7 dias grátis'
                    : currentStep.kind === 'plan-booker'
                      ? 'Começar grátis'
                      : currentStep.optional &&
                          (currentStep.kind === 'chip-multi'
                            ? currentMultiSelected.length === 0
                            : currentValue.trim().length === 0)
                        ? 'Pular por agora'
                        : 'Continuar'}
              </button>
            </div>
            {currentStep.kind === 'plan' && (
              <p className="text-center text-xs text-[var(--ink)]/45">
                Você só começa a pagar após os 7 dias.
              </p>
            )}
            {currentStep.kind === 'plan-booker' && (
              <p className="text-center text-xs text-[var(--ink)]/45">
                Sem cartão, sem mensalidade. Você só paga se decidir fazer upgrade no futuro.
              </p>
            )}
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
                {pending
                  ? 'Criando conta…'
                  : role === 'artista'
                    ? `Iniciar ${TRIAL_DAYS} dias grátis`
                    : 'Criar conta'}
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
