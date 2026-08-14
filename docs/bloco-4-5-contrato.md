# Bloco 4.5 — contrato banco ↔ aplicação

Referência pra quem for escrever Server Actions em cima do schema de
oportunidades/convites/matching (`supabase/migrations/0007`, `0008`, `0009`).
Nomes de tabela/coluna/enum aqui são o contrato — mudar depois que a camada
de cima já existir é caro, então trate como estável.

## Tabelas e o que cada uma é

| Tabela | O que representa | Nunca confundir com |
|---|---|---|
| `representation_requests` | Booker pede pra representar um artista **novo** (relação ainda não existe) | `invites` (relação já existe fora da doopla) |
| `invites` / `representations` | "Já trabalho com este artista" — formaliza uma relação que já existe fora da plataforma | `representation_requests` |
| `opportunity_invitations` | Artista convida **um booker específico** pra **uma oportunidade pontual** | `representation_requests` — aceitar não cria representação permanente |
| `opportunity_interests` | Booker demonstra interesse numa oportunidade em modo aberto ("tenho interesse") | `opportunity_invitations` — não é convite, é auto-candidatura |
| `opportunity_events` | Log de funil (recebeu/abriu/interessou/selecionado), sem uso na interface ainda — combustível do Matching V2 | — |
| `opportunity_tags` | Tags da oportunidade, `explicit` (usuário) ou `ai` (extração assíncrona) | — |
| `ai_usage_events` | Custo de IA por usuário/oportunidade/feature | — |

## `opportunities.status` (`opportunity_status`) — jornada de publicação

Nunca é sobre o andamento do trabalho — isso é `booking_status`, que só existe
a partir do momento em que `selected_booker_id` é preenchido.

| Valor | Garante |
|---|---|
| `rascunho` | Reservado pro fluxo de salvar rascunho — **ainda não implementado**. Nenhuma Server Action deve produzir esse valor hoje. |
| `aberta` | Oportunidade publicada e visível conforme `distribution_mode` (ver abaixo). `selected_booker_id` é `null`. |
| `em_distribuicao` | Mesma visibilidade de `aberta` — reservado pra quando existir uma etapa de distribuição por regra explícita (seção 4 do roteiro). Hoje é tratado como equivalente a `aberta` em todas as policies e na função de seleção. |
| `interesse_recebido` | Mesma visibilidade de `aberta`/`em_distribuicao`. Não implica nada além de "existe pelo menos um `opportunity_interests` pendente" — nenhuma trigger automática move o status pra esse valor ainda; se uma Server Action futura quiser fazer essa transição, ela é apenas informativa, não muda nenhuma regra de acesso. |
| `booker_selecionado` | **Garantido atomicamente por `select_booker_for_opportunity()`, nunca por update direto** (client não tem mais privilégio de coluna pra `status`/`selected_booker_id`/`selected_at` desde a migration 0009). Implica, sempre, todos os itens abaixo — a própria função garante isso na mesma transação: <br>• `selected_booker_id` preenchido com o booker escolhido<br>• todo `opportunity_invitations` pendente de outros bookers virou `encerrada`<br>• todo `opportunity_interests` pendente de outros bookers virou `encerrado`<br>• o convite/interesse do booker escolhido (se existia) virou `aceita`/`selecionado`<br>• eventos `selecionado` e `encerrada` (um por parte fechada) gravados em `opportunity_events` |
| `cancelada` | Terminal, fora da sequência linear. Artista desistiu. Hoje ainda editável via update direto do artista (não travado na 0009, junto com os outros campos "de conteúdo") — não implica nada sobre convites/interesses pendentes, que **não** são fechados automaticamente ao cancelar (gap conhecido, não implementado ainda). |

## `opportunities.distribution_mode`

| Valor | Garante |
|---|---|
| `meus_bookers` | Só visível pro artista dono e pra quem tem uma linha em `opportunity_invitations`. `opportunity_interests` não aceita insert (bloqueado no `with check` da policy de insert). |
| `novos_bookers` | Visível a qualquer booker autenticado enquanto `status` for `aberta`/`em_distribuicao`/`interesse_recebido`. `opportunity_invitations` continua podendo existir (o artista pode convidar mesmo em modo aberto), mas não é o caminho principal. |
| `ambos` | Os dois caminhos acima em paralelo — nenhum bloqueia o outro até existir `selected_booker_id`. |

