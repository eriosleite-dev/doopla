# ADR 0002 — Proposta: recuperação automática de `inbound_events` com status `failed`

- **Data:** 2026-10-15
- **Status:** Proposto, aguardando aprovação da fundadora — **nada aqui foi implementado**. Nenhuma migration aplicada, nenhum código de runtime alterado.
- **Autor:** Claude Code (Principal AI Engineer), Etapa 3 do plano de Fase 0 do AI Engineering Charter
- **Escopo**: investigação + proposta técnica. Implementação é um passo futuro separado, com sua própria aprovação.

## Causa real da falha (não hipótese — lida direto no código)

O mecanismo de idempotência de `inbound_events` (migration 0051) já foi desenhado pra ser **retry-safe**: a tabela e a function `claim_inbound_event` explicitamente suportam reivindicar de novo um evento com `processing_status='failed'` ou com `lease_expires_at` vencido:

```sql
-- supabase/migrations/0051_runtime_orchestrator.sql
comment on table public.inbound_events is '... processing_status=processed é terminal
(nunca reclaimed); claimed/failed podem ser reclaimed após lease_expires_at
(worker travado/crashado nunca bloqueia o evento pra sempre).';
```

```sql
if v_existing.processing_status = 'failed' or v_existing.lease_expires_at < now() then
  update public.inbound_events
  set processing_status = 'claimed', lease_expires_at = now() + make_interval(secs => p_lease_seconds), ...
  where id = v_existing.id;
  return query select true, v_existing.id, false;
  return;
end if;
```

**O problema não é o mecanismo — é que nada nunca chama `claim_inbound_event` de novo pra um evento que falhou.** Essa function só é chamada quando um evento chega de novo com a mesma chave `(channel, provider_event_id)`. Isso só aconteceria se:

1. **A Meta reentregasse o mesmo webhook** — não acontece. `src/app/api/whatsapp/webhook/route.ts` sempre devolve `200 { ok: true }` depois de processar o lote, mesmo quando uma mensagem individual falha (try/catch por mensagem, `console.error`, segue pro próximo — decisão deliberada documentada no código: "nunca propagamos um 5xx que faria a Meta reenviar o LOTE inteiro de novo"). Do ponto de vista da Meta, a entrega teve sucesso — ela nunca tem motivo pra reenviar essa mensagem específica.
2. **Um sweep/cron interno reivindicasse de novo** — não existe hoje. Busquei no projeto inteiro por qualquer leitura de `inbound_events` com `processing_status='failed'` fora do próprio `claim_inbound_event`/testes — não há nenhuma.

Ou seja: a trava de segurança "nunca preso pra sempre" (comentário do próprio autor original, pipeline.ts linha 65-67) descreve a INTENÇÃO, mas na prática, pro canal WhatsApp, o evento FICA preso pra sempre — porque a única coisa que destravaria (reentrega da Meta) é ativamente impedida pela decisão (correta, por outro motivo) de sempre devolver 200.

## Possibilidade de perda de mensagens de clientes

Real, em dois graus de severidade — depende de QUANDO no ciclo a falha acontece:

**Grau 1 — perda genuína (mensagem nunca fica salva em lugar nenhum).** `inbound_events` não grava o corpo/payload bruto da mensagem (só `channel`, `provider_event_id`, `provider_message_id`, `conversation_message_id`, `error`). Se a falha acontece ANTES de `persistInboundMessage` ter sucesso dentro de `runCycle` (ex.: `resolveSystemActorContext` falha, Pre-Model Gate recusa por um motivo transiente, `resolveOrCreateExternalParticipant` falha) — o texto da mensagem do cliente não existe em NENHUMA tabela. Sem reenvio espontâneo do cliente, está perdida de verdade.

**Grau 2 — mensagem salva, mas ciclo nunca completa.** Se a falha acontece DEPOIS de `persistInboundMessage` ter sucesso (classify, plan, approval, policy-gate, outbound — qualquer exceção não tratada no resto do ciclo), a mensagem aparece em `conversation_messages` (visível no painel/dashboard), mas a Doopla nunca processa nem responde. Menos grave (um humano pode ver e agir manualmente), mas ainda assim silencioso — ninguém é avisado.

**Achado adicional, encontrado agora (bug de observabilidade, não de perda de dado):** o catch externo de `processInboundEvent` (pipeline.ts linhas 76-80) sempre grava `conversationMessageId: null` em `finishInboundEvent`, mesmo nos casos de Grau 2 onde a mensagem FOI salva com sucesso antes da falha posterior. Isso quebra o rastro — mesmo se um humano for investigar, o `inbound_events` não aponta pra `conversation_messages` nesses casos, dificultando reconciliação manual.

