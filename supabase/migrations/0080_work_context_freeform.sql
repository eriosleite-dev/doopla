-- Doopla — Beta "Como você trabalha" (Settings V2, simplificação
-- aprovada 14/09/2026): os 5 grupos de chips estruturados
-- (work_types/client_types/regions/languages/help_areas) e
-- career_stage existiam pra alimentar "matching", conceito que não faz
-- mais parte do produto. Auditoria confirmou que o Intelligence
-- Context só consome esses arrays como texto narrativo simples
-- (join(', ') — ver src/lib/intelligence/context-builder/sections.ts),
-- então dois campos de texto livre entregam a mesma informação com
-- muito menos fricção de preenchimento. Colunas antigas NÃO são
-- removidas nem apagadas — dado de profissionais que já preencheram
-- continua intacto, só deixa de ser editável pela UI do beta.
alter table public.artist_profiles
  add column what_you_do text,
  add column where_you_serve text;

comment on column public.artist_profiles.what_you_do is 'Texto livre: "o que você faz e para quem" — substitui work_types/client_types na UI do beta (Settings V2, 14/09/2026). Conhecimento declarado pro Intelligence Context, nunca autorização.';
comment on column public.artist_profiles.where_you_serve is 'Texto livre: "onde você atende" — substitui regions na UI do beta (Settings V2, 14/09/2026). Conhecimento declarado pro Intelligence Context, nunca autorização.';
