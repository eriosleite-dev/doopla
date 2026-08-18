import { notFound, redirect } from 'next/navigation';

import { getReviewSummary } from '../../data';
import { getSessionProfile } from '../../session';
import { avatarClass, eyebrowClass, initialsFromName } from '../../ui';
import { labelForAttribute } from '../../review-attributes';
import type { Profile, BookerProfile } from '@/lib/supabase/types';

export default async function BookerProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const { supabase, user, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const [{ data: bookerAccount }, { data: booker }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', id).eq('role', 'booker').maybeSingle<Profile>(),
    supabase.from('booker_profiles').select('*').eq('profile_id', id).maybeSingle<BookerProfile>(),
  ]);
  if (!bookerAccount) notFound();

  const [rating, { data: representation }] = await Promise.all([
    getReviewSummary(id, supabase),
    supabase
      .from('representations')
      .select('id')
      .eq('artist_profile_id', user.id)
      .eq('booker_profile_id', id)
      .maybeSingle<{ id: string }>(),
  ]);

  const location = [bookerAccount.city, bookerAccount.state].filter(Boolean).join(' · ');
  const tags = (booker?.mercados ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);

  return (
    <main className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        {bookerAccount.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bookerAccount.avatar_url}
            alt=""
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <span className={`${avatarClass} h-16 w-16 text-xl`}>
            {initialsFromName(bookerAccount.full_name)}
          </span>
        )}
        <div>
          <p className={eyebrowClass}>{[booker?.perfil, location].filter(Boolean).join(' · ')}</p>
          <h1 className="font-doopla-display mt-1 text-3xl font-semibold">
            {bookerAccount.full_name}
          </h1>
          <p className="font-doopla-mono mt-1 text-[12px] text-[var(--accent-ink)]">
            {rating.count > 0
              ? `★ ${rating.average?.toFixed(1)} · ${rating.count} ${rating.count === 1 ? 'avaliação' : 'avaliações'}`
              : 'Novo na doopla. Ainda construindo o histórico na plataforma.'}
          </p>
        </div>
      </header>

      <div className="rounded-[18px] bg-white p-6">
        {representation ? (
          <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--musgo)]">
            Já trabalha com você ✓
          </span>
        ) : (
          <p className="text-sm text-[var(--ink)]/55">
            Vocês ainda não têm uma relação de representação registrada na doopla.
          </p>
        )}
      </div>

      {booker?.foco && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>Como posso ajudar</p>
          <p className="mt-2 text-sm text-[var(--ink)]/75">
            {booker.foco === 'Universal' ? 'Atende qualquer nicho' : booker.foco}
          </p>
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

      {rating.attributeCounts.length > 0 && (
        <section className="rounded-[18px] bg-white p-6">
          <p className={eyebrowClass}>O que os artistas destacam</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {rating.attributeCounts.map((a) => (
              <span
                key={a.key}
                className="font-doopla-mono rounded-full bg-[var(--paper-dim)] px-3 py-2 text-[10.5px] uppercase tracking-[.03em] text-[var(--ink)]/70"
              >
                {a.count} · {labelForAttribute('booker', a.key)}
              </span>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
