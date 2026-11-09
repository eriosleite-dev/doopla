# ADR 0009 — Desenho técnico dos 4 mecanismos estruturais (ADR 0008)

- **Data:** 2026-10-20
- **Status:** Proposta de desenho técnico, **nenhum código escrito**. Aguardando sua revisão/aprovação antes de eu implementar qualquer parte.
- **Autor:** Claude Code (Principal AI Engineer)
- **Relacionado:** ADR 0008 (incidente P0, contenção A já em produção) — este documento responde às suas 7 perguntas de validação e detalha os 4 mecanismos (A-D) da seção 5 daquele ADR.

## Como ler este documento

Pra cada mecanismo, respondo: o que existe hoje no código que já ajuda ou que precisa ser evitado, o desenho proposto, e minha recomendação. Marquei explicitamente onde encontrei um atalho tentador que na verdade **não é seguro usar** — prefiro te mostrar o porquê a só usar o caminho mais rápido.

## Achado prévio importante: existe uma "mute" pronta no banco, mas não é segura pra isto

Procurando onde reconectar o mecanismo B, encontrei que `conversations.mandate` (migration 0039) já tem um valor `'suspended'` documentado em comentário, uma function `set_conversation_mandate()` pronta, e uma tabela de auditoria `conversation_mandate_events` — tudo já existe, nunca foi usado (busquei no código inteiro: zero chamadas a `set_conversation_mandate` hoje).

**Por que não vou reaproveitar isso pro "pare de me escrever"**: o Pre-model Policy Gate (`policy-gate.ts:32`) já lê esse campo — `if (conversation.mandate !== 'active') return { ok:false, error:'mandate_not_active' }` — e essa checagem roda **ANTES de `persistInboundMessage`** (`pipeline.ts:146-150`). Se eu marcasse a conversa como `mandate='suspended'` pra representar "pausada", toda mensagem sua enviada enquanto pausado **nunca seria salva no banco** — violaria direto seu requisito "preservar inbound, nenhuma mensagem sua se perde". Pior: a linha na fila (`professional_self_pending_messages`) acumularia tentativas, bateria no teto de 5 e seria marcada `failed` permanentemente — parecendo um bug, não uma pausa intencional.

**Recomendação**: não tocar em `mandate`/Policy Gate pra isto. Mecanismo B usa um campo novo e dedicado, verificado só no mesmo ponto onde a contenção A já verifica hoje (o envio final) — nunca na entrada.

---

## Mecanismo D — Idempotência (recomendo implementar PRIMEIRO)

**Por quê primeiro**: é o mais simples, o de menor risco, e sozinho já elimina duplicata de envio por retry/cron — uma fração real do sintoma do incidente.

**Desenho**: nova tabela `professional_self_whatsapp_sends` (ou uma coluna em `conversation_messages`, mas prefiro tabela separada pra não sobrecarregar uma tabela já crítica):

```sql
create table professional_self_whatsapp_sends (
  ai_message_id uuid primary key references conversation_messages(id),
  provider_message_id text,
  sent_at timestamptz not null default now()
);
```

`sendProfessionalSelfReplyViaWhatsapp` passa a receber `aiMessageId` (já disponível no call site, `pipeline.ts:600` — `aiMessage.id`, hoje não é passado) e faz, antes de qualquer envio real: `insert ... on conflict (ai_message_id) do nothing returning *` — se não retornar linha, **já foi enviado antes, não envia de novo**. A chave é o `id` da mensagem de IA já persistida no painel, nunca inventa um novo identificador.

**Responde sua pergunta 5** (idempotência contra duplicação de cron/retry): isto resolve o caso onde a MESMA `aiMessage.id` tentaria ser enviada duas vezes (ex.: um retry do drain depois de um timeout de rede que na verdade teve sucesso). Não resolve, por si só, o caso onde o Planner gera uma `aiMessage` NOVA pra uma pergunta que já foi superada — isso é o mecanismo A.

