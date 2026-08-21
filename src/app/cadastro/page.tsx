import type { Metadata } from 'next';
import Link from 'next/link';

import { eyebrowClass } from '@/app/auth/ui';
import type { PlanId } from '@/lib/market';
import { CreateAccountForm } from './CreateAccountForm';
import { SignupForm } from './signup-form';

export const metadata: Metadata = {
  title: 'Criar conta | Doopla',
};

// Agência não é mais um tipo de conta selecionável no cadastro — quem cai
// aqui com ?role=agencia (links antigos) recebe o padrão "artista".
type SignupRole = 'artista' | 'booker';

const VALID_ROLES: SignupRole[] = ['artista', 'booker'];

function isSignupRole(value: string | undefined): value is SignupRole {
  return VALID_ROLES.includes(value as SignupRole);
}

function isPlanId(value: string | undefined): value is PlanId {
  return value === 'doopla' || value === 'pro';
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    tipo?: string;
    ref?: string;
    invite?: string;
    plano?: string;
  }>;
}) {
  const params = await searchParams;
  // `tipo` é o nome pedido pela especificação de preços pros CTAs da
  // Home (?tipo=artista/?tipo=booker); `role` continua funcionando pros
  // links já espalhados pelo resto do produto — mesmo parâmetro, dois
  // nomes aceitos.
  const defaultRole = isSignupRole(params.tipo)
    ? params.tipo
    : isSignupRole(params.role)
      ? params.role
      : 'artista';
  const isBooker = params.tipo === 'booker' || params.role === 'booker';
  const planIntent = isPlanId(params.plano) ? params.plano : undefined;

  // Funil público (Home → Começar grátis, sem convite, sem link
  // explícito de booker): fluxo novo — cria a conta primeiro, sem
  // perguntar Artista/Booker, e continua "Preparar sua Doopla" /
  // "Escolher plano" já autenticado (ver /cadastro/preparar e
  // /cadastro/plano). Booker e artista convidado por agência continuam
  // no wizard antigo, que já resolve os dois casos corretamente e não
  // precisava ser reconstruído agora.
  const useNewFlow = !isBooker && !params.invite;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[var(--paper)] px-6 py-12 font-doopla-sans text-[var(--ink)]">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Link
          href="/"
          className="font-doopla-display inline-flex w-fit items-baseline text-xl font-semibold"
        >
          doopla
        </Link>

        <div className="flex flex-col gap-1">
          <span className={eyebrowClass}>toda carreira merece representação</span>
          <h1 className="font-doopla-display text-3xl">Criar conta</h1>
          <p className="text-sm text-[var(--ink)]/60">
            Plataforma de representação para artistas independentes.
          </p>
        </div>

        {useNewFlow ? (
          <CreateAccountForm referralCode={params.ref} artistPlan={planIntent} />
        ) : (
          <SignupForm
            defaultRole={defaultRole}
            referralCode={params.ref}
            inviteToken={params.invite}
            showRolePicker={isBooker}
            planIntent={planIntent}
          />
        )}

        {!params.invite && (
          <p className="text-center text-[12px] text-[var(--ink)]/45">
            Sua agência já usa a doopla? Peça o link de convite direto pra ela — ele te leva pra
            um cadastro mais rápido, já te conectando com quem te convidou.
          </p>
        )}
      </div>
    </main>
  );
}
