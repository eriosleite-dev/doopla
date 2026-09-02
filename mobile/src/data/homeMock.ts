// Dados mockados — mesmo conteúdo de exemplo do protótipo
// dooplaapphome.html. Nenhum dado real ainda; todo valor exibido
// precisa vir do backend quando esta tela for integrada.
export const mockUser = {
  firstName: 'Eduarda',
  fullName: 'Eduarda Leite',
  studio: 'Milky Studios',
  planBadge: 'PRO',
  initials: 'EL',
};

export const mockStats = [
  { key: 'negociacoes', tone: 'red' as const, num: '4', label: 'Negociações' },
  { key: 'aguardando', tone: 'amber' as const, num: '2', label: 'Aguardando você' },
  { key: 'confirmados', tone: 'green' as const, num: '6', label: 'Confirmados' },
  { key: 'mes', tone: 'off' as const, num: 'R$ 8.700', label: 'Este mês' },
];

export const mockDeals = [
  {
    key: 'marina',
    name: 'Marina & Pedro',
    meta: 'Casamento · 20 set',
    note: 'Pediu 10% de desconto. R$ 4.500 → R$ 4.000.',
    when: 'Há 2h',
    modal: 'decide-marina' as const,
  },
  {
    key: 'alma',
    name: 'Grupo Alma',
    meta: 'Evento corp. · 03 out',
    note: 'Quer estender o set em 1 hora. Sugestão: R$ 800/hora.',
    when: 'Há 5h',
    modal: 'decide-alma' as const,
  },
];

export const mockBookings = [
  { key: 'marina', month: 'SET', day: '20', name: 'Casamento · Marina', place: 'São Paulo, SP', statusLabel: 'Precisa', statusTone: 'red' as const },
  { key: 'alma', month: 'OUT', day: '03', name: 'Corporativo · Alma', place: 'São Paulo, SP', statusLabel: 'Aguard.', statusTone: 'amber' as const },
  { key: 'renata', month: 'OUT', day: '25', name: 'Festa · Renata', place: 'São Paulo, SP', statusLabel: 'OK', statusTone: 'green' as const },
];

export const mockActivity = [
  { key: 'laura', kind: 'chat' as const, text: 'Conversou com', boldPart: 'Laura', sub: '"Posso ajustar pra R$ 3.200."', time: '10 min' },
  { key: 'vetta', kind: 'mail' as const, text: 'Proposta pra', boldPart: 'Vetta', sub: 'Rider enviado por e-mail.', time: '32 min' },
];

export const mockChartMetrics = [
  { num: '12', label: 'Bookings' },
  { num: '8', label: 'Decisões poupadas' },
  { num: '5', label: 'Follow-ups' },
];

export const mockChannels = {
  link: 'doopla.com/eduarda',
  whatsapp: '+55 11 94444-XXXX',
  code: 'EDUARDA27',
};

export const mockIndique = {
  earned: 'R$ 45,00',
  activeSubscribers: 3,
};

export const mockDecisionContent = {
  conversation: {
    title: 'Marina & Pedro',
    meta: 'Casamento · 20 set · R$ 4.500 em negociação',
    messages: [
      { author: 'Marina', text: 'Oi! Vocês fariam por 4 mil?' },
      { author: 'Doopla', text: 'Consigo confirmar sua data. Deixa eu confirmar o valor e já te retorno.' },
    ],
  },
  'decide-marina': {
    title: 'Marina & Pedro',
    meta: 'Pediram desconto: R$ 4.500 → R$ 4.000',
    recommendation: 'Seu valor habitual pra esse formato é R$ 4.500. Eu manteria.',
    actions: [
      { label: 'Manter R$ 4.500', kind: 'solid' as const, toast: 'Mantido R$ 4.500.' },
      { label: 'Aceitar R$ 4.000', kind: 'outline' as const, toast: 'R$ 4.000 aceito.' },
    ],
  },
  'decide-alma': {
    title: 'Grupo Alma',
    meta: 'Pediram 1 hora a mais de set',
    recommendation: 'Sugestão da Doopla: R$ 800/hora, seu valor padrão de hora extra.',
    actions: [
      { label: 'Aceitar R$ 800/hora', kind: 'solid' as const, toast: 'Hora extra aceita.' },
      { label: 'Recusar', kind: 'outline' as const, toast: 'Pedido recusado.' },
    ],
  },
} as const;

export type DecisionModalKind = keyof typeof mockDecisionContent;
