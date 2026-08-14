# Auditoria de risco — Bloco 4.5 (schema de oportunidades/matching)

Feita antes de escrever qualquer Server Action em cima da migration
`0018_bloco_4_5_oportunidades_convites_matching.sql` (portada do branch
`claude/doopla-bloco-4-5-opportunities-5f15n6` pra este branch). Escopo
estritamente os 3 pontos pedidos: matriz de RLS, atomicidade da seleção
de booker, contrato de nomes/semântica. Nenhuma feature nova, nenhum
redesenho de produto.

Achados corrigidos em `0019_bloco_4_5_security_hardening.sql` estão
marcados **[CORRIGIDO]** abaixo. Nada ficou pendente sem correção.

## 1. Matriz de RLS por tabela, papel e operação

Papéis: **AD** = artista dono do recurso · **BI** = booker envolvido
(convidado, com interesse registrado, ou já selecionado) · **BN** =
booker não envolvido · **AM** = admin (`profiles.is_admin`).

| Tabela | Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `opportunities` | AD | ✓ (dono) | ✓ (dono) | ✓ (dono, só via UPDATE direto de campos próprios — `selected_booker_id` só pela função) | ✗ (sem policy) |
| `opportunities` | BI | ✓ (via convite, ou enquanto `status` aberto) | ✗ | ✗ (nenhuma policy libera booker) | ✗ |
| `opportunities` | BN | ✓ só enquanto `status` em aberta/em_distribuição/interesse_recebido **e** `distribution_mode` permite descoberta aberta | ✗ | ✗ | ✗ |
| `opportunities` | AM | ✓ (todas) | ✗ | ✗ | ✗ |
| `representation_requests` | AD (artista alvo) | ✓ | ✗ | ✓ só `status`/`responded_at` **[CORRIGIDO — antes dava pra reatribuir booker/artist_profile_id/message/expires_at]** | ✗ |
| `representation_requests` | BI (booker autor) | ✓ | ✓ (só a própria, com check `requested_by`-implícito via `booker_profile_id = auth.uid()`, limite de 5/10/20 reforçado por trigger) | ✗ | ✗ |
| `representation_requests` | BN | ✗ | ✗ (não pode inserir em nome de outro booker) | ✗ | ✗ |
| `opportunity_invitations` | AD | ✓ | ✓ só se `distribution_mode` em (`meus_bookers`,`ambos`) **[CORRIGIDO — antes não checava distribution_mode]** | ✗ (sem policy pro artista) | ✗ |
| `opportunity_invitations` | BI | ✓ | ✗ | ✓ só recusar (`status='recusada'`, mais nada muda) | ✗ |
| `opportunity_invitations` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_interests` | AD | ✓ | ✗ | ✗ | ✗ |
| `opportunity_interests` | BI | ✓ | ✓ só se `distribution_mode` em (`novos_bookers`,`ambos`) e oportunidade ainda aberta | ✗ (sem policy) | ✓ (retirar o próprio interesse a qualquer momento) |
| `opportunity_interests` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_events` | AD | ✓ | ✗ | ✗ | ✗ |
| `opportunity_events` | BI | ✓ | ✓ só se já tem convite ou interesse registrado naquela oportunidade **[CORRIGIDO — antes qualquer booker inseria evento pra qualquer opportunity_id]** | ✗ | ✗ |
| `opportunity_events` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_events` | AM | ✓ (todas) | ✓ (qualquer) | ✗ | ✗ |
| `opportunity_tags` | AD | ✓ | ✓ (só na própria oportunidade) | ✗ (sem policy — ninguém edita/apaga via API) | ✗ |
| `opportunity_tags` | BN/BI | ✓ enquanto oportunidade visível | ✗ | ✗ | ✗ |
| `ai_usage_events` | dono (`profile_id`) | ✓ | ✗ (só service role escreve) | ✗ | ✗ |
| `profiles.is_admin` | qualquer usuário | ✓ (próprio) | — | ✗ pra si mesmo **[CORRIGIDO — antes `profiles: update own` não travava nenhuma coluna; qualquer usuário conseguia setar `is_admin=true` na própria linha]** | — |
| `reviews` (0017, mesma classe de bug) | reviewer | ✓ | — (só via trigger) | ✓ rating/attributes/comment/status/submitted_at/edited_at | ✗ |
| `reviews` | reviewee | ✓ | — | ✓ só `requested_at`/`contested` **[CORRIGIDO — antes o avaliado podia reescrever a própria nota]** | ✗ |

Critério "passou": toda célula tem uma policy explícita que permite ou
nega — nenhuma dependeu de comportamento implícito do Postgres. As duas
últimas linhas de cada bloco de tabela com **[CORRIGIDO]** eram os casos
em que o `SELECT`/`INSERT` estava certo mas o `UPDATE` deixava mexer em
coluna que devia ser somente leitura pra aquele papel — exatamente o
padrão de erro que a auditoria pediu pra procurar.

## 2. Atomicidade de `select_booker_for_opportunity`

**Mecanismo**: `select * from opportunities where id = ... for update`
dentro da função — trava a linha pela duração da transação da chamada.
Uma segunda chamada concorrente pra mesma oportunidade bloqueia na
leitura até a primeira transação terminar; quando é liberada, encontra
`selected_booker_id` já preenchido e cai no `raise exception
opportunity_already_filled` de forma determinística. Não existe janela
entre leitura e escrita em que duas chamadas possam "ambas vencer" — o
lock cobre exatamente esse intervalo.

**Efeitos colaterais** (fechamento de convites/interesses concorrentes,
registro em `opportunity_events`) acontecem dentro da mesma execução/
transação da função, então são atômicos junto com a seleção — não há
como o booker ficar selecionado sem os outros caminhos já terem sido
fechados.

**Único problema real não era atomicidade, era autorização**
**[CORRIGIDO]**: a checagem original —
`auth.uid() <> artist_profile_id and auth.uid() <> p_booker_profile_id`
— autorizava o próprio booker a se chamar como selecionado, sem convite,
sem interesse, sem decisão do artista. A função em si nunca teve corrida
de dados (isso já estava certo); o buraco era deixar o booker "se
selecionar" sozinho pulando o artista inteiro. Corrigido pra só o
artista poder chamar.

## 3. Contrato banco ↔ aplicação: nomes e semântica

### Tabelas e função que a Server Action vai referenciar
`opportunities`, `representation_requests`, `opportunity_invitations`,
`opportunity_interests`, `opportunity_events`, `opportunity_tags`,
`ai_usage_events`, função `select_booker_for_opportunity(p_opportunity_id, p_booker_profile_id)`.

### `opportunity_status` — o que cada valor garante
- `rascunho` — reservado pro roteiro, nada no banco usa ainda (toda
  oportunidade hoje nasce em `aberta`). Server Action não deve permitir
  esse valor até o fluxo de rascunho ser construído.
- `aberta` — visível a qualquer booker se `distribution_mode` permitir
  descoberta aberta; aceita convite e/ou interesse conforme o modo.
- `em_distribuicao` — mesma visibilidade/regras de `aberta` na RLS
  atual (tratados de forma idêntica pelas policies); a distinção entre
  os dois é só de produto/exibição, o banco não impõe diferença de
  comportamento entre eles ainda.
- `interesse_recebido` — idem acima, mesma visibilidade que `aberta`/
  `em_distribuicao` nas policies.
- `booker_selecionado` — **garante**, de forma atômica (função,
  seção 2): `selected_booker_id` preenchido, `selected_at` preenchido,
  todo outro convite pendente virou `encerrada`, todo outro interesse
  pendente virou `encerrado`, o convite/interesse do escolhido (se
  existia) virou `aceita`/`selecionado`. Esse estado só é alcançável
  via `select_booker_for_opportunity`, nunca por UPDATE direto (RLS não
  libera `selected_booker_id` pra ninguém por fora da função).
- `cancelada` — estado terminal, artista desiste. Não interage com o
  fluxo de seleção.

### `representation_request_status`
- `pendente` — conta pro limite (5/10/20) do booker, enquanto
  `expires_at > now()`.
- `aceita` — **garante** que existe uma linha correspondente em
  `representations` (trigger cria automaticamente, `on conflict do
  nothing` se já existia por outro caminho).
- `recusada` / `expirada` — terminais, não geram `representations`.
  `expirada` só é setada pela função de sweep
  (`expire_stale_representation_requests`), nunca automaticamente por
  trigger — a Server Action que listar solicitações pendentes precisa
  chamar essa função antes de exibir a lista, senão pode mostrar como
  "pendente" algo que já passou dos 7 dias.

### `opportunity_invitation_status` / `opportunity_interest_status`
- Convite `pendente → aceita` só acontece dentro de
  `select_booker_for_opportunity` (nunca setável direto: a policy de
  update do booker só libera `recusada`).
- Convite `pendente → encerrada` = "outro booker foi selecionado
  primeiro" (é literalmente esse o texto de aviso que o roteiro pede).
- Interesse `pendente → selecionado` / `encerrado` seguem a mesma regra,
  só que não têm status "recusada" (booker que desiste usa `DELETE`,
  não update de status).

### Nomenclatura que a Server Action deve usar exatamente
`booker_profile_id`, `artist_profile_id` (nunca `booker_id`/`artist_id`
soltos, pra bater com o resto do schema já existente desde o Bloco 4).
Enum de distribuição: `'meus_bookers' | 'novos_bookers' | 'ambos'`.
