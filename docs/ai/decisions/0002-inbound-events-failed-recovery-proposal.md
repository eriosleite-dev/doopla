# ADR 0002 — Proposta: recuperação confiável de mensagens inbound

- **Data:** 2026-10-15 (revisão 2, após crítica do Head of AI sobre a revisão 1)
- **Status:** Proposto, aguardando aprovação da fundadora — **nada aqui foi implementado**. Nenhuma migration aplicada, nenhum código de runtime alterado.
- **Autor:** Claude Code (Principal AI Engineer)
- **Escopo**: investigação + arquitetura técnica completa. Implementação é um passo futuro separado, com sua própria aprovação.

## Por que esta revisão existe

A revisão 1 deste ADR (commit `367dccf`) propunha só adicionar `raw_payload`/`attempt_count` em `inbound_events` e um sweep que reclama linhas `failed`. O Head of AI apontou corretamente que isso não bastava: **a maior parte da superfície real de falha acontece ANTES de `inbound_events` sequer ter uma linha**, então um sweep sobre essa tabela nunca veria essas falhas. Esta revisão corrige a premissa e cobre as 7 perguntas feitas.

---

## 1. Todos os pontos onde uma mensagem pode falhar, antes e depois da persistência

Rastreei a cadeia real, do webhook até `conversation_messages`, com file:line de cada etapa:

```
Meta POST /api/whatsapp/webhook
  └─ verifyWhatsappWebhookSignature (route.ts:60) — falha = 401, nunca processado (correto: payload não autenticado)
  └─ JSON.parse (route.ts:66) — falha = 400 (correto: payload ilegível)
  └─ for (message of value.messages) — MÚLTIPLAS mensagens por webhook, cada uma isolada por try/catch (route.ts:86-90)
       └─ handleInboundMessage (route.ts:109)
            └─ normalizeWhatsappPhone (phone.ts) — retorno null = ignorado (legítimo, não é falha)
            └─ handleWhatsappInboundMessage (intake-orchestration.ts:368)
                 ├─ resolveVerifiedProfessionalId (:382) ─┐
                 ├─ resolveProfessionalBySlug (:386)       │  TODOS DB reads/RPCs
                 ├─ resolveBareCodeMatches (:397)          │  que podem lançar —
                 ├─ resolveExplicitReservedSlugIntent(:401)│  NENHUM gerou ainda
                 ├─ evaluateWhatsappRouting (:404, pura)   │  uma linha em
                 ├─ [ramo verificado] resolveProfessionalSelfAndFinish
                 ├─ [ramo não verificado] resolveAndFinish │  inbound_events
                 │    └─ resolveParticipantAndConversation │  até aqui.
                 │         (resolve_or_create_external_participant,
                 │          resolução/criação de conversation)
                 │    └─ triggerInboundMessage (trigger.ts:61)
                 │         └─ processInboundEvent (pipeline.ts:48)
                 │              └─ claimInboundEvent (pipeline.ts:53) ◄── PRIMEIRA LINHA EM inbound_events, SÓ AQUI
                 │              └─ acquireConversationLease (pipeline.ts:62)
                 │              └─ runCycle (pipeline.ts:138)
                 │                   └─ resolveSystemActorContext (:139)
                 │                   └─ evaluatePreModelGate (:146)
                 │                   └─ resolveOrCreateExternalParticipant (:162, se author=external)
                 │                   └─ persistInboundMessage (:173) ◄── PRIMEIRA VEZ QUE O TEXTO É SALVO, EM QUALQUER TABELA
                 │                   └─ [daqui em diante: classify/plan/approval/gate/outbound —
                 │                      já coberto pelas correções da Etapa A/2.1, idempotente via claim/lease]
```

**Achado central**: entre a Meta entregar o webhook e `persistInboundMessage` salvar o texto, existem **pelo menos 8 operações assíncronas** (identidade verificada, slug, bare code, reserved slug, resolução de participante/conversation, claim, lease, actor context, pre-model gate) que podem lançar — e **nenhuma delas tem hoje qualquer registro durável do conteúdo da mensagem**. `inbound_events` só nasce na claim (penúltimo passo antes da persistência), não no início. A revisão 1 deste ADR presumia implicitamente que o ponto de falha relevante era "depois da claim" — está errado; a maior fatia da superfície real é ANTES dela.

## 2. Quais eventos têm conteúdo suficiente pra reprocessamento, hoje

