// Doopla Mobile — espelha o shape real de `profiles` (migrations
// 0001 + posteriores que adicionaram slug/is_admin/referral_code) e o
// tipo `Profile` já usado no painel web (src/lib/supabase/types.ts).
// Cópia deliberada, nunca import relativo cruzando pra dentro de
// src/ do Next.js (decisão do usuário) — se o schema mudar, os dois
// lugares precisam ser atualizados manualmente; mesma classe de
// dívida que os tipos gerados do Supabase já têm hoje no projeto web
// (registrada, não escondida).
//
// professional_id NÃO é uma coluna/conceito separado em lugar nenhum
// do schema — profiles.id É o id da profissional, 1:1 com
// auth.users.id (mesma FK). Todo lugar do Runtime que fala em
// "represented_professional_id" está se referindo a este mesmo id.
// Nunca inventar uma segunda noção de identidade aqui.

export type UserRole = 'artista' | 'booker' | 'agencia';

export type Profile = {
  id: string;
  role: UserRole;
  full_name: string;
  display_name: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  avatar_url: string | null;
  slug: string | null;
  is_admin: boolean;
  referral_code: string;
  created_at: string;
  updated_at: string;
};
