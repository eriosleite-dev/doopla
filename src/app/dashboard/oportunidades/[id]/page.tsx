import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { formatCentsAsBRL, formatPercent, formatRelativeDate } from '@/lib/format';

import { inviteBookerToOpportunityAction } from '../../actions';
import { getOpportunityManageDetail } from '../../data';
import { getSessionProfile } from '../../session';
import { avatarClass, cardClass, eyebrowClass, ghostButtonClass, initialsFromName } from '../../ui';
import { SelectBookerButton } from './select-booker-button';

export const metadata: Metadata = {
  title: 'Gerenciar oportunidade | Doopla',
};

const STATUS_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_distribuicao: 'Em distribuição',
  interesse_recebido: 'Com interesse recebido',
  booker_selecionado: 'Booker escolhido',
  cancelada: 'Cancelada',
};

export default async function OpportunityManagePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const detail = await getOpportunityManageDetail(id, user.id, supabase);
  if (!detail) notFound();

  const { opportunity, interests, invitations, invitableBookers, hasAnyBookers } = detail;
  const isOpen = opportunity.status !== 'booker_selecionado' && opportunity.status !== 'cancelada';
  const canInvite = opportunity.distribution_mode !== 'novos_bookers';
  const canReceiveInterest = opportunity.distribution_mode !== 'meus_bookers';

  return (
    <main className="flex flex-col gap-8">
      <header>
        <p className={eyebrowClass}>Oportunidade publicada</p>
        <h1 className="font-doopla-display mt-1 text-2xl font-semibold">
          {STATUS_LABEL[opportunity.status] ?? opportunity.status}
        </h1>
      </header>

      <section className={cardClass}>
        {opportunity.source === 'artist_link' && (
          <p className="font-doopla-mono mb-3 w-fit rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--accent-ink)]">
            Recebida pelo seu link de orçamento
          </p>
        )}
        {opportunity.requires_invoice === 'sim' && (
          <p className="font-doopla-mono mb-3 w-fit rounded-full bg-[var(--alert)]/10 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--alert)]">
            Nota fiscal necessária · pagamento direto ao artista
          </p>
        )}
        {opportunity.requires_invoice === 'nao_sei' && (
          <p className="font-doopla-mono mb-3 w-fit rounded-full bg-[var(--paper-dim)] px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--ink)]/50">
            Nota fiscal: a definir
          </p>
        )}
        <p className="text-sm text-[var(--ink)]/75">{opportunity.description}</p>
        {opportunity.client_name && (
          <p className="mt-2 text-[12.5px] text-[var(--ink)]/60">
            Cliente: {opportunity.client_name}
            {opportunity.client_contact && ` · ${opportunity.client_contact}`}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[var(--ink)]/55">
          <span>
            {opportunity.cache_amount_cents != null
              ? formatCentsAsBRL(opportunity.cache_amount_cents)
              : opportunity.client_offered_cents != null
                ? `Cliente ofereceu ${formatCentsAsBRL(opportunity.client_offered_cents)}`
                : 'Cachê ainda não fechado'}
          </span>
          <span>
            {opportunity.commission_percent != null
              ? `${formatPercent(opportunity.commission_percent)} de comissão`
              : 'Comissão ainda não negociada'}
          </span>
          {opportunity.category && <span>{opportunity.category}</span>}
          {opportunity.location && <span>{opportunity.location}</span>}
          <span className="font-doopla-mono">{formatRelativeDate(opportunity.created_at)}</span>
        </div>
      </section>

      {isOpen && opportunity.source === 'artist_link' && (
        <section className="rounded-[18px] bg-[var(--paper-dim)] p-5">
          <p className="text-sm font-medium">Você pode gerenciar esse pedido você mesma.</p>
          <p className="mt-1 text-[13px] text-[var(--ink)]/60">
            Não é obrigatório enviar pra um booker — você pode responder o cliente, negociar e
            fechar diretamente. Se preferir ajuda, use as opções abaixo{hasAnyBookers
              ? ' para enviar pra um booker que você já representa'
              : ' para encontrar um booker'}
            .
          </p>
          {!hasAnyBookers && (
            <Link
              href="/dashboard/bookers#descubra"
              className="mt-3 inline-block text-[13px] font-medium text-[var(--accent-ink)] underline underline-offset-2"
            >
              Buscar ajuda de um booker →
            </Link>
          )}
        </section>
      )}

      {!isOpen && (
        <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/60">
          {opportunity.status === 'booker_selecionado'
            ? 'Booker já escolhido pra essa oportunidade — veja o andamento em Trabalhos.'
            : 'Essa oportunidade foi cancelada.'}
        </p>
      )}

      {isOpen && canReceiveInterest && (
        <section className="flex flex-col gap-3">
          <p className={eyebrowClass}>Bookers interessados ({interests.length})</p>
          {interests.length === 0 ? (
            <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
              Ninguém demonstrou interesse ainda.
            </p>
          ) : (
            interests.map((i) => (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-5"
              >
                <div className="flex items-center gap-3">
                  <span className={avatarClass}>{initialsFromName(i.bookerName)}</span>
                  <div>
                    <p className="text-sm font-medium">{i.bookerName}</p>
                    <p className="text-[12px] text-[var(--ink)]/55">
                      {i.ratingCount > 0
                        ? `★ ${i.ratingAverage?.toFixed(1)} · ${i.ratingCount} avaliações`
                        : 'Novo na doopla'}
                    </p>
                  </div>
                </div>
                <SelectBookerButton
                  opportunityId={opportunity.id}
                  bookerProfileId={i.booker_profile_id}
                  needsCommission={opportunity.commission_percent == null}
                />
              </div>
            ))
          )}
        </section>
      )}

      {isOpen && canInvite && (
        <section className="flex flex-col gap-3">
          <p className={eyebrowClass}>Bookers convidados ({invitations.length})</p>
          {invitations.length === 0 ? (
            <p className="rounded-[18px] bg-white p-6 text-sm text-[var(--ink)]/55">
              Nenhum booker convidado ainda.
            </p>
          ) : (
            invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] bg-white p-5"
              >
                <div className="flex items-center gap-3">
                  <span className={avatarClass}>{initialsFromName(inv.bookerName)}</span>
                  <div>
                    <p className="text-sm font-medium">{inv.bookerName}</p>
                    <p className="text-[12px] text-[var(--ink)]/55">
                      {inv.status === 'pendente' && 'Aguardando resposta'}
                      {inv.status === 'recusada' && 'Recusou o convite'}
                      {inv.status === 'aceita' && 'Aceitou — escolhido'}
                      {inv.status === 'encerrada' && 'Convite encerrado'}
                    </p>
                  </div>
                </div>
                {inv.status === 'pendente' && (
                  <SelectBookerButton
                    opportunityId={opportunity.id}
                    bookerProfileId={inv.booker_profile_id}
                    needsCommission={opportunity.commission_percent == null}
                  />
                )}
              </div>
            ))
          )}

          {invitableBookers.length > 0 && (
            <div className="rounded-[18px] bg-white p-5">
              <p className={eyebrowClass}>Convidar mais alguém que você representa</p>
              <div className="mt-3 flex flex-col gap-2">
                {invitableBookers.map((b) => (
                  <form
                    key={b.profileId}
                    action={inviteBookerToOpportunityAction}
                    className="flex items-center justify-between gap-3"
                  >
                    <input type="hidden" name="opportunityId" value={opportunity.id} />
                    <input type="hidden" name="bookerProfileId" value={b.profileId} />
                    <span className="text-sm">{b.fullName}</span>
                    <button type="submit" className={ghostButtonClass}>
                      Convidar
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
