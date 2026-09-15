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
  return { title: name ? `Fale com a Doopla de ${name}` : 'doopla' };
}

// Redesign 15/09/2026 (achado da fundadora) — esta página é a porta de
// entrada individual pra um cliente iniciar um booking com a Doopla de
// um profissional específico. Nunca perfil público, marketplace,
// oportunidade pública ou formulário de matching/booker: só o começo
// de uma conversa. Fluxo funcional (submit_orcamento_request ->
// opportunity -> conversation vinculada, origin/channel='public_link')
// já validado no Item 1 e preservado 100% intocado aqui, incluindo
// actions.ts (nenhuma mudança) — este redesign é só camada visual e de
// conteúdo, reaproveitando os mesmos tokens --pro-* já usados em todo
// o Professional Shell (`.pro-shell`/`.pro-glow-bg`, globals.css) pra
// não inventar uma terceira identidade visual.
export default async function OrcamentoPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const name = await getArtistName(slug);
  if (!name) notFound();

  const whatsappNumber = whatsappPublicNumber();
  const whatsappUrl = whatsappNumber ? buildWhatsappCtaUrl(whatsappNumber, slug, name) : null;

  return (
    <main className="pro-shell pro-glow-bg flex min-h-screen flex-col items-center justify-center px-5 py-14 font-pro-body sm:py-20">
      <div className="flex w-full max-w-[420px] flex-col gap-5">
        <div className="text-center">
          <h1 className="font-pro-sub text-[24px] font-bold leading-snug text-[var(--pro-off)] sm:text-[28px]">
            Fale com a Doopla de {name}
          </h1>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-[var(--pro-tx-70)]">
            Você conta o que precisa. A Doopla cuida do atendimento.
          </p>
        </div>

        <div className="rounded-[20px] border border-[rgba(226,41,28,.35)] bg-[var(--pro-panel)] p-5 shadow-[0_0_50px_rgba(226,41,28,.12)] backdrop-blur-xl sm:p-6">
          <OrcamentoForm slug={slug} artistName={name} />
        </div>

        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-full border border-[var(--pro-line)] py-3 text-[13.5px] font-semibold text-[var(--pro-tx-70)] transition-colors hover:border-[var(--pro-off)]/40 hover:text-[var(--pro-off)]"
          >
            Prefere falar direto no WhatsApp?
          </a>
        )}
      </div>
    </main>
  );
}
