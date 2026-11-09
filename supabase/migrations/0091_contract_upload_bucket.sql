-- Doopla — upload real de arquivo pra "Anexar contrato próprio"
-- (achado de UX real, Sessão Central, 21/09/2026): o campo só aceitava
-- colar uma URL — sem forma de enviar um arquivo do computador. Mesmo
-- padrão já usado pra foto de perfil (0015, bucket "avatars"): bucket
-- público, arquivo por usuário em `{user_id}/...`, leitura pública
-- (o link de contrato já era compartilhável hoje, colando uma URL
-- pública qualquer — mesmo modelo de confiança, não é um downgrade de
-- segurança), escrita só do dono do arquivo.

insert into storage.buckets (id, name, public)
values ('contracts', 'contracts', true)
on conflict (id) do nothing;

create policy "contracts: public read"
  on storage.objects for select
  using (bucket_id = 'contracts');

create policy "contracts: owner insert"
  on storage.objects for insert
  with check (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "contracts: owner update"
  on storage.objects for update
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "contracts: owner delete"
  on storage.objects for delete
  using (bucket_id = 'contracts' and auth.uid()::text = (storage.foldername(name))[1]);
