# ADR 0002 — Arquitetura final: recuperação confiável de mensagens inbound

- **Data:** 2026-10-15 (revisão 7 — Fase 1 preparada localmente, ver seção 8)
- **Status:** Arquitetura aprovada (Fases 2-3 ainda aguardando). **Fase 0 CONCLUÍDA: aplicada em staging e produção.** **Fase 1 (migration `0112_whatsapp_inbound_raw_captures.sql`) preparada e testada localmente (seção 8) — NÃO aplicada em staging/produção, aguardando aprovação separada.** Nenhum push de código/deploy feito ainda — segue represado pelo template `doopla_primeiro_contato_v2`, sem relação com nenhuma destas migrations.
- **Autor:** Claude Code (Principal AI Engineer)
- **Escopo**: arquitetura técnica completa, fases de implementação, critérios objetivos de aprovação, contratos SQL propostos. Implementação é um passo futuro separado, fase por fase, cada uma com sua própria aprovação.

## O que mudou nesta revisão

A revisão 2 (commit `907b683`) acertou a premissa (captura antes do roteamento) mas tratava "idempotência" como um problema só de `persist_inbound_message`. Investigando mais fundo a pedido do Head of AI, achei um problema mais sério e mais geral: **`outbound_intents` não tem NENHUMA proteção própria contra duplicação** — nem unique constraint, nem `ON CONFLICT`. A proteção que existe hoje vem inteira de CADA CHAMADOR ter seu próprio claim externo (`inbound_events` pro ciclo normal, `runtime_pending_replies.status` pra resumption) — um mecanismo de retry novo não herda nenhuma dessas proteções automaticamente só por reaproveitar código. Esta revisão corrige isso e responde às 5 perguntas da forma mais precisa que consegui, com evidência de código real em cada afirmação.

---

## 1. Captura durável e HTTP 200

### Achado adicional: já existe um claim parcial, em dois pontos diferentes e inconsistentes

Descobri que `claim_inbound_event` (migration 0051) já é chamado em DOIS pontos diferentes do fluxo WhatsApp, dependendo do ramo de roteamento:

- **Identidade verificada** (`handleWhatsappInboundMessage` → `resolveProfessionalSelfAndFinish`/`resolveAndFinish` → `triggerInboundMessage`, intake-orchestration.ts:368-450): claim acontece TARDE, só depois de `resolveParticipantAndConversation` ter sucesso.
- **Identidade ambígua/desconhecida** (`claimRawInboundEvent`, intake-orchestration.ts:668-674, chamada na linha 530): claim acontece mais cedo, mas ainda depois de várias leituras de roteamento, e usa a MESMA `claim_inbound_event` só pra idempotência de decisão de prompt — nunca grava o corpo da mensagem.

Nenhum dos dois pontos armazena o conteúdo bruto. Nenhum dos dois é o PRIMEIRO coisa que acontece pra cada mensagem. Esta inconsistência (dois pontos de claim diferentes, a depender do ramo) é parte do problema, não só "falta capturar mais cedo".

### Desenho proposto: um único ponto de captura, uniforme, antes de qualquer ramo

```sql
create table public.whatsapp_inbound_raw_captures (
  id uuid primary key default gen_random_uuid(),
  provider_message_id text not null unique, -- wamid — chave real do provider, nunca gerado por nós
  from_phone text not null,
  body text not null,
  contact_name text not null,
  provider_timestamp_seconds bigint,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'needs_attention')),
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_worker_id text,
  lease_expires_at timestamptz,
  captured_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_conversation_message_id uuid references public.conversation_messages (id) on delete set null
);

create index whatsapp_inbound_raw_captures_due_idx
  on public.whatsapp_inbound_raw_captures (next_attempt_at)
  where status in ('pending', 'processing');
```

`route.ts` passa a ter DUAS passagens explícitas sobre `value.messages`, não uma:

**Passagem 1 — captura (síncrona, decide o HTTP status da resposta à Meta):**
```ts
for (const message of value.messages ?? []) {
  try {
    await captureRawInboundMessage(supabase, { providerMessageId: message.id, from: message.from, body: message.text?.body ?? '', contactName: ..., providerTimestampSeconds: ... });
  } catch (err) {
    captureFailed = true; // nunca interrompe o loop — tenta capturar TODAS antes de decidir o status
  }
}
if (captureFailed) return new NextResponse(null, { status: 503 }); // Meta reentrega o LOTE — seguro, captura é idempotente (ON CONFLICT DO NOTHING)
```

**Passagem 2 — processamento (best-effort, nunca afeta o HTTP status, exatamente como hoje):**
```ts
for (const message of value.messages ?? []) {
  try { await handleInboundMessage(supabase, message, contactNames); }
  catch (err) { console.error(...); } // isolado, segue — processamento pode ficar pra trás, retry fica com o sweep
}
return NextResponse.json({ ok: true });
```

### Por que isso responde exatamente à pergunta

- **Múltiplas mensagens por webhook**: cada uma captura independente na Passagem 1; se qualquer uma falhar, a resposta HTTP é 503 pro LOTE inteiro — Meta reentrega tudo, e a reentrega é segura porque `provider_message_id unique` + `on conflict do nothing` tornam a captura idempotente (mensagens já capturadas no-opam, só a que falhou tem nova chance).
- **Falha parcial do banco**: cada `insert` é uma transação atômica própria (Postgres nunca deixa uma linha "meio gravada") — não existe estado intermediário corrompido, só "gravou" ou "não gravou".
- **Reentrega do lote inteiro**: coberta pelo parágrafo acima — é o mecanismo de recuperação, não um risco.
- **Chave única baseada no identificador real do provider**: `provider_message_id` (wamid), nunca um id gerado por nós.
- **Dado mínimo, LGPD**: só `from_phone`, `body`, `contact_name`, `provider_timestamp_seconds` — o mínimo que `handleWhatsappInboundMessage` precisa pra reconstruir o processamento do zero. `body`/`contact_name` são dado pessoal de cliente — retenção descrita na seção 6.
- **Controle de acesso**: RLS habilitado, sem nenhuma policy pra `authenticated`/`anon` (mesmo padrão de `inbound_events`/`approval_resolution_backoff`) — só `service_role`.

---

## 2. Idempotência completa — além do INSERT duplicado

### Mapa de cada efeito colateral de `runCycle`, com evidência de proteção (ou falta dela)

| Efeito | Mecanismo de proteção hoje | Protegido sob retry-do-zero? |
|---|---|---|
| `persist_inbound_message` (conversation_messages) | **Nenhum** — sem coluna de `provider_message_id`, INSERT puro | **NÃO** — achado crítico, revisão 2 |
| `ensure_opportunity_for_conversation` | RPC "ensure_" — reusa opportunity existente da conversation (nome + comentário confirmam create-if-missing) | Sim |
| `register_inbound_proposal` (via `get_communicated_proposal_candidates`) | Retorna `alreadyClassified: boolean` — já checa se esta mensagem já foi classificada antes de agir | Sim |
| Approval Engine (`try_acquire_approval_resolution_claim`/`commit_approval_resolution`) | Claim/lease completo, F1/F2 stale-context-discard — já testado adversarialmente | Sim |
| Policy Gate (`log_policy_gate_decision`) | Só um log de auditoria — duplicar cria uma linha extra, nunca uma ação dupla | Sim (baixo risco mesmo sem proteção) |
| **`create_outbound_intent` (outbound_intents)** | **Nenhum** — confirmado na migration 0051: INSERT puro, sem `ON CONFLICT`, **sem unique constraint em `trigger_message_id`** | **NÃO — achado crítico desta revisão** |

### Por que `create_outbound_intent` é o achado mais sério

A suposição de que "resumption.ts já prova que isso é seguro" está **errada**, e o Head of AI tinha razão em pedir que eu verificasse com mais cuidado. Rastreei `resolve_runtime_pending_reply_allowed` (migration 0053/0054) até o fim: a proteção contra outbound duplicado no caminho de resumption vem de

```sql
update public.runtime_pending_replies
set status = 'completed', resolved_at = now()
where id = p_pending_reply_id and status = 'pending'
returning * into v_pending;

if v_pending.id is null then
  return query select false, null::uuid; -- já resolvida, no-op idempotente
```

— ou seja, a garantia é **inteiramente do estado de `runtime_pending_replies`**, nunca de `outbound_intents` em si. Minha arquitetura proposta (capturar, reclamar, reprocessar do zero) **não tem** um `runtime_pending_replies` equivalente — então, sem um fix adicional, um retry que já tinha criado um outbound_intent numa tentativa anterior (que falhou DEPOIS disso, em qualquer passo seguinte) criaria um SEGUNDO na nova tentativa. O cron de envio (`send-outbound-intents`) mandaria os dois — **cliente recebe a mesma mensagem duas vezes**, exatamente o cenário que não pode acontecer.

### Fix proposto (bloqueador, antes de qualquer sweep)

```sql
create unique index outbound_intents_one_per_trigger_message_idx
  on public.outbound_intents (trigger_message_id)
  where trigger_message_id is not null;
```

Confirmei que isso é seguro pra TODOS os chamadores existentes: delegated-contact-flow.ts sempre passa `triggerMessageId: null` (o outbound vai pra uma conversation diferente da que gerou o pedido, nunca correlacionado 1:1 por esse campo); cold-outreach e o ciclo normal de pipeline.ts sempre passam o id real, mas são ramos mutuamente exclusivos pra uma mesma mensagem (nunca os dois rodam pro mesmo trigger). Esse índice sozinho já fecha a lacuna pra QUALQUER caminho, não só o retry novo — é uma correção geral, não um remendo específico.

---

## 3. Limites de `resumeOnePendingReply` — os 4 cenários, separados

| Cenário | Mecanismo reutilizável hoje | O que falta |
|---|---|---|
| **(a) Falha antes da resolução de identidade** (resolveVerifiedProfessionalId, slug, bare code — intake-orchestration.ts:382-410) | Nenhum — `inbound_events`/`claimRawInboundEvent` ainda nem existe nesse ponto | Precisa da captura da seção 1 + reexecução completa de `handleWhatsappInboundMessage` (ver Fase 2 abaixo) |
| **(b) Falha antes da persistência da mensagem** (depois de identidade resolvida, antes de `persistInboundMessage`: resolução de participante/conversation, claim, lease, actor context, pre-model gate) | Idem — `inbound_events` existe (tardiamente) mas o conteúdo não | Idem (a) — ainda precisa reexecutar desde a captura, inclusive a resolução de identidade de novo |
| **(c) Falha depois da persistência, antes do Runtime concluir** (classify/plan/approval/gate/outbound) | `resumeOnePendingReply` NÃO serve pra isso — ele exige um `RuntimePendingReply` já existente, criado só quando uma resposta foi EXPLICITAMENTE bloqueada aguardando aprovação (ver (d)). Uma falha técnica genérica nunca cria essa linha. | Função NOVA, mais simples que resumption: retomar classify→outbound a partir de `conversation_messages` já existente, SEM o conceito de "pendência bloqueada" — só "ciclo que não terminou". Reaproveita o padrão (claim/lease/backoff), nunca o `runtime_pending_replies` em si (semântica diferente). |
| **(d) Resposta bloqueada aguardando aprovação** | `resumeOnePendingReply` — exatamente pra isso, já funciona, já testado. Nunca precisa de mudança. | Nada — fora do escopo deste ADR, não é uma "falha", é o comportamento correto do Policy Gate. |

