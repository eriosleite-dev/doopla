import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';

import { formatCentsAsBRL } from '@/lib/format';
import { siteOrigin } from '@/lib/site-url';
import { whatsappPublicNumber } from '@/lib/supabase/env';
import type { Profile } from '@/lib/supabase/types';
import { buildTalkToYourDooplaUrl } from '@/lib/professional-doopla-cta';
import { groupDecisionsByConversation, sortDecisionsByPriority } from '@/lib/decisions/data';

import { conversationHref } from './decisoes/format-cards';
import { getActivePaymentDetails, getArtistMatchingCompletion, getOrcamentoLinkInfo, getRecentActivity, getUserBookings, getReferralSummary } from './data';
import { getCachedActionableDecisions, getCachedConversationStateSummary, getCachedProfessionalHomeFacts } from './pro-home-cache';
import { ProMascot } from './pro-mascot';
import { capitalizeName, formatRelativeTime, proPlanBadgeClass, proStatusPillClass, PRO_BOOKING_PILL_TONE } from './pro-format';
import { ProReferralGainsButton } from './pro-referral-gains-button';
import { ProAccordion, ProCopyButton } from './pro-ui';
import { STATUS_LABELS } from './ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export async function ProfessionalHomeView({
  userId,
  profile,
  supabase,
}: {
  userId: string;
  profile: Profile;
  supabase: AnySupabaseClient;
}) {
  const [homeFacts, decisions, conversationSummary, bookings] = await Promise.all([
    getCachedProfessionalHomeFacts(supabase),
    getCachedActionableDecisions(supabase),
    getCachedConversationStateSummary(supabase),
    getUserBookings(userId, profile.role, supabase),
  ]);

  // Item 3/15 da revisão Professional Web Dashboard (06/09/2026): a
  // contagem exibida (card, accordion, badge do sidebar) é SEMPRE
  // conversationSummary.needsYouCount (getCachedConversationStateSummary
  // — fonte única). A lista abaixo é filtrada a um subconjunto
  // GARANTIDO desse mesmo conjunto (needsYouConversationIds), agrupada
  // por conversa (nunca 2 cards pra 1 conversa) — nunca mais diverge do
  // número mostrado.
  const needsYouDecisions = sortDecisionsByPriority(
    groupDecisionsByConversation(decisions).filter((d) => conversationSummary.needsYouConversationIds.includes(d.conversationId))
  ).slice(0, 5);

  const [recentActivity, orcamentoInfo, referralSummary, activePaymentDetails, matchingCompletion] = await Promise.all([
    getRecentActivity(userId, profile.role, bookings, supabase),
    getOrcamentoLinkInfo(userId, supabase),
    profile.referral_code ? getReferralSummary(userId, profile.referral_code, supabase) : Promise.resolve(null),
    // Bloco 4 (progressive profiling, 08/09/2026) — mesmas fontes
    // canônicas já usadas em /dashboard/perfil/recebimento e no card
    // "Complete suas preferências" (antes só alcançável via Booker
    // gerenciando artista, órfão desde o split Shell+Home — ver
    // booker-home-view.tsx). Nunca uma segunda implementação: mesma
    // getActivePaymentDetails/getArtistMatchingCompletion, mesmo
    // critério, sem alterar nenhuma das duas funções.
    getActivePaymentDetails(userId, supabase),
    getArtistMatchingCompletion(userId, supabase),
  ]);

  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const today = new Date().toISOString().slice(0, 10);
  const upcomingBookings = bookings
    .filter((b) => (b.status === 'aceita' || b.status === 'aguardando_pagamento') && b.event_date && b.event_date >= today)
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
    .slice(0, 5);

  const origin = orcamentoInfo?.publicEnabled ? await siteOrigin() : null;
  const orcamentoUrl = orcamentoInfo?.publicEnabled && profile.slug ? `${origin}/orcamento/${profile.slug}` : null;
  const whatsappNumber = whatsappPublicNumber();

  if (!homeFacts) {
    return (
      <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-6 text-[13.5px] text-[var(--pro-tx-50)]">
        Não conseguimos carregar seus dados agora. Atualize a página em instantes.
      </div>
    );
  }

  const upcomingBookingsAccordion = (
    <ProAccordion title="Próximos bookings" rightLink={{ label: 'Ver agenda', href: '/dashboard/agenda' }}>
      {upcomingBookings.length === 0 ? (
        <p className="py-2 text-[13px] text-[var(--pro-tx-50)]">Nenhum booking confirmado por vir ainda.</p>
      ) : (
        <div>
          {upcomingBookings.map((b) => (
            <div key={b.id} className="flex items-center gap-3 border-t border-[var(--pro-line)] py-2.5 first:border-t-0">
              <div className="font-doopla-mono w-9 flex-none text-center text-[10.5px] text-[var(--pro-tx-50)]">
                <b className="font-pro-display block text-[16px] font-normal text-[var(--pro-off)]">
                  {b.event_date ? new Date(`${b.event_date}T00:00:00`).getDate() : '-'}
                </b>
                {b.event_date &&
                  new Date(`${b.event_date}T00:00:00`).toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-pro-sub truncate text-[13.5px] font-bold">{b.otherPartyName}</p>
                <p className="truncate text-[11px] text-[var(--pro-tx-50)]">{b.event_location || 'Local a definir'}</p>
              </div>
              <Link href={`/dashboard/bookings/${b.id}`} className={proStatusPillClass(PRO_BOOKING_PILL_TONE[b.status] ?? 'amber')}>
                {STATUS_LABELS[b.status] ?? b.status}
              </Link>
            </div>
          ))}
        </div>
      )}
    </ProAccordion>
  );

  return (
    <div>
      <ProHero fullName={profile.full_name} needsYouCount={conversationSummary.needsYouCount} hasDooplaPro={homeFacts.hasDooplaPro} />

      <StatsRow
        needsYou={conversationSummary.needsYouCount}
        waitingClient={conversationSummary.waitingClientCount}
        confirmed={homeFacts.bookingsConfirmedCount}
        completed={homeFacts.bookingsCompletedCount}
      />

      {/* Recomposição do grid (07/09/2026, corrigida) — UM grid só de 2
         colunas (lg:items-start), cada coluna é uma pilha vertical
         independente (nunca linhas pareadas card-a-card — isso foi
         tentado antes e criava vãos enormes sempre que o card da
         direita numa "linha" era bem mais alto que o accordion fechado
         correspondente à esquerda). A direita começa alinhada ao topo
         da esquerda; depois cada lado segue sua própria altura natural.
         Espaçamento: ProAccordion já tem mb-3.5 embutido (mesmo
         componente usado em outras páginas — não alterado aqui), por
         isso a coluna esquerda não usa gap (dobraria o espaçamento);
         a direita usa gap-3.5 pra igualar visualmente, já que os cards
         de lá não têm margin próprio. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="min-w-0">
          <ProAccordion id="precisa-de-voce" title="Precisa de você" count={conversationSummary.needsYouCount} defaultOpen={false}>
            {needsYouDecisions.length === 0 ? (
              <p className="font-pro-sub py-2 text-[14px] font-semibold text-[var(--pro-off)]">
                Tudo certo por aqui.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {needsYouDecisions.map((d) => {
                    const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
                    const href = conversationHref(d.relatedBookingId, d.conversationId);
                    return (
                      <div key={d.id} className="rounded-[14px] border border-[var(--pro-line)] bg-white/[0.02] p-4">
                        <p className="font-pro-sub text-[14.5px] font-bold">
                          {booking?.otherPartyName ?? 'Conversa em andamento'}
                        </p>
                        <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">
                          {d.kind === 'prepared_draft'
                            ? 'A Doopla preparou uma resposta. Revise antes de enviar.'
                            : decisionBlockReasonLabel(d.blockReason)}
                        </p>
                        {d.kind === 'prepared_draft' && d.preparedContent && (
                          <p className="mt-2 line-clamp-2 text-[12.5px] italic text-[var(--pro-tx-70)]">
                            &ldquo;{d.preparedContent}&rdquo;
                          </p>
                        )}
                        <p className="font-doopla-mono mt-3 text-[10.5px] font-bold text-[var(--pro-tx-30)]">
                          {formatRelativeTime(d.createdAt)}
                        </p>
                        <Link
                          href={href}
                          className="font-pro-sub mt-3 inline-flex items-center gap-1.5 rounded-full bg-[var(--pro-red)] px-4 py-2 text-[12px] font-bold text-[var(--pro-off)] shadow-[0_0_20px_rgba(226,41,28,.35)]"
                        >
                          Ver conversa
                        </Link>
                      </div>
                    );
                  })}
                </div>
                <Link
                  href="/dashboard/decisoes"
                  className="font-pro-sub mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[var(--pro-red)] hover:underline"
                >
                  Ver todas as decisões →
                </Link>
              </>
            )}
          </ProAccordion>

          {upcomingBookingsAccordion}

          <ProAccordion title="Atividade da Doopla" rightLink={{ label: 'Ver todas', href: '/dashboard/trabalhos' }}>
            {recentActivity.length === 0 ? (
              <p className="py-2 text-[13px] text-[var(--pro-tx-50)]">Nenhuma atividade registrada ainda.</p>
            ) : (
              <div>
                {recentActivity.slice(0, 6).map((item, i) => (
                  <a
                    key={i}
                    href={item.href}
                    className="flex items-start gap-3 border-t border-[var(--pro-line)] py-2.5 text-[12.5px] leading-relaxed text-[var(--pro-tx-70)] first:border-t-0 hover:text-[var(--pro-off)]"
                  >
                    <span className="mt-[3px] flex-none text-[var(--pro-tx-30)]">{item.tone === 'positivo' ? '✓' : '·'}</span>
                    <span className="flex-1">{item.text}</span>
                  </a>
                ))}
              </div>
            )}
          </ProAccordion>

          <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-4 sm:p-5">
            <p className="font-pro-sub text-[16px] font-bold">Sua Doopla em ação</p>
            {homeFacts.bookingsConfirmedCount === 0 && homeFacts.bookingsCompletedCount === 0 && homeFacts.referralQualifiedCount === 0 ? (
              <p className="mt-2 text-[13px] text-[var(--pro-tx-50)]">
                Ainda não há histórico suficiente pra mostrar aqui. Assim que os primeiros bookings avançarem, este
                resumo aparece.
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-6">
                <div>
                  <p className="font-pro-display text-[20px]">{homeFacts.bookingsConfirmedCount + homeFacts.bookingsCompletedCount}</p>
                  <p className="text-[10.5px] text-[var(--pro-tx-50)]">Bookings conduzidos</p>
                </div>
                <div>
                  <p className="font-pro-display text-[20px]">{homeFacts.referralQualifiedCount}</p>
                  <p className="text-[10.5px] text-[var(--pro-tx-50)]">Indicações qualificadas</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3.5">
          <ReadinessCard paymentReady={activePaymentDetails !== null} matchingCompletion={matchingCompletion} />
          <BookingChannelsCard orcamentoUrl={orcamentoUrl} whatsappNumber={whatsappNumber} professionalSlug={profile.slug} />
          {referralSummary && (
            <ReferralCard referralTotal={homeFacts.referralTotalCount} referralQualifiedCents={referralSummary.qualifiedTotalCents} />
          )}
          <TalkToDooplaCard whatsappNumber={whatsappNumber} whatsappIdentityStatus={homeFacts.whatsappIdentityStatus} />
        </div>
      </div>
    </div>
  );
}

function decisionBlockReasonLabel(reason: string | null): string {
  if (!reason) return 'A Doopla está esperando uma decisão sua pra continuar essa conversa.';
  const known: Record<string, string> = {
    professional_not_operationally_ready: 'Precisa confirmar alguns dados antes da Doopla continuar por você.',
  };
  return known[reason] ?? 'A Doopla pausou aqui e precisa de você pra seguir.';
}

function ProHero({
  fullName,
  needsYouCount,
  hasDooplaPro,
}: {
  fullName: string;
  needsYouCount: number;
  // Só informativo aqui — status da conta, nunca CTA de upgrade. A
  // monetização continua sendo o padrão contextual (ProUpgradeModal ao
  // tentar usar uma feature Pro), não este badge.
  hasDooplaPro: boolean;
}) {
  const firstName = capitalizeName((fullName || '').trim().split(/\s+/)[0] || 'você');
  return (
    <div className="relative mb-4 flex items-start justify-between gap-5 overflow-hidden rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-7 backdrop-blur-xl sm:p-8">
      <div className="min-w-0 pt-0.5">
        <span className={`${proPlanBadgeClass(hasDooplaPro)} inline-block`}>{hasDooplaPro ? 'PRO' : 'BÁSICO'}</span>
        <h1 className="font-pro-sub mt-2 flex items-center gap-2 text-[26px] font-bold sm:text-[28px]">
          Oi, {firstName}
          <span className="h-[6px] w-[6px] flex-none rounded-full bg-[var(--pro-red)] shadow-[0_0_8px_var(--pro-red-glow)]" />
        </h1>
        <p className="mt-3 max-w-[340px] text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">
          Sua Doopla negocia, organiza e cuida dos seus bookings.
        </p>
        <div className="mt-5 flex items-center gap-2 text-[12px] text-[var(--pro-tx-70)]">
          <span className="relative h-2 w-2 flex-none rounded-full bg-[var(--pro-green)]">
            <span className="absolute inset-[-4px] rounded-full bg-[var(--pro-green)] opacity-50 [animation:pro-pulse_1.8s_ease-out_infinite]" />
          </span>
          {needsYouCount > 0
            ? `Sua Doopla está ativa, com ${needsYouCount} conversa${needsYouCount > 1 ? 's' : ''} esperando por você`
            : 'Sua Doopla está ativa, trabalhando por você'}
        </div>
      </div>
      <div className="flex-none self-center">
        <ProMascot />
      </div>
      <style>{`
        @keyframes pro-pulse { 0% { transform: scale(.6); opacity: .6; } 100% { transform: scale(2.2); opacity: 0; } }
      `}</style>
    </div>
  );
}

function StatCard({ tone, icon, num, label }: { tone: 'red' | 'amber' | 'green' | 'off'; icon: React.ReactNode; num: number | string; label: string }) {
  const toneClass = {
    red: 'bg-[rgba(226,41,28,.15)] text-[var(--pro-red)]',
    amber: 'bg-[rgba(245,166,35,.15)] text-[var(--pro-amber)]',
    green: 'bg-[rgba(62,207,110,.15)] text-[var(--pro-green)]',
    off: 'bg-[rgba(251,249,242,.1)] text-[var(--pro-off)]',
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-4 backdrop-blur-xl">
      <div className={`flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full ${toneClass}`}>{icon}</div>
      <div className="min-w-0">
        <p className="font-pro-display text-[21px] leading-none">{num}</p>
        <p className="mt-[3px] text-[11.5px] leading-tight text-[var(--pro-tx-50)]">{label}</p>
      </div>
    </div>
  );
}

function StatsRow({ needsYou, waitingClient, confirmed, completed }: { needsYou: number; waitingClient: number; confirmed: number; completed: number }) {
  const ic = { viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.8, width: 17, height: 17 } as const;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard
        tone="red"
        num={needsYou}
        label="Precisa de você"
        icon={
          <svg {...ic} stroke="currentColor">
            <path d="M4 5h16v11H8l-4 4z" />
          </svg>
        }
      />
      <StatCard
        tone="amber"
        num={waitingClient}
        label="Aguardando cliente"
        icon={
          <svg {...ic} stroke="currentColor">
            <path d="M6 2h12M6 22h12M8 2c0 5 8 5 8 10s-8 5-8 10M16 2c0 5-8 5-8 10s8 5 8 10" />
          </svg>
        }
      />
      <StatCard
        tone="green"
        num={confirmed}
        label="Bookings confirmados"
        icon={
          <svg {...ic} stroke="currentColor">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        }
      />
      <StatCard
        tone="off"
        num={completed}
        label="Bookings concluídos"
        icon={
          <svg {...ic} stroke="currentColor">
            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7H14a3.5 3.5 0 1 1 0 7H6" />
          </svg>
        }
      />
    </div>
  );
}

// Bloco 4 — nudge progressivo de prontidão (08/09/2026). Ressalva de
// UX do usuário: nunca um banner genérico/persistente — mesma
// linguagem visual já usada em BookingChannelsCard (linha com
// label/valor + CTA quando falta algo, borda entre linhas, nunca uma
// caixa de alerta nova). Progressivo e nunca bloqueante: cada pendência
// é sua própria linha, desaparece sozinha quando resolvida (nunca pede
// de novo o que já foi dado); card inteiro não renderiza nada (nem
// título) quando as duas já estão resolvidas — zero ruído visual no
// estado "tudo completo". Dados de recebimento aponta pra
// /dashboard/perfil/recebimento (superfície real de Settings V2);
// contexto comercial aponta pro mesmo modal "Preferências de matching"
// já linkado em Preferências da Doopla (#preferencias-matching) —
// nenhuma superfície nova, nenhum campo novo.
function ReadinessCard({
  paymentReady,
  matchingCompletion,
}: {
  paymentReady: boolean;
  matchingCompletion: { filled: number; total: number };
}) {
  const matchingComplete = matchingCompletion.total === 0 || matchingCompletion.filled >= matchingCompletion.total;
  if (paymentReady && matchingComplete) return null;

  return (
    <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-[18px] backdrop-blur-xl">
      <p className="font-pro-sub mb-1 text-[13.5px] font-bold">Deixe sua Doopla pronta</p>
      {!paymentReady && (
        <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] text-[var(--pro-tx-50)]">Dados de recebimento</p>
            <p className="text-[12px] text-[var(--pro-tx-70)]">Sem isso, a Doopla não consegue fechar pagamento com o cliente.</p>
          </div>
          <Link href="/dashboard/perfil/recebimento" className="flex-none text-[11.5px] font-bold text-[var(--pro-red)] hover:underline">
            Completar →
          </Link>
        </div>
      )}
      {!matchingComplete && (
        <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] text-[var(--pro-tx-50)]">
              Contexto profissional · {matchingCompletion.filled}/{matchingCompletion.total}
            </p>
            <p className="text-[12px] text-[var(--pro-tx-70)]">Ajuda a Doopla te representar melhor nas conversas.</p>
          </div>
          <Link
            href="/dashboard/perfil/editar#preferencias-matching"
            className="flex-none text-[11.5px] font-bold text-[var(--pro-red)] hover:underline"
          >
            Completar →
          </Link>
        </div>
      )}
    </div>
  );
}

function BookingChannelsCard({
  orcamentoUrl,
  whatsappNumber,
  professionalSlug,
}: {
  orcamentoUrl: string | null;
  whatsappNumber: string | null;
  professionalSlug: string | null;
}) {
  return (
    <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-[18px] backdrop-blur-xl">
      <p className="font-pro-sub mb-3 text-[13.5px] font-bold">Seus canais de booking</p>
      {orcamentoUrl ? (
        <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5 first:border-t-0">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] text-[var(--pro-tx-50)]">Seu link de orçamento</p>
            <p className="font-doopla-mono truncate text-[12px]">{orcamentoUrl.replace(/^https?:\/\//, '')}</p>
          </div>
          <ProCopyButton value={orcamentoUrl} label="Link copiado." />
        </div>
      ) : (
        <p className="border-t border-[var(--pro-line)] py-2.5 text-[12px] text-[var(--pro-tx-50)] first:border-t-0">
          Seu link de orçamento ainda não está ativo.{' '}
          <Link href="/dashboard/perfil" className="text-[var(--pro-red)] hover:underline">
            Ativar
          </Link>
        </p>
      )}
      {/* Correção 06/09/2026 — "WhatsApp da Doopla" é um CANAL, não um
         dado condicional: a ausência de NEXT_PUBLIC_WHATSAPP_NUMBER
         (número oficial ainda em análise no WhatsApp/Meta) é um
         estado esperado, nunca motivo pra esconder a linha inteira.
         "Dado/canal inexistente no momento" ≠ "esconder a feature". */}
      <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] text-[var(--pro-tx-50)]">WhatsApp da Doopla</p>
          {whatsappNumber ? (
            <p className="font-doopla-mono truncate text-[12px]">{whatsappNumber}</p>
          ) : (
            <p className="font-doopla-mono truncate text-[12px] text-[var(--pro-tx-30)]">Em configuração</p>
          )}
        </div>
      </div>
      {professionalSlug ? (
        <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] text-[var(--pro-tx-50)]">Seu código ID</p>
            <p className="font-doopla-mono truncate text-[12px]">{professionalSlug}</p>
          </div>
          <ProCopyButton value={professionalSlug} label="Código copiado." />
        </div>
      ) : (
        <p className="border-t border-[var(--pro-line)] py-2.5 text-[12px] text-[var(--pro-tx-50)]">
          Seu código ID ainda não está disponível.
        </p>
      )}
    </div>
  );
}

