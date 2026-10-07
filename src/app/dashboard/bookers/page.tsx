import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AddConnectionModal } from '../add-connection-modal';
import { confirmInviteAction, respondRepresentationRequestAction } from '../actions';
import { PendingInviteCard } from '../resend-invite-button';
import {
  getArtistBookerRelationships,
  getIncomingRepresentationRequests,
  getOutgoingRepresentationRequestsForArtist,
  getPendingInvites,
  getSentInvites,
  getSubscription,
} from '../data';
import { PublicIdChip } from '../public-id-chip';
import { getSessionProfile } from '../session';
import { hasDooplaPro } from '@/lib/subscription';
import { proGhostButtonClass, proPrimaryButtonClass } from '../pro-format';
import { ProCard } from '../pro-ui';
import { initialsFromName } from '../ui';
import { TerminateRelationshipButton } from '../terminate-relationship-button';

export const metadata: Metadata = {
  title: 'Minha equipe | Doopla',
};

// Item 11 da revisão Professional Web Dashboard (06/09/2026) —
// reescrita conceitual completa. Removido por completo: favoritos,
// busca/descoberta de novos bookers, ranking, "bookers ativos
// recentemente", campo "Encontrar Bookers" — tudo isso era marketplace
// de outro produto. O modelo vigente é só relacionamento operacional
// profissional <-> Booker (representations/representation_requests,
// migrations 0005/0018/0033), nunca ressuscitado o modelo de
// agência/marketplace antigo. Ações preservadas EXATAMENTE como já
// existiam (mesmas Server Actions, nenhuma regra nova): aceitar/recusar
// solicitação (respondRepresentationRequestAction), aceitar convite
// genérico (confirmInviteAction), remover vínculo ativo
// (TerminateRelationshipButton -> terminateRepresentationAction). Não
// existe hoje "cancelar convite/solicitação que eu enviei" — gap real,
// não inventado aqui (mesmo já registrado antes desta revisão).
export default async function BookersPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const [myBookers, incomingRequests, outgoingRequests, sentInvites, receivedInvites, subscription] = await Promise.all([
    getArtistBookerRelationships(user.id, supabase),
    getIncomingRepresentationRequests(user.id, supabase),
    getOutgoingRepresentationRequestsForArtist(user.id, supabase),
    getSentInvites(user.id, supabase),
    getPendingInvites(user.id, supabase),
    getSubscription(user.id, supabase),
  ]);
  const hasProPlan = hasDooplaPro(subscription);

  const outgoingPending = outgoingRequests.map((r) => ({
    key: r.id,
    name: r.bookerName,
    href: `/dashboard/bookers/${r.booker.profileId}`,
  }));
  const invitesPending = sentInvites
    .filter((i) => i.status === 'pendente' || i.status === 'expirada')
    .map((i) => ({ key: i.id, name: i.invitee_name, href: null, expired: i.status === 'expirada', token: i.token }));

  const hasNothing = myBookers.length === 0 && incomingRequests.length === 0 && outgoingPending.length === 0 && invitesPending.length === 0 && receivedInvites.length === 0;

  return (
    <main>
      {/* Reposição do CTA (07/10/2026, achado da fundadora) — antes
         "Adicionar alguém da equipe" ficava no canto superior direito,
         na mesma linha dos 3 ícones globais do shell (sino/comunidade/
         configurações, ver pro-shell.tsx), competindo visualmente com
         eles. Hierarquia agora: título+badge -> descrição -> CTA
         principal, tudo alinhado à esquerda, sem nenhuma relação com a
         navegação global. Markup inline aqui (não em ProPageHeader,
         componente compartilhado por Bookings/Agenda/Financeiro/
         Configurações) de propósito — essa mudança foi pedida só pra
         Minha equipe por enquanto; o pass de espaçamento/hierarquia do
         painel inteiro é um item separado, auditado mas não
         implementado ainda. */}
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-pro-sub text-[24px] font-bold sm:text-[26px]">Minha equipe</h1>
          {hasProPlan ? (
            <span className="rounded-full border border-[var(--pro-red)] px-2.5 py-0.5 font-doopla-mono text-[10px] font-bold uppercase tracking-[.08em] text-[var(--pro-red)]">
              PRO
            </span>
          ) : (
            <span className="rounded-full border border-[var(--pro-line)] px-2.5 py-0.5 font-doopla-mono text-[10px] font-bold uppercase tracking-[.08em] text-[var(--pro-tx-50)]">
              BÁSICO
            </span>
          )}
        </div>
        <p className="mt-1.5 max-w-[440px] text-[13.5px] text-[var(--pro-tx-70)]">
          Gerencie quem pode trabalhar com seus bookings pela Doopla.
        </p>
        {!hasNothing && (
          <div className="mt-4">
            <AddConnectionModal myRole="artista" variant="pro" hasProPlan={hasProPlan} />
          </div>
        )}
      </div>

      {/* "Seu ID Doopla" (07/10/2026, achado da fundadora) — faltava um
         jeito de achar o próprio ID aqui, pra passar pra quem vai
         adicionar você pelo "Com ID Doopla". Reaproveita PublicIdChip
         tal como já existe (mesmo componente de artistas/page.tsx) —
         nenhuma lógica nova de ID, só exposição num lugar que fazia
         falta. Fora do ProPageHeader (componente compartilhado por
         outras rotas) de propósito, pra não vazar pra lá. */}
      {profile.slug && (
        <div className="mb-4">
          <PublicIdChip publicId={profile.slug} variant="pro" />
        </div>
      )}

      {/* Redesign 01/10/2026 (achado de produto da fundadora, 2 rodadas
         na mesma data) — versão anterior (ícone em círculo + card
         alto) tinha aparência de placeholder/marketplace. Agora: sem
         ícone/ilustração, padding padrão de ProCard (consistente com
         o resto do painel, ~160-180px de altura total), conteúdo
         alinhado à esquerda, copy como convite direto em vez de
         "estado vazio". */}
      {hasNothing && (
        <ProCard className="flex flex-col items-start gap-3">
          <div>
            <p className="font-pro-sub text-[14px] font-bold">Traga sua equipe para a Doopla</p>
            <p className="mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[var(--pro-tx-50)]">
              Convide quem já trabalha com você para acompanhar seus bookings.
            </p>
          </div>
          <AddConnectionModal myRole="artista" variant="pro" hasProPlan={hasProPlan} triggerLabel="+ Adicionar pessoa" />
        </ProCard>
      )}

      {incomingRequests.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {incomingRequests.map((req) => (
            <ProCard key={req.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/dashboard/bookers/${req.booker.profileId}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="font-pro-sub flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--pro-red)] text-[13px] font-semibold text-[var(--pro-off)]">
                    {initialsFromName(req.booker.fullName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-[var(--pro-off)]">{req.booker.fullName}</p>
                    <p className="text-[12px] text-[var(--pro-amber)]">Convite pendente · quer operar seus bookings</p>
                  </div>
                </Link>
                <div className="flex flex-none gap-2">
                  <form action={respondRepresentationRequestAction}>
                    <input type="hidden" name="requestId" value={req.id} />
                    <input type="hidden" name="decision" value="aceitar" />
                    <button type="submit" className={proPrimaryButtonClass}>
                      Aceitar
                    </button>
                  </form>
                  <form action={respondRepresentationRequestAction}>
                    <input type="hidden" name="requestId" value={req.id} />
                    <input type="hidden" name="decision" value="recusar" />
                    <button type="submit" className={proGhostButtonClass}>
                      Recusar
                    </button>
                  </form>
                </div>
              </div>
            </ProCard>
          ))}
        </div>
      )}

      {receivedInvites.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          {receivedInvites.map((invite) => (
            <ProCard key={invite.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="flex items-center gap-3 text-[13.5px] text-[var(--pro-off)]">
                  <span className="font-pro-sub flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[var(--pro-red)] text-[13px] font-semibold text-[var(--pro-off)]">
                    {initialsFromName(invite.inviterName)}
                  </span>
                  <strong>{invite.inviterName}</strong> quer se conectar com você na Doopla.
                </span>
                <form action={confirmInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button type="submit" className={proPrimaryButtonClass}>
                    Aceitar conexão
                  </button>
                </form>
              </div>
            </ProCard>
          ))}
        </div>
      )}

      {(outgoingPending.length > 0 || invitesPending.length > 0) && (
        <div className="mb-4 flex flex-col gap-2">
          {outgoingPending.map((row) => (
            <ProCard key={row.key} className="!p-4">
              <Link href={row.href} className="flex items-center justify-between gap-3 text-[13px] text-[var(--pro-off)] hover:text-[var(--pro-tx-70)]">
                <span>{row.name}</span>
                <span className="text-[12px] text-[var(--pro-tx-50)]">Convite pendente · Aguardando aceite</span>
              </Link>
            </ProCard>
          ))}
          {invitesPending.map((row) => (
            <PendingInviteCard
              key={row.key}
              inviteId={row.key}
              name={row.name}
              token={row.token}
              expired={row.expired}
              variant="pro"
            />
          ))}
        </div>
      )}

      {myBookers.length > 0 && (
        <div className="flex flex-col gap-2">
          {myBookers.map((b) => (
            <ProCard key={b.profileId} className="!p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/dashboard/bookers/${b.profileId}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="font-pro-sub flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--pro-red)] text-[12px] font-semibold text-[var(--pro-off)]">
                    {initialsFromName(b.fullName)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-bold text-[var(--pro-off)]">
                      {b.fullName} · <span className="text-[var(--pro-green)]">Ativo</span>
                    </p>
                    <p className="truncate text-[12px] text-[var(--pro-tx-50)]">
                      {b.ongoingCount > 0 ? `${b.ongoingCount} ${b.ongoingCount === 1 ? 'trabalho em andamento' : 'trabalhos em andamento'}` : 'nenhum trabalho em andamento agora'}
                    </p>
                  </div>
                </Link>
                <div className="flex flex-none items-center gap-3">
                  <Link href={`/dashboard/bookers/${b.profileId}`} className={proGhostButtonClass}>
                    Gerenciar
                  </Link>
                  <TerminateRelationshipButton representationId={b.representationId} targetName={b.fullName} />
                </div>
              </div>
            </ProCard>
          ))}
        </div>
      )}
    </main>
  );
}
