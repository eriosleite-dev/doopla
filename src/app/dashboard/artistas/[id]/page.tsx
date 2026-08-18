import { notFound, redirect } from 'next/navigation';

import { getRepresentationRequestStatus, getReviewSummary } from '../../data';
import { getSessionProfile } from '../../session';
import { avatarClass, eyebrowClass, initialsFromName } from '../../ui';
import { labelForAttribute } from '../../review-attributes';
import { RequestRepresentationButton } from '../request-button';
import type { Profile, ArtistProfile } from '@/lib/supabase/types';

export default async function ArtistProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const [{ data: artistProfile }, { data: artist }] = await Promise.all([
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .eq('role', 'artista')
      .maybeSingle<Profile>(),
    supabase.from('artist_profiles').select('*').eq('profile_id', id).maybeSingle<ArtistProfile>(),
  ]);
  if (!artistProfile) notFound();

  const [requestStatus, rating, { data: alreadyRepresents }] = await Promise.all([
    getRepresentationRequestStatus(user.id, id, supabase),
    getReviewSummary(id, supabase),
    supabase
      .from('representations')
      .select('id')
      .eq('artist_profile_id', id)
      .eq('booker_profile_id', user.id)
      .maybeSingle<{ id: string }>(),
  ]);

  const name = artist?.stage_name || artistProfile.full_name;
  const location = [artistProfile.city, artistProfile.state].filter(Boolean).join(' · ');
  const tags = (artist?.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        {artistProfile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artistProfile.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className={`${avatarClass} h-16 w-16 text-xl`}>{initialsFromName(name)}</span>
        )}
        <div>
          <p className={eyebrowClass}>{[artist?.category, location].filter(Boolean).join(' · ')}</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">{name}</h1>
          <p className="font-doopla-mono mt-1 text-[12px] text-[var(--accent-ink)]">
            {rating.count > 0
              ? `★ ${rating.average?.toFixed(1)} · ${rating.count} ${rating.count === 1 ? 'avaliação' : 'avaliações'}`
              : 'Novo na doopla. Ainda construindo o histórico na plataforma.'}
          </p>
        </div>
      </header>

      <div className="rounded-[18px] bg-white p-6">
        {alreadyRepresents ? (
          <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--musgo)]">
            Você já representa este artista ✓
          </span>
        ) : (
          <RequestRepresentationButton artistProfileId={id} status={requestStatus?.status ?? null} />
        )}
      </div>

      {artist?.bio && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>Sobre</p>
          <p className="mt-2 text-sm text-[var(--ink)]/75">{artist.bio}</p>
        </section>
      )}

      {tags.length > 0 && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>Mercados</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-[.04em] text-[var(--musgo)]"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {(artist?.instagram_url || artist?.portfolio_url) && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>Links</p>
          <div className="mt-3 flex gap-4">
            {artist?.instagram_url && (
              <a
                href={artist.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-doopla-mono text-[12px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
              >
                Instagram
              </a>
            )}
            {artist?.portfolio_url && (
              <a
                href={artist.portfolio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-doopla-mono text-[12px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
              >
                Portfólio
              </a>
            )}
          </div>
        </section>
      )}

      {rating.attributeCounts.length > 0 && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>O que os bookers destacam</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rating.attributeCounts.map((a) => (
              <span
                key={a.key}
                className="font-doopla-mono rounded-full bg-[var(--paper-dim)] px-3 py-2 text-[10.5px] uppercase tracking-[.03em] text-[var(--ink)]/70"
              >
                {a.count} · {labelForAttribute('artista', a.key)}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