- **Falha em qualquer ponto ANTES de `persistInboundMessage` ter sucesso** (a maioria dos pontos do mapa acima): **zero conteúdo recuperável**, em lugar nenhum do banco. Perda real.
- **Falha DEPOIS de `persistInboundMessage` ter sucesso** (dentro de classify/plan/approval/gate/outbound): o texto está salvo em `conversation_messages`, visível no painel — recuperável, mas hoje nada reprocessa automaticamente.

Com a arquitetura proposta abaixo, a resposta muda: **100% dos eventos passam a ter conteúdo suficiente**, por construção — porque a captura durável passa a acontecer ANTES de qualquer lógica que possa falhar, não depois.

## 3. Persistência durável antes do "reconhecimento definitivo", inclusive múltiplas mensagens

Proposta: uma captura bruta, mínima, ANTES de `handleWhatsappInboundMessage` ser chamada — dentro do mesmo loop `for (message of value.messages)` que já isola cada mensagem por try/catch (route.ts:83-90), então cobre nativamente o caso de múltiplas mensagens por webhook (cada uma captura e processa independente da sorte das outras, exatamente como o isolamento de falha já funciona hoje pro processamento).

```sql
-- Nova tabela, deliberadamente separada de inbound_events — nunca
-- participa do claim/lease que já governa QUEM processa; só garante
-- que o CONTEÚDO sobrevive, não importa onde o processamento falhe
-- depois.
create table public.whatsapp_inbound_raw_captures (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique, -- wamid, chave de idempotência
  from_phone text not null,
  body text not null,
  contact_name text not null,
  provider_timestamp_seconds bigint,
  captured_at timestamptz not null default now(),
  -- Preenchido quando o ciclo real finalmente conclui com sucesso —
  -- um sweep nunca mais olha pra uma linha com isto preenchido.
  resolved_conversation_message_id uuid references public.conversation_messages (id) on delete set null
);
```

Escrita via `insert ... on conflict (provider_message_id) do nothing` — idempotente mesmo que o MESMO webhook chegue duas vezes (Meta pode reentregar o lote inteiro se a resposta demorar, por exemplo). Acontece ANTES de qualquer resolução de identidade, então sobrevive a QUALQUER falha downstream, pro webhook inteiro (não só depois da claim).

Por que uma tabela separada em vez de só adicionar colunas em `inbound_events` (como a revisão 1 propunha): `inbound_events` é keyed por `(channel, provider_event_id)` onde `provider_event_id` só é conhecido depois que o `InboundEvent` é montado (dentro de `triggerInboundMessage`) — exigiria mover a criação da linha de idempotência de processamento pra muito mais cedo, o que arriscaria colidir com a semântica de claim/lease já testada e usada em produção. Separar as duas responsabilidades (captura bruta vs. posse de processamento) é mais seguro: nunca toca no mecanismo já comprovado, só adiciona uma rede de segurança por cima.

## 4. Retry automático: backoff, limite de tentativas, concorrência, idempotência

**Não inventar um terceiro mecanismo.** O projeto já tem DOIS backoffs exponenciais provados: `approval/config.ts` (BACKOFF_BASE_SECONDS=60/BACKOFF_MAX_SECONDS=3600, pro Approval Resolver) e `runtime/retry-backoff.ts` (`computeRuntimeRetryBackoffSeconds`, 30s→30min, 8 tentativas, usado por `runtime_pending_replies`/`resumption.ts` — **arquitetura quase idêntica ao que preciso aqui**: tentativa, lease, backoff, `needs_attention` terminal depois do teto).

Proposta: reaproveitar literalmente o padrão de `retry-backoff.ts` (mesmos `RUNTIME_PENDING_REPLY_MAX_ATTEMPTS`-equivalente, mesma fórmula) pra uma nova tabela de controle de retry sobre `whatsapp_inbound_raw_captures` não resolvidas — nunca escrever uma terceira fórmula de backoff do zero.

- **Concorrência**: mesmo padrão já testado em `claim_inbound_event`/`try_acquire_approval_resolution_claim`/`begin_runtime_pending_reply_attempt` — `for update` + lease com expiração. Nenhum risco novo, mecanismo já coberto por teste adversarial em produção.
- **Limite de tentativas**: reaproveitar `RUNTIME_PENDING_REPLY_MAX_ATTEMPTS` (8) como ponto de partida, sujeito a ajuste.
- **Idempotência**: ver seção 5 — aqui é onde a revisão 1 estava mais fraca.

