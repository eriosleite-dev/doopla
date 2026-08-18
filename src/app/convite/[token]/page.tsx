import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { InviteByToken } from '@/lib/supabase/types';

const ROLE_LABEL: Record<string, string> = {
  booker: 'Booker',
  agencia: 'Agência',
  artista: 'Artista',
};

async function getInvite(token: string): Promise<InviteByToken | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('get_invite_by_token', { p_token: token });
  return data?.[0] ?? null;
}

export async function generateMetadata(props: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await props.params;
  const invite = await getInvite(token);
  return { title: invite ? `Convite de ${invite.inviter_name} | doopla` : 'doopla' };
}

export default async function ConviteTokenPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await getInvite(token);
  if (!invite) notFound();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-16 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-md flex-col gap-6 text-center">
        <div>
          <p className="font-doopla-mono text-[12px] uppercase tracking-[.1em] text-[var(--accent-ink)]">
            Você foi convidado
          </p>
          <h1 className="font-doopla-display mt-2 text-3xl font-semibold">
            {invite.inviter_name} quer se conectar com você na doopla
          </h1>
          <p className="mt-3 text-sm text-[var(--ink)]/60">
            {ROLE_LABEL[invite.inviter_role] ?? 'Alguém'} convidou você pra entrar na rede dela.
            Crie sua conta pra aceitar a conexão.
          </p>
        </div>

        <Link
          href={`/cadastro?tipo=artista&invite=${token}`}
          className="font-doopla-mono rounded-full bg-[var(--ink)] px-6 py-3.5 text-center text-[13px] uppercase tracking-[.05em] text-[var(--paper)]"
        >
          Criar minha conta
        </Link>

        <p className="text-[12px] text-[var(--ink)]/45">
          Já tem conta?{' '}
          <Link href="/login" className="underline underline-offset-2">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
