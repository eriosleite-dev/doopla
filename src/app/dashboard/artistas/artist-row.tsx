import Link from 'next/link';

import type { ArtistCard, ArtistRelationshipCard } from '../data';
import { FavoriteButton } from '../favorite-button';
import { TerminateRelationshipButton } from '../terminate-relationship-button';
import { avatarClass, initialsFromName } from '../ui';
import { RequestRepresentationButton } from './request-button';
import type { RepresentationRequestStatus } from '@/lib/supabase/types';

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

export function ArtistRow({
  artist,
  requestStatus,
  isFavorited = false,
}: {
  artist: ArtistCard | ArtistRelationshipCard;
  requestStatus?: RepresentationRequestStatus | null;
  isFavorited?: boolean;
}) {
  const relationship = 'relationshipSince' in artist ? artist : null;
  const name = artist.stageName || artist.fullName;
  const location = [artist.city, artist.state].filter(Boolean).join(' · ');
  const tags = (artist.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/dashboard/artistas/${artist.profileId}`}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <span className={avatarClass}>{initialsFromName(name)}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-[12px] text-[var(--ink)]/55">
              {[artist.category, location].filter(Boolean).join(' · ') || 'Artista na doopla'}
            </p>
          </div>
        </Link>
        <FavoriteButton
          targetId={artist.profileId}
          initialFavorited={isFavorited}
          className="flex-none text-[var(--ink)]/30 hover:text-[var(--accent-ink)]"
        />
      </div>
      {artist.ratingCount > 0 ? (
        <p className="font-doopla-mono text-[11.5px] text-[var(--accent-ink)]">
          ★ {artist.ratingAverage?.toFixed(1)} · {artist.ratingCount}{' '}
          {artist.ratingCount === 1 ? 'avaliação' : 'avaliações'}
        </p>
      ) : (
        <p className="text-[11.5px] italic text-[var(--ink)]/45">
          Novo na doopla. Ainda construindo o histórico na plataforma.
        </p>
      )}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-2 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--musgo)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {relationship && (
        <p className="text-[12px] text-[var(--ink)]/55">
          Juntos desde {formatSince(relationship.relationshipSince)} ·{' '}
          {relationship.ongoingCount > 0
            ? `${relationship.ongoingCount} ${relationship.ongoingCount === 1 ? 'trabalho em andamento' : 'trabalhos em andamento'}`
            : 'nenhum trabalho em andamento agora'}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-[var(--line-light)] pt-3">
        <Link
          href={`/dashboard/artistas/${artist.profileId}`}
          className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
        >
          {relationship ? 'Gerenciar relação →' : 'Ver perfil →'}
        </Link>
        {requestStatus !== undefined && (
          <RequestRepresentationButton artistProfileId={artist.profileId} status={requestStatus} />
        )}
        {relationship && (
          <TerminateRelationshipButton
            representationId={relationship.representationId}
            targetName={name}
          />
        )}
      </div>
    </div>
  );
}
