import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';

type PublicArtist = {
  id: string;
  full_name: string;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  stage_name: string | null;
  bio: string | null;
  category: string | null;
  mercados: string | null;
  instagram_url: string | null;
  portfolio_url: string | null;
};

async function getPublicArtist(slug: string): Promise<PublicArtist | null> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, city, state, avatar_url')
    .eq('slug', slug)
    .single<{
      id: string;
      full_name: string;
      city: string | null;
      state: string | null;
      avatar_url: string | null;
    }>();
  if (!profile) return null;

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('stage_name, bio, category, mercados, public_enabled, instagram_url, portfolio_url')
    .eq('profile_id', profile.id)
    .eq('public_enabled', true)
    .maybeSingle<{
      stage_name: string | null;
      bio: string | null;
      category: string | null;
      mercados: string | null;
      public_enabled: boolean;
      instagram_url: string | null;
      portfolio_url: string | null;
    }>();
  if (!artist) return null;

  return {
    id: profile.id,
    full_name: profile.full_name,
    city: profile.city,
    state: profile.state,
    avatar_url: profile.avatar_url,
    stage_name: artist.stage_name,
    bio: artist.bio,
    category: artist.category,
    mercados: artist.mercados,
    instagram_url: artist.instagram_url,
    portfolio_url: artist.portfolio_url,
  };
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const artist = await getPublicArtist(slug);
  const name = artist?.stage_name || artist?.full_name;
  return { title: name ? `${name} | doopla` : 'doopla' };
}

export default async function PublicArtistPage(props: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await props.params;
  const artist = await getPublicArtist(slug);
  if (!artist) notFound();

  const name = artist.stage_name || artist.full_name;
  const location = [artist.city, artist.state].filter(Boolean).join(' · ');
  const tags = (artist.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--paper)] px-6 py-16 font-doopla-sans text-[var(--ink)] sm:py-24">
      <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
        {artist.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={artist.avatar_url}
            alt={name}
            className="h-28 w-28 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[var(--ink)] font-doopla-display text-3xl font-semibold text-[var(--accent)]">
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}

        <div>
          <h1 className="font-doopla-display text-4xl font-semibold">{name}</h1>
          <p className="font-doopla-mono mt-2 text-[12px] uppercase tracking-[.1em] text-[var(--accent-ink)]">
            {[artist.category, location].filter(Boolean).join(' · ')}
          </p>
        </div>

        {artist.bio && (
          <p className="max-w-md text-[15px] leading-relaxed text-[var(--ink)]/75">{artist.bio}</p>
        )}

        {tags.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {tags.map((tag) => (
              <span
                key={tag}
                className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-3 py-1.5 text-[10.5px] uppercase tracking-[.04em] text-[var(--musgo)]"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {(artist.instagram_url || artist.portfolio_url) && (
          <div className="flex gap-4">
            {artist.instagram_url && (
              <a
                href={artist.instagram_url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-doopla-mono text-[12px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline"
              >
                Instagram
              </a>
            )}
            {artist.portfolio_url && (
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
        )}

        <p className="font-doopla-display mt-4 text-lg text-[var(--ink)]/40">doopla</p>
      </div>
    </main>
  );
}