O Head of AI está certo: **(a)/(b)/(c) são três coisas diferentes, e `resumeOnePendingReply` só serve, por desenho, pra (d)**. A Fase 1 proposta abaixo cobre (c) com uma função nova (não reaproveita `resumeOnePendingReply` diretamente, só o mesmo PADRÃO de claim/lease/backoff). (a)/(b) exigem reexecutar a resolução de identidade inteira — Fase 2, mais arriscada (ver seção 4).

---

## 4. Envio de mensagens pelo WhatsApp (`sendSystemWhatsappMessage`) — auditoria

Três call sites em `intake-orchestration.ts`: linha 556 (`INTAKE_ABANDONED_MESSAGE`), 566 (prompt de desambiguação), 585 (`OPENING_QUESTION`). Todos os três ficam DEPOIS de `claimRawInboundEvent` (linha 530) ter sucesso — ou seja, pra uma MESMA mensagem (mesmo wamid), `claim_inbound_event` já impede uma segunda entrada nesse trecho enquanto o claim original ainda está `claimed`/`processed`. **Isso protege contra reentrega do MESMO webhook pela Meta.**

**O que isso NÃO protege**: o cenário que motiva este ADR — uma FALHA DEPOIS do envio, mas antes do claim virar `processed`. Nesse caso, o claim fica em `claimed` com lease vencendo; um sweep futuro que reclame esse evento e reexecute `handleWhatsappInboundMessage` do zero **passaria pelos mesmos sends de novo**, porque o `claim_inbound_event` reclamado passa a aceitar passar de novo (esse é o propósito dele: permitir retry). Não encontrei nenhuma proteção adicional além do claim em si pra esse caso específico.

**Decisão proposta, conforme pedido explícito**: **não autorizar retry automático desses três envios** até existir uma estratégia comprovada. Concretamente: a Fase 2 (retry de cenários (a)/(b), que é onde esses sends acontecem) fica BLOQUEADA até eu desenhar e testar uma dessas duas soluções — nunca assumida resolvida:

1. Idempotência no PRÓPRIO envio: gravar que o prompt X já foi mandado pra este wamid ANTES de mandar (não depois), e checar antes de reenviar — mesmo raciocínio de "claim antes de agir", aplicado ao envio em si, não só à sessão de intake.
2. Ou: nunca reexecutar `handleWhatsappInboundMessage` inteira num retry — em vez disso, antes de reenviar qualquer coisa, consultar o estado já persistido da `channel_inbound_intake` session (`current_prompt_options`) e pular o envio se already enviado — fechando a lacuna real (hoje esse campo protege contra MENSAGENS NOVAS repetirem a pergunta, mas não foi desenhado pensando em "a mesma mensagem sendo reprocessada do zero").

Nenhuma das duas está implementada ou escolhida ainda — fica como pré-requisito explícito da Fase 2, não uma suposição.

---

## 5. Operação e testes

### Estados duráveis de processamento

`whatsapp_inbound_raw_captures.status`: `pending` (capturada, nunca processada) → `processing` (lease ativo) → `completed` (processada com sucesso, `resolved_conversation_message_id` preenchido) | `needs_attention` (esgotou tentativas).

### Lease e concorrência

Mesmo padrão de `claim_inbound_event`/`begin_runtime_pending_reply_attempt`: `for update`, `lease_worker_id`/`lease_expires_at`, nunca dois workers processando a mesma captura ao mesmo tempo.

### Backoff e limite de tentativas

Reaproveita `runtime/retry-backoff.ts` (`computeRuntimeRetryBackoffSeconds`, já existe, já testado) — mesma fórmula (30s base, 30min teto), mesmo teto de tentativas (`RUNTIME_PENDING_REPLY_MAX_ATTEMPTS = 8` como ponto de partida). Nenhuma fórmula nova.

### Estado terminal que exige atenção operacional

`status = 'needs_attention'` depois do teto — mesmo conceito já usado em `runtime_pending_replies`. **Achado da revisão 2, ainda não resolvido**: esse estado hoje não aparece em NENHUM painel (busquei em todo `src/app` — zero resultado em `.tsx`). Monitoramento de verdade exige uma seção nova no Admin (família de `/admin/ia-custo`) cobrindo os DOIS mecanismos (o já existente de pending replies, que também está invisível hoje, e o novo de captura inbound).

### Tratamento de eventos históricos e possíveis duplicatas

Antes de ativar qualquer sweep, rodar uma auditoria única (consulta, não migration) sobre `inbound_events` existentes com `processing_status='failed'` — confirmar quantos há, se algum já tem `conversation_message_id` preenchido (Grau 2, seguro pra Fase 1) vs. não (Grau 1, só resolvido pela Fase 2). Não presumir — medir antes de decidir o que fazer com o histórico.

### Proteção de dados pessoais

`body`/`contact_name` de `whatsapp_inbound_raw_captures` purgados (mantém só metadados: `provider_message_id`, timestamps, status) quando `status='completed'` (sucesso — não precisa mais) OU quando `status='needs_attention'` há mais de 30 dias — mesmo padrão já em produção em `professional_self_pending_messages` (migration 0108).

### Testes necessários (antes de considerar pronto)

- Captura sobrevive a falha em CADA um dos pontos do mapa da seção 1 do ADR anterior (identidade, roteamento, persistência).
- Webhook com múltiplas mensagens: uma captura falha, resto captura OK → resposta 503 → reentrega simulada → idempotência confirmada (nenhuma duplicata, a que faltava agora captura).
- Concorrência: dois workers reclamando a mesma captura — só um ganha.
- **`persist_inbound_message` idempotente por wamid**: chamar duas vezes pro mesmo `provider_message_id` nunca cria segunda linha.
- **`outbound_intents` idempotente por `trigger_message_id`**: tentar criar dois pro mesmo trigger — segunda tentativa falha/no-opa, nunca dois sends.
- Fase 1 (cenário c): mensagem já persistida, falha simulada em cada etapa seguinte (classify/plan/approval/gate/outbound), retry recupera e conclui, sem duplicar NADA.
- Backoff: `attempt_count` incrementa certo, vira `needs_attention` no teto, nunca tenta de novo depois.
- Retenção: corpo purgado nos dois gatilhos (sucesso, esgotamento+prazo).

---

## Plano de implementação em fases, com critério objetivo de aprovação em cada uma

| Fase | Conteúdo | Migration | Critério de aprovação |
|---|---|---|---|
| **0 — Bloqueadores** | `conversation_messages.provider_message_id` + dedup em `persist_inbound_message`; `outbound_intents_one_per_trigger_message_idx` | **Sim — `0111_inbound_outbound_idempotency.sql`, escrita e testada localmente (seção 7). Não aplicada em staging/produção.** | Teste local (Postgres real) provando que chamar cada RPC duas vezes pro mesmo id nunca duplica; zero regressão nos fluxos existentes (toda a suíte atual passando) — **atendido, ver seção 7** |
| **1 — Captura durável + processamento best-effort (sem sweep ainda)** | `whatsapp_inbound_raw_captures`, as duas passagens no webhook (seção 1) | **Sim — `0112_whatsapp_inbound_raw_captures.sql`, escrita e testada localmente (seção 8). Não aplicada em staging/produção.** | Captura sobrevive a falha simulada em cada ponto; webhook com falha parcial de captura devolve 503 e reentrega é idempotente; **nenhum sweep rodando ainda** — só grava, zero risco de reprocessar nada — **atendido, ver seção 8** |
| **2 — Retomada do cenário (c)** | Função nova (claim/lease/backoff sobre captures com `resolved_conversation_message_id is not null`), monitoramento no Admin | Sim (tabela de controle) | Teste de retry real sem duplicar `conversation_messages`/`outbound_intents`/efeitos comerciais; `needs_attention` visível no Admin pros dois mecanismos |
| **3 — Retomada dos cenários (a)/(b)** | Reexecução de `handleWhatsappInboundMessage` do zero | Possivelmente mais colunas | **Bloqueada até a estratégia de idempotência de `sendSystemWhatsappMessage` (seção 4) estar desenhada e testada** — nunca ativada por suposição |

Cada fase é testada e aprovada separadamente antes da próxima, conforme já combinado.

---

## 7. Fase 0 entregue localmente — migration, testes reais, impacto e rollback

Execução autorizada pela fundadora (15/10/2026): "Pode preparar localmente a migration proposta da Fase 0, os testes automatizados e os ajustes isolados necessários... Não aplique a migration em staging ou produção. Não faça push ou deploy." Esta seção é o pacote completo exigido antes de qualquer aplicação real: migration final, resultados com Postgres real, impacto nos chamadores existentes, plano de rollback.

### 7.1 Gap fechado em relação à seção 2 original: upsert-com-reuso, nunca índice nu

A seção 2 (acima) propunha só `create unique index outbound_intents_one_per_trigger_message_idx` — um índice único NU teria o efeito colateral que a fundadora corrigiu explicitamente (ponto 1e): uma segunda tentativa geraria erro de violação de constraint e deixaria o evento preso em `failed` de novo, em vez de encontrar e reusar a linha já criada. A migration entregue (`0111`) nunca usa um índice nu sozinho — todo INSERT protegido virou `insert ... on conflict (...) where ... is not null do nothing returning *`, com fallback de `select` da linha existente quando o `returning` vem vazio. Mesmo padrão nos dois lugares (`conversation_messages`/`outbound_intents`).

### 7.2 Achado novo desta rodada: `outbound_intents` tem DOIS pontos de escrita direta, não um

A seção 2 original só auditou `create_outbound_intent`. Rastreando de novo a pedido da fundadora, confirmei que `resolve_runtime_pending_reply_allowed` (migrations 0053/0054, reescrita em 0083) faz seu PRÓPRIO `insert into outbound_intents` direto — não chama `create_outbound_intent`. Os dois precisavam da mesma correção; a migration 0111 aplica a mesma trava (mesmo índice único, mesmo padrão ON CONFLICT + fallback) nos dois. Um teste de "caminho cruzado" (seção 7.4, teste 6) prova que as duas funções compartilham a MESMA idempotência — chamar uma depois da outra pro mesmo `trigger_message_id` nunca produz duas linhas.

### 7.3 Migration final

`supabase/migrations/0111_inbound_outbound_idempotency.sql` (committed localmente, aplicada em staging — `doopla-qa-staging` —, ainda não em produção):

- `alter table conversation_messages add column provider_message_id text` (aditiva, nullable, zero efeito em linha existente) + `create unique index conversation_messages_one_per_provider_message_idx on conversation_messages (channel, provider_message_id) where provider_message_id is not null` (mesmo molde de `(channel, provider_event_id)` em `inbound_events`, 0051).
- `persist_inbound_message`: `drop function` + `create function` (arity mudou, 9→10 parâmetros — mesmo cuidado já usado em 0062/0066 pra esta function) com `p_provider_message_id text default null` e upsert-com-reuso.
- `create unique index outbound_intents_one_per_trigger_message_idx on outbound_intents (trigger_message_id) where trigger_message_id is not null`.
- `create_outbound_intent` e `resolve_runtime_pending_reply_allowed`: `create or replace` (arity NÃO muda nos dois — só o corpo), upsert-com-reuso nos dois.

### 7.4 Resultados dos testes com Postgres real (local, réplica fiel de 0001-0111 via `supabase start` bare + replay arquivo-a-arquivo)

