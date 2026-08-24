-- Doopla — reescrita da etapa "Valores" do onboarding (fonte de verdade
-- final: onboarding funciona pra qualquer profissional independente, não
-- só DJ/artista de palco).
--
-- "Como você costuma definir seus valores?" (quando o profissional
-- escolhe "Depende do trabalho" em vez de um valor fixo) é uma resposta
-- nova, semanticamente diferente de bio (etapa "Prepare sua Doopla" —
-- quem é o profissional e como ele trabalha) e de negotiation_notes
-- (etapa "Como você trabalha" — regra de representação/negociação):
-- aqui é especificamente sobre COMO o preço varia. Fica em coluna
-- própria, nunca concatenada com as outras duas.
--
-- fee_varies_by_job_type e typical_job_duration (migration 0037) saem
-- do onboarding nesta reescrita — a primeira porque não existe mais
-- taxonomia de "tipo de trabalho" alguma (produto não é mais nichado em
-- DJ), a segunda porque "duração típica" só fazia sentido pra um
-- subconjunto de profissões. As colunas continuam existindo no banco
-- (não é destrutivo remover uma pergunta), só deixam de ser escritas
-- pelo onboarding — podem ser reaproveitadas ou removidas num cleanup
-- futuro, sem pressa.

alter table public.artist_profiles
  add column pricing_notes text;

comment on column public.artist_profiles.pricing_notes is 'Etapa Valores: "como você costuma definir seus valores?", preenchido só quando o profissional escolhe "Depende do trabalho" em vez de um valor fixo (base_fee_cents). Diferente de bio (quem é/como trabalha) e de negotiation_notes (regra de negociação) — nunca concatenar.';
