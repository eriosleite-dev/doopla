import { notFound, redirect } from 'next/navigation';

import { getRecentReviews, getReviewSummary } from '../../data';
import { FavoriteButton } from '../../favorite-button';
import { getSessionProfile } from '../../session';
import { labelForAttribute } from '../../review-attributes';
import { avatarClass, eyebrowClass, initialsFromName } from '../../ui';
import type { Profile, BookerProfile } from '@/lib/supabase/types';

function formatSince(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });
}

export async function BookerProfileView({ id }: { id: string }) {
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const [{ data: bookerAccount }, { data: booker }] = await Promise.all([
    // booker_profile_id em representations pode ser um booker OU uma
    // agência (role distinta desde o cadastro) — filtrar só por
    // role='booker' derrubava a abertura do perfil de quem tinha uma
    // agência na rede.
    supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .in('role', ['booker', 'agencia'])
      .maybeSingle<Profile>(),
    supabase.from('booker_profiles').select('*').eq('profile_id', id).maybeSingle<BookerProfile>(),
  ]);
  if (!bookerAccount) notFound();

  const [rating, recentReviews, { data: representation }, { data: favorite }] = await Promise.all([
    getReviewSummary(id, supabase),
    getRecentReviews(id, supabase),
    supabase
      .from('representations')
      .select('id')
      .eq('artist_profile_id', user.id)
      .eq('booker_profile_id', id)
      .maybeSingle<{ id: string }>(),
    supabase
      .from('favorites')
      .select('user_id')
      .eq('user_id', user.id)
      .eq('favorited_user_id', id)
      .maybeSingle<{ user_id: string }>(),
  ]);

  const location = [bookerAccount.city, bookerAccount.state].filter(Boolean).join(', ');
  const tags = (booker?.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const socialLinks = [
    booker?.instagram_url && { label: 'Instagram', href: booker.instagram_url },
    booker?.website_url && { label: 'Site', href: booker.website_url },
  ].filter((l): l is { label: string; href: string } => Boolean(l));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-[260px_1fr]">
      <div className="flex flex-col gap-5 rounded-t-[24px] bg-[var(--ink)] p-7 text-[var(--paper)] sm:rounded-l-[24px] sm:rounded-tr-none">
        {bookerAccount.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bookerAccount.avatar_url} alt="" className="h-20 w-20 rounded-full object-cover" />
        ) : (
          <span className={`${avatarClass} h-20 w-20 bg-white/10 text-xl`}>
            {initialsFromName(bookerAccount.full_name)}
          </span>
        )}

        {/* Selos (Identidade verificada / Booker Doopla Oficial) entram aqui
           quando existir um critério real por trás — ver DECISOES.md. */}

        <div>
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-doopla-display text-2xl font-semibold">{bookerAccount.full_name}</h1>
            <FavoriteButton
              targetId={id}
              initialFavorited={Boolean(favorite)}
              className="mt-1 flex-none text-[var(--paper)]/40 hover:text-[var(--paper)]"
            />
          </div>
          <p className="mt-2 text-[12px] text-[var(--paper)]/55">
            {location}
            {location && <br />}
            Na doopla desde <strong className="text-[var(--paper)]/85">{formatSince(bookerAccount.created_at)}</strong>
          </p>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
          {representation ? (
            <span className="font-doopla-mono rounded-full bg-[var(--musgo)]/20 px-4 py-2.5 text-center text-[11px] uppercase tracking-[.05em] text-[#a8c49a]">
              Já trabalha com você ✓
            </span>
          ) : (
            <p className="text-[12px] text-[var(--paper)]/55">
              Vocês ainda não têm uma relação de representação registrada na doopla.
            </p>
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

        {booker?.bio && (
          <div>
            <p className={eyebrowClass}>Sobre</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink)]/80">{booker.bio}</p>
            {booker.commission_range && (
              <p className="mt-3 text-[12.5px] text-[var(--ink)]/60">
                Comissão praticada: <strong className="text-[var(--ink)]">{booker.commission_range}</strong>
              </p>
            )}
          </div>
        )}

        {rating.attributeCounts.length > 0 && (
          <div>
            <p className={eyebrowClass}>O que os artistas destacam</p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {rating.attributeCounts.map((a) => (
                <span
                  key={a.key}
                  className="rounded-[12px] bg-[var(--paper-dim)] px-3 py-2.5 text-[11.5px] font-medium leading-tight"
                >
                  {labelForAttribute('booker', a.key)}
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
            <p className={eyebrowClass}>Avaliações de artistas</p>
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