## 5. Garantir que o reprocessamento NUNCA duplica mensagem, resposta comercial ou efeito externo

Esta é a pergunta mais importante, e a resposta precisa ser dividida em duas fases por nível de risco real, não tratada como uma coisa só:

### Achado crítico (bloqueador, precisa de fix antes de QUALQUER retry): `persist_inbound_message` não tem proteção contra duplicação

Conferi o código real: `persistInboundMessage` (intake.ts:25) chama a RPC `persist_inbound_message` sem nunca passar o `provider_message_id` (wamid) da mensagem. Busquei em todas as migrations — `conversation_messages` **não tem nenhuma coluna de wamid/provider_message_id**. Ou seja: hoje, se o MESMO ciclo rodar duas vezes pro mesmo wamid (ex.: um retry ingênuo depois de uma falha que aconteceu DEPOIS de `persistInboundMessage` já ter tido sucesso), uma SEGUNDA linha idêntica em `conversation_messages` seria criada — mensagem duplicada, visível pra profissional e cliente.

**Isso precisa ser corrigido ANTES de qualquer sweep existir, não é opcional**: adicionar `provider_message_id text` em `conversation_messages` (nullable — nem toda mensagem vem de canal com id de provider) + `persist_inbound_message` passar a fazer `on conflict (conversation_id, provider_message_id) where provider_message_id is not null do nothing returning *` (ou equivalente), devolvendo a linha EXISTENTE em vez de criar uma segunda. Com isso, mesmo um retry que re-executa `persistInboundMessage` por engano se torna seguro — idempotência pela chave real do evento, não por "confiar que nunca roda duas vezes".

### Fase 1 (segura pra implementar com a evidência que já tenho): retry de falhas DEPOIS de `persistInboundMessage`

Pra eventos onde a mensagem já foi salva com sucesso (ou seja, exatamente o caso que a revisão 1 deste ADR cobria), o retry não precisa re-executar a resolução de identidade nem re-persistir nada — precisa só retomar classify→plan→approval→gate→outbound a partir da mensagem JÁ existente. **Esse padrão já existe no projeto**: `resumeOnePendingReply` (resumption.ts:160) faz exatamente isso — reexecuta Classifier+Planner do zero sobre uma mensagem/conversation já existentes, nunca re-persiste. A idempotência de tudo depois disso (claim de approval, outbound_intents, policy-gate) já está provada e testada ao longo desta sessão inteira. Esta fase é de baixo risco porque reaproveita um caminho de código já existente e já confiável — não precisa de nova auditoria funda.

### Fase 2 (precisa de auditoria adicional antes de ativar): retry de falhas ANTES de `persistInboundMessage`

Essa fase precisa re-executar a resolução de identidade/roteamento (`handleWhatsappInboundMessage` inteira) — e aí existe um risco real que a revisão 1 não tinha identificado: durante essa resolução, em alguns ramos (sessão de intake ambígua, `backlogged`), o código **já envia uma mensagem real de WhatsApp pro cliente** (`sendWhatsappTextMessage`, intake-orchestration.ts:225 — prompt de desambiguação "você quer falar com X ou Y?"). Se esse envio já aconteceu com sucesso mas uma etapa POSTERIOR falhou antes de `inbound_events` existir, re-executar a função inteira do zero arrisca reenviar o MESMO prompt de novo pro cliente real.

Há evidência de que o sistema já pensa nisso parcialmente — a sessão de `channel_inbound_intake` guarda `current_prompt_options` e parece desenhada pra não duplicar prompt dentro do fluxo normal (múltiplas mensagens da mesma pessoa) — mas eu **não tenho prova ainda** de que esse mesmo controle protege especificamente o caso "a função inteira é chamada de novo do zero para o MESMO wamid depois de uma falha parcial". Isso exige uma auditoria funda — rastrear cada chamada a `sendWhatsappTextMessage` dentro de `intake-orchestration.ts` e confirmar que, numa segunda chamada pro mesmo evento, o estado já persistido faz o código pular o envio em vez de repetir.

**Recomendação**: ativar a Fase 1 primeiro (cobre o caso mais comum — falha depois da persistência — com risco já comprovadamente baixo), e tratar a Fase 2 como um projeto à parte, com a auditoria de idempotência de `intake-orchestration.ts` completa ANTES de qualquer sweep rodar sobre `whatsapp_inbound_raw_captures`. Isso significa: a tabela de captura bruta (seção 3) já pode ser criada e começar a gravar dado real agora (baixo risco, só escreve, nunca aciona nada sozinha) — o SWEEP que a lê e reprocessa fica condicionado a essa auditoria terminar.

