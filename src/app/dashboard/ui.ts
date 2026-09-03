export const eyebrowClass =
  'font-doopla-mono text-[11.5px] uppercase tracking-[.16em] text-[var(--accent-ink)]';

export const statCardClass = 'rounded-[18px] bg-white p-6';
export const statCardLeadClass =
  'rounded-[18px] bg-[var(--ink)] p-6 text-[var(--paper)]';
export const statLabelClass =
  'font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--ink)]/55';
export const statLabelLeadClass =
  'font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--accent)]/85';
export const statValueClass = 'font-doopla-display mt-2.5 text-[28px] font-semibold';
export const statValueLeadClass = 'font-doopla-display mt-2.5 text-[40px] font-semibold';
export const statSubClass = 'mt-2 text-[12.5px] text-[var(--ink)]/55';
export const statSubUpClass = 'mt-2 text-[12.5px] text-[var(--accent-ink)]';

export const cardClass = 'rounded-[18px] bg-white p-6';

export const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--paper)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
export const accentButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';
export const ghostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ink)] px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)] transition-colors hover:bg-[var(--ink)] hover:text-[var(--paper)] disabled:cursor-not-allowed disabled:opacity-40';
export const rustGhostButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-full border border-[var(--ink)]/35 px-6 py-3 text-xs font-medium uppercase tracking-[.06em] text-[var(--ink)]/60 transition-colors hover:border-[var(--ink)] hover:text-[var(--ink)] disabled:cursor-not-allowed disabled:opacity-40';

export const filterChipClass = (active: boolean) =>
  `font-doopla-mono rounded-full border px-4 py-2 text-[11px] uppercase tracking-[.06em] transition-colors ${
    active
      ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
      : 'border-[var(--line-light)] text-[var(--ink)]/60 hover:border-[var(--ink)]/40'
  }`;

const STATUS_PILL_BASE =
  'font-doopla-mono inline-block rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.06em]';

export const statusPillClasses: Record<string, string> = {
  proposta_enviada: `${STATUS_PILL_BASE} bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]`,
  aceita: `${STATUS_PILL_BASE} bg-[var(--ink)] text-[var(--accent)]`,
  recusada: `${STATUS_PILL_BASE} border border-[var(--line-light)] text-[var(--ink)]/40`,
  aguardando_pagamento: `${STATUS_PILL_BASE} bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]`,
  concluida: `${STATUS_PILL_BASE} bg-[var(--ink)] text-[var(--paper)]`,
  cancelada: `${STATUS_PILL_BASE} bg-[var(--alert)]/15 text-[var(--alert)]`,
};

export const STATUS_LABELS: Record<string, string> = {
  proposta_enviada: 'Aguardando resposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
  aguardando_pagamento: 'Aguardando pagamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const contractStatusPillClasses: Record<string, string> = {
  anexado: `${STATUS_PILL_BASE} bg-[var(--musgo)]/10 text-[var(--musgo)]`,
  sem_contrato: `${STATUS_PILL_BASE} bg-[var(--paper-dim)] text-[var(--ink)]/50`,
};

export const CONTRACT_STATUS_LABELS: Record<string, string> = {
  anexado: 'Anexado',
  sem_contrato: 'Sem contrato',
};

export const cpDotClass = (done: boolean) =>
  `mx-auto flex h-[22px] w-[22px] items-center justify-center rounded-full font-doopla-mono text-[11px] ${
    done ? 'bg-[var(--musgo)] text-white' : 'bg-[var(--alert)] text-white'
  }`;
export const cpLabelClass = (done: boolean) =>
  `font-doopla-mono mt-1.5 text-[9.5px] uppercase tracking-[.02em] ${
    done ? 'text-[var(--ink)]/45' : 'font-semibold text-[var(--alert)]'
  }`;

export const verifyBadgeClass = (verified: boolean) =>
  `font-doopla-mono inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[10.5px] uppercase tracking-[.03em] ${
    verified ? 'bg-[var(--musgo)]/10 text-[var(--musgo)]' : 'bg-[var(--alert)]/10 text-[var(--alert)]'
  }`;

