// Espelha o subconjunto de artist_profiles usado pelas telas mobile
// desta fase (Configurações/perfil público). Não é o shape completo
// da tabela (tem muito mais campos de onboarding/matching que
// nenhuma tela mobile usa ainda) — só o que é lido/editado aqui.
export type ArtistProfile = {
  profile_id: string;
  stage_name: string | null;
  category: string | null;
  bio: string | null;
  genres: string[];
  work_types: string[];
  public_enabled: boolean;
  instagram_url: string | null;
  portfolio_url: string | null;
};

// Espelha o subconjunto de subscriptions usado pra badge de plano.
export type ArtistSubscription = {
  profile_id: string;
  role: 'artista';
  status: 'trialing' | 'active' | 'canceled';
  artist_plan: 'doopla' | 'pro' | null;
  trial_ends_at: string | null;
};
