# Auditoria de risco — Bloco 4.5 (schema de oportunidades/matching)

Feita antes de escrever qualquer Server Action em cima da migration
`0018_bloco_4_5_oportunidades_convites_matching.sql`. Escopo estritamente
os 3 pontos pedidos: matriz de RLS, atomicidade da seleção de booker,
contrato de nomes/semântica. Nenhuma feature nova, nenhum redesenho de
produto.

## Histórico — por que este arquivo foi reescrito

A primeira versão deste documento (migration `0019`) e uma segunda
auditoria independente, feita em paralelo no branch de origem do schema
(PR #2, `claude/doopla-bloco-4-5-opportunities-5f15n6`), cobriram **achados
diferentes** e **nenhuma das duas estava completa sozinha** — apesar da
primeira versão deste arquivo dizer "nada ficou pendente sem correção".
Consolidado na migration `0021_bloco_4_5_auditoria_consolidacao.sql`.

O achado mais sério que faltava nas duas: **recursão infinita de RLS**
entre `opportunities` e `opportunity_invitations` (as duas policies de
SELECT se referenciavam em círculo — Postgres resolve isso caindo em
`infinite recursion detected in policy`, o que quebraria qualquer
select/update real de oportunidade em produção). Não apareceu em nenhuma
das duas auditorias porque as duas testaram só como superusuário
(`postgres`), que ignora RLS por completo — só bateu simulando de
verdade uma role `authenticated` sem bypass.

Duas divergências de abordagem entre as auditorias também precisaram ser
resolvidas, não só somadas:

1. **`select_booker_for_opportunity()`** — a versão da `0019` restringiu
   a chamada só ao artista, fechando o buraco de um booker se
   autoselecionar sem convite/interesse, mas isso também quebrava o
   fluxo legítimo do roteiro: *"o primeiro booker efetivamente
   selecionado, seja **aceitando convite direto**, seja sendo escolhido
   entre os interessados"* — aceitar o próprio convite direto pendente
   é a seleção nesse caminho, não uma ação do artista. Versão final
   (`0021`): artista seleciona qualquer booker; o próprio booker só se
   autoseleciona se existir um `opportunity_invitations` **pendente de
   verdade** endereçado a ele.
2. **`opportunity_events` insert** — a `0019` exigia vínculo real
   (convite ou interesse) mas não restringia `event_type` (um booker
   convidado ainda conseguia inserir `event_type = 'selecionado'` pra si
   mesmo); o PR #2 restringia `event_type = 'aberta'` mas não exigia
   vínculo. Versão final: exige as duas coisas.

Achados que só existiam de um lado entraram como estavam, sem
sobreposição: trava de coluna de `opportunities`/`opportunity_invitations`/
`booker_profiles`, pin de `status = 'pendente'` na criação de
`representation_requests`/`opportunity_invitations`/`opportunity_interests`,
e correção de vazamento de visibilidade em `opportunity_tags` (só
existiam no PR #2); checagem de `distribution_mode` no insert de
`opportunity_invitations`, trigger de `profiles.is_admin` e trigger de
identidade de `representation_requests` (só existiam na `0019`).

**Verificação**: tudo abaixo foi confirmado rodando as 20 migrations de
ponta a ponta contra Postgres 16 local, com uma role `authenticated` real
(`nologin`, sem `bypassrls`, privilégios de tabela iguais ao default do
Supabase) — não superusuário — incluindo um teste end-to-end completo
(convite direto + interesse aberto + seleção pelo artista + fechamento em
cascata) sob esse mesmo papel.

## 1. Matriz de RLS por tabela, papel e operação

Papéis: **AD** = artista dono do recurso · **BI** = booker envolvido
(convidado, com interesse registrado, ou já selecionado) · **BN** =
booker não envolvido · **AM** = admin (`profiles.is_admin`).

| Tabela | Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| `opportunities` | AD | ✓ (dono) | ✓ (dono) | ✓ campos de conteúdo — `status`/`selected_booker_id`/`selected_at` travados por privilégio de coluna, só a função grava **[0021 — antes o artista conseguia escrever esses 3 campos direto, ignorando a trava de linha e o fechamento em cascata da função]** | ✗ (sem policy) |
| `opportunities` | BI | ✓ via função `security definer` (convite real, sem recursão) **[0021 — a subquery direta anterior causava "infinite recursion detected in policy"]** | ✗ | ✗ | ✗ |
| `opportunities` | BN | ✓ só enquanto `status` em aberta/em_distribuição/interesse_recebido **e** `distribution_mode` permite descoberta aberta | ✗ | ✗ | ✗ |
| `opportunities` | AM | ✓ (todas) | ✗ | ✗ | ✗ |
| `representation_requests` | AD (artista alvo) | ✓ | ✗ | ✓ só `status`/`responded_at` (trigger reverte qualquer tentativa de reescrever `booker_profile_id`/`artist_profile_id`/`message`/`expires_at`) | ✗ |
| `representation_requests` | BI (booker autor) | ✓ | ✓ só a própria, `status` obrigatoriamente `'pendente'` **[0021 — antes aceitava nascer já `'aceita'`]**, limite de 5/10/20 reforçado por trigger | ✗ | ✗ |
| `representation_requests` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_invitations` | AD | ✓ | ✓ só se `distribution_mode` em (`meus_bookers`,`ambos`) **e** `status` obrigatoriamente `'pendente'` **[0021 — pin de status somado à checagem de distribution_mode que já existia]** | ✗ (sem policy pro artista) | ✗ |
| `opportunity_invitations` | BI | ✓ | ✗ | ✓ só recusar — `status`/`responded_at` travados por privilégio de coluna, `opportunity_id`/`booker_profile_id` imutáveis **[0021 — antes dava pra reapontar o próprio convite pra outra oportunidade]** | ✗ |
| `opportunity_invitations` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_interests` | AD | ✓ | ✗ | ✗ | ✗ |
| `opportunity_interests` | BI | ✓ | ✓ só se `distribution_mode` em (`novos_bookers`,`ambos`), oportunidade ainda aberta, `status` obrigatoriamente `'pendente'` **[0021]** | ✗ (sem policy) | ✓ (retirar o próprio interesse a qualquer momento — nota: mesmo depois de `selecionado`, não é falha de segurança, só rala a completude do histórico) |
| `opportunity_interests` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_events` | AD | ✓ | ✗ | ✗ | ✗ |
| `opportunity_events` | BI | ✓ | ✓ só se `event_type = 'aberta'` **e** já tem convite ou interesse registrado naquela oportunidade **[0021 — combina as duas restrições; cada auditoria sozinha só tinha uma]** | ✗ | ✗ |
| `opportunity_events` | BN | ✗ | ✗ | ✗ | ✗ |
| `opportunity_events` | AM | ✓ (todas) | ✓ (qualquer) | ✗ | ✗ |
| `opportunity_tags` | AD | ✓ | ✓ só `source = 'explicit'` **[0021 — antes dava pra inserir alegando `source = 'ai'`]** | ✗ (sem policy) | ✗ |
| `opportunity_tags` | BI | ✓ (mesma regra de visibilidade de `opportunities`, via função `security definer`) **[0021 — antes vazava tag de oportunidade `meus_bookers` pra qualquer booker autenticado]** | ✗ | ✗ | ✗ |
| `opportunity_tags` | BN | ✗ (mesma regra) | ✗ | ✗ | ✗ |
| `ai_usage_events` | dono (`profile_id`) | ✓ | ✗ (só service role escreve) | ✗ | ✗ |
| `profiles.is_admin` | qualquer usuário | ✓ (próprio) | — | ✗ pra si mesmo (trigger reverte a mudança quando a sessão é de usuário autenticado) | — |
| `booker_profiles.representation_request_limit` | booker dono | ✓ (próprio) | — | ✗ pra si mesmo, só ajustável manualmente/DB direto **[0021 — antes o booker conseguia subir o próprio limite de 5 pra 20]** | — |
| `reviews` (0017, mesma classe de bug, fora do escopo de Bloco 4.5) | reviewer | ✓ | — (só via trigger) | ✓ rating/attributes/comment/status/submitted_at/edited_at | ✗ |
| `reviews` | reviewee | ✓ | — | ✓ só `requested_at`/`contested` | ✗ |

Critério "passou": toda célula tem uma policy explícita (ou privilégio de
coluna) que permite ou nega — nenhuma depende de comportamento implícito
do Postgres, e nenhuma trava depende só de `RLS` quando o que precisava
ser travado era coluna por coluna (RLS não tem acesso a `OLD`/`NEW` pra
comparar "mudou ou não" — por isso as correções marcadas acima usam
`REVOKE`/`GRANT` de coluna ou trigger, não só `with check`).

## 2. Atomicidade de `select_booker_for_opportunity`

**Mecanismo**: `select * from opportunities where id = ... for update`
dentro da função — trava a linha pela duração da transação da chamada.
Uma segunda chamada concorrente pra mesma oportunidade bloqueia na
leitura até a primeira transação terminar; quando é liberada, encontra
`selected_booker_id` já preenchido e cai no `raise exception
opportunity_already_filled` de forma determinística. Não existe janela
entre leitura e escrita em que duas chamadas possam "ambas vencer" — o
lock cobre exatamente esse intervalo. Confirmado com uma role
`authenticated` real chamando a função duas vezes em sequência pra mesma
oportunidade: a segunda falha sempre, de forma determinística.

**Efeitos colaterais** (fechamento de convites/interesses concorrentes,
registro em `opportunity_events`) acontecem dentro da mesma
execução/transação da função, então são atômicos junto com a seleção.

**Autorização (reconciliada na `0021`)**: artista dono pode selecionar
qualquer booker, com ou sem convite/interesse prévio (é ele quem escolhe
entre os interessados do modo aberto, por exemplo). O próprio booker só
pode se autoselecionar quando existe um `opportunity_invitations` com
`status = 'pendente'` de verdade endereçado a ele — é o "booker aceita o
próprio convite direto" do roteiro, não uma brecha. Qualquer outra
combinação (booker sem convite tentando se autoselecionar, ou terceiro
que não é nem o artista nem o booker envolvido) recebe `not_authorized`
(`42501`). Confirmado testando as 5 combinações possíveis.

Além disso, desde a `0021`, `status`/`selected_booker_id`/`selected_at`
só são graváveis por dentro desta função — não existe mais nenhum caminho
de `UPDATE` direto que ignore a trava de linha ou o fechamento em
cascata.

## 3. Contrato banco ↔ aplicação: nomes e semântica

### Tabelas e função que a Server Action vai referenciar
`opportunities`, `representation_requests`, `opportunity_invitations`,
`opportunity_interests`, `opportunity_events`, `opportunity_tags`,
`ai_usage_events`, função
`select_booker_for_opportunity(p_opportunity_id, p_booker_profile_id)`.

### `opportunity_status` — o que cada valor garante
- `rascunho` — reservado pro roteiro, nada no banco usa ainda (toda
  oportunidade hoje nasce em `aberta`). Server Action não deve permitir
  esse valor até o fluxo de rascunho ser construído.
- `aberta` — visível a qualquer booker se `distribution_mode` permitir
  descoberta aberta; aceita convite e/ou interesse conforme o modo.
- `em_distribuicao` / `interesse_recebido` — mesma visibilidade/regras de
  `aberta` na RLS atual; a distinção é só de produto/exibição, o banco
  não impõe diferença de comportamento entre eles ainda.
- `booker_selecionado` — **garante**, de forma atômica (seção 2):
  `selected_booker_id` preenchido, `selected_at` preenchido, todo outro
  convite pendente virou `encerrada`, todo outro interesse pendente virou
  `encerrado`, o convite/interesse do escolhido (se existia) virou
  `aceita`/`selecionado`. Só alcançável via `select_booker_for_opportunity`
  — desde a `0021`, nem por `UPDATE` direto do artista.
- `cancelada` — estado terminal, artista desiste. Não fecha
  automaticamente convites/interesses pendentes (gap conhecido, não
  implementado — fora do escopo desta auditoria).

### `representation_request_status`
- `pendente` — único valor aceito na criação (`0021`); conta pro limite
  (5/10/20 — só ajustável manualmente, nunca pelo próprio booker desde a
  `0021`) enquanto `expires_at > now()`.
- `aceita` — **garante** que existe uma linha correspondente em
  `representations`, com a contraparte correta (trigger de identidade
  impede reatribuir `booker_profile_id`/`artist_profile_id` no mesmo
  update que aceita).
- `recusada` / `expirada` — terminais. `expirada` só é setada pela função
  de sweep (`expire_stale_representation_requests`), nunca
  automaticamente — quem listar pendentes precisa chamar essa função
  antes, senão pode mostrar como "pendente" algo já vencido.

### `opportunity_invitation_status` / `opportunity_interest_status`
- `pendente` — único valor aceito na criação (`0021`) nas duas tabelas.
- Convite `pendente → aceita` só dentro de `select_booker_for_opportunity`
  (a policy de update do booker só libera `recusada`, e trava
  `opportunity_id`/`booker_profile_id` como imutáveis desde a `0021`).
- Convite/interesse `pendente → encerrada`/`encerrado` = "outro booker
  foi selecionado primeiro" (o aviso do roteiro).
- Interesse `pendente → selecionado` não tem "recusada" — booker que
  desiste usa `DELETE`, não update de status (não há policy de update
  pra essa tabela).

### Colunas travadas por privilégio (só mudam via função/trigger, `0021`)
`profiles.is_admin`, `booker_profiles.representation_request_limit`,
`opportunities.status`/`selected_booker_id`/`selected_at`,
`representation_requests.*` exceto `status`/`responded_at`,
`opportunity_invitations.*` exceto `status`/`responded_at`. Update
tentando tocar essas colunas recebe `permission denied for table X`, não
chega nem a avaliar a policy.

### Erros que `select_booker_for_opportunity` pode levantar
| `errcode` | Mensagem | Quando |
|---|---|---|
| `P0002` | `opportunity_not_found` | id não existe |
| `42501` | `not_authorized` | quem chama não é o artista dono, nem o booker com convite pendente real sendo selecionado |
| `P0001` | `opportunity_already_filled` | já existe `selected_booker_id` — traduzir pra "Esta oportunidade foi encerrada. O artista seguiu com outro booker." (texto exato do roteiro) |

### Nomenclatura que a Server Action deve usar exatamente
`booker_profile_id`, `artist_profile_id` (nunca `booker_id`/`artist_id`
soltos, pra bater com o resto do schema já existente desde o Bloco 4).
Enum de distribuição: `'meus_bookers' | 'novos_bookers' | 'ambos'`.

## Fora do escopo (achado, não corrigido)

`bookings` (Bloco 4, migration `0003`) e `invites` (migration `0005`) têm
a mesma classe de bug de UPDATE sem trava de coluna (qualquer uma das
partes pode reescrever a contraparte da relação) — não corrigido aqui pra
não reabrir blocos anteriores sem pedido explícito. Registrando pra não
virar surpresa depois.

## Status

Migration `0021_bloco_4_5_auditoria_consolidacao.sql` fecha os 3 pontos
por completo, combinando as duas auditorias. Verificado de ponta a ponta
com role `authenticated` real. Liberado pra Server Actions + tela
`/dashboard/oportunidades` reconstruída em cima desta camada.