## `opportunity_invitations.status` (`opportunity_invitation_status`)

| Valor | Garante |
|---|---|
| `pendente` | Único valor aceito na criação (pinado no insert desde a 0009). |
| `aceita` | Só é setado por dentro de `select_booker_for_opportunity()` — implica que esse booker é o `selected_booker_id` da oportunidade. |
| `recusada` | Único valor que o próprio booker pode setar via update direto (coluna travada pra só `status`/`responded_at` desde a 0009 — `opportunity_id`/`booker_profile_id` são imutáveis pelo cliente). |
| `encerrada` | Setado automaticamente por `select_booker_for_opportunity()` em todo convite pendente que não foi o escolhido — equivale a "OPPORTUNITY_FILLED" no roteiro. |

## `opportunity_interests.status` (`opportunity_interest_status`)

| Valor | Garante |
|---|---|
| `pendente` | Único valor aceito na criação. Não reserva a oportunidade nem bloqueia convite direto. |
| `selecionado` | Só setado por dentro de `select_booker_for_opportunity()` — implica que esse booker é o `selected_booker_id`. Não existe update direto disponível pro cliente pra essa tabela (sem policy de UPDATE — só a função, que roda como dono, consegue). |
| `encerrado` | Setado automaticamente pra todo interesse pendente que não foi o escolhido, quando outro booker é selecionado. |

## `representation_requests.status` (`representation_request_status`)

| Valor | Garante |
|---|---|
| `pendente` | Único valor aceito na criação. Conta pro limite (`booker_profiles.representation_request_limit`, default 5) — reforçado por trigger no insert. |
| `aceita` | Setado pelo artista via update direto (coluna travada pra só `status`/`responded_at` desde a 0009). Implica, sempre: existe uma linha em `representations` ligando `artist_profile_id`↔`booker_profile_id`, com `created_via_representation_request_id` apontando pra essa solicitação — garantido por trigger (`handle_representation_request_response`) na mesma transação do update, não depende da Server Action lembrar de criar a `representations` à parte. |
| `recusada` | Setado pelo artista via update direto. Não cria nada em `representations`. |
| `expirada` | **Não é automático ainda** — só é setado quando algo chama `public.expire_stale_representation_requests()` (sem cron no beta; a Server Action de listagem deve chamar essa função antes de exibir pendentes). Uma linha com `status = 'pendente'` e `expires_at <= now()` já deve ser **tratada como expirada na leitura**, mesmo que a coluna ainda não tenha sido atualizada. |

## Colunas travadas pra client (só mudam via função/trigger, não por update direto)

Reforçado por privilégio de coluna (`REVOKE`/`GRANT` na migration 0009), não só por `RLS` — um update tentando tocar essas colunas recebe `permission denied for table X`, não passa nem a chegar na policy:

- `profiles.is_admin`
- `booker_profiles.representation_request_limit`
- `opportunities.status`, `opportunities.selected_booker_id`, `opportunities.selected_at`
- `representation_requests.*` exceto `status`, `responded_at`
- `opportunity_invitations.*` exceto `status`, `responded_at`

Qualquer fluxo novo que precise mudar uma dessas colunas (ex.: "cancelar
oportunidade", "publicar rascunho") precisa de uma função `security definer`
nova, no mesmo padrão de `select_booker_for_opportunity()` — não de um
update direto liberado por RLS.

## Erros que a função de seleção pode levantar

`select_booker_for_opportunity(p_opportunity_id, p_booker_profile_id)`:

| `errcode` | Nome usado na mensagem | Quando | Tradução sugerida pra UI |
|---|---|---|---|
| `P0002` | `opportunity_not_found` | id não existe | erro genérico |
| `42501` | `not_authorized` | quem chama não é o artista dono nem o booker sendo selecionado | erro genérico / não deveria acontecer pela UI normal |
| `P0001` | `opportunity_already_filled` | já existe `selected_booker_id` | "Esta oportunidade foi encerrada. O artista seguiu com outro booker." (texto exato do roteiro) |