| # | Teste | Resultado |
|---|---|---|
| 1 | `persist_inbound_message` — 2ª chamada sequencial com o mesmo wamid | Devolve o MESMO `id` da 1ª chamada, 1 única linha em `conversation_messages` |
| 2 | `persist_inbound_message` — 20 chamadas sequenciais rápidas, mesmo wamid | 1 única linha depois das 20 |
| 3 | `persist_inbound_message` — canal sem wamid (`provider_message_id=null`, ex. painel) | Nunca deduplica — 2 chamadas = 2 linhas, comportamento idêntico ao de antes da migration |
| 4 | `create_outbound_intent` — 2ª chamada sequencial com o mesmo `trigger_message_id`, conteúdo DIFERENTE da 1ª | Devolve o MESMO `id`; o `content` da linha permanece o da 1ª tentativa (a que já estava "em voo" nunca é sobrescrita por uma decisão posterior do Planner) |
| 5 | `create_outbound_intent` — `trigger_message_id=null` (cold outreach/delegação) | Nunca deduplica — 2 chamadas = 2 linhas, comportamento idêntico ao de antes |
| 6 | **Concorrência real** — 25 conexões `psql` SEPARADAS (processos de SO distintos, não coordenadas por uma única transação) disparadas quase simultaneamente contra o MESMO wamid | 25/25 devolveram o mesmo `id`; 1 única linha em `conversation_messages` |
| 7 | **Concorrência real** — mesmo desenho, 25 conexões simultâneas contra o MESMO `trigger_message_id` em `create_outbound_intent` | 25/25 devolveram o mesmo `id`; 1 única linha em `outbound_intents` |
| 8 | Caminho cruzado — `resolve_runtime_pending_reply_allowed` cria o outbound_intent; chamar `create_outbound_intent` DIRETO depois, mesmo `trigger_message_id` | Devolve o MESMO `id` já criado pela primeira função — 1 única linha, confirma que as duas escritas (7.2) compartilham a mesma trava |
| 9 | `trigger_message_id` DIFERENTE em paralelo ao teste 4 nunca colide com ele | Linha distinta criada normalmente — índice parcial nunca super-generaliza |
| 10 | Regressão: outbound_intent criado pelo caminho idempotente continua `claimable` normalmente por `list_claimable_outbound_intents`/`claim_outbound_intent_for_send` (0057/0083) | Sem alteração de comportamento — claim concedido normalmente |
| 11 | Suíte completa do projeto após a migration + ajustes de TS | `npm run typecheck` (0 erros), `npm run lint` (0 erros, 2 warnings pré-existentes não relacionados), `npm run test` (192/192 testes, 22 arquivos), `npm run build` (sucesso) |

Testes 6 e 7 são a prova que a fundadora pediu explicitamente (concorrência entre workers, não só sequência de tentativas numa sessão só) — 25 processos `psql` reais, não 25 chamadas dentro de uma transação.

### 7.5 Impacto nos chamadores existentes

- **`create_outbound_intent`**: 4 call sites reais (`pipeline.ts:550` ciclo normal, `pipeline.ts:751` cold-outreach, `delegated-contact-flow.ts:332`/`:585`). Nenhum passa dois `trigger_message_id` iguais de propósito pro mesmo ciclo (`resolveOutboundAction` em `recipient.ts` retorna só UM de `'create_outbound_intent' | 'persist_ai_message' | 'none'`, nunca os dois); os dois call sites de delegação sempre passam `null`. Nenhum comportamento muda pra nenhum deles — a assinatura SQL não mudou, só o corpo.
- **`resolve_runtime_pending_reply_allowed`**: mesma conclusão — assinatura inalterada, corpo mais seguro.
- **TS**: `src/lib/runtime/outbound.ts` — nenhuma mudança (assinatura da RPC não mudou). `src/lib/runtime/intake.ts` — `persistInboundMessage` ganhou `providerMessageId?: string | null` opcional; único call site real (`pipeline.ts:173`) agora passa `event.providerMessageId` (campo que já existia em `InboundEvent`, nunca precisou de plumbing novo). Nenhum teste existente mockava essa RPC (wrappers finos não têm suíte própria neste projeto) — a prova de correção é a seção 7.4, contra Postgres real, não um mock.
- **Nenhuma migration de dados**: `provider_message_id` é aditiva e começa `null` em toda linha existente — zero backfill, zero linha afetada retroativamente.

### 7.6 Verificação pendente da fundadora antes de aplicar (ponto 1d)

Query read-only preparada em `/tmp/.../scratchpad/0111_verificacao_duplicatas_producao.sql` (entregue separadamente) — confirma que não há `trigger_message_id` duplicado em `outbound_intents` em produção antes do `create unique index` rodar lá. Localmente (banco de teste, sem dados reais) o resultado é 0 linhas, como esperado — não substitui rodar contra produção.

### 7.7 Plano de rollback

Reversível sem perda de dado, em qualquer ordem (recomendado: reverter as duas functions primeiro, depois os índices, numa migration de rollback só se for aplicada em ambiente já migrado):

```sql
-- 1. Reverter persist_inbound_message pra versão 0098 (9 parâmetros —
--    precisa dropar a versão de 10 parâmetros primeiro, mesmo cuidado
--    de arity desta migration).
drop function if exists public.persist_inbound_message(uuid, text, uuid, uuid, text, text, text, uuid, uuid, text);
-- ... recriar com o corpo exato de 0098 (sem p_provider_message_id, sem ON CONFLICT) ...

-- 2. Reverter create_outbound_intent e resolve_runtime_pending_reply_allowed
--    pro corpo exato de 0083 (mesma assinatura — create or replace basta).

-- 3. Remover os dois índices novos (nenhuma linha depende deles).
drop index if exists public.outbound_intents_one_per_trigger_message_idx;
drop index if exists public.conversation_messages_one_per_provider_message_idx;

-- 4. A coluna conversation_messages.provider_message_id pode ficar
--    (nullable, sem custo, sem dependente) — recomendo NÃO dropar
--    mesmo em rollback: dropar e recriar depois custa mais do que
--    deixar uma coluna aditiva não usada.
```

Nenhuma etapa do rollback apaga ou altera uma linha existente em `conversation_messages`/`outbound_intents` — reverte só a função e os índices, nunca o dado.

### 7.8 Recomendação

Bate com a arquitetura já aprovada (seções 1-3) e fecha os 5 pontos exigidos antes da implementação, incluindo o gap do índice nu (1e) e o segundo ponto de escrita (`resolve_runtime_pending_reply_allowed`) que a auditoria original não tinha nomeado.

### 7.9 Status real (atualizado 15/10/2026)

1. ✅ Query de 7.6 rodada em produção pela fundadora — **0 linhas**, sem duplicidade histórica.
2. ✅ Migration 0111 aplicada em **staging** (`doopla-qa-staging`, projeto Supabase separado de produção, confirmado pela fundadora) — sucesso, sem erro, consistente com os testes locais da seção 7.4.
3. ✅ **Fase 0 considerada validada por mim** — decisão técnica minha, não precisou de nova rodada de teste da fundadora: a evidência já reunida (seção 7.4 — Postgres real, inclusive 25 conexões concorrentes reais pro mesmo wamid/trigger — mais a aplicação limpa em staging, schema idêntico) foi suficiente.
4. ✅ **Migration 0111 aplicada em PRODUÇÃO** (15/10/2026, pela fundadora via SQL Editor, com aprovação explícita dela pedida e dada antes). "Success. No rows returned" — mesmo resultado limpo de staging, nenhum erro de constraint/arity.

**Fase 0 está concluída.** `conversation_messages.provider_message_id`, `persist_inbound_message` idempotente por wamid, `outbound_intents_one_per_trigger_message_idx` e `create_outbound_intent`/`resolve_runtime_pending_reply_allowed` idempotentes por `trigger_message_id` — tudo em produção, protegendo qualquer retry futuro (inclusive os que a Fase 1 vai introduzir) contra duplicar mensagem ao cliente ou duplicar envio comercial.

**Confirmação independente (16/10/2026)**: a pedido do Head of AI, a fundadora rodou em produção a consulta de catálogo/contagem de `0111_confirmacao_schema_producao.sql` (read-only, sem passar pelo meu relato) — `duplicatas_outbound = 0`, `duplicatas_inbound = 0`. Confirma, por evidência direta do banco, que os índices únicos foram criados sem violação e que não há nenhuma duplicata pós-migration nos dois lados.

Fase 0 encerrada (produção). Push/deploy real do WhatsApp (Etapa 2.1, "Doopla chama o cliente") continua represado pelo bloqueio do template `doopla_primeiro_contato_v2`, sem relação com nenhuma migration deste ADR.

---

## 8. Fase 1 entregue localmente — captura durável, testes, riscos residuais, sequência de staging

Execução autorizada pela fundadora/Head of AI (15/10/2026, após aprovar o escopo mínimo proposto): "Pode começar a implementação local da captura durável de mensagens do WhatsApp." Mesmas regras da Fase 0: nada aplicado em staging/produção, nenhum push/deploy, sem autorização separada.

### 8.1 Arquivos alterados

- `supabase/migrations/0112_whatsapp_inbound_raw_captures.sql` (novo) — tabela `whatsapp_inbound_raw_captures` + 4 functions: `capture_whatsapp_inbound_raw_message` (idempotente, ON CONFLICT DO NOTHING + fallback SELECT, mesmo padrão da Fase 0), `claim_whatsapp_inbound_raw_capture_for_processing` (claim/lease, só reclama pending ou processing com lease vencida), `finish_whatsapp_inbound_raw_capture` (só aceita o worker dono da lease; completed purga body/from_phone/contact_name na hora — LGPD; needs_attention retém pra investigação), `purge_expired_whatsapp_inbound_raw_captures` (retenção, SEM cron automático nesta rodada — mesmo precedente de `purge_expired_professional_self_pending_message_bodies`, 0108, que também não tem cron próprio hoje).
- `src/lib/channels/whatsapp/raw-captures.ts` (novo) — wrappers finos das 3 RPCs de runtime (capture/claim/finish), mesmo padrão de `inbound-events.ts`/`outbound.ts`.
- `src/app/api/whatsapp/webhook/route.ts` (reescrito) — duas passagens explícitas: Passagem 1 captura todo texto elegível do lote (mesmo filtro de hoje: `type==='text'` com `body`) ANTES de qualquer roteamento; qualquer falha de captura → 503 pro lote inteiro. Passagem 2 reclama a captura (impede duas entregas processando a mesma mensagem em paralelo) e só então chama `handleWhatsappInboundMessage` (inalterada) — nunca afeta o status HTTP.
- `src/app/api/whatsapp/webhook/route.test.ts` (novo, 14 testes) — cobre a orquestração das duas passagens com Supabase mockado.

### 8.2 O que a Fase 1 garante, e o que ainda depende da Fase 2 (pedido explícito da fundadora pra deixar claro)

**Garante agora** (uma vez aplicada): nenhuma mensagem de texto elegível desaparece sem deixar rastro, mesmo que todo o resto do processamento falhe — o conteúdo bruto (telefone, corpo, nome, timestamp) sobrevive em `whatsapp_inbound_raw_captures` até alcançar um destino durável verificado, e fica **visível** (`status='needs_attention'`) quando isso não acontece, em vez de silenciosamente sumir (comportamento de hoje, especialmente nos cenários (a)/(b) do mapa de falhas da seção 3).

**NÃO garante ainda, por desenho desta rodada** (Fase 2, não implementada): uma linha em `needs_attention` não é retomada sozinha. Alguém (um humano, ou um sweep futuro) precisa olhar e decidir o que fazer. Não há cron, não há retry automático. Isso é a lacuna que a Fase 2 ("recuperação automática dos eventos elegíveis", já citada como próximo passo pela fundadora) fecha.

### 8.3 Resultados dos testes

**Postgres real** (réplica local de 0001-0112, `supabase start` bare + replay arquivo-a-arquivo):

