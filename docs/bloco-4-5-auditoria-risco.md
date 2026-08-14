# Auditoria de risco — Bloco 4.5 (antes das Server Actions)

Feita depois do PR #2 (schema do Bloco 4.5) já com CI verde, antes de começar
Server Actions/UI em cima da camada de banco. Corrigida na migration
`0009_bloco_4_5_auditoria_rls.sql`. Ver `docs/bloco-4-5-contrato.md` pro
contrato de nomes/semântica (ponto 3).

**Como foi verificado, não só revisado**: todo achado abaixo foi confirmado
rodando de verdade contra um Postgres 16 local, com uma role `authenticated`
real (`nologin`, sem `bypassrls`, com os mesmos privilégios de tabela que o
Supabase concede por padrão) — não como superusuário. Isso importa porque
superusuário ignora RLS **e** privilégio de coluna por completo; os testes
anteriores (antes desta auditoria) rodaram todos como `postgres` e por isso
não pegaram nenhum destes problemas, incluindo o mais crítico (F0 abaixo).

## Achados corrigidos

| # | Severidade | Tabela | Problema | Correção |
|---|---|---|---|---|
| F0 | **Crítico, bloqueante** | `opportunities` ↔ `opportunity_invitations` | Policies de SELECT circulares (cada uma consulta a outra) → `infinite recursion detected in policy` em qualquer select/update real de oportunidade, não só num caminho raro | Checagem "booker convidado" movida pra função `security definer` (`is_booker_invited_to_opportunity`), que não reaciona RLS por dentro |
| F1 | Crítico | `profiles` | `is_admin` (nova nesta bloco) editável via update direto — qualquer usuário virava admin em si mesmo | Privilégio de coluna: `is_admin` fora da lista de colunas que `authenticated` pode dar update |
| F2 | Alto | `opportunities` | Artista podia escrever `status`/`selected_booker_id`/`selected_at` direto, ignorando `select_booker_for_opportunity()` (trava de linha, fechamento em cascata, log de eventos) | Mesmas 3 colunas tiradas do privilégio de update de `authenticated` |
| F3 | Alto | `representation_requests` | `with check` só travava `artist_profile_id`; artista podia reescrever `booker_profile_id` no mesmo update que aceita, criando a `representations` com a contraparte errada | Só `status`/`responded_at` continuam editáveis direto |
| F4 | Médio | `opportunity_invitations` | Booker podia reescrever `opportunity_id` do próprio convite pendente, "recusando" uma oportunidade que nunca foi convidado | Só `status`/`responded_at` continuam editáveis direto |
| F5 | Médio | `booker_profiles` | `representation_request_limit` (nova nesta bloco) editável via update direto — booker subia o próprio limite de 5 pra 20 | Mesmo padrão de F1; de brinde, `profile_id` também sai da lista (mesma classe de bug) |
| F6 | Médio | `representation_requests`, `opportunity_invitations`, `opportunity_interests` | Insert aceitava qualquer valor de status na criação (ex.: interesse já nascendo `selecionado`) | `with check` pina `status = 'pendente'` nas três |
| F7 | Médio | `opportunity_events` | Booker podia inserir qualquer `event_type` pra qualquer `opportunity_id` sob o próprio nome — inclusive `selecionado`/`recebida` forjados, contaminando o dataset do Matching V2 | Cliente só pode inserir `event_type = 'aberta'`; todo o resto já nasce sozinho via trigger ou vem de dentro da função `security definer` |
| F8 | Baixo | `opportunity_tags` | SELECT não respeitava `distribution_mode = 'meus_bookers'` — vazava tags de oportunidade fechada pra booker não convidado | Policy reescrita espelhando exatamente a visibilidade de `opportunities` |
| F9 | Baixo | `opportunity_tags` | Insert não pinava `source = 'explicit'` — artista podia inserir tag alegando ser `'ai'` | `with check` exige `source = 'explicit'` no insert do cliente |

## 1. Matriz de RLS por papel e operação

Convenção: ✅ = existe policy explícita permitindo · ❌ = negado (sem policy
correspondente, ou bloqueado por privilégio de coluna) · "campos X" = update
restrito a essas colunas via privilégio de coluna (não é `with check` — ver
nota no topo da migration 0009 sobre por que RLS sozinho não dá pra travar
coluna por coluna).

