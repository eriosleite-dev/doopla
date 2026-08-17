-- Doopla — Prioridade 1 do bloco "cadastro/matching/relação": corrigir o
-- vínculo artista↔booker como fonte única de verdade.
--
-- A tabela `representations` já era a fonte única (escrita por trigger em
-- `representation_requests`, RLS correta, todos os pontos de leitura
-- filtram certo). O bug real reportado ("aceitei, mas sumiu daqui" /
-- "/orçamento diz que não tenho booker") era de invalidação de cache
-- incompleta nas Server Actions, não de dado errado — corrigido em código
-- (revalidatePath cobrindo todas as rotas que leem a relação).
--
-- O que faltava de verdade no banco: o booker nunca era notificado quando
-- o artista aceitava sua solicitação de representação. Esta coluna marca
-- se o booker já viu esse aceite, pra virar um item real em "Precisa da
-- sua atenção" que desaparece depois de visto (mesmo padrão já usado em
-- booker_profiles.opportunities_seen_at).

alter table public.representation_requests
  add column booker_seen_at timestamptz;

comment on column public.representation_requests.booker_seen_at is 'Quando o booker visualizou o aceite/recusa da sua solicitação. Nulo = ainda não visto, aparece em "Precisa da sua atenção".';
