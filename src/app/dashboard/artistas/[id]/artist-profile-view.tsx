import { notFound, redirect } from 'next/navigation';

import { getRecentReviews, getRepresentationRequestStatus, getReviewSummary } from '../../data';
import { FavoriteButton } from '../../favorite-button';
import { getSessionProfile } from '../../session';
import { labelForAttribute } from '../../review-attributes';
import { avatarClass, eyebrowClass, initialsFromName } from '../../ui';
import { RequestRepresentationButton } from '../request-button';
import type { Profile, ArtistProfile } from '@/lib/supabase/types';

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

export async function ArtistProfileView({ id }: { id: string }) {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'booker') redirect('/dashboard');

  const [{ data: artistProfile }, { data: artist }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).eq('role', 'artista').maybeSingle<Profile>(),
    supabase.from('artist_profiles').select('*').eq('profile_id', id).maybeSingle<ArtistProfile>(),
  ]);
  if (!artistProfile) notFound();

  const [requestStatus, rating, recentReviews, { data: alreadyRepresents }, { data: favorite }] =
    await Promise.all([
      getRepresentationRequestStatus(user.id, id, supabase),
      getReviewSummary(id, supabase),
      getRecentReviews(id, supabase),
      supabase
        .from('representations')
        .select('id')
        .eq('artist_profile_id', id)
        .eq('booker_profile_id', user.id)
        .maybeSingle<{ id: string }>(),
      supabase
        .from('favorites')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('favorited_user_id', id)
        .maybeSingle<{ user_id: string }>(),
    ]);

  const name = artist?.stage_name || artistProfile.full_name;
  const location = [artistProfile.city, artistProfile.state].filter(Boolean).join(', ');
  const tags = (artist?.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const socialLinks = [
    artist?.instagram_url && { label: 'Instagram', href: artist.instagram_url },
    artist?.portfolio_url && { label: 'Portfólio', href: artist.portfolio_url },
    artist?.website_url && { label: 'Site', href: artist.website_url },
  ].filter((l): l is { label: string; href: string } => Boolean(l));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-5 rounded-t-[24px] bg-[var(--ink)] p-7 text-[var(--paper)] sm:rounded-l-[24px] sm:rounded-tr-none">
        {artistProfile.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={artistProfile.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className={`${avatarClass} h-20 w-20 bg-white/10 text-xl`}>{initialsFromName(name)}</span>
        )}

        {/* Selos (Identidade verificada) entram aqui quando existir um
           critério real por trás — ver DECISOES.md. */}

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-doopla-display text-2xl font-semibold">{name}</h1>
            <FavoriteButton
              targetId={id}
              initialFavorited={Boolean(favorite)}
              className="mt-1 flex-none text-[var(--paper)]/40 hover:text-[var(--paper)]"
            />
          </div>
          <p className="mt-2 text-[12px] text-[var(--paper)]/55">
            {location}
            {location && <br />}
            Na doopla desde <strong className="text-[var(--paper)]/85">{formatSince(artistProfile.created_at)}</strong>
          </p>
        </div>

        {(artist?.category || tags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {artist?.category && (
              <span className="font-doopla-mono rounded-full border border-white/20 px-2.5 py-1 text-[10px] text-[var(--paper)]/80">
                {artist.category}
              </span>
            )}
            {tags.map((tag) => (
              <span
                key={tag}
                className="font-doopla-mono rounded-full border border-white/20 px-2.5 py-1 text-[10px] text-[var(--paper)]/80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {socialLinks.length > 0 && (
          <div className="flex gap-2">
            {socialLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                title={link.label}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-[11px] text-[var(--paper)]/75 hover:border-white/40"
              >
                {link.label[0]}
              </a>
            ))}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-2 border-t border-white/10 pt-5">
          {alreadyRepresents ? (
            <span className="font-doopla-mono rounded-full bg-[var(--musgo)]/20 px-4 py-2.5 text-center text-[11px] uppercase tracking-[.05em] text-[#a8c49a]">
              Você já representa este artista ✓
            </span>
          ) : (
            <RequestRepresentationButton artistProfileId={id} status={requestStatus?.status ?? null} />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-6 p-7">
        {rating.count > 0 && (
          <div className="flex gap-6 border-b border-[var(--line-light)] pb-5">
            <div>
              <p className="font-doopla-display text-2xl font-semibold">
                {rating.average?.toFixed(1)}
                <span className="font-doopla-sans text-xs font-normal text-[var(--ink)]/50"> / 5</span>
              </p>
              <p className={`${eyebrowClass} mt-1`}>Avaliação</p>
            </div>
            <div>
              <p className="font-doopla-display text-2xl font-semibold">{rating.count}</p>
              <p className={`${eyebrowClass} mt-1`}>{rating.count === 1 ? 'Avaliação' : 'Avaliações'}</p>
            </div>
          </div>
        )}

        {artist?.bio && (
          <div>
            <p className={eyebrowClass}>Sobre</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink)]/80">{artist.bio}</p>
          </div>
        )}

        {rating.attributeCounts.length > 0 && (
          <div>
            <p className={eyebrowClass}>O que os bookers destacam</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rating.attributeCounts.map((a) => (
                <span
                  key={a.key}
                  className="rounded-[12px] bg-[var(--paper-dim)] px-3 py-2.5 text-[11.5px] font-medium leading-tight"
                >
                  {labelForAttribute('artista', a.key)}
                  <span className="font-doopla-mono mt-0.5 block text-[9.5px] text-[var(--ink)]/50">
                    {a.count} {a.count === 1 ? 'marcou' : 'marcaram'}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {recentReviews.length > 0 && (
          <div>
            <p className={eyebrowClass}>Avaliações de bookers</p>
            <div className="mt-3 flex flex-col gap-2.5">
              {recentReviews.map((r) => (
                <div key={r.id} className="rounded-[14px] bg-[var(--paper-dim)] p-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[12.5px] font-medium">{r.reviewerName}</span>
                    <span className="text-[10.5px] text-[var(--ink)]/45">
                      {new Date(r.submittedAt).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--ink)]/75">{r.comment}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
