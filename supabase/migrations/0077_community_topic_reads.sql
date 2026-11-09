-- Item 12 do roadmap da Comunidade — "pousar na posição de leitura"
-- (08/09/2026). O ponto de extensão já estava previsto desde o Item 5
-- (ver ComunidadeScrollAnchor em navigation-guard.tsx: "'start' | 'end'
-- cobre só o que o Item 5 precisa; o formato nasce pensado pra crescer
-- pra um terceiro caso ({ messageId: string }, Item 12) sem quebrar
-- quem já usa 'start'/'end'"). Esta migration é só o estado durável
-- que faltava pra isso existir de verdade: onde foi a última mensagem
-- que cada profissional viu em cada tópico.
--
-- Mesmo padrão de escrita direta (RLS, não RPC) já usado por
-- community_saved_topics (0059) — toggle/registro puro, sem regra de
-- negócio nenhuma além de "só o dono lê/escreve a própria linha". Sem
-- DELETE: não existe "esquecer onde parei de ler" como ação de
-- produto, então não expõe a operação.
create table public.community_topic_reads (
  profile_id uuid not null references public.profiles (id),
  topic_id uuid not null references public.community_topics (id),
  -- null é um estado válido (linha existe mas ainda não sabemos uma
  -- mensagem específica) — na prática o client só grava quando tem um
  -- id real, mas a coluna não precisa ser not null pra isso.
  last_read_post_id uuid references public.community_posts (id),
  updated_at timestamptz not null default now(),
  primary key (profile_id, topic_id)
);

comment on table public.community_topic_reads is 'Item 12 (08/09/2026) — posição de leitura por (profile, topic). last_read_post_id é só um marcador de apresentação (onde o painel/app pousa o scroll ao reabrir); nunca usado por nenhuma regra de autorização/negócio. Gravado no unmount da tela do tópico (client mede qual mensagem estava visível), nunca em tempo real.';

alter table public.community_topic_reads enable row level security;

create policy "community_topic_reads: select own" on public.community_topic_reads
  for select to authenticated using (profile_id = auth.uid());
create policy "community_topic_reads: insert own" on public.community_topic_reads
  for insert to authenticated with check (profile_id = auth.uid());
create policy "community_topic_reads: update own" on public.community_topic_reads
  for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());

revoke all on public.community_topic_reads from public, anon;
grant select, insert, update on public.community_topic_reads to authenticated;