export const EVENT_LABELS: Record<string, string> = {
  proposta_enviada: 'Proposta enviada',
  contraproposta: 'Contraproposta',
  aceita: 'Proposta aceita',
  recusada: 'Proposta recusada',
  aguardando_pagamento: 'Marcado como realizado',
  pagamento_confirmado: 'Pagamento confirmado',
  concluida: 'Booking concluído',
  cancelada: 'Booking cancelado',
  remarcacao_proposta: 'Remarcação proposta',
  remarcacao_aceita: 'Remarcação aceita',
  remarcacao_recusada: 'Remarcação recusada',
  em_cobranca: 'Marcado como em cobrança',
  disputa_aberta: 'Disputa aberta',
  chargeback_aberto: 'Chargeback aberto',
  nf_prazo_atualizado: 'Prazo de pagamento da NF atualizado',
  nf_emitida: 'NF marcada como emitida',
  nf_enviada_cliente: 'NF marcada como enviada ao cliente',
  nf_pagamento_recebido: 'Pagamento do cliente confirmado pelo artista',
  nf_comissao_paga: 'Comissão do Booker marcada como paga',
};

// Conversas Bloco 2 — os 4 estados CURRENT (src/lib/conversations/state.ts).
// "Você respondeu" NÃO tem entrada aqui de propósito: é um fato de
// mensagem individual, nunca um destes 4 estados de conversa.
export const CONVERSATION_STATE_LABELS: Record<string, string> = {
  needs_you: 'Precisa de você',
  waiting_client: 'Aguardando cliente',
  in_progress: 'Em andamento',
  closed: 'Encerrada',
};

export const conversationStatePillClasses: Record<string, string> = {
  needs_you: `${STATUS_PILL_BASE} bg-[var(--alert)]/15 text-[var(--alert)]`,
  waiting_client: `${STATUS_PILL_BASE} bg-[var(--accent-ink)]/15 text-[var(--accent-ink)]`,
  in_progress: `${STATUS_PILL_BASE} border border-[var(--line-light)] text-[var(--ink)]/60`,
  closed: `${STATUS_PILL_BASE} bg-[var(--paper-dim)] text-[var(--ink)]/40`,
};

export const avatarClass =
  'flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--ink)] font-doopla-display text-sm font-semibold text-[var(--accent)]';

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const calendarDayClass = (hasEvent: boolean) =>
  `relative flex aspect-square items-center justify-center rounded-[10px] text-[13px] ${
    hasEvent ? 'bg-[var(--paper-dim)] font-semibold' : 'text-[var(--ink)]'
  }`;

export type AgendaEventKind = 'confirmado' | 'disponivel' | 'indisponivel' | 'viagem' | 'outro';

const AGENDA_DOT_COLOR: Record<AgendaEventKind, string> = {
  confirmado: 'bg-[var(--musgo)]',
  disponivel: 'bg-[var(--accent)]',
  indisponivel: 'bg-[var(--alert)]',
  viagem: 'bg-[var(--ink)]/50',
  outro: 'bg-[var(--ink)]/30',
};

export const calendarDotClass = (kind: AgendaEventKind) =>
  `absolute bottom-[6px] h-[5px] w-[5px] rounded-full ${AGENDA_DOT_COLOR[kind]}`;

const AGENDA_TAG_COLOR: Record<AgendaEventKind, string> = {
  confirmado: 'bg-[var(--musgo)]/10 text-[var(--musgo)]',
  disponivel: 'bg-[var(--accent)]/15 text-[var(--accent-ink)]',
  indisponivel: 'bg-[var(--alert)]/12 text-[var(--alert)]',
  viagem: 'bg-[var(--ink)]/8 text-[var(--ink)]/70',
  outro: 'bg-[var(--ink)]/8 text-[var(--ink)]/70',
};

export const agendaTagClass = (kind: AgendaEventKind) =>
  `font-doopla-mono inline-block rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[.03em] ${AGENDA_TAG_COLOR[kind]}`;

export const officialChipClass = (done: boolean) =>
  `font-doopla-mono inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] uppercase tracking-[.03em] ${
    done ? 'bg-[var(--musgo)]/35 text-[#a8c49a]' : 'bg-white/8 text-[var(--paper)]/45'
  }`;
