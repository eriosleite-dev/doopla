import Link from 'next/link';
import type { SupabaseClient } from '@supabase/supabase-js';

import { formatCentsAsBRL } from '@/lib/format';
import { siteOrigin } from '@/lib/site-url';
import { whatsappPublicNumber } from '@/lib/supabase/env';
import type { Profile } from '@/lib/supabase/types';
import { buildTalkToYourDooplaUrl } from '@/lib/professional-doopla-cta';
import { getMyBookerFacts } from '@/lib/professional-booker/data';

import { getOrcamentoLinkInfo, getRecentActivity, getUserBookings, getReferralSummary } from './data';
import { getCachedActionableDecisions, getCachedProfessionalHomeFacts } from './pro-home-cache';
import { ProMascot } from './pro-mascot';
import { ProReferralGainsButton } from './pro-referral-gains-button';
import { ProAccordion, ProCopyButton, formatRelativeTime, proStatusPillClass } from './pro-ui';
import { STATUS_LABELS } from './ui';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

const BOOKING_PILL_TONE: Record<string, 'red' | 'amber' | 'green'> = {
  proposta_enviada: 'red',
  aceita: 'green',
  aguardando_pagamento: 'amber',
  concluida: 'green',
  cancelada: 'amber',
  recusada: 'amber',
};

