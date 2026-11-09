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

// Correção da regressão de pendingInviteToken (migration 0069):
//   - invitee_role vem explícito do convite agora — o CTA de cadastro
//     manda pro tipo certo (nunca mais hardcoded ?tipo=artista, que
//     quebrava silenciosamente convites de artista->booker).
//   - is_expired distingue "convite venceu" (mensagem honesta, pede pro
//     remetente reenviar) de "não existe" (notFound() — 404 de verdade,
//     nunca confundido com expirado).
//   - Quem já tem conta autenticada NÃO tenta vincular por token aqui —
//     esse cenário é do outro mecanismo (representation_requests, ver
//     "Adicionar profissional/Booker" no painel), pra não duplicar
//     sistema. A página só orienta pro caminho certo.
export default async function ConviteTokenPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const invite = await getInvite(token);
  if (!invite) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const inviterLabel = ROLE_LABEL[invite.inviter_role] ?? 'Alguém';
  const inviteeLabel = ROLE_LABEL[invite.invitee_role] ?? 'pessoa';

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
          {invite.is_expired ? (
            <p className="mt-3 text-sm text-[var(--ink)]/60">
              Esse link de convite já venceu. Peça pra {invite.inviter_name} reenviar um novo
              convite pra você.
            </p>
          ) : (
            <p className="mt-3 text-sm text-[var(--ink)]/60">
              {inviterLabel} convidou você pra entrar como {inviteeLabel.toLowerCase()} na rede
              dela.{' '}
              {user
                ? ''
                : 'Crie sua conta pra aceitar a conexão.'}
            </p>
          )}
        </div>

        {invite.is_expired ? null : user ? (
          <div className="rounded-[16px] bg-white/60 px-5 py-4 text-left text-[13px] leading-relaxed text-[var(--ink)]/70">
            Você já tem uma conta na Doopla. Convites por link são só pra quem ainda vai se
            cadastrar — peça pra {invite.inviter_name} te adicionar direto pelo painel dela
            (Minha equipe → Adicionar), usando seu contato ou ID público.
            <Link
              href="/dashboard"
              className="mt-3 block font-doopla-mono text-[12px] uppercase tracking-[.05em] text-[var(--accent-ink)] underline underline-offset-2"
            >
              Ir para o meu painel →
            </Link>
          </div>
        ) : (
          <Link
            href={`/cadastro?tipo=${invite.invitee_role}&invite=${token}`}
            className="font-doopla-mono rounded-full bg-[var(--ink)] px-6 py-3.5 text-center text-[13px] uppercase tracking-[.05em] text-[var(--paper)]"
          >
            Criar minha conta
          </Link>
        )}

        {!invite.is_expired && !user && (
          <p className="text-[12px] text-[var(--ink)]/45">
            Já tem conta?{' '}
            <Link href="/login" className="underline underline-offset-2">
              Entrar
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