| # | Teste | Resultado |
|---|---|---|
| 1 | Captura — retry sequencial do mesmo wamid | Mesmo `id`, 1 única linha |
| 2 | Claim — segundo worker enquanto o primeiro processa | `claimed=false`, nunca os dois ao mesmo tempo |
| 3 | Finish — worker que NÃO detém a lease tenta terminar | Rejeitado (`false`, nenhuma linha afetada) — nunca termina por cima de um processamento mais novo |
| 3b | Finish — worker correto termina com `completed` | Aceito; `body`/`from_phone`/`contact_name` zerados na hora (LGPD) |
| 4 | Claim numa captura já `completed` | Nunca reclamada de novo (terminal nesta fase) |
| 5 | Claim numa captura com lease VENCIDA (worker travado/crashado) | Reclamável por outro worker, `attempt_count` incrementado |
| 6 | Finish com `needs_attention` | Retém `body`/`from_phone`/`contact_name`/erro — nunca purgado na hora |
| 7 | `purge_expired_whatsapp_inbound_raw_captures` | Só afeta `needs_attention` além do prazo; nunca toca `completed` (já zerado) nem `needs_attention` recente |
| 8 | **Concorrência real** — 25 processos `psql` distintos capturando o MESMO wamid simultaneamente | 25/25 mesmo `id`; 1 única linha |
| 9 | **Concorrência real** — 25 processos `psql` distintos reclamando o MESMO wamid simultaneamente | Exatamente 1 `claimed=true`; os outros 24, `false` |

**Bug real pego pelo teste 2** (antes de eu prosseguir): `claim_whatsapp_inbound_raw_capture_for_processing` tinha `attempt_count` ambíguo entre a coluna da tabela e a variável de saída do `RETURNS TABLE` — Postgres recusava a function. Corrigido com alias explícito (`c.attempt_count`) antes de qualquer outro teste rodar. Fica registrado como prova de que os testes locais pegam erro real, não são só formalidade.

**Vitest** (`route.test.ts`, Supabase mockado, 14 testes): captura bem-sucedida → `completed`; falha de captura (banco fora) → 503, Passagem 2 nunca roda; lote com falha PARCIAL de captura → 503 pro lote inteiro, nenhuma mensagem processada (nem a que capturou OK — nunca um sucesso parcial); reentrega do mesmo lote (claim já concluído) → nunca reprocessa; concorrência (claim perdido) → nunca processa em paralelo; exceção durante processamento → `needs_attention`, HTTP ainda 200; os 5 resultados reconhecidos como sucesso durável (`routed`/`duplicate_event`/`backlogged`/`abandoned`/`deferred`) → sempre `completed`; telefone inválido → `needs_attention`, nunca otimista; mensagem não-texto → fora de escopo, comportamento inalterado; assinatura inválida → 401, nunca captura nada.

**Suíte completa**: `typecheck` (0 erros), `lint` (0 erros, 2 warnings pré-existentes não relacionados), `test` (207/207, 23 arquivos — 192 da Fase 0 + 15 novos), `build` (sucesso).

### 8.4 Riscos residuais (declarados, não escondidos)

1. **`purge_expired_whatsapp_inbound_raw_captures` sem cron** — decisão deliberada desta rodada (mesmo precedente de 0108), mas significa que, até alguém ligar isso a um cron (ou chamar manualmente), uma mensagem presa em `needs_attention` retém o conteúdo além dos 30 dias pensados. Baixo risco funcional (só acumula retenção além do previsto), real do ponto de vista de LGPD se ignorado por muito tempo.
2. **`needs_attention` ainda não aparece em nenhuma tela** — mesmo achado já registrado na seção 7 (`runtime_pending_replies`) se repete aqui: o mecanismo existe, a visibilidade operacional (um humano realmente vendo e agindo) ainda depende de alguém olhar o banco direto. Recomendo que a Fase 2 (ou uma etapa de observabilidade isolada, mais barata) resolva os dois mecanismos juntos, nunca dois painéis separados.
3. **Tipo `contacts` (Prioridade 2 do roadmap, ADR 0004) ainda não capturado** — só `type==='text'` é elegível nesta rodada, por desenho (mesmo escopo que já excluía áudio/imagem/documento). Cartão de contato compartilhado hoje passa batido sem captura — vai precisar de uma extensão desta mesma Fase 1 (ou uma tabela irmã) quando a Prioridade 2 for implementada.
4. **Nenhum teste de carga/volume real** — os testes de concorrência provam CORREÇÃO sob concorrência (nunca duas linhas, nunca dois vencedores), não comportamento sob volume alto sustentado. Aceitável pro tamanho do beta hoje; registrar como algo a observar se o volume crescer.

### 8.5 Sequência segura de validação em staging (antes de propor produção)

1. Rodar a migration `0112_whatsapp_inbound_raw_captures.sql` inteira no SQL Editor de staging (mesmo procedimento já usado pra 0111) — DDL puro, sem dado existente afetado (tabela nova).
2. Confirmar a aplicação limpa com uma consulta read-only de catálogo (mesmo padrão de `0111_confirmacao_schema_producao.sql`) — vou preparar a versão equivalente pra 0112 quando chegar a hora.
3. **Teste funcional real recomendado** (diferente da Fase 0, aqui vale mais a pena): mandar uma mensagem de teste pelo número de staging do WhatsApp, se existir, e confirmar `select * from whatsapp_inbound_raw_captures order by captured_at desc limit 1` mostra a linha `completed` com `result_kind` coerente — prova viva de que o webhook de staging está realmente rodando o código novo, não só que a migration aplicou.
4. Só depois disso, proposta de produção, mesmo fluxo de aprovação explícita da Fase 0.

### 8.6 Recomendação (original)

Fase 1 fecha a lacuna mais grave que o Head of AI apontou (mensagem perdida antes de qualquer registro) com o menor escopo possível — sem sweep, sem mudança de comportamento observável pro cliente hoje (a Passagem 2 roda exatamente a mesma lógica de antes). Risco de regressão baixo: toda a suíte de testes existente continua verde, e os testes novos (Postgres real + vitest) cobrem especificamente os cenários que a fundadora/Head of AI exigiram.

---

## 9. Conferência final pré-staging (revisão do Head of AI, 15/10/2026)

Resposta aos 8 pontos pedidos antes de aplicar em staging. **Achado real que mudou código** no ponto 1 — os demais confirmam o desenho já entregue, com evidência de código, não só reafirmação.

### 9.1 Ponto 1 — nenhuma captura marcada `completed` se o processamento falhou, ficou `deferred`, ou outro estado pendente

**Achado real, corrigido antes de staging.** O código original marcava `deferred` como `completed` — eu tinha verificado que o CONTEÚDO estava durável (`professional_self_pending_messages`, migration 0108), mas não diferenciava isso de um resultado genuinamente FINALIZADO. A revisão do Head of AI está certa em cobrar essa distinção: `resolveProfessionalSelfAndFinish` (intake-orchestration.ts:362-365) só devolve `'deferred'` quando `drainResult.watchedStatus !== 'completed'` — ou seja, a linha em `professional_self_pending_messages` está ATIVAMENTE `pending`/`processing`, uma tentativa real ainda em andamento, não um resultado de repouso.

**Correção**: novo status `delegated` (migration 0112, `whatsapp_inbound_raw_captures.status` CHECK estendido pra `('pending', 'processing', 'completed', 'delegated', 'needs_attention')`). `finish_whatsapp_inbound_raw_capture` agora aceita três desfechos, não dois. `deferred` → `delegated` (conteúdo durável, responsabilidade ativa em outro mecanismo com seu próprio ciclo de retomada já testado). `routed`/`duplicate_event`/`backlogged`/`abandoned` continuam `completed` (conteúdo numa posição durável e ESTÁVEL — nada mais em voo pro conteúdo em si). Exceção ou resultado não reconhecido continuam `needs_attention`, nunca por omissão.

Retestado contra Postgres real: `delegated` nunca reclamado de novo (terminal nesta fase, igual `completed`), purga conteúdo na hora (LGPD, igual `completed`), distinto de `needs_attention` (nunca implica falha) e de `completed` (nunca implica resultado definitivo). `route.test.ts` atualizado: teste dedicado prova `deferred` → `delegated`, nunca `completed`. Suíte completa revalidada (207/207, build verde).

### 9.2 Ponto 2 — `backlogged` só completo quando a mensagem está efetivamente preservada

Confirmado por leitura de código, linha a linha: em `handleWhatsappInboundMessage` (intake-orchestration.ts), `append_channel_inbound_intake_message` (linha 541-547) roda **incondicionalmente, ANTES** de qualquer branch que possa devolver `backlogged` (`needs_confirmation`, linha 560-571; `no_signal`, linha 573-589) ou `abandoned` (linha 549-558). Se essa chamada lançar exceção, a exceção propaga até `handleInboundMessageWithCapture`, que marca a captura `needs_attention` — nunca chega a devolver `backlogged`/`abandoned` sem o append ter commitado primeiro. Não há caminho de código onde `backlogged` é devolvido sem a mensagem já estar em `channel_inbound_intake_messages`.

### 9.3 Ponto 3 — dois webhooks concorrentes nunca executam o mesmo processamento nem seus efeitos externos

