import type { PlanId } from './market';

// Catálogo canônico de features por plano (07/09/2026) — fonte única
// pra qualquer superfície que mostre "o que cada plano tem": o
// PlanPicker do onboarding (`src/app/cadastro/PlanPicker.tsx`) e o
// ProUpgradeModal (`src/app/dashboard/pro-upgrade-modal.tsx`) importam
// PLAN_CARDS daqui — nenhum dos dois define sua própria lista. Só
// itens já 100% confirmados pelo produto E realmente implementados
// hoje (nada de "especialista humano"/"rede de bookers"/"benefícios de
// parceiros", conceitos antigos já removidos das promessas).
//
// Correção 07/09/2026 — a versão anterior deste catálogo (commit
// 2b63a20) listava "Inteligência sobre cachês, clientes e negociações"
// e "Materiais profissionais para sua carreira" como disponíveis hoje
// no Pro. Isso divergia da própria classificação PENDING que o usuário
// já tinha aprovado (e-mail de representação, analytics avançados,
// materiais, automações avançadas — nenhuma dessas tem gate real nem
// UI construída). Corrigido aqui: só entra em `features`/`moreFeatures`
// o que tem gate/implementação real hoje. "Booker / Minha equipe"
// entra porque o gate real (hasDooplaPro() + enforcement backend) foi
// implementado nesta mesma rodada — não é mais promessa.
export const PLAN_CARDS: {
  id: PlanId;
  name: string;
  description: string;
  features: string[];
  moreFeatures: string[];
}[] = [
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
    moreFeatures: [
      'Negociação respeitando suas regras e aprovações',
      'Follow-up de cada negociação',
      'WhatsApp como canal principal com sua Doopla',
      'Perfil, link e canais de booking',
    ],
  },
  {
    id: 'pro',
    name: 'Doopla Pro',
    description: 'Mais estrutura para fazer sua carreira crescer.',
    features: ['Bookings ilimitados', 'Booker / Minha equipe'],
    moreFeatures: [
      'Tudo o que vem no plano Básico',
      'Negociação respeitando suas regras e aprovações',
      'Follow-up de cada negociação',
      'WhatsApp como canal principal com sua Doopla',
      'Perfil, link e canais de booking',
    ],
  },
];

export function getPlanCard(id: PlanId) {
  const card = PLAN_CARDS.find((c) => c.id === id);
  if (!card) throw new Error(`Plano desconhecido: ${id}`);
  return card;
}
