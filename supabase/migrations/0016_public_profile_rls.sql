-- Doopla — RLS: quem visita a página pública /[slug] (sem estar logado)
-- precisa conseguir ler o profile + artist_profile de quem ativou o
-- perfil público. Antes só o dono via o próprio registro.

create policy "artist_profiles: select public" on public.artist_profiles
  for select using (public_enabled = true);

create policy "profiles: select public" on public.profiles
  for select using (
    exists (
      select 1 from public.artist_profiles ap
      where ap.profile_id = profiles.id and ap.public_enabled = true
    )
  );
