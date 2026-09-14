'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';

export interface AccountSecurityFormState {
  error?: string;
  success?: boolean;
}

// Settings V2 (08/09/2026) — Segurança e acesso. As 3 ações abaixo usam
// só a API real do GoTrue (nenhuma tabela/RPC própria necessária —
// auditado antes de codar: nenhuma migration cabe aqui).

// Alterar e-mail (Conta) — supabase.auth.updateUser({ email }) já
// dispara o fluxo de confirmação padrão do GoTrue (link enviado pro
// e-mail NOVO); o e-mail atual só troca de fato depois da confirmação.
// Nenhum e-mail "fantasma" fica salvo em profiles — auth.users continua
// sendo a única fonte de verdade do e-mail de login.
export async function updateEmailAction(
  _prevState: AccountSecurityFormState,
  formData: FormData
): Promise<AccountSecurityFormState> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Digite o novo e-mail.' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });
  if (error) return { error: 'Não foi possível iniciar a troca de e-mail. Tente novamente.' };

  return { success: true };
}

// Trocar senha — exige a senha atual (reautenticação leve via
// signInWithPassword, mesmo mecanismo do account closure) antes de
// aceitar a nova, já que updateUser sozinho não pede a senha antiga.
export async function updatePasswordAction(
  _prevState: AccountSecurityFormState,
  formData: FormData
): Promise<AccountSecurityFormState> {
  const currentPassword = String(formData.get('currentPassword') ?? '');
  const newPassword = String(formData.get('newPassword') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');

  if (!currentPassword || !newPassword) return { error: 'Preencha os dois campos de senha.' };
  if (newPassword.length < 8) return { error: 'A nova senha precisa ter pelo menos 8 caracteres.' };
  if (newPassword !== confirmPassword) return { error: 'As senhas não conferem.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Sessão expirada. Entre novamente.' };

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (reauthError) return { error: 'Senha atual incorreta.' };

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: 'Não foi possível trocar a senha agora.' };

  return { success: true };
}

// Sair dos outros dispositivos — signOut({ scope: 'others' }) é a API
// real do GoTrue pra isso: revoga a família de refresh tokens de todas
// as OUTRAS sessões, preservando a atual. Não exige service_role
// (diferente do account closure, que precisa banir/trocar e-mail via
// Admin API) — é uma ação normal da própria sessão.
export async function signOutOtherSessionsAction(): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: 'others' });
  if (error) return { error: 'Não foi possível encerrar as outras sessões agora.' };

  revalidatePath('/dashboard/perfil/seguranca');
  return {};
}