## 6. Monitoramento de eventos irrecuperáveis e proteção de dados pessoais

- **Eventos irrecuperáveis**: mesmo padrão de `needs_attention` já usado em `runtime_pending_replies` — depois do teto de tentativas, a linha vira um estado terminal observável, nunca reprocessada automaticamente de novo. Achado ao verificar: **esse estado hoje não aparece em nenhum lugar visível** (busquei em todo `src/app` — `needs_attention` nunca é lido por nenhuma página/painel). Pra cumprir "monitoramento" de verdade, preciso incluir uma seção nova no painel Admin (mesma família de `/admin/ia-custo`) listando eventos `needs_attention`/esgotados dos dois mecanismos (o já existente de pending replies e o novo de inbound) — hoje ninguém vê isso, nem o antigo nem o novo.
- **Dados pessoais**: `whatsapp_inbound_raw_captures.body` duplica conteúdo de mensagem de cliente. Mesma disciplina já usada em `professional_self_pending_messages` (migration 0108): purgar o corpo (manter só metadados) quando `resolved_conversation_message_id` for preenchido (sucesso — não precisa mais) OU quando a linha atingir o estado terminal esgotado após um prazo (ex.: 30 dias) — nunca retenção indefinida de texto de cliente que já falhou em ser processado.

## 7. Testes necessários antes de considerar isto pronto

- **Falha em cada ponto do mapa da seção 1** (simulado, não contra OpenAI/Meta real): confirma que a captura bruta sobrevive mesmo quando CADA uma das 8 etapas anteriores a `persistInboundMessage` falha.
- **Webhook com múltiplas mensagens, uma falha no meio**: mensagem 1 captura e processa OK, mensagem 2 falha e fica capturada pra retry, mensagem 3 captura e processa OK — nenhuma mistura, nenhuma perdida.
- **Concorrência**: dois workers tentando reclamar a mesma captura simultaneamente — só um ganha (mesmo padrão já testado em `claim_inbound_event`).
- **Fase 1 (retry pós-persistência)**: simula uma falha depois de `persistInboundMessage` ter sucesso, roda o retry, confirma UMA ÚNICA linha em `conversation_messages` (nunca duplicada) e que classify/plan/outbound rodam corretamente a partir da mensagem já existente.
- **Backoff e teto**: `attempt_count` incrementa corretamente, respeita a fórmula já existente, vira `needs_attention` no teto, nunca tenta de novo depois disso.
- **`persist_inbound_message` idempotente por wamid**: chamar duas vezes com o mesmo `provider_message_id` pra mesma conversation nunca cria uma segunda linha.
- **Retenção/PII**: corpo é purgado quando `resolved_conversation_message_id` é preenchido e quando o prazo de retenção vence pra linhas esgotadas.

## Resumo da arquitetura proposta (nada implementado ainda)

| Peça | Ação | Migration? | Risco |
|---|---|---|---|
| `conversation_messages.provider_message_id` + dedup em `persist_inbound_message` | Corrige bug crítico de duplicação | Sim | Baixo (aditivo, bloqueador pra tudo mais) |
| `whatsapp_inbound_raw_captures` (captura bruta, sem sweep ainda) | Nova tabela, só escreve | Sim | Baixo |
| Fix do `conversationMessageId: null` hardcoded no catch de `processInboundEvent` | Rastreabilidade | Não (só código) | Muito baixo |
| Sweep Fase 1 (retry pós-persistência, reaproveitando `resumeOnePendingReply`) | Retry automático seguro | Sim (tabela de controle de attempt/backoff) | Baixo — caminho já comprovado |
| Monitoramento (`needs_attention` visível no Admin) | Observabilidade | Não (só UI) | Baixo |
| Sweep Fase 2 (retry pré-persistência, identidade/roteamento) | Retry automático completo | Sim | **Médio-alto — exige auditoria de idempotência de `intake-orchestration.ts` ainda não feita** |

## Próximo passo

Aguardando aprovação da fundadora e do Head of AI sobre esta arquitetura (em particular: concordam com o faseamento 1/2? com a tabela separada de captura bruta?) antes de eu escrever qualquer migration de verdade, testar localmente (mesmo rigor de Postgres real desta sessão) e só então pedir aprovação de aplicação em produção.
