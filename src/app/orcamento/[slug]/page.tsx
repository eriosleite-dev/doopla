import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { OrcamentoForm } from './orcamento-form';

async function getArtistName(slug: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('slug', slug)
    .single<{ id: string; full_name: string }>();
  if (!profile) return null;

  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('stage_name, public_enabled')
    .eq('profile_id', profile.id)
    .eq('public_enabled', true)
    .maybeSingle<{ stage_name: string | null; public_enabled: boolean }>();
  if (!artist) return null;

  return artist.stage_name || profile.full_name;
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;
  const name = await getArtistName(slug);
  return { title: name ? `Orçamento com ${name} | doopla` : 'doopla' };
}

export default async function OrcamentoPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const name = await getArtistName(slug);
  if (!name) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center bg-[var(--paper)] px-6 py-16 font-doopla-sans text-[var(--ink)] sm:py-24">
      <div className="flex w-full max-w-md flex-col gap-6">
        <div className="text-center">
          <p className="font-doopla-mono text-[12px] uppercase tracking-[.1em] text-[var(--accent-ink)]">
            Pedir orçamento
          </p>
          <h1 className="font-doopla-display mt-2 text-3xl font-semibold">{name}</h1>
          <p className="mt-2 text-sm text-[var(--ink)]/60">
            Conte um pouco sobre o seu evento — {name} (ou quem cuida da agenda) recebe sua
            solicitação e entra em contato.
          </p>
        </div>

        <div className="rounded-[18px] bg-white p-6">
          <OrcamentoForm slug={slug} />
        </div>

        <p className="text-center text-[11px] text-[var(--ink)]/40">
          Powered by <span className="font-doopla-display">doopla</span>
        </p>
      </div>
    </main>
  );
}