`claim_whatsapp_inbound_raw_capture_for_processing` é a ÚNICA porta de entrada pra `handleWhatsappInboundMessage` desde a Fase 1 — toda entrega (original ou reentrega da Meta) precisa reclamar a captura antes de processar; só uma consegue por vez (`UPDATE ... WHERE status='pending' OR (status='processing' AND lease vencida)`, atômico). Qualquer efeito externo (`sendSystemWhatsappMessage`, `triggerInboundMessage`) só acontece DE DENTRO de `handleWhatsappInboundMessage` — logo, nunca em paralelo pro mesmo wamid. **Provado sob concorrência real** (seção 8.3, testes 8-9): 25 processos de SO distintos disputando a mesma captura/claim — sempre exatamente 1 vencedor, nos dois casos. Isso também fecha uma pergunta que a seção 2 deste ADR tinha deixado em aberto (`claim_inbound_event`'s `already_processed=false` — lease viva noutro worker): esse cenário agora é estruturalmente inalcançável pro wamid de cliente, porque o claim novo da Fase 1 serializa tudo antes disso.

### 9.4 Ponto 4 — Passagem 1 só responde 200 depois de persistir TODAS as mensagens elegíveis; falha transitória → 503

Confirmado por leitura literal de `route.ts`: o loop da Passagem 1 tenta capturar CADA mensagem elegível do lote (nunca para no primeiro erro — tenta capturar o máximo possível, reduzindo trabalho repetido na reentrega), setando `captureFailed=true` em qualquer falha. `if (captureFailed) return new NextResponse(null, { status: 503 })` roda **antes** de qualquer linha da Passagem 2. HTTP 200 só é alcançável depois do loop inteiro da Passagem 1 terminar com `captureFailed=false`. Testado explicitamente (`route.test.ts`): captura única falhando → 503, Passagem 2 nunca chamada; lote de 2 mensagens com a 2ª falhando → 503 pro lote INTEIRO, nem a 1ª (que capturou OK) é processada.

### 9.5 Ponto 5 — permissões, RLS, retenção, compatibilidade com 0111, rollback de 0112

- **Permissões**: as 4 functions seguem exatamente o padrão de toda function sensível do projeto desde 0051 — `revoke all ... from public`, `grant execute ... to service_role`, `revoke execute ... from anon, authenticated`. Confirmado por grep nas 4, sem exceção.
- **RLS**: `alter table whatsapp_inbound_raw_captures enable row level security`, nenhuma policy pra `authenticated`/`anon` — mesmo padrão de `inbound_events`/`professional_self_pending_messages`. `service_role` bypassa RLS (comportamento padrão do Supabase, não uma policy).
- **Retenção**: `needs_attention` retém corpo até `purge_expired_whatsapp_inbound_raw_captures` (30 dias, SEM cron — risco residual já declarado na seção 8.4). `completed`/`delegated` zeram o corpo na hora do `finish`, nunca retêm.
- **Compatibilidade com 0111**: 0112 não toca nenhum objeto de 0111 — tabela nova, functions novas, zero sobreposição. O fluxo que a Fase 1 envolve (`handleInboundMessage` → `handleWhatsappInboundMessage` → `triggerInboundMessage` → pipeline → `persist_inbound_message`) continua passando `providerMessageId` exatamente como antes — a proteção de idempotência da Fase 0 (0111) fica intacta e ativa por baixo da Fase 1, sem nenhuma mudança.
- **Rollback de 0112** (diferença importante em relação ao de 0111, que era retrocompatível com código antigo — este NÃO é):
  ```sql
  drop function if exists public.purge_expired_whatsapp_inbound_raw_captures(integer);
  drop function if exists public.finish_whatsapp_inbound_raw_capture(text, text, text, text, text);
  drop function if exists public.claim_whatsapp_inbound_raw_capture_for_processing(text, text, integer);
  drop function if exists public.capture_whatsapp_inbound_raw_message(text, text, text, text, bigint);
  drop table if exists public.whatsapp_inbound_raw_captures;
  ```
  **Aviso explícito**: ao contrário de 0111 (onde o código antigo continuava funcionando perfeitamente mesmo sem a migration, porque os parâmetros novos tinham `default null`), o `route.ts` da Fase 1 chama as 4 RPCs de 0112 **incondicionalmente** — se a migration for revertida enquanto o código novo ainda estiver no ar, TODO webhook de WhatsApp passa a falhar (RPC inexistente). Rollback de 0112 só é seguro se feito JUNTO com a reversão do deploy do código (`route.ts` de volta à versão pré-Fase 1), nunca um sem o outro. Isso é inerente ao desenho (a Passagem 1 é, de propósito, obrigatória) — registrado aqui pra nunca ser esquecido na hora de um rollback real.

### 9.6 Ponto 6 — consulta operacional read-only (enquanto `needs_attention` não tem painel)

Preparada separadamente, entregue em arquivo: 5 blocos SELECT — visão geral por status, fila de atenção (`needs_attention`/`processing`/`pending`, com dado pessoal só visível quando `needs_attention` genuíno), alerta de lease vencida persistente (webhook parado?), `delegated` há muito tempo sem o drain concluir, e `needs_attention` perto do prazo de purge. Nenhuma escrita, segura de rodar a qualquer momento.

### 9.7 Ponto 7 — plano de validação funcional em staging (webhook completo, não só a migration)

Pré-requisitos: migration 0112 aplicada em staging + esta branch deployada num ambiente de staging (preview) que sirva `/api/whatsapp/webhook` com o código novo — nenhum dos dois feito ainda, plano pra quando houver aprovação.

1. **Confirmar schema**: consulta de catálogo equivalente à de 0111 (vou preparar a versão de 0112 nessa hora) — tabela + 4 functions existem com a assinatura certa.
2. **Requisição sintética direta ao endpoint de staging** (nunca pelo WhatsApp real — sem enviar mensagem indevida nenhuma): um `curl` assinado com o `WHATSAPP_APP_SECRET` de staging (só quem tem acesso a staging consegue gerar a assinatura — não eu, nesta sessão) simulando o payload da Meta, direto pro endpoint `/api/whatsapp/webhook` de staging. Isso testa o código REAL (Next.js + Postgres de staging) sem depender do número de WhatsApp real nem da Meta de verdade.
3. **Matriz de cenários a rodar**:
   - Mensagem única de texto → confirmar `whatsapp_inbound_raw_captures` tem 1 linha `completed`, `result_kind` coerente.
   - Mesmo `wamid` enviado duas vezes seguidas (simula reentrega da Meta) → confirmar ainda 1 linha, mesmo `id`.
   - Lote com 2 mensagens, `wamid`s diferentes → confirmar as duas capturadas e processadas independentemente.
   - Assinatura inválida → 401, nenhuma linha criada.
   - JSON malformado → 400 (comportamento já existente, só confirmando que não regrediu).
4. **O que NÃO dá pra simular com segurança em staging**: falha de banco durante a captura (exigiria derrubar a conexão de staging de propósito — arriscado demais pro ambiente compartilhado). Essa cobertura já está feita (seção 8.3, `route.test.ts`, mock de falha de captura → 503) — staging valida a integração REAL entre o código e o Postgres de verdade, não reinjeta falha; são complementares, não o mesmo teste duas vezes.
5. Checar a consulta operacional (9.6) depois de cada cenário — confirma visibilidade real, não só o código "parece certo".
6. Usar um número de telefone de teste (nunca um contato real) em todos os payloads sintéticos — nenhum dado de cliente de verdade tocado.

### 9.8 Ponto 8 — auditoria da separação dos 24 commits locais

**Achado real, não assumido**: os 24 commits são uma cadeia linear nesta branch. Os 3 commits represados pelo template (`97d35ff`, `31a2e36`, `308a84d` — os três mais antigos, logo após o último push) estão na BASE da história; todo o resto (Charter, Fase 0, correção do link, Fase 1, ADRs) foi construído EM CIMA deles. Isso significa:

- **Hoje, publicar esta branch (push) publica os 24 juntos** — não existe um "fast-forward parcial" que leve só os 21 de cima sem os 3 de baixo, porque eles são a base da linha do tempo.
- **Dependência real encontrada** (não só teórica): `src/lib/runtime/delegated-contact-flow.ts` e seu `.test.ts` foram tocados tanto pelos 3 commits represados (Etapa 2.1) quanto por commits posteriores (Etapa A/Head of AI, adicionando `logAiUsageEvent` nesse mesmo arquivo). O CONTEÚDO que se sobrepõe é só instrumentação de custo de IA — **nenhuma relação com o template do WhatsApp** — mas um `git cherry-pick` dos 21 commits de cima sozinhos, direto em cima do `origin` atual, provavelmente geraria conflito nesse arquivo (o diff dos commits de cima foi calculado sobre uma versão do arquivo que já inclui as mudanças dos 3 de baixo).

**O que isso significa na prática**: não existe uma ação de git "grátis" pra publicar só a Fase 0/1 sem o trabalho pendente do template. As opções reais são: (a) continuar como está — tudo represado até a aprovação da Meta, sem nenhum risco ou trabalho extra; (b) criar uma branch nova a partir do `origin` atual e reconstruir manualmente só as mudanças de Fase 0/1/ADRs/link nela (recriar `delegated-contact-flow.ts` com só a parte de `logAiUsageEvent`, sem as mudanças de Etapa 2.1) — trabalho real de engenharia, com risco de erro humano/meu ao separar os dois na mão, não uma operação mecânica seguro.

**Minha recomendação**: manter a opção (a) — nenhuma urgência força publicar Fase 0/1 antes da aprovação do template (nada do que foi feito nesta sessão depende de produção estar rodando o código novo; a migration 0111 já está em produção, aplicada manualmente, sem precisar do código correspondente no ar até a Fase 0 do código ser deployada). Se a fundadora decidir que quer Fase 0/1 em produção ANTES da aprovação do template, aí sim vale o esforço de (b) — mas nunca algo que eu faria sem pedir aprovação explícita primeiro, dado o risco de erro numa separação manual de histórico.

---

## 10. Migration 0112 aplicada em staging + testes de integração SQL (autorização de 15/10/2026)

### 10.1 Compatibilidade com o código publicado, confirmada antes de aplicar

Pedido explícito da fundadora/Head of AI antes da aplicação: confirmar que a migration não depende de deploy simultâneo pra manter o webhook funcionando. Confirmado por grep no arquivo inteiro: **zero** `drop function`, `create or replace function` ou `alter table` em objeto pré-existente — só `create table`/`create index`/`create function` com nomes que não existiam antes desta sessão. O código hoje publicado em staging (versão anterior à Fase 1) nunca referencia esses nomes, logo não há como colidir. Aplicação é segura independente de quando o código novo for publicado.

### 10.2 Migration aplicada em staging

A fundadora aplicou `0112_whatsapp_inbound_raw_captures.sql` (versão corrigida, com `delegated`) em `doopla-qa-staging` — sucesso, sem erro. Confirmado depois por consulta de catálogo (schema correto, incluindo o `CHECK` com `delegated`) e pela consulta operacional (0 linhas — esperado, tabela nova, sem tráfego real ainda, já que o código novo não está publicado).

### 10.3 Testes de integração SQL (dados sintéticos, réplica local de staging) — os 7 pontos pedidos

Rodados contra Postgres local, réplica fiel do schema de staging (0001-0112). Todos passaram, `exit code 0`.

| # | Ponto | O que foi provado |
|---|---|---|
| 1 | Captura durável e unicidade por wamid | 2 capturas do mesmo wamid → mesmo `id`, 1 única linha |
| 2 | Concorrência e controle de lease | Segundo claim enquanto o primeiro está ativo → rejeitado; lease vencida → reclamável, `attempt_count` incrementa corretamente (concorrência real de SO já provada em rodada anterior — 25 processos simultâneos, sempre 1 vencedor, resultado repetido aqui pra registro) |
| 3 | Transições entre os 5 estados | `pending` → `processing` → `completed` / `delegated` / `needs_attention`, cada uma testada de ponta a ponta, estado final confirmado em cada caso |
| 4 | Rejeição de transições inválidas | Status desconhecido → exceção `22023`; `finish` numa captura nunca reclamada (ainda `pending`) → `false`, nada muda; segundo `finish` numa captura já `completed` → `false`, não sobrescreve; `claim` numa `needs_attention` → nunca reclamada |
| 5 | Permissões, RLS e acesso restrito | Caller `authenticated` (sem `service_role`) → `not_authorized` (`42501`) nas 4 functions, testado diretamente, não só lido no código; grants confirmados via catálogo (`service_role` sim, `anon`/`authenticated` não); RLS habilitado, 0 policies |
| 6 | Compatibilidade com 0111 | `persist_inbound_message`/`create_outbound_intent` continuam idempotentes por wamid/trigger_message_id depois de 0112 aplicada — nenhuma regressão |
| 7 | Comportamento após interrupção de processamento | Worker reclama e "morre" sem chamar `finish` → conteúdo intacto, nunca perdido; lease expira; worker novo reclama (`attempt_count` incrementa) e conclui → 1 única linha, nunca duplicada |

**Prova adicional pedida**: que `delegated` está de fato correlacionado com um processamento ativo em outro mecanismo durável, não só um status solto. Teste cria uma captura `delegated` E a linha correspondente em `professional_self_pending_messages` com `status='pending'`, depois faz o `JOIN` real pelos dois `provider_message_id`:

```
provider_message_id | status_na_captura | status_na_fila_professional_self | processamento_ainda_nao_terminou
wamid.DELPROVA       | delegated         | pending                          | t
```

Confirma exatamente o que a fundadora pediu: dado `delegated`, é possível identificar objetivamente que o processamento correspondente ainda não terminou (consultando a tabela correlacionada), nunca um estado opaco.

### 10.4 O que ainda falta — nunca confundir aprovação de schema com aprovação ponta a ponta

Como a fundadora explicitamente pediu pra nunca confundir: **tudo acima valida o SCHEMA e as GARANTIAS DE BANCO** (idempotência, concorrência, permissões, transições de estado). **Isso NÃO é validação funcional do webhook Next.js completo** — o código da Fase 1 (`route.ts` reestruturado) ainda não foi publicado em nenhum ambiente real, só testado localmente (vitest, mock de Supabase) e via estes testes SQL diretos às functions. Falta, antes de autorizar produção:

1. Publicar o código da Fase 1 num ambiente de teste seguro (staging) — bloqueado por decisão explícita de não fazer push/deploy nesta rodada.
2. Rodar o plano da seção 9.7 (requisição sintética assinada, direto ao endpoint de staging) contra o código REAL publicado — confirma que `route.ts` chama as RPCs certas, na ordem certa, com os dados certos, algo que nenhum teste de banco sozinho consegue provar.
3. Só depois disso, com os dois níveis (schema + ponta a ponta) validados, proposta de produção.

### 10.5 Relatório breve

Schema da Fase 1 (migration 0112) está validado em staging nos dois níveis possíveis sem publicar código: aplicação limpa, compatibilidade com código atual confirmada antes de aplicar, e os 7 pontos de integração SQL todos passando contra dados sintéticos, incluindo o achado corrigido (`delegated`) com prova de correlação real. Nenhuma regressão em 0111. Falta exclusivamente a validação ponta a ponta do webhook publicado (seção 10.4), que depende de uma decisão de publicar código — fora do escopo autorizado agora.

---

## 11. Checklist curto — sequência de validação da Fase 1 após a aprovação do template da Meta

1. **Publicação controlada em staging**: push desta branch (ou merge pra uma branch que o Vercel deploya como preview/staging), confirmando antes que o `main` do projeto Supabase de staging segue com a migration 0112 aplicada (já está, seção 10.2).
2. **Testes ponta a ponta**: plano da seção 9.7 — requisição sintética assinada, direto no endpoint de staging, matriz de cenários (mensagem única, reentrega do mesmo wamid, lote com 2 mensagens, assinatura inválida, JSON malformado). Confirmar via consulta operacional (entregue em arquivo) que cada cenário produziu o estado esperado em `whatsapp_inbound_raw_captures`.
3. **Revisão dos resultados**: eu apresento os resultados (sucesso/falha de cada cenário, qualquer achado novo) antes de qualquer próximo passo — mesmo formato desta seção do ADR.
4. **Só depois**: proposta de aplicação em produção, com o mesmo rigor já usado pra 0111 (migration final, testes, impacto, rollback) — nunca pulando direto pra produção a partir de staging sem esse relatório intermediário.

---

## 12. Fase 2 — proposta mínima de recuperação automática (SEM implementação)

Resposta aos 8 pontos pedidos (15/10/2026). Nenhum código, nenhuma migration — proposta de arquitetura, pra aprovação antes de eu escrever qualquer coisa.

### 12.1 Achado que molda toda a proposta: o risco real é mais estreito do que parecia

Antes de desenhar o mecanismo, rastreei precisamente O QUE poderia duplicar se `handleWhatsappInboundMessage` for chamada de novo do zero pra uma mensagem interrompida no meio. Resultado, com evidência de código (não suposição):

| Efeito dentro de `handleWhatsappInboundMessage` | Protegido contra retry? |
|---|---|
| `create_conversation` (professional_self OU external_inquiry) | **Sim** — idempotente nos dois ramos (migration 0107 pra professional_self via `pg_advisory_xact_lock` + represented_professional_id; ramo external_inquiry já reaproveitava por external_participant_id desde antes). Confirmado lendo 0107, não presumido. |
| `enqueueProfessionalSelfPendingMessage` | **Sim** — `unique(provider_message_id)` em `professional_self_pending_messages` (0108). |
| `persist_inbound_message` (via `triggerInboundMessage` → pipeline) | **Sim** — idempotente por wamid desde a Fase 0 (0111). |
| `create_outbound_intent`/envio comercial real | **Sim** — idempotente por `trigger_message_id` desde a Fase 0 (0111). |
| `append_channel_inbound_intake_message` | **Sim** — materializa de novo só se `materialized_conversation_message_id` ainda for null (já idempotente, código existente). |
| **`sendSystemWhatsappMessage`** (prompt de desambiguação / pergunta de abertura / mensagem de encerramento por limite de tentativas) | **NÃO.** Confirmado: `claimRawInboundEvent` (linha 530) usa `claim_inbound_event`, mas **`finish_inbound_event` nunca é chamado no ramo ambíguo** (grep confirma zero chamadas em `intake-orchestration.ts`/`pipeline.ts` pro ramo de backlog) — a lease desse claim (300s) expira e fica reclamável de novo, sem nenhum sinal de "já processado". Uma segunda execução pode mandar o MESMO prompt/pergunta/encerramento ao cliente outra vez. |

**Conclusão**: graças à Fase 0 + 0107/0108, o único efeito genuinamente não-protegido é `sendSystemWhatsappMessage` — e ele só é alcançado quando a identidade NÃO resolve de forma determinística (`evaluateWhatsappRouting` devolve `needs_confirmation` ou `no_signal`, nunca `resolved`). Isso estreita exatamente onde a cautela precisa se concentrar — não a função inteira.

### 12.2 Pontos 1-3 — desenho da recuperação, com a distinção de segurança

**Seleção** (ponto 1): elegível pra sweep é toda captura em `pending` (Passagem 2 nunca nem começou — zero execução, zero risco por construção) ou `processing` com `lease_expires_at` vencida (execução começou, destino desconhecido). `needs_attention` entra também, mas só com backoff e nunca pra sempre (ponto 4).

**Reaproveitamento** (ponto 2): zero mecanismo novo de claim/lease — o sweep usa `claim_whatsapp_inbound_raw_capture_for_processing` exatamente como está (já cobre `pending` OU `processing`-com-lease-vencida na mesma cláusula `WHERE`, confirmado na migration 0112). O sweep é, estruturalmente, a MESMA Passagem 2 do webhook, só disparada por um cron em vez de uma requisição ao vivo.

**A distinção que separa seguro de arriscado** (ponto 3 — o cerne do pedido): antes de chamar `handleWhatsappInboundMessage` de verdade, o worker do sweep roda uma "pré-checagem" BARATA e SEM EFEITO COLATERAL — as mesmas leituras puras que `handleWhatsappInboundMessage` já faz antes de decidir (`resolveVerifiedProfessionalId` + extração de token + `evaluateWhatsappRouting`), só que isolada, sem persistir nada. Duas saídas:
- **`outcome === 'resolved'`** (identidade verificada, token determinístico, ou histórico único) → **seguro pra retomar automaticamente**. Esse caminho nunca chama `sendSystemWhatsappMessage` — vai direto pra `resolveProfessionalSelfAndFinish`/`resolveAndFinish`, cujos efeitos são TODOS idempotentes (tabela acima). Sweep executa `handleWhatsappInboundMessage` de verdade.
- **`outcome !== 'resolved'`** (ambíguo, ou sem sinal nenhum) → **NUNCA retomado automaticamente nesta fase**. Fica `needs_attention` com um `result_kind` distinto (ex.: `'ambiguous_retry_blocked'`), visível na consulta operacional, pra alguém decidir manualmente — exatamente a cautela que a fundadora pediu ("mantenha bloqueado qualquer retry automático de prompts... sem idempotência comprovada"). Isso não é uma simplificação insegura — é a tradução direta e precisa dessa instrução pro desenho técnico, baseada no achado da seção 12.1, não um palpite.

Nenhum mecanismo novo de idempotência é necessário pra isso — é reaproveitar `evaluateWhatsappRouting` (já puro, já testado) como um filtro de decisão, nunca uma segunda implementação do algoritmo de roteamento.

### 12.3 Ponto 4 — backoff, limites de tentativas, needs_attention

Reaproveita `computeRuntimeRetryBackoffSeconds`/o ESPÍRITO de `RUNTIME_PENDING_REPLY_MAX_ATTEMPTS` (`retry-backoff.ts`, já usado por `runtime_pending_replies`) — mesma forma, constante própria (ex.: `RAW_CAPTURE_MAX_ATTEMPTS`), nunca uma terceira implementação de backoff no projeto.

- `pending`/`processing`-lease-vencida: sempre elegível de novo, sem backoff (nada falhou ainda — só não terminou).
- `needs_attention` com `result_kind` de uma exceção genérica (potencialmente transitória — ex.: blip de conexão): elegível pra retry com backoff exponencial, até `RAW_CAPTURE_MAX_ATTEMPTS`. Esgotado o limite → permanece `needs_attention`, nunca mais reclamado automaticamente (mesmo padrão de `runtime_pending_replies`).
- `needs_attention` com `result_kind='invalid_phone'` (determinístico — vai falhar do mesmo jeito sempre): **nunca entra no sweep automático**, vai direto pro estado terminal — retentar não muda o resultado, só adia a visibilidade real do problema.
- `needs_attention` com `result_kind='ambiguous_retry_blocked'` (seção 12.2): fica fora do sweep automático até a idempotência de `sendSystemWhatsappMessage` existir (pré-requisito já nomeado da Fase 3) — não tem backoff, porque não é question de "tentar de novo mais tarde", é bloqueio de desenho.

### 12.4 Ponto 5 — monitoramento operacional mínimo

Reaproveita a consulta operacional já entregue (ponto 6 da conferência anterior) como base — adiciona só uma visão nova: quantas linhas estão no "limbo do sweep" (tentativas sendo feitas automaticamente) vs. quantas estão genuinamente travadas esperando decisão humana (`ambiguous_retry_blocked`, `invalid_phone`, ou esgotaram `RAW_CAPTURE_MAX_ATTEMPTS`). Sem painel novo nesta proposta (fora de escopo, mesma decisão já tomada na Fase 1) — SQL read-only, mesmo padrão.

### 12.5 Ponto 6 — retenção e LGPD

Nenhuma mudança na política já definida (0112): `completed`/`delegated` zeram corpo na hora; `needs_attention` retém até `purge_expired_whatsapp_inbound_raw_captures` (ainda sem cron — risco residual já registrado, continua aberto, não piora nem melhora com a Fase 2). Uma linha que esgota `RAW_CAPTURE_MAX_ATTEMPTS` e vira `needs_attention` terminal entra na MESMA janela de retenção das demais, sem tratamento especial.

### 12.6 Ponto 7 — testes necessários antes de implementar

- Sweep nunca retoma uma captura cuja pré-checagem resolve `needs_confirmation`/`no_signal` — marca `ambiguous_retry_blocked`, nunca chama `handleWhatsappInboundMessage`.
- Sweep retoma corretamente `pending` e `processing`-lease-vencida com identidade resolvida — mesma prova de "nunca duplica" já feita pra Fase 0/1 (idempotência de `conversation_messages`/`outbound_intents`/`professional_self_pending_messages` sob a retomada).
- Backoff cresce corretamente, nunca tenta antes da hora; esgota exatamente em `RAW_CAPTURE_MAX_ATTEMPTS`.
- `invalid_phone` nunca entra no sweep, em nenhuma circunstância (teste negativo explícito).
- Concorrência: dois ticks do cron/sweep rodando por acidente ao mesmo tempo nunca processam a mesma captura em paralelo (reaproveita a mesma prova de concorrência real já feita pro claim da Fase 1 — não precisa refazer, só confirmar que o sweep usa a mesma function).
- Teste de interrupção: sweep retomando uma captura que o PRÓPRIO sweep interrompe de novo (crash dentro do crash) — nunca perde, nunca duplica, lease protege de novo.

### 12.7 Ponto 8 — critérios objetivos pra liberar no beta

1. Suíte do ponto 12.6 inteira verde, Postgres real.
2. Zero regressão nas suítes de Fase 0/1 já existentes.
3. Sweep rodando em staging por um período de observação (proponho 48-72h) sem nenhuma captura `ambiguous_retry_blocked` sendo mal classificada (toda vez que cair nesse estado, confirmar manualmente que era mesmo ambíguo, não um bug da pré-checagem).
4. Consulta operacional (12.4) mostrando números plausíveis — nenhum acúmulo crescente de `needs_attention`, nenhuma captura presa em `processing` além do esperado.
5. Aprovação explícita da fundadora/Head of AI pra produção, com o mesmo pacote de sempre (migration final, testes, impacto, rollback).

### 12.8 Fora de escopo, explicitamente (nunca implementado nesta fase)

- Retomada automática de QUALQUER mensagem cuja identidade não resolve deterministicamente — bloqueada até `sendSystemWhatsappMessage` ter idempotência própria (pré-requisito nomeado da Fase 3, que continua bloqueada).
- Cron de purge de retenção (risco residual já aceito, não piora).
- Qualquer painel/UI nova.
- Qualquer mudança em Classifier, Planner, regras comerciais ou Approval Engine.

### 12.9 Recomendação

Proposta deliberadamente pequena: reaproveita 100% dos mecanismos já existentes (claim/lease da Fase 1, backoff de `retry-backoff.ts`, `evaluateWhatsappRouting` puro) — o único código genuinamente novo seria a função de seleção/sweep (espelhando `claim_next_professional_self_pending_message`) e a pré-checagem de roteamento isolada (reaproveitando, nunca reimplementando, `evaluateWhatsappRouting`). Fecha a lacuna mais visível da Fase 1 (conteúdo capturado mas nunca processado) sem tocar no ponto que ainda não tem idempotência comprovada. Recomendo aprovar este escopo antes de eu escrever qualquer migration ou código.

---

## 13. Fase 2 entregue localmente — implementação, testes, riscos residuais

Execução autorizada pela fundadora/Head of AI (15/10/2026): "Aprovo implementar agora a Fase 2 de recuperação automática de mensagens, conforme a proposta da seção 12." Mesmas regras de sempre: nada aplicado em staging/produção, nenhum push/deploy, sem autorização separada.

### 13.1 Arquivos alterados

- `src/lib/channels/whatsapp/intake-orchestration.ts` — nova function exportada `evaluateWhatsappInboundRoutingSafety`: réplica fiel (mesmos helpers privados, zero duplicação de algoritmo) da leitura+decisão de `handleWhatsappInboundMessage`, SEM nenhum efeito colateral. Só `{safe: true}` quando a identidade resolve deterministicamente (verified_professional/token/unique_history/client_confirmation) — é a implementação direta do achado da seção 12.1.
- `src/lib/channels/whatsapp/raw-captures.ts` — nova function `classifyWhatsappInboundResultForCapture` (ÚNICA implementação da classificação completed/delegated/needs_attention, antes duplicada só em route.ts — consolidada aqui e reaproveitada pelo sweep) + `listWhatsappInboundRawCapturesForSweep` (wrapper fino).
- `src/app/api/whatsapp/webhook/route.ts` — refatoração mínima e segura (mesmo comportamento, zero mudança funcional): passa a chamar `classifyWhatsappInboundResultForCapture` em vez de repetir a lógica inline.
- `src/lib/channels/whatsapp/raw-capture-sweep.ts` (novo) — orquestração do sweep: `sweepOneWhatsappInboundRawCapture` (backoff → pré-checagem de segurança → claim → execução real → classificação) e `runWhatsappInboundRawCaptureSweep` (lista + processa sequencialmente, isolamento de falha por captura).
- `src/app/api/runtime/sweep-whatsapp-inbound-raw-captures/route.ts` (novo) — cron endpoint, mesmo padrão de autenticação (`CRON_SECRET`) dos 3 crons já existentes.
- `vercel.json` — novo cron registrado (`* * * * *`, mesma cadência dos demais). Puramente declarativo — inerte até haver deploy, que não foi feito.
- `supabase/migrations/0113_whatsapp_inbound_raw_capture_sweep.sql` (novo) — uma única function nova, `list_whatsapp_inbound_raw_captures_for_sweep` (seleção grosseira, `language sql stable`, mesmo padrão de `list_professional_self_pending_professionals`, 0108). Nenhum mecanismo novo de claim/lease — reaproveita 0112 integralmente.
- `src/app/api/whatsapp/webhook/route.test.ts` — mock ajustado pra usar a implementação real (pura) de `classifyWhatsappInboundResultForCapture` via `importActual`, nunca remockada.
- `src/lib/channels/whatsapp/raw-capture-sweep.test.ts` (novo, 11 testes).

### 13.2 Resultados dos testes

**SQL (Postgres real, réplica local de 0001-0113)**: fixture com 8 cenários (pending, processing com lease vencida, processing com lease VIVA, needs_attention retryable, needs_attention/invalid_phone, needs_attention/ambiguous_retry_blocked, needs_attention com tentativas esgotadas, completed) — a seleção trouxe EXATAMENTE os 3 elegíveis (pending, processing-vencida, needs_attention-retryable), excluindo corretamente os outros 5. Ordem por `captured_at asc` confirmada. `p_limit` respeitado.

**Achado real de metodologia de teste** (não uma falha da migration): testei permissão via JWT claim fake como superuser `postgres` — `list_whatsapp_inbound_raw_captures_for_sweep` pareceu aceitar o caller `authenticated`. Investigando: essa function (como `list_professional_self_pending_professionals`, 0108, que ela espelha) nunca teve um check interno `is_system_caller()` — depende inteiramente de `REVOKE EXECUTE`/`GRANT EXECUTE` no nível real do papel do Postgres. Um teste via JWT-claim-fake como superuser nunca exercita isso de verdade (superuser ignora REVOKE). Corrigido testando do jeito certo — `has_function_privilege` no catálogo — confirmando `service_role_pode=true, authenticated_pode=false, anon_pode=false`, idêntico ao precedente de 0108. Nenhuma mudança de código foi necessária; o gap era só no meu método de teste, registrado aqui por transparência (mesmo padrão de rigor das rodadas anteriores: nunca esconder um achado, mesmo quando o achado sou eu mesmo errando o teste).

**Concorrência**: reaproveitada a prova já feita na Fase 1 (25 processos de SO reais disputando o mesmo claim, sempre 1 vencedor) — o sweep usa a MESMA `claim_whatsapp_inbound_raw_capture_for_processing`, sem nenhum mecanismo de exclusão mútua próprio, então a garantia já provada se aplica integralmente. Duas execuções do sweep (ou o sweep + o webhook) disputando a mesma captura nunca processam em paralelo.

**Vitest** (`raw-capture-sweep.test.ts`, 11 testes): identidade determinística + claim ganho → retoma de verdade, classifica `completed`; `deferred` → `resumed_delegated` (nunca completed, reaproveitando a mesma classificação do webhook); identidade AMBÍGUA → nunca chama `handleWhatsappInboundMessage`, bloqueia com `ambiguous_retry_blocked`; claim perdido → `claim_missed`, nunca processa nem finaliza; exceção durante processamento → `needs_attention`, `resumed_failed`; telefone/corpo ausente (defesa em profundidade) → `invalid_phone` sem sequer chamar a pré-checagem; `pending` nunca respeita backoff (sempre elegível); `needs_attention` com backoff ainda não vencido → `backoff_not_due`, nunca tenta; backoff vencido → tenta normalmente; tally do sweep soma corretamente e uma captura que lança inesperadamente nunca derruba o loop inteiro (isolamento de falha, mesmo princípio do webhook).

**Suíte completa**: `typecheck` (0 erros), `lint` (0 erros, 2 warnings pré-existentes não relacionados), `test` (218/218, 24 arquivos — 207 anteriores + 11 novos), `build` (sucesso, inclusive o novo cron route aparecendo no output).

### 13.3 Riscos residuais (declarados)

1. **Mesma lacuna de monitoramento da Fase 1** — `ambiguous_retry_blocked`/`invalid_phone`/tentativas esgotadas ficam visíveis só via consulta SQL manual (seção 12.4), nenhum painel novo (fora de escopo, decisão deliberada).
2. **Cron nunca testado rodando de verdade** — só a função TS/SQL foi testada (mocks + Postgres real). O disparo periódico real (Vercel cron chamando o endpoint) só será exercitado quando houver deploy — mesma limitação já registrada pra Fase 1 (seção 10.4): esquema e lógica validados, integração ponta a ponta publicada ainda pendente.
3. **`RAW_CAPTURE_SWEEP_MAX_ATTEMPTS=8`** (mesmo valor de `RUNTIME_PENDING_REPLY_MAX_ATTEMPTS`) é um palpite razoável, nunca calibrado com dado real de produção — pode precisar de ajuste depois de observação real em staging/produção (critério 3 da seção 12.7 já previa isso).
4. **Pré-checagem reavalia sinais que podem mudar entre a checagem e a execução real** (ex.: um profissional desativa `public_enabled` no meio) — janela pequena, mesma categoria de risco que já existe no caminho normal do webhook (não introduzida pela Fase 2), não uma regressão nova.

### 13.4 Recomendação

Implementação fiel à proposta aprovada — nenhuma expansão de escopo, reaproveita 100% dos mecanismos já testados (claim/lease, backoff, algoritmo de roteamento). A distinção de segurança do ponto 3 (pré-checagem bloqueando retomada de identidade ambígua) está implementada e testada exatamente como desenhada. Pronta pra revisão do Head of AI; aplicação em staging segue o mesmo processo já estabelecido (apresentar, aguardar aprovação explícita, nunca aplicar sozinho).

## 14. Revisão final de segurança da Fase 2 (4 pontos do Head of AI, 15/10/2026) — dois riscos reais encontrados e corrigidos

A fundadora revisou o relatório da seção 13 com o ChatGPT (Head of AI) e aprovou a implementação como candidata à validação em staging, condicionado a verificar 4 pontos específicos de segurança antes de encerrar a revisão local. Autorização explícita: "Se encontrar um risco real, corrija apenas esse risco localmente, com testes de regressão, sem expandir o escopo. Não faça push, merge, deploy nem aplique migrations." Os pontos 1 e 2 eram riscos reais, não hipotéticos — confirmados por rastreamento de código e corrigidos.

### 14.1 Ponto 1 — TOCTOU entre pré-checagem e execução real

**O risco**: `evaluateWhatsappInboundRoutingSafety` (seção 13.1) só prevê segurança no instante da seleção do sweep. Entre essa leitura e a execução real (`handleWhatsappInboundMessage`, chamada depois do claim), identidade/sessão/histórico podem mudar — a garantia vivia inteiramente na pré-checagem, uma predição, nunca no caminho efetivo de envio.

**A correção**: novo parâmetro `WhatsappInboundHandlerOptions.onlyProvenIdempotentPaths` em `handleWhatsappInboundMessage` (`intake-orchestration.ts`). Dois pontos de aborto controlado, reavaliando a decisão de roteamento no instante real da execução, nunca só na seleção:

1. Antes de `resolveProfessionalSelfAndFinish` (`decision.method === 'verified_professional'`) — se a flag estiver ligada, devolve `{kind: 'retry_blocked', reason: 'professional_self_unproven'}` em vez de executar.
2. Antes de `claimRawInboundEvent` no caminho ambíguo geral (`decision.outcome !== 'resolved'`) — devolve `{kind: 'retry_blocked', reason: 'ambiguous_identity'}`.

Default `false` preserva 100% do comportamento do webhook ao vivo (zero risco de regressão ali); o sweep sempre passa `true`. Defesa em profundidade: a pré-checagem continua existindo como otimização (evita reclamar+processar uma captura previsivelmente bloqueada), mas a garantia real agora é o gate dentro do próprio `handleWhatsappInboundMessage`, reavaliado no instante do envio.

### 14.2 Ponto 2 — `sendProfessionalSelfReplyViaWhatsapp` sem idempotência própria

**O risco**: auditoria do caminho alcançável pela Fase 2 via `resolveProfessionalSelfAndFinish` → `drainProfessionalSelfPendingMessages` → `triggerInboundMessage` → pipeline do Runtime → ramo `persist_ai_message` → `sendProfessionalSelfReplyViaWhatsapp` (`src/lib/runtime/professional-whatsapp-reply.ts`). Essa function é um envio direto ao WhatsApp, documentado no próprio código como nunca passando por `outbound_intents` ("falha de envio aqui NUNCA derruba o ciclo") — zero proteção de idempotência própria. Em `drainProfessionalSelfPendingMessages`, a ordem é claim → `triggerInboundMessage` (pode enviar) → só DEPOIS `finish` marca concluído; um crash entre o envio e o `finish` deixa a linha reclamável, arriscando um segundo envio numa reexecução. Gap sistêmico pré-existente, mas o sweep é um chamador novo que o exercita com mais frequência.

**A correção**: estendido o MESMO gate do ponto 14.1 — `evaluateWhatsappInboundRoutingSafety` agora devolve `{safe: false, reason: 'professional_self_unproven'}` quando `decision.method === 'verified_professional'` (antes era incondicionalmente seguro), e o gate de execução (abort 1 acima) bloqueia a retomada automática pelo mesmo caminho. Nenhuma mudança em `sendProfessionalSelfReplyViaWhatsapp` em si (fora de escopo desta rodada — ela precisaria de idempotência própria pra alguma rotina algum dia poder reenviar por esse caminho com segurança); a correção é só impedir que a Fase 2 a alcance automaticamente até isso existir.

### 14.3 Ponto 3 — checklist de cron e recuperação operacional (confirmado, nenhuma mudança necessária)

Cada item verificado contra a implementação já entregue na seção 13 e os testes existentes:

- **Autenticação `CRON_SECRET`**: endpoint rejeita com 401 antes de qualquer trabalho (mesmo padrão dos 3 crons anteriores, inalterado).
- **Limite por execução**: `limit: 50` passado ao sweep (`runWhatsappInboundRawCaptureSweep`).
- **Isolamento de falha**: `try/catch` por captura no loop sequencial — uma exceção inesperada processando uma captura nunca derruba as demais (testado em `raw-capture-sweep.test.ts`).
- **Lease e backoff respeitados**: reaproveitamento integral de `claim_whatsapp_inbound_raw_capture_for_processing` (0112) e `computeRuntimeRetryBackoffSeconds` — nenhuma fórmula nova.
- **Tentativas esgotadas**: excluídas na seleção SQL (`attempt_count < p_max_attempts`).
- **Visibilidade de `needs_attention`**: coberta pela consulta operacional já entregue na Fase 1 (filtra por status, não por `result_kind` específico — os dois novos valores ficam visíveis automaticamente, nenhuma mudança necessária).
- **Nenhum reprocessamento automático de casos ambíguos**: agora garantido em DUAS camadas — exclusão na seleção SQL (migration 0113, `result_kind not in (...)`) E o gate de execução real (seção 14.1) — mais forte que antes desta rodada, que tinha só a camada SQL/pré-checagem.

### 14.4 Ponto 4 — teste integrado local

Novo arquivo `src/lib/channels/whatsapp/raw-capture-sweep.integration.test.ts` — deliberadamente SEM mockar `intake-orchestration.ts` nem `raw-captures.ts` (ao contrário de todos os outros testes desta área), só os limites externos reais (envio de WhatsApp, pipeline do Runtime, fila de `professional_self`). Dois cenários, atravessando seleção → claim → pré-checagem → processamento real → estado final:

1. **Cenário feliz**: captura pendente → sweep real completo → identidade determinística → `resumed_completed`, nenhum envio de WhatsApp.
2. **A prova central do ponto 4**: `channel_inbound_intakes` configurado como fila de 2 respostas — a 1ª leitura (dentro da pré-checagem) traz uma sessão com uma opção de prompt que a mensagem responde (pré-checagem diz `safe: true`); a 2ª leitura (dentro da execução real) traz a MESMA sessão, mas com `current_prompt_options: []` (simula a sessão mudando nesse meio-tempo — o TOCTOU que a revisão pediu pra fechar). A execução real cai em `no_signal`/ambíguo e o gate aborta. Resultado: `sendWhatsappTextMessage` e `triggerInboundMessage` nunca chamados, `tally.blocked_at_execution === 1`, `tally.blocked_at_precheck === 0`.

Ambos os testes passam.

### 14.5 Arquivos alterados nesta rodada

- `src/lib/channels/whatsapp/intake-orchestration.ts` — `WhatsappInboundHandlerOptions`/`onlyProvenIdempotentPaths`, dois pontos de aborto, `WhatsappInboundHandlerResult` estendido com `retry_blocked`, `evaluateWhatsappInboundRoutingSafety` com o novo motivo `professional_self_unproven`.
- `src/lib/channels/whatsapp/raw-captures.ts` — `classifyWhatsappInboundResultForCapture` consolidada (devolve `{status, resultKind, error}`, fonte única de verdade) + tratamento do novo `retry_blocked`.
- `src/lib/channels/whatsapp/raw-capture-sweep.ts` — `SweepCaptureOutcome` com `blocked_at_precheck`/`blocked_at_execution` (antes só `ambiguous_blocked`); chama `handleWhatsappInboundMessage` com `onlyProvenIdempotentPaths: true`.
- `src/app/api/whatsapp/webhook/route.ts` — usa o `resultKind` consolidado de `classifyWhatsappInboundResultForCapture` em vez de derivar separadamente.
- `src/app/api/whatsapp/webhook/route.test.ts`, `src/lib/channels/whatsapp/raw-capture-sweep.test.ts`, `src/lib/channels/whatsapp/intake-orchestration.test.ts` — ajustes de mock e 7 testes novos no total provando o gate real (não só mocks isolados).
- `src/lib/channels/whatsapp/raw-capture-sweep.integration.test.ts` (novo) — teste integrado do ponto 4.

### 14.6 Validação final

`typecheck` (0 erros), `lint` (0 erros, mesmos 2 warnings pré-existentes não relacionados), `test` (226/226, 25 arquivos — 218 da seção 13 + 2 do novo arquivo integrado + 6 novos nos arquivos existentes), `build` (sucesso).

### 14.7 Correção de rastreabilidade — migration 0113 editada em local errado, corrigida pra 0114

**Erro cometido nesta rodada, encontrado pela fundadora/Head of AI**: na primeira versão desta seção eu havia editado `0113_whatsapp_inbound_raw_capture_sweep.sql` DIRETAMENTE pra adicionar a exclusão de `professional_self_retry_blocked` — mas essa migration já tinha sido registrada como aplicada em staging na sua versão original (seção 10), antes desta correção. Editar um arquivo de migration já aplicado quebra a rastreabilidade entre o que o histórico de migrations de cada ambiente registra como aplicado e o que o arquivo no repositório realmente contém.

**Corrigido**: `0113_whatsapp_inbound_raw_capture_sweep.sql` foi revertido pro seu conteúdo ORIGINAL (idêntico ao que está aplicado em staging). A correção (exclusão de `professional_self_retry_blocked`) virou uma migration incremental nova — `0114_whatsapp_inbound_raw_capture_sweep_professional_self_exclusion.sql`, via `create or replace function` sobre a mesma function, com os grants reafirmados explicitamente. Mesmo padrão já usado no projeto pela `0110_fix_literal_content_lease_function_name_truncation.sql` (correção incremental sobre a 0109, nunca uma edição em local). `raw-captures.ts` ajustado pra citar "migrations 0113/0114" no comentário.

**Limitação desta verificação**: o container desta sessão não tem acesso ao daemon Docker (`Cannot connect to the Docker daemon`, sem permissão pra iniciá-lo), então não foi possível replayar 0001→0113(original)+0114 contra Postgres real nesta rodada, como fiz nas rodadas anteriores. O corpo da function na 0114 é byte-idêntico ao que FOI testado ao vivo na rodada anterior (mesma cláusula WHERE, mesmo valor de exclusão adicionado) — só a embalagem mudou, de `create function` editado em local pra `create or replace function` incremental, um padrão padrão e seguro do Postgres (o mesmo que a 0110 já depende implicitamente). Ainda assim, isto é uma verificação declarada como PENDENTE, não assumida como feita — recomendo rodar a mesma conferência direta por `has_function_privilege`/consulta de exclusão (seção 13.2) assim que houver acesso a Postgres real, antes de aplicar a 0114 em staging.

**Status de staging**: a 0113 aplicada em staging (seção 10) é exatamente a versão original — nenhuma divergência, nenhuma ação necessária sobre ela. A 0114 NÃO foi aplicada em nenhum ambiente — fica pendente de aprovação específica da fundadora, junto com a verificação acima.

### 14.8 Riscos residuais (atualizado da seção 13.3)

Os 4 riscos da seção 13.3 continuam válidos e inalterados. Nenhum risco novo introduzido pela correção do ponto 14.1/14.2 — ela estreita o automatismo (menos casos retomados sozinhos), nunca o amplia. Risco novo desta rodada: a 0114 ainda não foi reconferida contra Postgres real (seção 14.7) — mitigado por ser uma mudança textualmente idêntica a algo já testado, mas declarado em aberto até a reconfirmação.

### 14.9 Recomendação e relatório de prontidão para staging

Os 4 pontos pedidos estão comprovados: (1) TOCTOU fechado por gate na execução real, com teste integrado simulando a divergência; (2) `sendProfessionalSelfReplyViaWhatsapp` agora inalcançável pela retomada automática, mesmo gate; (3) checklist operacional do cron já estava satisfeito, agora com reforço de duas camadas; (4) teste integrado ponta a ponta entregue, incluindo o cenário de divergência. Ambos os riscos reais encontrados foram corrigidos com a mudança mínima necessária — nenhuma expansão de escopo, nenhuma função nova além do gate já desenhado pra este propósito.

**Recomendação do Principal AI Engineer**: a Fase 2 está pronta para validação em staging, com duas pendências administrativas antes de aplicar qualquer coisa lá: (a) reconfirmar a 0114 contra Postgres real assim que houver ambiente disponível (seção 14.7), e (b) aplicar a 0114 (nunca reaplicar a 0113, que já está correta em staging) só depois dessa reconfirmação e de aprovação específica. Nenhum push, merge ou deploy foi feito; os commits permanecem locais aguardando a aprovação do template `doopla_primeiro_contato_v2` pela Meta, conforme a restrição em vigor.

## Próximo passo

Fase 2 revisada e corrigida (seção 14), aguardando validação em staging — aplicar a 0114 (incremental, nunca reaplicar a 0113) é o único passo pendente, condicionado à reconfirmação contra Postgres real e aprovação específica. Fase 3 continua bloqueada até `sendSystemWhatsappMessage`/`sendProfessionalSelfReplyViaWhatsapp` terem idempotência própria. Por instrução explícita da fundadora, a implementação de infraestrutura desta rodada está encerrada aqui — a próxima prioridade de produto é o ADR 0004 (memória profissional, contatos compartilhados pelo WhatsApp, aprendizado com feedback).
