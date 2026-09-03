import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { whatsappPublicNumber } from '@/lib/supabase/env';
import { OrcamentoForm } from './orcamento-form';

// WhatsApp Inbound Foundation — texto pré-preenchido natural, nunca um
// código escondido: o próprio link público (doopla.com/<slug>) já
// visível nesta página é o token técnico de routing (parseado pelo
// webhook, ver src/lib/channels/whatsapp/intake-routing.ts), citado
// aqui de forma que soa como referência normal, não como comando.
function buildWhatsappCtaUrl(number: string, slug: string, artistName: string): string {
  const text = `Oi! Vim pelo link de ${artistName} (doopla.com/${slug}) e queria falar sobre um trabalho.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

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

  const whatsappNumber = whatsappPublicNumber();
  const whatsappUrl = whatsappNumber ? buildWhatsappCtaUrl(whatsappNumber, slug, name) : null;

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

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--ink)]/10 bg-white py-3 text-sm font-medium text-[var(--ink)]"
          >
            Prefere falar pelo WhatsApp?
          </a>
        )}

        <p className="text-center text-[11px] text-[var(--ink)]/40">
          Powered by <span className="font-doopla-display">doopla</span>
        </p>
      </div>
    </main>
  );
}