---

## Mecanismo A — Verificação de atualidade antes de enviar

**Desenho**: no mesmo ponto onde a contenção já verifica a flag (`professional-whatsapp-reply.ts`, início da function), uma segunda checagem, só quando a flag está ligada:

```sql
select id from conversation_messages
where conversation_id = $1 and direction = 'inbound' and author_type = 'professional'
order by created_at desc limit 1;
```

Se o `id` dessa consulta for diferente da mensagem que originou este ciclo (`message.id`, já disponível em `pipeline.ts`, precisa ser passado adiante até `sendProfessionalSelfReplyViaWhatsapp`), a resposta está desatualizada — **descarta o envio** (nunca manda), mas **ainda marca a linha da fila como `completed`** (a resposta já foi persistida no painel corretamente, só o envio real pelo WhatsApp é que não faz sentido mais).

**Responde sua pergunta 1** (atualidade sem perda de dado): nada é descartado de verdade — o Classifier/Planner já rodaram e a resposta já está no painel; só a cópia que sairia pelo WhatsApp, specificamente, é suprimida. Nenhuma mensagem sua é perdida, porque a checagem é sobre MENSAGENS SUAS (inbound), nunca sobre o que a IA gerou.

**Responde sua pergunta 4** (bloqueio no momento do envio, não antes): sim — propositalmente avaliado dentro de `sendProfessionalSelfReplyViaWhatsapp`, nunca no enqueue nem no claim da fila. Isso preserva o mesmo ponto único de controle que a contenção A (ADR 0008) já usa, nunca um segundo lugar pra manter sincronizado.

**O que isto NÃO resolve por si só**: se você mandar 3 mensagens em sequência rápida, ainda existem 3 ciclos completos (Classifier+Planner+persist) rodando — cada um ainda gasta tempo/custo de IA. Isso só descarta o ENVIO da(s) resposta(s) obsoleta(s), não evita o reprocessamento. Reprocessar a partir da mensagem mais nova em vez de tentar responder cada uma (como mencionei na seção 5 do ADR 0008) é uma otimização de custo futura, separada — não é necessária pra parar o loop percebido por você, que é sobre MENSAGENS CHEGANDO, não sobre custo de IA.

---

## Mecanismo B — Pausa real ("pare de me escrever")

**Desenho em duas partes, deliberadamente separadas**:

**1. Recognizer isolado** (`src/lib/intelligence/runtime-control/pause-recognizer.ts`, novo, mesmo padrão de `delegated-contact/recognizer.ts`): model call pequeno, schema fechado, roda sobre CADA mensagem inbound de `professional_self` (nunca sobre `external_inquiry`):

```ts
const modelOutputSchema = z.object({
  signal: z.enum(['pause_requested', 'resume_requested', 'no_signal']),
});
```

Falha do model (timeout/erro/parse) → sempre `no_signal`, nunca assume pausa nem retomada por conta própria — mesma disciplina de `recognizeDelegatedContactRequest`. Reconhece semanticamente ("pare de me escrever", "já chega", "não precisa mais responder" e equivalentes), nunca por lista de frases fixas — exatamente como você pediu na mensagem sobre arquitetura de compreensão.

**2. Estado persistido**: coluna nova em `conversations`, só usada quando `conversation_type = 'professional_self'`:

```sql
alter table conversations add column professional_self_reply_paused_at timestamptz;
```

Setada pelo recognizer (via RPC dedicada, nunca UPDATE direto do client) quando `signal = 'pause_requested'`; limpa (`null`) quando `signal = 'resume_requested'` **ou** — pra nunca depender só do model entender um pedido explícito de retomada — qualquer nova mensagem sua reabre automaticamente (seu próprio exemplo na pergunta 7). Recomendo a reabertura automática como comportamento padrão: mais simples de explicar ("se você escrever de novo, ela volta a responder") e nunca deixa você precisa decorar um comando específico pra "destravar".

