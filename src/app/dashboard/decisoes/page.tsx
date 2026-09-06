import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { groupDecisionsByConversation, sortDecisionsByPriority } from '@/lib/decisions/data';

import { getUserBookings } from '../data';
import { getCachedActionableDecisions } from '../pro-home-cache';
import { formatRelativeTime } from '../pro-format';
import { ProCard, ProEmptyState, ProPageHeader } from '../pro-ui';
import { getSessionProfile } from '../session';

export const metadata: Metadata = {
  title: 'Decisões | Doopla',
};

// Item 9 da revisão Professional Web Dashboard (06/09/2026) — lista
// completa do que a Home resume em "Precisa de você" (mesma fonte:
// getCachedActionableDecisions, agrupada por conversa pela mesma função
// usada na Home — nunca uma segunda contagem). Só Pendentes: não existe
// hoje nenhuma leitura real de decisões já resolvidas (nenhuma UI no
// produto expõe isso), então nenhuma aba "Resolvidas" foi criada —
// decisão explícita, não um gap escondido (ver PROGRESS.md). Esta tela
// só REPRESENTA o que Runtime/Approval Engine/Policy Gate já decidiram
// — nunca contorna ou reinterpreta essa camada.
function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  const known: Record<string, string> = {
    professional_not_operationally_ready: 'Precisa confirmar alguns dados antes da Doopla continuar por você.',
  };
  return known[reason] ?? 'A Doopla pausou aqui e precisa de você pra seguir.';
}

export default async function DecisoesPage() {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role === 'booker') redirect('/dashboard');

  const [decisions, bookings] = await Promise.all([
    getCachedActionableDecisions(supabase),
    getUserBookings(user.id, profile.role, supabase),
  ]);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const grouped = sortDecisionsByPriority(groupDecisionsByConversation(decisions));

  return (
    <main>
      <ProPageHeader
        title="Decisões"
        subtitle="Tudo que a Doopla está esperando você decidir pra continuar uma conversa."
      />

      {grouped.length === 0 ? (
        <ProEmptyState message="Tudo certo por aqui — nenhuma decisão pendente no momento." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {grouped.map((d) => {
            const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
            const href = d.relatedBookingId
              ? `/dashboard/bookings/${d.relatedBookingId}/conversa/${d.conversationId}`
              : '/dashboard/trabalhos';
            return (
              <ProCard key={d.id}>
                <p className="font-pro-sub text-[14.5px] font-bold">{booking?.otherPartyName ?? 'Conversa em andamento'}</p>
                <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">
                  {d.kind === 'prepared_draft'
                    ? 'A Doopla preparou uma resposta. Revise antes de enviar.'
                    : decisionBlockReasonLabel(d.blockReason)}
                </p>
                {d.kind === 'prepared_draft' && d.preparedContent && (
                  <p className="mt-2 line-clamp-3 text-[12.5px] italic text-[var(--pro-tx-70)]">&ldquo;{d.preparedContent}&rdquo;</p>
                )}
                <p className="font-doopla-mono mt-3 text-[10.5px] text-[var(--pro-tx-30)]">{formatRelativeTime(d.createdAt)}</p>
                <Link
                  href={href}
                  className="font-pro-sub mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12px] font-bold text-[var(--pro-off)] shadow-[0_0_20px_rgba(226,41,28,.35)]"
                >
                  Ver conversa
                </Link>
              </ProCard>
            );
          })}
        </div>
      )}
    </main>
  );
}
