import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AddConnectionModal } from '../add-connection-modal';
import { confirmInviteAction, respondRepresentationRequestAction } from '../actions';
import {
  getArtistBookerRelationships,
  getIncomingRepresentationRequests,
  getOutgoingRepresentationRequestsForArtist,
  getPendingInvites,
  getSentInvites,
} from '../data';
import { getSessionProfile } from '../session';
import { proGhostButtonClass, proPrimaryButtonClass } from '../pro-format';
import { proNavIcons } from '../pro-sidebar-nav';
import { ProCard, ProPageHeader } from '../pro-ui';
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

  const [myBookers, incomingRequests, outgoingRequests, sentInvites, receivedInvites] = await Promise.all([
    getArtistBookerRelationships(user.id, supabase),
    getIncomingRepresentationRequests(user.id, supabase),
    getOutgoingRepresentationRequestsForArtist(user.id, supabase),
    getSentInvites(user.id, supabase),
    getPendingInvites(user.id, supabase),
  ]);

  const outgoingPending = outgoingRequests.map((r) => ({
    key: r.id,
    name: r.bookerName,
    href: `/dashboard/bookers/${r.booker.profileId}`,
  }));
  const invitesPending = sentInvites.filter((i) => i.status === 'pendente').map((i) => ({ key: i.id, name: i.invitee_name, href: null }));

  const hasNothing = myBookers.length === 0 && incomingRequests.length === 0 && outgoingPending.length === 0 && invitesPending.length === 0 && receivedInvites.length === 0;

  return (
    <main>
      <ProPageHeader
        title="Minha equipe"
        subtitle="Gerencie quem pode trabalhar com seus bookings pela Doopla."
        action={!hasNothing ? <AddConnectionModal myRole="artista" variant="pro" /> : undefined}
      />

      {/* Correção 06/09/2026 — antes: ProEmptyState genérico (caixa
         tracejada, pensada pra listas pequenas dentro de outras
         telas) + CTA duplicado (aqui e no header). Agora: card sólido
         no mesmo sistema visual da Home (ProCard, ícone em círculo —
         mesmo tratamento de StatCard/canais), com uma explicação curta
         do que é Minha equipe e UM ÚNICO CTA. */}
      {hasNothing && (
        <ProCard className="flex flex-col items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/[0.06] text-[var(--pro-tx-70)]">
            {proNavIcons.equipe}
          </div>
          <div>
            <p className="font-pro-sub text-[14px] font-bold">Nenhum Booker conectado ainda</p>
            <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-[var(--pro-tx-50)]">
              Minha equipe é onde você conecta um Booker de confiança pra operar seus bookings com você na Doopla —
              nada de marketplace, só quem você já trabalha de verdade.
            </p>
          </div>
          <AddConnectionModal myRole="artista" variant="pro" />
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
          {[...outgoingPending, ...invitesPending].map((row) => (
            <ProCard key={row.key} className="!p-4">
              {row.href ? (
                <Link href={row.href} className="flex items-center justify-between gap-3 text-[13px] text-[var(--pro-off)] hover:text-[var(--pro-tx-70)]">
                  <span>{row.name}</span>
                  <span className="text-[12px] text-[var(--pro-tx-50)]">Convite pendente · Aguardando aceite</span>
                </Link>
              ) : (
                <div className="flex items-center justify-between gap-3 text-[13px] text-[var(--pro-off)]">
                  <span>{row.name}</span>
                  <span className="text-[12px] text-[var(--pro-tx-50)]">Convite pendente · Aguardando cadastro</span>
                </div>
              )}
            </ProCard>
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
