// Funções puras de formatação usadas pelo novo Shell/Home — sem nada
// de navegador, de propósito: precisam ser chamáveis direto de Server
// Components (professional-home-view.tsx). Nunca colocar aqui algo que
// dependa de 'use client' (useState/useEffect/window/etc.) — é
// exatamente essa mistura que causava "Attempted to call X() from the
// server" quando essas duas viviam em pro-ui.tsx.

import { wasBookingProposedByViewer, type BookingProposalFields } from './booking-attention';

// Correção 06/09/2026 — nome cadastrado sem capitalização consistente
// (ex.: "eduarda") não deve vazar pra saudação da Home ("Oi, eduarda").
// Normaliza pra Title Case preservando acentos, via toLocaleUpperCase/
// toLocaleLowerCase('pt-BR') — nunca regex ingênua que quebra á/é/ã/ç.
export function capitalizeName(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1).toLocaleLowerCase('pt-BR'))
    .join(' ');
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
}

export type ProPillTone = 'red' | 'amber' | 'green' | 'neutral';

export function proStatusPillClass(tone: ProPillTone): string {
  const base = 'font-pro-sub inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold';
  if (tone === 'red') return `${base} bg-[rgba(226,41,28,.18)] text-[#ff8b80]`;
  if (tone === 'amber') return `${base} bg-[rgba(245,166,35,.18)] text-[var(--pro-amber)]`;
  if (tone === 'green') return `${base} bg-[rgba(62,207,110,.18)] text-[var(--pro-green)]`;
  // neutral — estado final/informativo, sem ação pendente (ex.: recusada,
  // conversa in_progress/closed): nunca a mesma cor de urgência/atenção.
  return `${base} border border-[var(--pro-line)] text-[var(--pro-tx-50)]`;
}

// Badge PRO/BÁSICO — mesmo estilo visual já usado em Minha equipe
// (`bookers/page.tsx`), reaproveitado aqui pra Home ter exatamente a
// mesma aparência do mesmo conceito (07/09/2026, migration 0074).
// Recebe `hasDooplaPro` já resolvido pela autoridade canônica — nunca
// decide Pro/Básico sozinho.
export function proPlanBadgeClass(hasPro: boolean): string {
  const base = 'rounded-full border px-2.5 py-0.5 font-doopla-mono text-[10px] font-bold uppercase tracking-[.08em]';
  return hasPro ? `${base} border-[var(--pro-red)] text-[var(--pro-red)]` : `${base} border-[var(--pro-line)] text-[var(--pro-tx-50)]`;
}

// Botões/inputs compartilhados — revisão Professional Web Dashboard
// (06/09/2026). Vermelho só pro botão PRIMARY (ação principal de cada
// tela); nunca botão branco/cinza neutro nas rotas novas, mesma regra
// da Home.
export const proPrimaryButtonClass =
  'font-pro-sub inline-flex items-center justify-center gap-2 rounded-full bg-[var(--pro-red)] px-5 py-2.5 text-[13px] font-bold text-[var(--pro-off)] shadow-[0_0_20px_rgba(226,41,28,.35)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40';

export const proGhostButtonClass =
  'font-pro-sub inline-flex items-center justify-center gap-2 rounded-full border border-[var(--pro-line)] px-5 py-2.5 text-[13px] font-bold text-[var(--pro-tx-70)] transition-colors hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)] disabled:cursor-not-allowed disabled:opacity-40';

export const proInputClass =
  'w-full rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-2.5 text-[13.5px] text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)] focus:border-[var(--pro-tx-30)]';

export const proLabelClass = 'text-[11.5px] font-semibold text-[var(--pro-tx-50)]';

// Tom visual por status de booking — compartilhado entre Home,
// Bookings e Agenda (revisão Professional Web Dashboard, 06/09/2026;
// revisado 09/09/2026 na auditoria de divergência Web×App). Nunca uma
// tela decide cor sozinha: aceita/concluida=green (resultado
// positivo), aguardando_pagamento=amber (atenção sem caráter
// negativo), cancelada=red (evento negativo relevante), recusada=
// neutral (estado final, sem ação — não é uma cor de urgência).
// proposta_enviada depende de QUEM propôs (mesma regra de
// classifyBookingAttention, booking-attention.ts): se foi a outra
// parte, o profissional precisa decidir agora (red); se foi o próprio
// profissional, está só aguardando resposta (amber) — nunca as duas
// situações com a mesma cor, senão uma proposta que ele mesmo enviou
// pareceria "urgente pra ele" outra vez.
export function bookingStatusTone(booking: BookingProposalFields, viewerId: string): ProPillTone {
  switch (booking.status) {
    case 'proposta_enviada':
      return wasBookingProposedByViewer(booking, viewerId) ? 'amber' : 'red';
    case 'aceita':
    case 'concluida':
      return 'green';
    case 'aguardando_pagamento':
      return 'amber';
    case 'cancelada':
      return 'red';
    default:
      return 'neutral'; // recusada
  }
}

// Tom visual por estado de conversa — mesma regra em toda parte que
// mostra o pill (booking detail, conversa-view); nunca um mapa local
// duplicado por tela (correção 09/09/2026).
export const PRO_CONVERSATION_STATE_TONE: Record<string, ProPillTone> = {
  needs_you: 'red',
  waiting_client: 'amber',
  in_progress: 'neutral',
  closed: 'neutral',
};
