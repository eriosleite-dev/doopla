import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';

import { getMyOpportunityById } from '../../data';
import { PEDIDO_STATUS_LABEL, pedidoStatusTone } from '../../pedido-attention';
import { proStatusPillClass } from '../../pro-format';
import { ProCard, ProCopyButton, ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';

export const metadata: Metadata = {
  title: 'Pedido | Doopla',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Correção 15/09/2026 (achado da fundadora, diagnóstico prévio no
// PROGRESS.md) — esta tela mostrava conteúdo do modelo antigo de
// matching/marketplace: "Oportunidade publicada", "Buscar ajuda de um
// booker", "Bookers interessados", "Bookers convidados" + convidar/
// selecionar booker. Tudo isso foi REMOVIDO da UI de Pedidos no
// Professional beta — inclusive a zona cinzenta de "Bookers
// convidados" (mesmo quando a solicitação nasceu roteada pra um booker
// via artist_link_routing, a invitation ainda é criada por
// submit_orcamento_request, só deixou de ser mostrada aqui). Se um dia
// existir atribuição de pedido a alguém da equipe, isso ganha desenho
// próprio em "Minha equipe" — nunca reaproveitando este fluxo.
//
// A infraestrutura antiga (tabelas opportunity_interests/
// opportunity_invitations, RPC select_booker_for_opportunity, as
// actions inviteBookerToOpportunityAction/selectBookerForOpportunityAction
// e select-booker-button.tsx) não foi apagada — só parou de ser lida/
// referenciada por esta tela (getOpportunityManageDetail, em ../../data,
// segue existindo sem chamadores).
//
// Layout reaproveita a arquitetura compacta de ProBookingDetailView
// (ProPageHeader + poucos ProCard, sem card-dentro-de-card) sem copiar
// o conteúdo: Pedido é uma entrada/negociação ainda em andamento,
// Booking é um trabalho que já avançou — distinção conceitual mantida
// mesmo reaproveitando componentes visuais.
export default async function PedidoDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const opportunity = await getMyOpportunityById(id, user.id, supabase);
  if (!opportunity) notFound();

  const isOpen = opportunity.status !== 'booker_selecionado' && opportunity.status !== 'cancelada';
  const clientLabel = opportunity.client_name || 'Cliente sem nome';

  return (
    <main className="flex flex-col gap-4">
      <div>
        <Link
          href="/dashboard/oportunidades"
          className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
        >
          ← Voltar pra Pedidos
        </Link>
      </div>

      <ProPageHeader
        title={clientLabel}
        subtitle="Pedido recebido pelo seu link de booking/orçamento"
        action={
          <span className={proStatusPillClass(pedidoStatusTone(opportunity))}>
            {PEDIDO_STATUS_LABEL[opportunity.status] ?? opportunity.status}
          </span>
        }
        badge={
          <span className="font-pro-sub flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/10 text-[13px] font-bold text-[var(--pro-off)]">
            {initials(clientLabel)}
          </span>
        }
      />

      <ProCard>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {opportunity.client_contact && (
            <div>
              <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Contato</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm text-[var(--pro-off)]">
                {opportunity.client_contact}
                <ProCopyButton value={opportunity.client_contact} label="Copiar contato" />
              </dd>
            </div>
          )}
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Recebido</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">
              {formatRelativeDate(opportunity.created_at)} pelo seu link de orçamento
            </dd>
          </div>
        </dl>
      </ProCard>

      <ProCard>
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">O trabalho</p>
        <p className="mt-2 text-sm text-[var(--pro-tx-70)]">{opportunity.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Data</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">
              {opportunity.event_date
                ? new Date(`${opportunity.event_date}T00:00:00`).toLocaleDateString('pt-BR')
                : 'A combinar'}
            </dd>
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Local</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">{opportunity.location || 'A combinar'}</dd>
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Categoria</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">{opportunity.category || '—'}</dd>
          </div>
          <div>
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Valor sugerido</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">
              {opportunity.client_offered_cents != null ? formatCentsAsBRL(opportunity.client_offered_cents) : 'Não informado'}
            </dd>
          </div>
        </dl>
      </ProCard>

      <ProCard>
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Precisa de você agora?</p>
        {isOpen && opportunity.status === 'aberta' && (
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">
            Sim — responda {clientLabel} pra negociar e fechar. Esse pedido chegou direto pela sua doopla; você
            conduz a negociação{opportunity.client_contact ? ' usando o contato acima' : ''}.
          </p>
        )}
        {isOpen && opportunity.status !== 'aberta' && (
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">Esse pedido está em andamento.</p>
        )}
        {!isOpen && opportunity.status === 'cancelada' && (
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">Esse pedido foi cancelado. Nada pendente por aqui.</p>
        )}
        {!isOpen && opportunity.status === 'booker_selecionado' && (
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">Esse pedido já foi encerrado.</p>
        )}
      </ProCard>
    </main>
  );
}