### `opportunities`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista dono | ✅ todas as próprias, qualquer status | ✅ só como si mesmo | ✅ campos de conteúdo (descrição, cachê, categoria, local, data, modo...) · ❌ `status`/`selected_booker_id`/`selected_at` (só via `select_booker_for_opportunity`) | ❌ sem policy |
| Booker convidado (`opportunity_invitations`) | ✅ via `is_booker_invited_to_opportunity()` | ❌ | ❌ | ❌ |
| Booker não envolvido | ✅ só se `status` aberto **e** `distribution_mode ∈ {novos_bookers, ambos}` · ❌ se `meus_bookers` e não convidado | ❌ | ❌ | ❌ |
| Admin (`is_admin`) | ✅ todas | ❌ | ❌ (mesma trava de coluna que o artista dono, admin não tem policy de update própria aqui) | ❌ |

### `representation_requests`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista (alvo do pedido) | ✅ próprias | ❌ | ✅ só `status`/`responded_at` (não `booker_profile_id`) | ❌ |
| Booker (quem pediu) | ✅ próprias | ✅ só como si mesmo, `status` obrigatoriamente `'pendente'`, limite reforçado por trigger | ❌ | ❌ |
| Booker não envolvido | ❌ | ❌ (não pode criar pedido em nome de outro booker) | ❌ | ❌ |
| Admin | ❌ (sem policy própria — ver observação abaixo) | ❌ | ❌ | ❌ |

*Observação: admin não tem acesso elevado nesta tabela hoje — não estava no
escopo original do roteiro (curadoria admin é só sobre `opportunity_events`/
`opportunities`), então deixamos como está. Sinalizando pra não ser lido como
esquecimento.*

### `opportunity_invitations`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista dono da oportunidade | ✅ | ✅ só pras próprias oportunidades, `status` obrigatoriamente `'pendente'` | ❌ (nenhuma policy de update pro artista — fechamento é só via função) | ❌ |
| Booker convidado | ✅ | ❌ | ✅ só `status`/`responded_at`, e só pra `'recusada'` (aceitar é exclusivo da função) | ❌ |
| Booker não envolvido | ❌ | ❌ | ❌ | ❌ |
| Admin | ❌ (sem policy própria) | ❌ | ❌ | ❌ |

### `opportunity_interests`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista dono da oportunidade | ✅ | ❌ | ❌ (seleção só via função) | ❌ |
| Booker interessado | ✅ | ✅ só como si mesmo, `status` obrigatoriamente `'pendente'`, só se `distribution_mode`/`status` da oportunidade permitirem | ❌ **sem nenhuma policy de UPDATE** — nem o próprio booker altera o status depois de criado | ✅ a qualquer momento, inclusive depois de `selecionado`/`encerrado` (ver nota abaixo) |
| Booker não envolvido | ❌ | ❌ | ❌ | ❌ |
| Admin | ❌ (sem policy própria) | ❌ | ❌ | ❌ |

*Nota não bloqueante (N3): o booker pode apagar o próprio registro de
interesse mesmo depois de `selecionado`, o que rala um pouco a completude do
histórico que `opportunity_events` foi feito pra preservar (o evento
`interesse` em si continua existindo, só a linha "viva" em
`opportunity_interests` some). Não é falha de segurança — só apaga a própria
linha, não a de ninguém. Considerar restringir a `status = 'pendente'` numa
próxima passada, sem urgência.*

### `opportunity_events`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista dono da oportunidade | ✅ | ❌ (artista não insere evento diretamente — nasce via trigger/função) | ❌ | ❌ |
| Booker (`booker_profile_id` = si mesmo) | ✅ | ✅ **só** `event_type = 'aberta'` | ❌ | ❌ |
| Booker não envolvido | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ todas | ✅ qualquer `event_type`/`opportunity_id` (curadoria manual, `source = 'curadoria_admin'`) | ❌ | ❌ |

### `opportunity_tags`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista dono da oportunidade | ✅ | ✅ só `source = 'explicit'` | ❌ | ❌ |
| Booker com visibilidade da oportunidade (mesma regra de `opportunities`) | ✅ | ❌ | ❌ | ❌ |
| Booker sem visibilidade (ex.: oportunidade `meus_bookers` sem convite) | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ (visibilidade cai no ramo `is_admin` de `opportunities`) | ❌ | ❌ | ❌ |

### `ai_usage_events`

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Dono do registro (`profile_id` = si mesmo) | ✅ | ❌ (só service role grava — sem policy de insert pra `authenticated` de propósito) | ❌ | ❌ |
| Qualquer outro | ❌ | ❌ | ❌ | ❌ |

### `bookings` (existente desde o Bloco 4 — incluída porque foi pedida na auditoria, **não corrigida aqui**, ver seção "Fora do escopo" abaixo)

