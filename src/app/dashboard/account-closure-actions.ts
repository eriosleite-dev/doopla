'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export interface AccountClosureFormState {
  error?: string;
}

// Account closure flow (Settings V2, 08/09/2026) — decisão de produto já
// fechada, nunca hard delete. Sequência:
//  1) reautenticação (senha) — mesmo padrão de qualquer ação irreversível
//     que exige confirmar identidade de novo, não só sessão ativa;
//  2) close_own_account() (migration 0078) — parte que É de banco:
//     encerra representações, desativa descoberta pública, marca
//     profiles.status='closed'. Roda com o client RLS-scoped do próprio
//     usuário (auth.uid() precisa ser o dono, mesma autoridade de
//     terminate_representation);
//  3) só o que exige Admin API (fora do alcance de qualquer RPC SQL):
//     e-mail trocado por um valor sintético (libera o original pra um
//     cadastro novo) + ban_duration (bloqueia login/refresh futuros).
//     Nunca supabase.auth.admin.deleteUser() — profiles.id referencia
//     auth.users(id) ON DELETE CASCADE, e bookings/contratos referenciam
//     profiles(id) ON DELETE CASCADE também (ver comentário da migration
//     0078): apagar o auth user cascatearia até apagar histórico
//     financeiro da OUTRA parte, o oposto do que este fluxo promete
//     preservar;
//  4) signOut() da própria sessão — o gate em session.ts (profiles.
//     status==='closed') é a defesa em profundidade contra qualquer
//     access token ainda não expirado tentando renderizar o painel.
export async function requestAccountClosureAction(
  _prevState: AccountClosureFormState,
  formData: FormData
): Promise<AccountClosureFormState> {
  const password = String(formData.get('password') ?? '');
  const confirmed = formData.get('confirmed') === 'on';

  if (!confirmed) {
    return { error: 'Confirme que entende que esta ação é permanente.' };
  }
  if (!password) {
    return { error: 'Digite sua senha pra confirmar.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) {
    redirect('/login?next=/dashboard/perfil/privacidade');
  }

  // Reautenticação — signInWithPassword contra a própria sessão só
  // confirma a senha (GoTrue não derruba a sessão atual por isso), é o
  // mecanismo real disponível sem endpoint dedicado de reauth.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (reauthError) {
    return { error: 'Senha incorreta.' };
  }

  const { error: closeError } = await supabase.rpc('close_own_account');
  if (closeError) {
    return { error: 'Não foi possível encerrar sua conta agora. Tente novamente.' };
  }

  const serviceRole = createServiceRoleClient();
  const syntheticEmail = `closed-${user.id}@closed.doopla.internal`;
  const { error: adminError } = await serviceRole.auth.admin.updateUserById(user.id, {
    email: syntheticEmail,
    ban_duration: '876000h',
  });
  if (adminError) {
    // A conta já está marcada como closed no banco (passo anterior
    // confirmado) — o painel já fica bloqueado pelo gate de
    // session.ts independente disso. Erro aqui é só sobre liberar o
    // e-mail original mais cedo; não deixa a pessoa presa numa conta
    // meio-fechada, então segue o fluxo em vez de travar no meio.
  }

  await supabase.auth.signOut();
  redirect('/conta-encerrada');
}