function ReferralCard({ referralTotal, referralQualifiedCents }: { referralTotal: number; referralQualifiedCents: number }) {
  return (
    <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-[18px] text-center backdrop-blur-xl">
      <p className="font-pro-sub mb-2 text-left text-[13.5px] font-bold">Indique e ganhe</p>
      <div
        className="mx-auto mb-2.5 flex h-16 w-16 items-center justify-center rounded-full font-pro-display text-[20px] text-[var(--pro-black)]"
        style={{ background: 'radial-gradient(circle at 40% 35%, #4ee27a, var(--pro-green) 65%)', boxShadow: '0 0 30px rgba(62,207,110,.5)' }}
      >
        $
      </div>
      <p className="font-pro-display text-[22px] text-[var(--pro-green)]">{formatCentsAsBRL(referralQualifiedCents)}</p>
      <p className="mb-3 text-[11px] text-[var(--pro-tx-50)]">
        {referralTotal > 0
          ? `${referralTotal} indicação${referralTotal > 1 ? 'ões' : ''} registrada${referralTotal > 1 ? 's' : ''}`
          : 'Nenhuma indicação ainda'}
      </p>
      <ProReferralGainsButton />
    </div>
  );
}

function TalkToDooplaCard({ whatsappNumber, whatsappIdentityStatus }: { whatsappNumber: string | null; whatsappIdentityStatus: string | null }) {
  const talkUrl = whatsappNumber ? buildTalkToYourDooplaUrl(whatsappNumber) : null;
  const isWhatsappVerified = whatsappIdentityStatus === 'verified';

  return (
    <div className="rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-[18px] backdrop-blur-xl">
      <div className="mb-4 flex items-center gap-3">
        <div
          className="flex h-11 w-11 flex-none items-center justify-center gap-1.5 rounded-full"
          style={{ background: 'radial-gradient(circle at 38% 32%, #ff4a38, var(--pro-red) 60%)', boxShadow: '0 0 24px var(--pro-red-glow)' }}
        >
          {[0, 1].map((i) => (
            <span key={i} className="relative flex h-[9px] w-[9px] items-center justify-center rounded-full bg-[var(--pro-black)]">
              <span className="h-[4px] w-[4px] rounded-full bg-[var(--pro-off)]" />
            </span>
          ))}
        </div>
        <div className="min-w-0">
          <p className="font-pro-sub text-[13.5px] font-bold">Falar com minha Doopla</p>
          <p className="text-[11.5px] text-[var(--pro-tx-50)]">Pergunte algo ou peça uma ação</p>
        </div>
      </div>
      {/* Item 5 da rodada de correção/consistência (06/09/2026) — 3
         estados nunca confundidos: (i) canal + identidade OK -> CTA
         ativa só; (ii) canal existe mas WhatsApp do profissional
         ainda não verificado -> CTA continua ativa (a mensagem chega
         de qualquer forma), mas com aviso explícito + link real pro
         fluxo de verificação (OTP/WhatsApp Identity, já existente em
         Configurações — nunca um atalho novo que ignore essa
         verificação); (iii) sem talkUrl (NEXT_PUBLIC_WHATSAPP_NUMBER
         ausente) -> estado indisponível honesto, nunca um número
         fake nem um link quebrado. */}
      {talkUrl && !isWhatsappVerified && (
        <p className="mb-3 text-[11px] leading-snug text-[var(--pro-tx-50)]">
          Seu WhatsApp ainda não está verificado — a Doopla pode não te reconhecer automaticamente nessa conversa.{' '}
          <Link href="/dashboard/perfil" className="text-[var(--pro-red)] hover:underline">
            Verificar meu WhatsApp →
          </Link>
        </p>
      )}
      {talkUrl ? (
        <a
          href={talkUrl}
          target="_blank"
          rel="noreferrer"
          className="flex w-full items-center justify-center gap-2.5 rounded-full py-3.5 text-[13.5px] font-bold text-white shadow-[0_0_22px_rgba(37,211,102,.4)]"
          style={{ background: 'var(--pro-whatsapp)' }}
        >
          <WhatsAppLogoIcon />
          Falar no WhatsApp
        </a>
      ) : (
        <p className="text-[11.5px] text-[var(--pro-tx-30)]">Canal da Doopla indisponível no momento.</p>
      )}
    </div>
  );
}

// Ícone oficial do WhatsApp (mesmo path do App, mobile/src/components/icons/Icons.tsx#WhatsAppLogoIcon)
// — mesma identidade visual nas duas plataformas, nunca um ícone genérico.
function WhatsAppLogoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 14.4c-.3-.1-1.7-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.1-.1.2-.3.2-.4.1-.2 0-.4 0-.5-.1-.1-.7-1.6-.9-2.2-.2-.5-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.1.2 2.1 3.3 5.2 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3z" />
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 20.2 12 8.2 8.2 0 0 1 12 20.2z" />
    </svg>
  );
}

// Booker foi removido de "Seus canais de booking" (correção
// 06/09/2026) — Booker não é canal de booking (cliente não chega até
// o profissional através de um Booker), é relação de equipe. Status/
// gerenciamento de Booker vive só em "Minha equipe", nunca duplicado
// aqui.
