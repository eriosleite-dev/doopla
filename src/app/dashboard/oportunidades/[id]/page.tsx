import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { formatCentsAsBRL, formatRelativeDate } from '@/lib/format';
import { getConversationOperationalFactsForOpportunity } from '@/lib/conversations/data';
import { groupDecisionsByConversation, type DecisionItem } from '@/lib/decisions/data';
import { buildTalkToYourDooplaUrl } from '@/lib/professional-doopla-cta';
import { whatsappPublicNumber } from '@/lib/supabase/env';

import { resolveDooplaIntervention } from '../../doopla-intervention';
import { getMyOpportunityById } from '../../data';
import { PEDIDO_STATUS_LABEL, pedidoStatusTone } from '../../pedido-attention';
import { getCachedActionableDecisions } from '../../pro-home-cache';
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
// convidados". A infraestrutura antiga não foi apagada — só parou de
// ser lida/referenciada por esta tela (getOpportunityManageDetail, em
// ../../data, segue existindo sem chamadores).
//
// Segunda correção, mesma data (resíduos da implementação anterior) —
// (1) "O trabalho" some ("O " maiúsculo virava "O TRABALHO", lido como
// "0 TRABALHO" no mono uppercase — texto agora só "Trabalho"); (2)
// "Categoria" só aparece quando `opportunity.category` existir de
// verdade (nunca artist_link hoje — submit_orcamento_request não
// coleta essa coluna) — grid base vira Data | Local | Valor sugerido;
// (3) "Precisa de você agora?" deixou de inferir do source='public_link'
// ("responda o cliente por fora") e passou a derivar do estado
// operacional real da conversation/decision (resolveDooplaIntervention,
// ../../doopla-intervention.ts — mesma fonte usada por Home/badge de
// Bookings/lista de Bookings, nunca uma segunda leitura divergente);
// (4) subtitle "Recebido pelo seu link de booking"; (5) contato do
// cliente continua disponível como dado, nunca mais como instrução pra
// negociar por fora (a Doopla é quem conduz; o CTA daqui fala com a
// PRÓPRIA Doopla via WhatsApp, reaproveitando buildTalkToYourDooplaUrl
// já usado na Home — nenhum mecanismo paralelo novo).
export default async function PedidoDetailPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const opportunity = await getMyOpportunityById(id, user.id, supabase);
  if (!opportunity) notFound();

  const isOpen = opportunity.status !== 'booker_selecionado' && opportunity.status !== 'cancelada';
  const clientLabel = opportunity.client_name || 'Cliente sem nome';

  let intervention = null;
  if (isOpen) {
    const conversation = await getConversationOperationalFactsForOpportunity(supabase, opportunity.id);
    let decision: DecisionItem | null = null;
    if (conversation && (conversation.hasPendingRuntimeReply || conversation.lastOutboundIntentDeliveryState === 'policy_allowed')) {
      const grouped = groupDecisionsByConversation(await getCachedActionableDecisions(supabase));
      decision = grouped.find((d) => d.conversationId === conversation.conversationId) ?? null;
    }
    intervention = resolveDooplaIntervention(conversation, decision, clientLabel);
  }

  const badgeLabel = intervention ? intervention.headline : (PEDIDO_STATUS_LABEL[opportunity.status] ?? opportunity.status);
  const badgeTone = intervention ? intervention.tone : pedidoStatusTone(opportunity);

  const whatsappNumber = whatsappPublicNumber();
  const talkUrl = whatsappNumber ? buildTalkToYourDooplaUrl(whatsappNumber) : null;

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
        subtitle="Recebido pelo seu link de booking"
        action={<span className={proStatusPillClass(badgeTone)}>{badgeLabel}</span>}
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
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Trabalho</p>
        <p className="mt-2 text-sm text-[var(--pro-tx-70)]">{opportunity.description}</p>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
            <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Valor sugerido</dt>
            <dd className="mt-1 text-sm text-[var(--pro-off)]">
              {opportunity.client_offered_cents != null ? formatCentsAsBRL(opportunity.client_offered_cents) : 'Não informado'}
            </dd>
          </div>
          {opportunity.category && (
            <div>
              <dt className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Categoria</dt>
              <dd className="mt-1 text-sm text-[var(--pro-off)]">{opportunity.category}</dd>
            </div>
          )}
        </dl>
      </ProCard>

      {intervention ? (
        <ProCard>
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">{intervention.headline}</p>
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">{intervention.detail}</p>
          {intervention.needsYou && talkUrl && (
            <a
              href={talkUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-bold text-white shadow-[0_0_20px_rgba(37,211,102,.35)]"
              style={{ background: 'var(--pro-whatsapp)' }}
            >
              Falar com minha Doopla no WhatsApp
            </a>
          )}
        </ProCard>
      ) : (
        <ProCard>
          <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">
            {opportunity.status === 'cancelada' ? 'Cancelado' : 'Encerrado'}
          </p>
          <p className="mt-3 text-sm text-[var(--pro-tx-70)]">
            {opportunity.status === 'cancelada' ? 'Esse pedido foi cancelado. Nada pendente por aqui.' : 'Esse pedido já foi encerrado.'}
          </p>
        </ProCard>
      )}
    </main>
  );
}