| Papel | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| Artista da negociação | ✅ | ✅ | ✅ **qualquer coluna, inclusive `artist_profile_id`/`booker_profile_id`** (ver N1) | ❌ |
| Booker da negociação | ✅ | ✅ | ✅ mesmo problema, espelhado | ❌ |
| Parte não envolvida | ❌ | ❌ (`with check` exige ser uma das partes) | ❌ | ❌ |

## 2. Atomicidade real de `select_booker_for_opportunity`

Mecanismo: `select ... for update` trava a linha da oportunidade antes de
checar `selected_booker_id`; a checagem e o update acontecem dentro da mesma
transação da função, então uma segunda chamada concorrente só consegue obter
a trava depois que a primeira já commitou (ou desfez), e nesse ponto
`selected_booker_id` já não é mais `null` — a segunda falha de forma
determinística com `opportunity_already_filled` (`P0001`). Além disso, desde
a F2, essas colunas **só** são graváveis por essa função — não existe mais
caminho de update direto que ignore a trava.

Testado de duas formas:

1. **Sequencial, mesma transação de teste**: primeira chamada seleciona,
   segunda chamada (mesma oportunidade, booker diferente) recebe
   `opportunity_already_filled` de forma determinística — não depende de
   quem "chegou primeiro" em nenhum sentido de corrida real, já que é
   chamada logo em seguida no mesmo teste; o que garante a exclusão mútua
   sob concorrência de verdade é a trava de linha (`for update`), não a
   ordem do teste.
2. **Como role `authenticated` real** (não superusuário) — confirma que a
   proteção sobrevive mesmo sem bypass de RLS/privilégio, e que o caminho
   legítimo (a própria função) continua funcionando normalmente por rodar
   `security definer`.

Cobertura adicional confirmada:

- Terceiro não autorizado (nem artista dono, nem o booker sendo selecionado)
  → `not_authorized` (`42501`).
- Ao selecionar, convites e interesses pendentes de **outros** bookers
  fecham automaticamente (`encerrada`/`encerrado`) e ficam logados em
  `opportunity_events` — confirmado com convite direto + interesse aberto
  coexistindo na mesma oportunidade em modo `ambos`.
- Edição legítima de outros campos da oportunidade (descrição etc.) continua
  funcionando pro artista depois da trava de coluna de F2.

## 3. Contrato banco ↔ aplicação

Ver `docs/bloco-4-5-contrato.md` — nomes de tabela/coluna/enum e o que cada
valor de status garante, incluindo a lista de colunas travadas por
privilégio (só mudam via função/trigger) e os `errcode` que
`select_booker_for_opportunity` pode levantar.

## Fora do escopo desta auditoria (achados, não corrigidos)

Surgiram construindo a matriz da seção 1, mas são de tabelas de blocos
anteriores — não mexemos pra não reabrir o Bloco 4/1 sem pedido explícito.
Registrando pra não virar surpresa depois:

- **N1 — `bookings` (Bloco 4, migration `0003`)**: a policy de UPDATE não
  restringe colunas — qualquer uma das partes pode reescrever
  `artist_profile_id`/`booker_profile_id` do próprio booking, trocando a
  contraparte sem o consentimento dela, além de poder setar `status`
  livremente (esse último já era uma decisão documentada no próprio arquivo
  — "regras de quem pode aceitar/recusar ficam pra Server Action" — mas a
  troca de contraparte não parece intencional). Mesma classe de bug de F3/F4.
- **N2 — `invites` (Bloco anterior, migration `0005`)**: "invitee can
  confirm" só trava `invitee_profile_id`; o convidado pode reescrever
  `inviter_profile_id` antes de confirmar, criando uma `representations`
  com o "convidador" errado se a Server Action de confirmação usar o valor
  já reescrito.

Ambos seguem o mesmo padrão de correção de F3/F4/F2 (trocar a policy de
update "com `using` mas sem `with check` de coluna" por privilégio de coluna
travando tudo exceto o campo de status). Sinalizando como próximo passo
recomendado, fora deste bloco.

## Status

Todos os 9 achados numerados (F1–F9) e o bloqueante F0 corrigidos na
migration `0009_bloco_4_5_auditoria_rls.sql`, verificados rodando as
migrations `0001`–`0009` de ponta a ponta contra Postgres 16 local com role
`authenticated` real (sem bypass de RLS/privilégio) e um teste end-to-end
completo (convite direto + interesse aberto + seleção + fechamento em
cascata) sob esse mesmo papel. `next build`/`tsc`/`eslint` inalterados desde
o PR #2 — esta migration não toca em código de aplicação nem em
`types.ts` (só privilégio de coluna e policies).

Auditoria fechada. Liberado pra começar Server Actions + tela
`/dashboard/oportunidades` em cima desta camada.
