import Link from 'next/link';

import type { ArtistCard } from '../data';
import { avatarClass, initialsFromName } from '../ui';
import { RequestRepresentationButton } from './request-button';
import type { RepresentationRequestStatus } from '@/lib/supabase/types';

export function ArtistRow({
  artist,
  requestStatus,
}: {
  artist: ArtistCard;
  requestStatus?: RepresentationRequestStatus | null;
}) {
  const name = artist.stageName || artist.fullName;
  const location = [artist.city, artist.state].filter(Boolean).join(' · ');
  const tags = (artist.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-3 rounded-[18px] bg-white p-5">
      <Link href={`/dashboard/artistas/${artist.profileId}`} className="flex items-center gap-3">
        <span className={avatarClass}>{initialsFromName(name)}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-[12px] text-[var(--ink)]/55">
            {[artist.category, location].filter(Boolean).join(' · ') || 'Artista na doopla'}
          </p>
        </div>
      </Link>
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
      <div className="flex items-center justify-between gap-2 border-t border-[var(--line-light)] pt-3">
        <Link
          href={`/dashboard/artistas/${artist.profileId}`}
          className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
        >
          Ver perfil →
        </Link>
        {requestStatus !== undefined && (
          <RequestRepresentationButton artistProfileId={artist.profileId} status={requestStatus} />
        )}
      </div>
    </div>
  );
}