export async function ProfessionalHomeView({
  userId,
  profile,
  supabase,
}: {
  userId: string;
  profile: Profile;
  supabase: AnySupabaseClient;
}) {
  const [homeFacts, decisions, bookings] = await Promise.all([
    getCachedProfessionalHomeFacts(supabase),
    getCachedActionableDecisions(supabase),
    getUserBookings(userId, profile.role, supabase),
  ]);

  const [recentActivity, orcamentoInfo, bookerFacts, referralSummary] = await Promise.all([
    getRecentActivity(userId, profile.role, bookings, supabase),
    getOrcamentoLinkInfo(userId, supabase),
    getMyBookerFacts(supabase, userId),
    profile.referral_code ? getReferralSummary(userId, profile.referral_code, supabase) : Promise.resolve(null),
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

  return (
    <div>
      <ProHero fullName={profile.full_name} needsYouCount={homeFacts.conversationsNeedingYouCount} />

      <StatsRow
        awaiting={homeFacts.bookingsAwaitingResponseCount}
        needsYou={homeFacts.conversationsNeedingYouCount}
        confirmed={homeFacts.bookingsConfirmedCount}
        completed={homeFacts.bookingsCompletedCount}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
        <div className="min-w-0">
          <ProAccordion id="precisa-de-voce" title="Precisa de você" count={decisions.length} defaultOpen={false}>
            {decisions.length === 0 ? (
              <p className="font-pro-sub py-2 text-[14px] font-semibold text-[var(--pro-off)]">
                Tudo certo por aqui.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {decisions.map((d) => {
                  const booking = d.relatedBookingId ? bookingById.get(d.relatedBookingId) : undefined;
                  const href = d.relatedBookingId
                    ? `/dashboard/bookings/${d.relatedBookingId}/conversa/${d.conversationId}`
                    : '/dashboard/trabalhos';
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
                      <p className="font-doopla-mono mt-3 text-[10.5px] text-[var(--pro-tx-30)]">
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
            )}
          </ProAccordion>

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
                    <Link href={`/dashboard/bookings/${b.id}`} className={proStatusPillClass(BOOKING_PILL_TONE[b.status] ?? 'amber')}>
                      {STATUS_LABELS[b.status] ?? b.status}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </ProAccordion>

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

        <RightColumn
          orcamentoUrl={orcamentoUrl}
          whatsappNumber={whatsappNumber}
          whatsappIdentityStatus={homeFacts.whatsappIdentityStatus}
          referralEligible={!!referralSummary}
          referralTotal={homeFacts.referralTotalCount}
          referralQualifiedCents={referralSummary?.qualifiedTotalCents ?? 0}
          bookerActiveCount={bookerFacts.active.length}
          bookerPendingCount={bookerFacts.pending.length}
        />
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

function ProHero({ fullName, needsYouCount }: { fullName: string; needsYouCount: number }) {
  const firstName = (fullName || '').trim().split(/\s+/)[0] || 'você';
  return (
    <div className="relative mb-4 flex items-center justify-between gap-5 overflow-hidden rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-6 backdrop-blur-xl sm:p-7">
      <div className="min-w-0">
        <h1 className="font-pro-sub flex items-center gap-2 text-[24px] font-bold sm:text-[26px]">
          Oi, {firstName}
          <span className="h-[6px] w-[6px] flex-none rounded-full bg-[var(--pro-red)] shadow-[0_0_8px_var(--pro-red-glow)]" />
        </h1>
        <p className="mt-1.5 max-w-[340px] text-[13.5px] text-[var(--pro-tx-50)]">
          Sua Doopla negocia, organiza e cuida dos seus bookings.
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-[var(--pro-tx-70)]">
          <span className="relative h-2 w-2 flex-none rounded-full bg-[var(--pro-green)]">
            <span className="absolute inset-[-4px] rounded-full bg-[var(--pro-green)] opacity-50 [animation:pro-pulse_1.8s_ease-out_infinite]" />
          </span>
          {needsYouCount > 0
            ? `Sua Doopla está ativa, com ${needsYouCount} conversa${needsYouCount > 1 ? 's' : ''} esperando por você`
            : 'Sua Doopla está ativa, trabalhando por você'}
        </div>
      </div>
      <ProMascot />
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

function StatsRow({ awaiting, needsYou, confirmed, completed }: { awaiting: number; needsYou: number; confirmed: number; completed: number }) {
  const ic = { viewBox: '0 0 24 24', fill: 'none', strokeWidth: 1.8, width: 17, height: 17 } as const;
  return (
    <div className="mb-4 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
      <StatCard
        tone="red"
        num={awaiting}
        label="Aguardando sua resposta"
        icon={
          <svg {...ic} stroke="currentColor">
            <path d="M4 5h16v11H8l-4 4z" />
          </svg>
        }
      />
      <StatCard
        tone="amber"
        num={needsYou}
        label="Conversas que precisam de você"
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

function RightColumn({
  orcamentoUrl,
  whatsappNumber,
  whatsappIdentityStatus,
  referralEligible,
  referralTotal,
  referralQualifiedCents,
  bookerActiveCount,
  bookerPendingCount,
}: {
  orcamentoUrl: string | null;
  whatsappNumber: string | null;
  whatsappIdentityStatus: string | null;
  referralEligible: boolean;
  referralTotal: number;
  referralQualifiedCents: number;
  bookerActiveCount: number;
  bookerPendingCount: number;
}) {
  const talkUrl = whatsappNumber ? buildTalkToYourDooplaUrl(whatsappNumber) : null;

  return (
    <aside className="flex flex-col gap-3.5 lg:sticky lg:top-6">
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
        {whatsappNumber && (
          <div className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] text-[var(--pro-tx-50)]">WhatsApp da Doopla</p>
              <p className="font-doopla-mono truncate text-[12px]">{whatsappNumber}</p>
            </div>
          </div>
        )}
        {(bookerActiveCount > 0 || bookerPendingCount > 0) && (
          <Link
            href="/dashboard/bookers"
            className="flex items-center gap-2.5 border-t border-[var(--pro-line)] py-2.5 text-[12px] text-[var(--pro-tx-70)] hover:text-[var(--pro-off)]"
          >
            {bookerActiveCount > 0
              ? `Representado por ${bookerActiveCount} booker${bookerActiveCount > 1 ? 's' : ''}`
              : `${bookerPendingCount} convite${bookerPendingCount > 1 ? 's' : ''} de booker pendente${bookerPendingCount > 1 ? 's' : ''}`}
          </Link>
        )}
      </div>

      {referralEligible && (
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
      )}

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
        {whatsappIdentityStatus !== 'verified' && (
          <p className="mb-3 text-[11px] leading-snug text-[var(--pro-tx-50)]">
            Seu WhatsApp ainda não está verificado. A Doopla pode não te reconhecer automaticamente nessa conversa.
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
            Abrir WhatsApp
          </a>
        ) : (
          <p className="text-[11.5px] text-[var(--pro-tx-30)]">Número da Doopla indisponível no momento.</p>
        )}
      </div>
    </aside>
  );
}
