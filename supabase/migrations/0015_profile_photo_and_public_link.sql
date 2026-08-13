-- Doopla — foto de perfil (Supabase Storage) + link público do artista.
--
-- Bucket "avatars": arquivo por usuário em `{user_id}/avatar.{ext}`,
-- upsert (substitui o anterior). Leitura pública (a foto aparece no
-- perfil público e em qualquer card), escrita só do dono do arquivo.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars: owner update"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "avatars: owner delete"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- Link público /[slug]. Só profiles (não artist_profiles) porque o slug
-- é do usuário, reservado pra artista por enquanto (só artista tem perfil
-- público no MVP), mas fica no lugar certo se o booker ganhar um depois.
alter table public.profiles
  add column slug text unique;

alter table public.artist_profiles
  add column public_enabled boolean not null default false,
  add column instagram_url text,
  add column portfolio_url text;

comment on column public.profiles.slug is 'Slug do link público doopla.com/[slug]. Nulo até o artista ativar o perfil público pela primeira vez.';
comment on column public.artist_profiles.public_enabled is 'Perfil público ativo/visível em doopla.com/[slug].';
