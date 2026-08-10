'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/supabase/types';

export interface AuthFormState {
  error?: string;
}

const ROLES: UserRole[] = ['artista', 'booker', 'agencia'];

async function siteOrigin() {
  const h = await headers();
  const host = h.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${protocol}://${host}`;
}

export async function loginAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');

  if (!email || !password) {
    return { error: 'Preencha e-mail e senha.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: 'E-mail ou senha inválidos.' };
  }

  redirect(next.startsWith('/') ? next : '/dashboard');
}

// Campos de onboarding por tipo de conta (mesmas perguntas do fluxo
// original do site), enviados como metadata do signUp e gravados pela
// trigger handle_new_user (ver supabase/migrations/0002_onboarding_fields.sql).
const ONBOARDING_FIELDS: Record<UserRole, string[]> = {
  artista: [
    'intencao',
    'pontualDetalhe',
    'funcao',
    'local',
    'mercados',
    'temBooker',
  ],
  booker: ['perfil', 'mercados', 'quem', 'cidades', 'jaRepresenta'],
  agencia: ['agencia', 'roster', 'agentes', 'mercado'],
};

export async function signupAction(
  _prevState: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const fullName = String(formData.get('fullName') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirmPassword = String(formData.get('confirmPassword') ?? '');
  const role = String(formData.get('role') ?? '') as UserRole;

  if (!ROLES.includes(role)) {
    return { error: 'Selecione o tipo de conta.' };
  }
  if (!fullName || !email || !password) {
    return { error: 'Preencha todos os campos obrigatórios.' };
  }
  if (password.length < 8) {
    return { error: 'A senha precisa ter pelo menos 8 caracteres.' };
  }
  if (password !== confirmPassword) {
    return { error: 'As senhas não conferem.' };
  }

  const metadata: Record<string, string> = { role, full_name: fullName };
  for (const key of ONBOARDING_FIELDS[role]) {
    const value = formData.get(key);
    if (typeof value === 'string' && value.trim()) {
      metadata[key] = value.trim();
    }
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: `${origin}/auth/confirm`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { error: 'Já existe uma conta com este e-mail.' };
    }
    return { error: 'Não foi possível criar a conta. Tente novamente.' };
  }

  redirect('/cadastro/confirme-seu-email');
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
