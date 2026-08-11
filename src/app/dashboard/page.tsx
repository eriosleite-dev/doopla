import type { Metadata } from 'next';
import Link from 'next/link';

import type { ReactNode } from 'react';

import { formatCentsAsBRL, formatPercent } from '@/lib/format';

import { confirmInviteAction } from './actions';
import type { BookingWithOtherParty, OpportunityWithArtist } from './data';
import {
  computeInMovementCents,
  getAttentionItems,
  getOpenOpportunitiesForBooker,
  getPendingInvites,
  getRepresentedArtists,
  getRepresentingBookers,
  getUserBookings,
} from './data';
import { getSessionProfile } from './session';
import {
  accentButtonClass,
  avatarClass,
  cardClass,
  eyebrowClass,
  initialsFromName,
  statCardLeadClass,
  STATUS_LABELS,
  statLabelLeadClass,
  statusPillClasses,
  statValueLeadClass,
} from './ui';

export const metadata: Metadata = {
  title: 'Hoje | Doopla',
};

const ACTIVE_STATUSES = ['aceita', 'aguardando_pagamento'];
const PREVIEW_LIMIT = 3;

export default async function DashboardPage() {
  const { supabase, user, profile } = await getSessionProfile();

  const bookings = await getUserBookings(user.id, profile.role, supabase);
  const attentionItems = await getAttentionItems(user.id, profile.role, bookings, supabase);
  const pendingInvites =
    profile.role === 'artista' ? await getPendingInvites(user.id, supabase) : [];
  const inMovementCents = computeInMovementCents(bookings, profile.role);
  const activeBookings = bookings
    .filter((b) => ACTIVE_STATUSES.includes(b.status))
    .slice(0, PREVIEW_LIMIT);

  const openOpportunities =
    profile.role === 'booker'
      ? (await getOpenOpportunitiesForBooker(user.id, supabase)).slice(0, PREVIEW_LIMIT)
      : [];
  const representedArtists =
    profile.role === 'booker'
      ? (await getRepresentedArtists(user.id, supabase)).slice(0, PREVIEW_LIMIT)
      : [];
  const representingBookers =
    profile.role === 'artista'
      ? (await getRepresentingBookers(user.id, supabase)).slice(0, PREVIEW_LIMIT)
      : [];

  return (
    <main className="flex flex-col gap-10">
      <header>
        <p className={eyebrowClass}>
          {profile.role === 'booker' ? 'Booker' : 'Artista'}
        </p>
        <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
          Olá, {profile.full_name || user.email}
        </h1>
      </header>

      {profile.role === 'artista' && (
        <section className={`${cardClass} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <p className={eyebrowClass}>Tenho um trabalho</p>
            <p className="mt-1 text-sm text-[var(--ink)]/70">
              {bookings.length === 0
                ? 'Publique seu primeiro trabalho em menos de um minuto.'
                : 'Já tem outro trabalho fechado ou quase fechado?'}
            </p>
          </div>
          <Link href="/dashboard/publicar" className={accentButtonClass}>
            Publicar
          </Link>
        </section>
      )}

      {profile.role === 'booker' && (
        <PreviewSection
          eyebrow="Novos trabalhos na Doopla"
          viewAllHref="/dashboard/trabalhos"
        >
          <OpportunitiesPreview opportunities={openOpportunities} />
        </PreviewSection>
      )}

      <section className={cardClass}>
        <p className={eyebrowClass}>Precisa de você</p>
        {attentionItems.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--ink)]/55">
            Nada pedindo sua atenção agora.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {attentionItems.map((item, i) => (
              <li key={i}>
                <a
                  href={item.href}
                  className="block text-sm text-[var(--ink)] underline decoration-[var(--accent)] decoration-2 underline-offset-4 hover:text-[var(--accent-ink)]"
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingInvites.length > 0 && (
        <section className={cardClass}>
          <p className={eyebrowClass}>Convites pendentes</p>
          <ul className="mt-4 flex flex-col gap-3">
            {pendingInvites.map((invite) => (
              <li
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <span className="flex items-center gap-3 text-sm">
                  <span className={avatarClass}>
                    {initialsFromName(invite.inviterName)}
                  </span>
                  <span>
                    <strong>{invite.inviterName}</strong> convidou você para
                    trabalhar junto na doopla.
                  </span>
                </span>
                <form action={confirmInviteAction}>
                  <input type="hidden" name="inviteId" value={invite.id} />
                  <button type="submit" className={accentButtonClass}>
                    Confirmar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {profile.role === 'artista' && (
        <PreviewSection eyebrow="Propostas recebidas" viewAllHref="/dashboard/trabalhos">
          <BookingsPreview
            bookings={bookings.filter(
              (b) => b.status === 'proposta_enviada' && b.proposed_by !== 'artista'
            )}
            emptyText="Nenhuma proposta de booker ainda."
          />
        </PreviewSection>
      )}

      <PreviewSection
        eyebrow={profile.role === 'booker' ? 'Trabalhos ativos' : 'Trabalhos em andamento'}
        viewAllHref="/dashboard/trabalhos"
      >
        <BookingsPreview
          bookings={activeBookings}
          emptyText={
            profile.role === 'booker'
              ? 'Nenhum trabalho ativo ainda.'
              : 'Nenhum trabalho em andamento ainda.'
          }
        />
      </PreviewSection>

      <section className={`${statCardLeadClass} max-w-sm`}>
        <p className={statLabelLeadClass}>
          {profile.role === 'booker' ? 'Comissões em movimento' : 'Dinheiro em movimento'}
        </p>
        <p className={statValueLeadClass}>{formatCentsAsBRL(inMovementCents)}</p>
        <p className="mt-2 text-[12.5px] text-[var(--paper)]/60">
          Em trabalhos ainda não concluídos
        </p>
      </section>

      {profile.role === 'booker' ? (
        <PreviewSection eyebrow="Artistas com quem trabalho" viewAllHref="/dashboard/artistas">
          <PartiesPreview
            parties={representedArtists}
            emptyText="Você ainda não representa nenhum artista."
          />
        </PreviewSection>
      ) : (
        <PreviewSection eyebrow="Quem trabalha comigo" viewAllHref="/dashboard/minha-equipe">
          <PartiesPreview
            parties={representingBookers}
            emptyText="Nenhum booker te representa ainda."
          />
        </PreviewSection>
      )}
    </main>
  );
}

function PreviewSection({
  eyebrow,
  viewAllHref,
  children,
}: {
  eyebrow: string;
  viewAllHref: string;
  children: ReactNode;
}) {
  return (
    <section className={cardClass}>
      <div className="flex items-center justify-between gap-4">
        <p className={eyebrowClass}>{eyebrow}</p>
        <Link
          href={viewAllHref}
          className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
        >
          Ver todos
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BookingsPreview({
  bookings,
  emptyText,
}: {
  bookings: BookingWithOtherParty[];
  emptyText: string;
}) {
  if (bookings.length === 0) {
    return <p className="text-sm text-[var(--ink)]/55">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {bookings.map((booking) => (
        <li key={booking.id}>
          <Link
            href={`/dashboard/bookings/${booking.id}`}
            className="flex items-center gap-3 rounded-xl p-2 transition-opacity hover:opacity-80"
          >
            <span className={avatarClass}>{initialsFromName(booking.otherPartyName)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {booking.otherPartyName}
              </span>
              <span className="block truncate text-[12.5px] text-[var(--ink)]/55">
                {formatPercent(booking.commission_percent)} de comissão
              </span>
            </span>
            <span className={statusPillClasses[booking.status]}>
              {STATUS_LABELS[booking.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function OpportunitiesPreview({
  opportunities,
}: {
  opportunities: OpportunityWithArtist[];
}) {
  if (opportunities.length === 0) {
    return (
      <p className="text-sm text-[var(--ink)]/55">Nenhum trabalho novo no momento.</p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {opportunities.map((opp) => (
        <li key={opp.id} className="flex items-center gap-3 rounded-xl p-2">
          <span className={avatarClass}>{initialsFromName(opp.artistName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{opp.artistName}</span>
            <span className="block truncate text-[12.5px] text-[var(--ink)]/55">
              {opp.description}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function PartiesPreview({
  parties,
  emptyText,
}: {
  parties: { id: string; full_name: string }[];
  emptyText: string;
}) {
  if (parties.length === 0) {
    return <p className="text-sm text-[var(--ink)]/55">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {parties.map((party) => (
        <li key={party.id} className="flex items-center gap-3 rounded-xl p-2">
          <span className={avatarClass}>{initialsFromName(party.full_name)}</span>
          <span className="text-sm font-medium">{party.full_name}</span>
        </li>
      ))}
    </ul>
  );
}