**Onde isto é checado**: mesmo ponto único de `sendProfessionalSelfReplyViaWhatsapp` — nunca no Policy Gate (pelo motivo explicado na seção anterior). Classifier/Planner continuam rodando e persistindo no painel normalmente enquanto pausado; só o envio real pelo WhatsApp é suprimido.

**Responde sua pergunta 3** (reconhecimento imediato, sem esperar a fila): o recognizer roda na passagem INLINE de cada mensagem nova (mesmo ciclo que já existe hoje, antes mesmo de qualquer enqueue pra retry), nunca só no drain do cron — então mesmo que a fila esteja travada processando mensagens antigas, a pausa é setada no banco no mesmo segundo em que sua mensagem de pausa chega, e o PRÓXIMO envio que `sendProfessionalSelfReplyViaWhatsapp` tentar (de qualquer linha, antiga ou nova) já encontra o estado pausado.

**Responde sua pergunta 7** (comportamento de retomada): reabertura automática por mensagem nova, como acima — sem comando mágico.

---

## Mecanismo C — Detecção de loop

**Desenho**: antes do envio (mesmo ponto de controle), comparar o texto da resposta atual com as últimas N (proponho N=3) respostas de IA (`author_type='ai'`) já enviadas por WhatsApp nesta conversa, usando similaridade simples de texto (normalização + Jaccard de palavras, sem precisar de embeddings/chamada de IA extra — mantém isto rápido e sem custo). Se a similaridade passar de um limiar (proponho 85%) **3 vezes consecutivas**, suprime o envio da repetição e, no lugar, registra uma linha `professional_self_pending_messages` especial/flag pra alertar — ideia inicial: só logar com severidade alta pra você notar no painel, nunca mandar uma mensagem de "não consegui resolver" automaticamente sem você revisar (isso seria mais um texto automático decidido sem necessidade real).

**Responde sua pergunta 6** (nunca bloquear mensagens legítimas): o limiar de 3 repetições quase-idênticas consecutivas é intencionalmente conservador — uma resposta parecida UMA vez (ex.: você perguntou a mesma coisa de dois jeitos) nunca é bloqueada; só um padrão repetitivo real.

**Minha recomendação**: implementar C por último, e só se A+B+D não já resolverem o padrão observado no incidente — no diagnóstico do ADR 0008, o loop foi causado pela fila destravando em lote (A resolve) sem reconhecer "pare" (B resolve), nunca por respostas literalmente repetidas por decisão do Planner. C é uma rede de segurança extra, não a causa raiz.

---

## Pergunta 2 — Controle de concorrência

Já resolvido pela infraestrutura existente, sem mudança necessária: `professional_self_drain_leases` (serializa o drain por profissional) + `conversation_processing_lease` (serializa por conversa, migration 0051, 120s). Nenhum dos 4 mecanismos precisa de lock novo — todos leem/escrevem dentro de um ciclo que já está serializado por esses dois leases existentes.

---

## Minha recomendação de ordem de implementação

1. **D (idempotência)** — menor risco, resolve uma fração real do sintoma, zero mudança de comportamento visível.
2. **A (atualidade)** — depende só de passar `message.id` adiante, nenhuma tabela nova.
3. **B (pausa real)** — a correção mais importante pro "pare de me escrever" especificamente, mas a de maior superfície (recognizer novo + coluna nova + RPC nova).
4. **C (loop)** — rede de segurança adicional, posso adiar pro backlog se você preferir fechar com A+B+D primeiro.

Cada um pode ser uma entrega e validação (testes + golden-suite onde aplicável) separada, pra você revisar incrementalmente em vez de um pacote grande de uma vez — mas a ordem acima é só minha sugestão; posso implementar em qualquer ordem que você preferir, ou todos juntos se for isso que você quer.

**Nada disto foi implementado.** Este documento é só o desenho técnico que você pediu pra revisar antes de eu escrever qualquer código.