## Retry automático e recuperação após interrupções

Não existe hoje. Confirmado por busca no projeto inteiro — nenhum cron/sweep lê `inbound_events` com `processing_status='failed'` ou `claimed` com lease vencido.

## Idempotência e concorrência

O desenho existente é sólido e já testado (claim atômico com `for update`, unique constraint em `(channel, provider_event_id)`, lease com expiração) — um sweep futuro reaproveitaria o MESMO mecanismo sem inventar nada novo, chamando `claim_inbound_event` de novo pra cada linha elegível. Nenhum risco adicional de concorrência além do que já existe e já está testado.

## Limites de tentativas e observabilidade

Não existe hoje nenhuma contagem de tentativas na tabela (`attempt_count` não existe). Sem isso, um sweep que simplesmente reclama e reprocessa tudo que está `failed` reprocessaria pra sempre um evento genuinamente impossível de processar (ex.: payload malformado de forma permanente) — nunca marcaria como "desistir", só tentaria de novo a cada tick do cron indefinidamente.

## Proposta técnica (requer migration — não aplicada)

### 1. Novas colunas em `inbound_events`

```sql
alter table public.inbound_events
  add column raw_payload jsonb,          -- o InboundEvent original (sem reconstrução ambígua)
  add column attempt_count integer not null default 1,
  add column max_attempts integer not null default 5;
```

`raw_payload` resolve o Grau 1 (perda genuína): grava o `InboundEvent` completo (author, body, canal, identificador do destinatário) no MOMENTO do claim inicial, antes de qualquer processamento — então mesmo uma falha na primeira linha do ciclo deixa o suficiente pra reconstruir e tentar de novo depois. Retenção: purgar `raw_payload` quando `processing_status='processed'` (sucesso — nunca mais precisa) ou quando `attempt_count >= max_attempts` após um prazo (ex.: 30 dias) — mesmo padrão já usado em `professional_self_pending_messages` (migration 0108) pra dado pessoal com retenção limitada.

### 2. Sweep novo (mesmo padrão de `drain-professional-self-messages`, cron de 1min já existente)

Uma nova RPC (`list_inbound_events_eligible_for_retry`) seleciona linhas `failed` (ou `claimed` com lease vencido) com `attempt_count < max_attempts`, ordenadas pela mais antiga primeiro (nunca esquece um evento preso atrás de uma fila grande — mesmo raciocínio já documentado em `list_professional_self_pending_professionals`). O sweep chama `claim_inbound_event` de novo pra cada uma (reaproveita 100% o mecanismo existente, incrementa `attempt_count`) e, se concedido, reconstrói o `InboundEvent` a partir de `raw_payload` e chama `processInboundEvent` de novo.

### 3. Corrige o bug de observabilidade

O catch externo de `processInboundEvent` passa a capturar o `conversationMessageId` já conhecido (quando `persistInboundMessage` já rodou) em vez de sempre `null` — rastro completo mesmo em falha tardia.

## Impacto e riscos

- **Risco de reprocessar um evento que na verdade já teve efeito colateral parcial** (ex.: `create_outbound_intent` já rodou antes da falha, e um reprocessamento cria um SEGUNDO outbound_intent): precisa de auditoria cuidadosa de CADA efeito colateral do `runCycle` quanto à idempotência sob reprocessamento — a maioria já é idempotente (claim/lease em outbound_intents, approval_records etc.), mas isso exige verificação linha a linha antes de ativar o sweep, não presunção.
- **Privacidade**: `raw_payload` duplica conteúdo de mensagem (já coberto pela política de dado pessoal existente, mas precisa do mesmo rigor de retenção/expiração do `professional_self_pending_messages`).
- **Reversível**: migration aditiva (novas colunas, nullable/com default) — mas, como já aprendemos com a 0109, aditiva não quer dizer sem custo depois que linhas reais passam a usar o novo estado.

## Validação proposta (antes de considerar pronto)

- Teste local (Postgres real, mesmo rigor da 0109): concorrência de dois workers reivindicando a mesma linha `failed` simultaneamente, `attempt_count` nunca ultrapassa `max_attempts`, `raw_payload` nunca vaza pra fora de `service_role`.
- Teste de idempotência de CADA efeito colateral de `runCycle` sob reprocessamento simulado.

## Próximo passo

Aguardando decisão da fundadora: aprovar o desenho acima (ou pedir ajuste) antes de eu escrever a migration e o sweep de verdade, testar localmente, e só então pedir aprovação de aplicação em produção — mesmo processo já usado pra migration 0109/0111.
