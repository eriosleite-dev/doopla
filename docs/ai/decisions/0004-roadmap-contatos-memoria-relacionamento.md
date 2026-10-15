# ADR 0004 — Roadmap: Doopla como representante inteligente (contatos, memória de relacionamento, aprendizado)

- **Data:** 2026-10-15
- **Status:** Rodada 1 (15/10/2026): auditoria concluída, proposta de desenho (Prioridade 2, cartões de contato) apresentada, nada implementado. Rodada 2 (15/10/2026, pós-revisão final da Fase 2): arquitetura integrada + MVP de memória de contatos ("fala com a Marina") propostos em detalhe. Rodada 3 (15/10/2026): arquitetura APROVADA pela fundadora/Head of AI com 2 decisões e 3 condições; núcleo de memória de contatos (migration 0115 + lookup em `delegated-contact-flow.ts`) **implementado e testado localmente** (Postgres real + vitest); integração do webhook pra cartões de contato permanece **só proposta**, aguardando Fase 1/2 validadas em staging — ver seção dedicada abaixo.
- **Autor:** Claude Code (Principal AI Engineer), a pedido da fundadora/Head of AI
- **Escopo**: resposta às 6 prioridades da mensagem de 15/10/2026. Prioridade 1 (link de orçamento) já corrigida e commitada localmente (ver changelog no fim). Prioridades 2-6 são auditoria + proposta, não implementação.

## Como ler este documento

Cada seção abre com um rótulo: **JÁ EXISTE** (código real, testado, rodando hoje), **IMPLEMENTADO NESTA RODADA** (mudança local, commitada, aguardando push/aprovação) ou **SÓ PLANEJADO** (proposta, zero código). Nunca misturo os três sem marcar.

---

## Prioridade 1 — Entrada pelo link de orçamento

### IMPLEMENTADO NESTA RODADA

Divergência confirmada e corrigida: `orcamento/[slug]/page.tsx` gerava o CTA de WhatsApp com `doopla.com/<slug>` (domínio errado, sem `/orcamento/`), enquanto `intake-routing.ts` só reconhece `doopla.pro/orcamento/<slug>` desde uma correção de 13/10/2026 que nunca chegou ao gerador. **Nenhum link real dessa página era reconhecido pelo roteamento** — o cliente clicava, mandava a mensagem, e a Doopla caía sempre em `no_signal` (pergunta genérica de abertura), nunca identificando o artista pelo link.

Corrigido com uma única fonte de verdade: `DOOPLA_ORCAMENTO_LINK_BASE`, exportada de `intake-routing.ts`, importada pelo gerador — nenhum literal duplicado. Teste de regressão provando o acoplamento (`intake-routing.test.ts`). `typecheck`/`lint`/testes do módulo — verdes.

Fluxo completo (passos 1-7 da sua mensagem) agora funciona ponta a ponta pro caminho de **link completo** — confirmado por leitura de código, não só pelo teste unitário:
1-3. Cliente clica, abre WhatsApp, manda a mensagem pré-preenchida com o link correto.
4. `extractDooplaSlugToken` reconhece o slug (agora que o link está certo) → `resolveProfessionalBySlug` identifica o artista.
5. `normalizeWhatsappPhone(message.from)` identifica o telefone.
6. `resolveParticipantAndConversation` reusa ou cria `external_participant`/`conversation` (histórico nunca perdido).
7. `triggerInboundMessage` entrega pro Runtime — Classifier/Planner perguntam só o que falta.

Nenhum cadastro, nenhum ID manual — já era assim antes desta correção, só não funcionava porque o link nunca batia.

### Formulário — auditoria (achado real, corrigido)

Rastreei `submitOrcamentoRequestAction` → `submit_orcamento_request` (migration 0082) até o fim: a function cria **só** `opportunities` + uma `conversations` vazia (`origin='public_link'`, zero `conversation_messages`). **Nunca chama `triggerInboundMessage` nem qualquer ciclo do Runtime.** Nenhuma IA lê ou responde nada neste ponto — o pedido fica na fila até um profissional/booker olhar manualmente o painel.

**IMPLEMENTADO NESTA RODADA**: a tela de sucesso do formulário dizia "Atendimento iniciado... já está cuidando do seu pedido" — exatamente a alegação enganosa que você pediu pra nunca fazer. Corrigida pra "Pedido recebido... vai dar retorno em breve" (descreve só o que de fato aconteceu). Mudança de copy isolada, sem lógica, testada (`typecheck`/`lint`).

**SÓ PLANEJADO** (decisão em aberto, não implementei): se/quando a Doopla deve assumir automaticamente uma conversa aberta por formulário via WhatsApp. Hoje não existe esse gatilho — e por bom motivo: iniciar uma mensagem de WhatsApp a partir de um contato só coletado pelo formulário, sem o cliente ter mandado nada pelo canal, é exatamente o cenário que a Meta regula com templates e consentimento (sua própria regra: "Não inicie mensagens pelo WhatsApp a partir do formulário sem verificar canal, consentimento e regras da Meta"). **Minha recomendação**: não implementar isso agora — trocar `client_contact` (campo livre hoje, ambíguo entre telefone/e-mail, já registrado como pendência na própria migration 0082) por um campo estruturado com tipo explícito é pré-requisito técnico antes de cogitar qualquer outreach automático daqui, e mesmo depois disso, outreach por WhatsApp a partir de um contato de formulário provavelmente exige o fluxo de **template de cold outreach já existente** (`cold-outreach.ts`, ver Prioridade 4) com consentimento explícito — nunca um texto livre direto. Fica registrado como item futuro, fora desta rodada.

---

## Prioridade 2 — Cartões de contato pelo WhatsApp (`type: "contacts"`)

**SÓ PLANEJADO — desenho apresentado, zero código.** Toca o webhook crítico (mesmo arquivo que a Fase 1 está alterando agora, ver nota de coordenação no fim). Por isso, desenho + testes primeiro, implementação só depois de aprovação separada, exatamente como você pediu.

### O que a Cloud API manda

Uma mensagem com `message.type === "contacts"` carrega `message.contacts: Array<{ name: { formatted_name, first_name?, last_name?, ... }, phones?: Array<{ phone, wa_id?, type? }>, emails?: [...], org?: { company?, title? } }>` — **nunca confundir com `value.contacts`** (array separado no mesmo payload do webhook, usado hoje só pra extrair o nome do REMETENTE via `wa_id`/`profile.name`, já consumido em `route.ts`). São dois conceitos com o mesmo nome de campo em níveis diferentes do payload — risco real de confusão que você já antecipou corretamente.

### Fluxo proposto

1. **Captura (Fase 1, já em implementação)**: estender o filtro de "elegível" no webhook pra também capturar `type === 'contacts'` — mesma tabela `whatsapp_inbound_raw_captures`, ou uma irmã dedicada (`whatsapp_inbound_contact_shares`, mais provável — o formato do conteúdo é estruturado, não um `body` de texto livre; forçar os dois no mesmo schema distorceria a tabela de texto). Decisão de desenho, não tomada ainda — depende de eu ver a Fase 1 estabilizada primeiro (mesmo padrão: nunca duas tabelas crescendo em paralelo sem o padrão de idempotência provado numa primeiro).
2. **Reconhecimento de intenção pendente**: seu exemplo ("Doopla, fala com a Marina... Pode me mandar?") mostra o cartão chegando como **resposta a um pedido já em aberto** — isso é exatamente a mesma forma de estado que `channel_inbound_intakes`/`runtime_pending_replies` já usam (uma pendência aberta, esperando um tipo específico de resposta). Proposta: reaproveitar esse padrão — uma pendência "aguardando contato compartilhado", nunca inventar um terceiro mecanismo de estado pendente.
3. **Validação e associação** — por item da sua lista:
   - **Múltiplos telefones**: nunca escolhe sozinho se há 2+ e nenhum é marcado `type` claramente principal — pergunta qual, mesmo padrão de desambiguação já usado pra artista (`buildPromptMessage`).
   - **Nome incompleto**: usa `formatted_name` (sempre presente no vCard) como label; nunca bloqueia por falta de sobrenome.
   - **Telefone sem código do país**: passa por `normalizeWhatsappPhone` (já existe, já testado) — mesma função, nunca uma segunda normalização.
   - **Contato já existente**: busca em `external_participant_channel_identities` por `(professional_id, channel='whatsapp', identifier=telefone normalizado)` ANTES de criar — reusa, nunca duplica (mesmo padrão de `resolveOrCreateExternalParticipant`).
   - **Duas pessoas com o mesmo nome** (dentro do mesmo profissional): nunca decide sozinho — pergunta, com os dois telefones distintos como opções.
   - **Vários profissionais com "Marina"**: não é ambiguidade real — `external_participants`/contatos são sempre escopados por `professional_id` (tenant isolation, regra não-negociável do Charter). "Marina" da profissional A nunca aparece pra profissional B. Sem risco aqui, só confirmando que a arquitetura já isola isso corretamente.
   - **Cartão sem solicitação anterior**: tratado como `needs_attention`/não reconhecido — nunca associado a um pedido que não existe; fica capturado (nunca perdido, mesmo princípio da Fase 1) mas não processado automaticamente até ter contexto. Decisão deliberadamente conservadora.
   - **Privacidade/origem do dado**: o cartão é dado de TERCEIRO (a pessoa cujo contato foi compartilhado nunca deu consentimento à Doopla diretamente) — reforça por que o próximo ponto é inegociável.
4. **Nunca envio automático**: exatamente como você definiu — compartilhar o contato só ENSINA a Doopla quem é a pessoa; a Doopla nunca manda mensagem nenhuma pra esse número sozinha. Qualquer contato subsequente com essa pessoa segue as MESMAS regras de CSW/template/consentimento da Prioridade 4 (nenhum atalho pra contato recém-aprendido).

### Testes que vou propor antes de implementar (não escritos ainda)
Payload real de `type: "contacts"` com 1/2/3 telefones; nome incompleto; contato já existente (idempotência); dois "Marina" mesmo profissional (desambiguação); cartão sem pedido pendente (fica capturado, nunca processado); confirmação de que `value.contacts` (remetente) e `message.contacts` (cartão) nunca se confundem no parser (teste de payload com os dois presentes simultaneamente, valores propositalmente diferentes).

---

## Prioridade 3 — Memória de pessoas e relacionamentos

**SÓ PLANEJADO.** Reaproveita `memory-policy.ts` (types `MemoryKind`/`MemoryStatus`/`proposeMemory`/`reviewMemory`/`revokeMemory`, já isolado, já testado, zero wiring em runtime ainda) em vez de um sistema novo, como você pediu — mas com uma diferença de desenho importante que preciso deixar explícita, não esconder: `memory-policy.ts` hoje modela memória como **texto curto + evidência** (`value: string`, até 500 chars) — bom pra "prefere tom informal", ruim pra um contato (que precisa de campos estruturados: nome, telefone(s), empresa, como conhece, consentimento). **Recomendação**: um módulo PRÓPRIO para contatos/relacionamentos (schema estruturado — tabela SQL de verdade, não um blob de texto), seguindo a MESMA filosofia de `memory-policy.ts` (proposed → approved/rejected, revogável, sempre com evidência/origem) mas com seu próprio shape, nunca forçando dado estruturado dentro do campo de texto livre de memória existente. As duas memórias (preferência + contato) convivem lado a lado, nunca uma dentro da outra.

Campos propostos (mapeando direto sua lista): `id`, `professional_id`, `canonical_name`, `aliases: text[]`, `phones: jsonb` (estruturado — tipo, se verificado), `company`, `role`, `relationship_note` ("como conhece"), `consent_status` (`unknown`/`granted`/`declined`), `contact_preference`, `source_evidence` (de onde veio: cartão compartilhado, mensagem do profissional, histórico de conversa — rastreável, nunca inventado), `status` (`active`/`merged`/`deleted`), `created_at`/`updated_at`.

RLS: escopado por `professional_id`, mesmo padrão de `external_participants` — nunca cross-tenant. Deduplicação: por telefone normalizado dentro do mesmo profissional (mesma chave que `external_participant_channel_identities` já usa). Correção/exclusão: o profissional sempre pode corrigir ou apagar (LGPD, direito de retificação/esquecimento) — `revokeMemory`'s padrão de nunca apagar fisicamente o rastro de auditoria, só marcar revogado, provavelmente não se aplica integralmente aqui (um pedido de exclusão de dado de TERCEIRO pode exigir apagamento real, não só soft-revoke — ponto que precisa de decisão sua antes de eu desenhar o schema final, não assumo sozinho).

Fica explicitamente fora desta rodada: schema final, migration, RPCs, wiring no Planner pra "Doopla, fala com a Marina" resolver a pessoa certa. Proposta de arquitetura, não implementação.

---

## Prioridade 4 — Contato inteligente pelo WhatsApp (janela de 24h)

### JÁ EXISTE — achado importante, bem mais pronto do que a mensagem presumia

Auditoria encontrou isso **já implementado e testado**, não como lacuna:
- `cold-outreach.ts`: `isCswOpen`/`shouldSendColdOutreachTemplate`/`resolveSendAction` — a janela de 24h (`CSW_WINDOW_MS`) é derivada SEMPRE de `conversation_messages` real (`get_last_whatsapp_inbound_at`), nunca um estado persistido à parte que pudesse dessincronizar.
- Revalidado em DOIS momentos: na criação do outbound_intent (`pipeline.ts`) E de novo no envio (`send-outbound-intents` cron) — cobre o caso da janela fechar no intervalo entre os dois.
- Fail-closed, nunca converte sozinho: `free_text` fora da janela nunca vira template automaticamente (`fail_closed_csw_expired`) — exige decisão explícita, nunca risco de mandar o texto errado como se fosse template.
- `outbound_intents.delivery_state`: `policy_allowed → queued → sending → sent_unknown/sent_confirmed/delivered/read/failed_*` — já é exatamente a máquina de estado "preparando/aguardando/enviando/confirmado/desconhecido" que você pediu. Isso é Fase 0 (desta sessão) + passo 6B (sessão anterior), já em produção.

### SÓ PLANEJADO (gap real, não implementado)

O que falta não é mecanismo, é **auditoria de linguagem**: confirmar que nenhuma resposta gerada pelo Planner/templates de sistema declara "enviei"/"entreguei" antes do `delivery_state` correspondente ser alcançado. Não auditei isso nesta rodada (fora do escopo desta resposta) — recomendo como item isolado e rápido da próxima rodada: grep em `planner/prompt.ts` e nos templates de sistema por qualquer afirmação de certeza de entrega, cruzar com o estado real disponível em cada ponto do código.

---

## Prioridade 5 — Evolução do cérebro (visão integrada)

Mapeamento da sua lista de 8 itens contra o que já existe, para nunca reconstruir o que já funciona:

| # | Item | Estado |
|---|---|---|
| 1 | Memória profissional persistente | `memory-policy.ts` — módulo isolado, testado, **zero wiring em runtime ainda** (Fase 1 do Charter original, ainda não priorizada sobre confiabilidade) |
| 2 | Memória de contatos/relacionamentos | Prioridade 3 acima — só desenho |
| 3 | Aprendizado com correção/feedback autorizado | Depende de (1)/(2) existirem primeiro — `reviewMemory`/`revokeMemory` já modelam o ciclo "proposto → aprovado/corrigido pelo profissional", falta o gatilho real que detecta uma correção numa conversa e propõe a memória |
| 4 | Recuperação contextual de informação comercial | Parcialmente — `selectContextMemories` já existe (seleciona até 8 memórias relevantes), mas sem memórias reais persistidas ainda não há o que recuperar |
| 5 | Compreensão de conversas longas/referências | Não auditado nesta rodada — fora de escopo, fica como item de investigação futura |
| 6 | Delegação de tarefas de múltiplas etapas | Delegated-contact-flow (Etapa 2.1, sessão anterior) é o PRIMEIRO caso real disso — um fluxo determinístico de múltiplos passos. Generalizar pra "fala com o produtor e me conta o que ele respondeu" é um salto bem maior, não um passo incremental — recomendo tratar como prioridade própria, não misturado ao roadmap de memória |
| 7 | Acompanhamento proativo de negociações/pendências | `runtime_pending_replies`/`needs_attention` já existem como ESTADO, mas (achado da auditoria da Fase 0, ADR 0002) nunca aparecem em nenhuma tela — "quais clientes estão esperando resposta" hoje não tem onde ser respondido, nem pela IA nem pelo painel |
| 8 | Avaliação contínua de qualidade | Não auditado — existe `dev/*-golden-suite` (testes dirigidos pro Classifier/Planner/Policy Gate), mas isso é QA de desenvolvimento, não avaliação contínua de produção |

**Minha recomendação de sequência** (impacto × risco × dependência, não arbitrária):
1. **Memória profissional (item 1) + wiring real** — já existe pronta, só falta conectar; menor risco, maior alavancagem imediata (toda conversa futura já se beneficia).
2. **Memória de contatos (Prioridade 3)** — depende de (1) estar rodando pra reaproveitar o mesmo padrão de aprovação/evidência; desbloqueia o caso de uso "fala com a Marina" que você exemplificou.
3. **Cartões de contato (Prioridade 2)** — pode andar em paralelo a (2) (são complementares: cartão é uma FONTE de dado pra memória de contato, não a memória em si), mas só depois da Fase 1 (captura durável) estar validada, pelo motivo de coordenação já explicado.
4. **Visibilidade de pendências (item 7)** — barato, desbloqueia "quais clientes estão esperando resposta" sem exigir nenhuma IA nova, só uma tela que já deveria existir.
5. Itens 3/4/6/8 — dependem demais dos anteriores pra ter critério de aceitação sério agora; ficam como visão, não como próxima etapa concreta.

---

## Prioridade 6 — Experiência de produto

Não é uma etapa técnica separada — é o padrão de qualidade que as Prioridades 2-5 já foram desenhadas pra atender (perguntar só o que falta, nunca formulário quando WhatsApp resolve, identificar contato conhecido, nunca declarar status falso). Nenhuma ação nova aqui além de manter esse padrão em cada etapa futura.

---

## Critérios de aceitação por etapa (resumo)

- **Memória profissional (wiring)**: uma preferência corrigida pelo profissional numa conversa gera uma `ProfessionalMemory` proposta; aprovada, aparece em `selectContextMemories` na conversa seguinte; nunca influencia decisão comercial protegida sem approval separado (regra do Charter, intocada).
- **Memória de contatos**: "fala com a Marina" com uma Marina só resolve sem perguntar; com duas, sempre pergunta; contato novo sempre pede telefone/cartão, nunca inventa.
- **Cartões de contato**: cartão com 1 telefone sempre resolve; com 2+, sempre pergunta; cartão duplicado nunca cria segunda linha; cartão sem pedido pendente nunca dispara envio nenhum.
- **Visibilidade de pendências**: toda linha `needs_attention`/`runtime_pending_replies` pendente aparece em alguma tela — nenhuma mais invisível.

## Coordenação com a Fase 1 em andamento

Esta auditoria não alterou nada do que já está em implementação (migration `0112_whatsapp_inbound_raw_captures.sql`, `raw-captures.ts`, `route.ts` reestruturado em duas passagens) — confirmei via `git status` antes de começar, nada sobrescrito. Prioridade 2 (cartões de contato) deliberadamente espera a Fase 1 terminar (testada, validada) antes de eu tocar o webhook de novo — duas mudanças concorrentes no mesmo arquivo crítico, sem a primeira validada, é exatamente o tipo de risco que o Charter pede pra evitar.

## Changelog da Rodada 1

- `src/lib/channels/whatsapp/intake-routing.ts` / `.test.ts`, `src/app/orcamento/[slug]/page.tsx` — correção do link de orçamento (commit local).
- `src/app/orcamento/[slug]/orcamento-form.tsx` — correção de copy enganosa (commit local).
- Este documento.

Nenhuma migration aplicada, nenhum push, nenhum deploy.

---

# Rodada 2 (15/10/2026) — MVP de memória de contatos: "Doopla, fala com a Marina"

Depois da revisão final de segurança da Fase 2 (ADR 0002, seção 14), aprovada e encerrada pela fundadora/Head of AI, esta rodada retoma o ADR 0004 como prioridade de produto. Pedido explícito: auditar o que já existe, propor arquitetura integrada ao Intelligence Core atual, e desenhar a **menor entrega que produza valor real no WhatsApp** — a experiência completa "fala com a Marina → Doopla pede o contato → cartão compartilhado → memorizado → próxima vez resolve sozinho, com desambiguação se houver ambiguidade".

**SÓ PLANEJADO nesta seção inteira — zero código, zero migration.** Nenhuma alteração em Runtime ou webhook. Proposta de arquitetura e MVP, aguardando aprovação antes de qualquer implementação, exatamente como pedido.

## 1. Auditoria — o que já existe e pode ser reaproveitado

A descoberta central desta auditoria: **"Doopla, fala com a Marina" já é, quase integralmente, a funcionalidade "Doopla chama o cliente" (Etapa 2.1, 13-14/10/2026) já implementada e testada** — `pending_delegated_contacts` (migration 0104/0109) + `delegated-contact-flow.ts` + o recognizer isolado (`src/lib/intelligence/delegated-contact/recognizer.ts`). O que falta não é um sistema novo — é uma camada de memória que alimenta essa máquina já pronta, e um canal de entrada (cartão de contato) que ela ainda não aceita.

### JÁ EXISTE (confirmado por leitura de código, não presumido)

- **Reconhecimento do pedido**: `recognizeDelegatedContactRequest` (`recognizer.ts:89`) já extrai `recipientName`/`recipientNumber`/`purposeSummary`/`draftMessageContent` de uma mensagem como "fala com a Marina" em `professional_self`, com `signal='new_request'`. Nunca inventa — campo ausente é sempre `null` (linha 73 das instruções do model).
- **Pedido de número faltante**: `pending_delegated_contacts.status='pending_number'` (migration 0104) é exatamente o estado "ainda não tenho o contato dela" — já existe, já testado. A migration já previu explicitamente que o número pode ser preenchido na criação OU depois (comentário da function `create_pending_delegated_contact`: "sempre nasce pending_number, mesmo quando o número já veio na mensagem... quem chama decide se já encadeia [a aprovação] na mesma chamada").
- **Isolamento por profissional**: todo o desenho é escopado por `requesting_professional_id`/`professional_id`, mesmo padrão não-negociável do Charter usado em `external_participants` — "Marina da profissional A" estruturalmente nunca aparece pra profissional B.
- **Gate de consentimento do DESTINATÁRIO antes de qualquer envio real**: `checkRecipientConsent` (`recipient-consent-check.ts`) já garante que a primeira resposta de Marina precisa ser lida como receptiva antes do conteúdo real ser liberado (`ambiguous`/`declined` nunca libera, fail-closed). Isto é **estrutural e intocado** pela proposta desta rodada — memorizar o contato de Marina nunca pula esse gate, só evita perguntar o número de novo.
- **Composição de texto 100% determinística pra profissional**: `delegated-contact-flow.ts` nunca usa o Planner pra falar com a própria profissional (`buildActiveSummary`/`replyToProfessional`) — todo texto vem de código a partir do estado real persistido, nunca geração livre. A experiência "Ainda não tenho o contato dela. Pode me mandar?" já é o tipo de mensagem que esse padrão compõe hoje (ver `updatePendingDelegatedContactPendingInfo`/fluxo de pending_number).
- **`memory-policy.ts`** (`src/lib/intelligence/learning/memory-policy.ts`, Etapa B, já testado): módulo 100% isolado e puro — `proposeMemory`/`reviewMemory`/`revokeMemory`/`selectContextMemories`, zero I/O, **zero wiring em runtime**. Princípio central documentado no próprio arquivo: "memória nunca é autorização comercial" — `selectContextMemories` devolve sempre `contextOnly: true` (tipo literal). Modela só preferências em texto curto (`value: string`, até 500 chars) — não serve, sem adaptação, pra dado estruturado de contato (nome/telefone/empresa), achado já registrado na Rodada 1 (seção "Prioridade 3" abaixo).
- **Padrão de desambiguação por opções numeradas**: `current_prompt_options`/`current_prompt_id` (migration 0062, `channel_inbound_intakes`) é o idioma já estabelecido pra "pergunto, guardo a pergunta exata, só aceito resposta que bate com ESSA pergunta" — mesmo padrão que uma desambiguação de "duas Marinas" deveria reaproveitar, nunca inventar um quarto mecanismo de estado pendente (a Rodada 1 já tinha identificado isso).

### NÃO EXISTE (gap real, não um esquecimento — forma do próximo MVP)

1. **Nenhuma memória persistente de nome→telefone entre pedidos.** Cada `pending_delegated_contacts` é efêmero (`vive só até executed/failed/rejected/cancelled/expired`, comentário da própria migration 0104) — depois disso, zero rastro ligando "Marina" a um telefone pra um pedido FUTURO. Confirmado em `delegated-contact-flow.ts`: `recipientNumber` só vem do que o recognizer extrai literalmente da mensagem atual (linhas 218/238), nunca de uma consulta a histórico ou memória.
2. **Nenhum canal de entrada pra cartão de contato (vCard).** Confirmado em `route.ts:113`: o filtro de elegibilidade do webhook é `message.type === 'text' && message.text?.body` — **só texto**, comentário explícito na linha 106-111 ("Só texto nesta rodada... decisão explícita de escopo"). Uma mensagem `type: "contacts"` hoje não é capturada, não é processada, não aparece em lugar nenhum — nem silenciosamente perdida com aviso, literalmente invisível pro sistema inteiro, inclusive dentro de uma conversa `professional_self` (o próprio profissional compartilhando um cartão pra Doopla hoje some sem rastro).
3. **Nenhum lookup de contato antes de perguntar.** Mesmo que Marina já tivesse sido contatada mês passado por um pedido anterior, a próxima vez que a profissional disser "fala com a Marina" o fluxo pergunta o número de novo — não existe hoje a consulta "já conheço alguém chamado Marina desta profissional?".

## 2. Arquitetura proposta — integrada, não um segundo cérebro

Princípio inegociável, repetido porque você pediu explicitamente: **nenhum sistema novo e paralelo**. A proposta inteira é aditiva sobre o que já existe — uma tabela de memória nova + um canal de entrada novo no webhook + um ponto de consulta novo antes de uma function que já existe, nunca uma reescrita da máquina de estados já testada.

### 2.1 Nova peça de dados: `professional_contact_memories` (nome provisório)

Por que uma tabela própria e não estender `memory-policy.ts`: já registrado na Rodada 1 e reconfirmado nesta auditoria — `memory-policy.ts` modela preferência (texto curto, evidência, propose→approve), não dado estruturado de terceiro (nome + telefone(s) + empresa + como conhece + consentimento DELE). Forçar isso dentro do `value: string` de 500 caracteres distorceria os dois usos. Proposta: módulo irmão, MESMA filosofia (proposto/revisável, sempre com evidência rastreável, nunca inventado), schema próprio:

| Campo | Tipo | Nota |
|---|---|---|
| `id` | uuid | — |
| `professional_id` | uuid → `profiles` | isolamento de tenant, mesmo padrão de `external_participants` |
| `canonical_name` | text | ex.: "Marina" |
| `aliases` | text[] | variações já vistas ("Marina Produtora", "Marininha") |
| `phones` | jsonb | array `{ number: string (normalizado via `normalizeWhatsappPhone`), is_primary: boolean, source: 'contact_card' \| 'manual_text' }` — nunca um segundo normalizador |
| `company` / `role` | text, nullable | do vCard (`org.company`/`org.title`) quando presente |
| `relationship_note` | text, nullable | "como conhece" — preenchido só se a profissional disser, nunca inferido |
| `external_participant_id` | uuid → `external_participants`, nullable | preenchido quando/se uma conversa real com esse telefone já existe ou passa a existir — nunca duplica a verdade já modelada em `external_participants`, só aponta pra ela |
| `source_evidence` | jsonb | `{ type: 'contact_card' \| 'manual_text', pendingDelegatedContactId, triggerMessageId }` — sempre rastreável até a origem real, nunca um texto solto |
| `consent_status` | text | `unknown` (default) / `granted` / `declined` — consentimento de MARINA pra ser contatada comercialmente; **nunca inferido de ter sido memorizada** (ver seção 3) |
| `status` | text | `active` / `merged` / `deleted` |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | `deleted_at` existe porque aqui, diferente de `memory-policy.ts`, uma exclusão pode precisar ser FÍSICA (ver seção 3.3) |

Dedup: por telefone normalizado dentro do mesmo `professional_id` (mesma chave de `external_participant_channel_identities`). RLS: mesmo padrão de `pending_delegated_contacts`/`runtime_pending_replies` — só `service_role`, nunca exposta a `anon`/`authenticated` diretamente (o painel, se um dia precisar ler isso, passa por uma function própria com `is_system_caller()`/`auth.uid()`, não por policy direta).

### 2.2 Canal de entrada: cartão de contato, escopo DELIBERADAMENTE estreito

A auditoria da Rodada 1 (Prioridade 2) já tinha desenhado uma ingestão GERAL de `type: "contacts"` (qualquer cartão, a qualquer momento, com tabela própria de captura). Para a menor entrega real, proponho encolher esse escopo: **processar um cartão de contato automaticamente só quando existe um `pending_delegated_contacts` com `status='pending_number'` aberto para aquela profissional, na mesma conversa `professional_self`.** Fora dessa janela específica, o cartão é capturado (nunca perdido, mesmo princípio da Fase 1) mas fica em um estado equivalente a `needs_attention` — nunca processado automaticamente sem um pedido que o explique. Isso é uma redução de escopo sobre o desenho original, não uma mudança de princípio.

Consequência prática: o webhook ganha uma extensão pequena e isolada (não implementada nesta rodada):
1. `route.ts`: o filtro de elegibilidade (linha 113) passa a também capturar `message.type === 'contacts'` — mesma Passagem 1 (durável, idempotente) da Fase 1, só estendendo o que conta como "elegível". `value.contacts` (nome do REMETENTE) e `message.contacts` (o cartão em si) continuam sendo lidos como campos completamente distintos — risco de confusão já identificado na Rodada 1, mitigado por nomear os dois de forma explícita no código e por um teste dedicado que os coloca juntos no mesmo payload com valores propositalmente diferentes.
2. Novo parser puro (mesmo padrão de `normalizeWhatsappPhone`/sem I/O): `message.contacts[]` → `{ name, phones: [...] }[]` normalizado.
3. `intake-orchestration.ts`: quando `decision.method === 'verified_professional'` E a mensagem é um cartão E existe um `pending_delegated_contacts` em `pending_number` pra essa profissional → desvia pra um novo fluxo determinístico (irmão dos dois early-returns que `delegated-contact-flow.ts` já tem em `pipeline.ts`), nunca passa pelo Planner, nunca passa pelo recognizer de LLM (um cartão compartilhado enquanto HÁ um pedido pendente de número é inequívoco — zero ambiguidade de intenção, resolver com código, não com model call).
4. Esse novo fluxo chama a MESMA `updatePendingDelegatedContactPendingInfo` que já existe — zero mudança na máquina de estados, só uma segunda forma de preencher `recipientNumber` (cartão, além de texto).

### 2.3 Lookup antes de perguntar — o único ponto novo dentro do fluxo já existente

Quando o recognizer devolve `signal='new_request'` com `recipientName` preenchido e `recipientNumber=null`, ANTES de criar o `pending_delegated_contacts` como `pending_number`, uma consulta nova: `professional_contact_memories` por `professional_id` + `canonical_name`/`aliases` batendo (case-insensitive) com `recipientName`, `status='active'`.

- **0 resultados**: comportamento de hoje, sem mudança — cria `pending_number`, pergunta o contato.
- **Exatamente 1 resultado**: `recipientNumber` já nasce preenchido (a própria migration 0104 já permite isso, "quem chama decide se já encadeia") — pula direto pra `pending_approval`, nunca pergunta de novo. Esta é a experiência central pedida: "na próxima conversa... não pede novamente o número".
- **2+ resultados**: nunca escolhe sozinho — pergunta qual, reaproveitando o MESMO padrão de composição determinística de texto que `delegated-contact-flow.ts` já usa (nunca o Planner), listando nome/empresa de cada candidata como opções.

### 2.4 Escrita da memória — depois que o número é conhecido, não antes

Assim que `recipientNumber` é resolvido (por texto OU por cartão) e a aprovação da profissional acontece (`pending_approval` → `approved`/`executed`), propõe-se uma `professional_contact_memories` nova (ou atualiza um alias de uma existente, nunca duplica por telefone). Evidência sempre aponta pro `pending_delegated_contacts.id`/`trigger_message_id` reais — nunca um valor solto.

**Decisão que precisa da sua confirmação, com minha recomendação**: diferente de `memory-policy.ts` (onde toda memória nasce `proposed`, nunca aprovada de origem, porque a evidência pode vir do cliente), aqui a evidência é a própria profissional compartilhando o contato em resposta direta ao próprio pedido dela — autoria inequívoca. **Minha recomendação**: esta memória específica pode nascer já `active` (sem uma segunda tela de aprovação separada) — exigir uma confirmação extra pra algo que a profissional acabou de fazer intencionalmente seria fricção sem ganho real de segurança. Se você preferir o mesmo rigor de `memory-policy.ts` (sempre nasce revisável, nunca ativa de origem, mesmo quando a evidência é a própria profissional), eu adapto — é uma escolha de produto, não uma imposição técnica de nenhum dos dois lados.

## 3. Modelo de consentimento, correção, exclusão e isolamento

### 3.1 Consentimento — duas camadas que nunca se confundem

- **Consentimento da PROFISSIONAL pra Doopla guardar o contato**: implícito no próprio ato de compartilhar o cartão em resposta a um pedido dela mesma — equivalente ao consentimento já assumido em qualquer outro dado que a profissional fornece ativamente ao sistema.
- **Consentimento de MARINA pra ser contatada comercialmente**: **nunca** concedido pelo simples fato de ter sido memorizada. `consent_status` nasce sempre `unknown` e só muda pra `granted` através do MESMO gate que já existe e já é testado — `checkRecipientConsent`, lido da primeira resposta REAL dela a um contato iniciado (nunca inferido do cartão em si). Esta é a garantia mais importante desta proposta inteira, e ela custa zero código novo: o gate já existe, só nunca é pulado.

### 3.2 Correção

A profissional sempre pode dizer "não é essa Marina"/"troca o número dela" numa conversa `professional_self`. MVP: tratado como um pedido de desambiguação forçada (a mesma pergunta de 2+ resultados da seção 2.3, disparada manualmente) — nunca uma correção silenciosa que o sistema infere sozinho. Detecção automática de correção (a profissional contradizendo um dado já memorizado sem pedir explicitamente) fica no roadmap de aprendizado (seção 5), não neste MVP.

### 3.3 Exclusão

Pedido explícito ("esquece o contato da Marina") sempre atendido. Diferença importante de `revokeMemory` (`memory-policy.ts`), que **nunca apaga fisicamente, só muda status** (preferência da própria profissional, rastro de auditoria dela mesma é aceitável manter): aqui o dado é de um TERCEIRO que nunca deu consentimento direto à Doopla. **Pergunta em aberto que já estava registrada na Rodada 1 e seguirá aberta até você decidir, com minha recomendação**: um pedido de exclusão deveria apagar fisicamente a linha (`delete`), não só marcar `status='deleted'`? **Recomendo apagamento físico real** quando a profissional pede explicitamente ("esquece esse contato") — nome e telefone de uma pessoa que nunca autorizou a Doopla a guardar nada dela merece o padrão mais forte de exclusão disponível, mesmo custando a trilha de auditoria que `memory-policy.ts` preserva pra preferências da própria profissional. `deleted_at`/`status='deleted'` ficaria reservado só pro caso de MERGE (duas entradas que eram a mesma pessoa, nunca um pedido de esquecer).

### 3.4 Isolamento

Estrutural, por `professional_id`, idêntico ao resto do Charter (`external_participants`, `pending_delegated_contacts`) — nenhuma policy nova a inventar, só repetir o padrão já comprovado.

## 4. Critérios de aceitação e testes propostos (ainda não escritos)

1. "Fala com a Marina" sem nenhuma Marina memorizada → cria `pending_number`, pergunta o contato — comportamento IDÊNTICO ao de hoje, sem regressão.
2. Cartão com 1 telefone compartilhado logo depois, dentro da janela `pending_number` aberta → resolve `recipientNumber`, segue pro fluxo normal de aprovação (nunca pula `pending_approval`/`checkRecipientConsent`).
3. Cartão com 2+ telefones → pergunta qual é o principal antes de prosseguir.
4. Cartão chegando SEM nenhum `pending_number` aberto → capturado, nunca processado automaticamente, nunca dispara nenhum envio.
5. Nova conversa, "fala com a Marina" de novo, exatamente 1 Marina memorizada → resolve direto, **nunca pergunta o número de novo** (o critério central pedido).
6. Duas Marinas memorizadas pro mesmo profissional → sempre pergunta qual, nunca escolhe sozinho.
7. Isolamento: Marina memorizada pela profissional A nunca aparece em nenhuma consulta feita em nome da profissional B (teste de tenant, mesmo padrão dos testes de RLS já existentes no projeto).
8. Memorizar o contato nunca muda `consent_status` pra `granted` sozinho — só a primeira resposta real de Marina, via `checkRecipientConsent`, muda isso (teste de regressão garantindo que as duas camadas de consentimento nunca se misturam).
9. `value.contacts` (remetente) e `message.contacts` (cartão) nunca se confundem — teste de payload com os dois presentes simultaneamente, valores propositalmente diferentes (já previsto na Rodada 1).
10. Pedido de exclusão explícito apaga fisicamente a linha (pendente da sua confirmação da seção 3.3).

## 5. Roadmap posterior de aprendizado (não neste MVP)

1. **Wiring de `memory-policy.ts`** (prioridade 1 da sua lista) — módulo já pronto e testado, só falta: (a) tabela/RPCs persistindo os tipos puros já existentes, (b) um recognizer isolado (mesmo padrão de `delegated-contact/recognizer.ts`) que detecta a profissional corrigindo/ensinando uma preferência numa conversa normal, (c) `selectContextMemories` sendo de fato consumido pelo Planner na montagem do prompt — hoje zero wiring, confirmado nesta auditoria. **Recomendo este como o PRÓXIMO incremento depois do MVP de contatos** — mesma arquitetura, menor risco (não toca o webhook), maior alavancagem (toda conversa futura se beneficia imediatamente).
2. **Detecção automática de correção de contato** (aprofunda a seção 3.2): a profissional contradizendo um dado já memorizado sem pedir explicitamente — precisa de um recognizer próprio, análogo ao de `delegated-contact`, nunca reaproveitando o mesmo por acidente (propósitos diferentes, sempre módulos isolados, mesmo princípio de todo o Intelligence Core).
3. **Recuperação contextual geral** (item 6 da sua lista, além de contatos): hoje só contatos teriam lookup; generalizar "recuperar informação relevante do histórico no momento certo" pro Planner como um todo é um salto maior, depende de (1) estar rodando primeiro.
4. **Visibilidade em painel**: nenhuma tela mostra contatos memorizados ou pendências de correção/exclusão — mesma lacuna já registrada pra `needs_attention`/`runtime_pending_replies` na Rodada 1, mesma recomendação (barato, alta transparência, prioridade cedo no roadmap de produto).

## 6. Riscos e dependências da integração WhatsApp

- **Coordenação com a Fase 1/2 (ADR 0002)**: esta proposta toca o MESMO arquivo crítico (`route.ts`) que a Fase 1/2 acabaram de estabilizar e que ainda aguarda validação em staging (migration 0114 pendente de aplicação, ver ADR 0002 seção 14.7). Recomendo, como já recomendado na Rodada 1: nenhuma implementação desta proposta antes da Fase 2 estar validada em staging — duas mudanças concorrentes no webhook crítico sem a primeira confirmada lá é exatamente o risco que o Charter pede pra evitar.
- **Envio herdado sem idempotência própria**: toda a comunicação de volta à profissional nesta proposta (pedir o contato, confirmar, desambiguar) passa por `sendProfessionalSelfReplyViaWhatsapp` — a MESMA function sem idempotência própria encontrada na revisão de segurança da Fase 2 (ADR 0002, seção 14.2). Não é um risco novo desta proposta, é um risco herdado e já documentado — mas cresce em superfície (mais um fluxo passando por ali). Fica registrado, não escondido; a correção real (idempotência própria dessa function) continua fora do escopo desta rodada.
- **Dado de terceiro sem consentimento direto**: nome e telefone de Marina são armazenados sem ela ter autorizado a Doopla diretamente — mitigado pelo modelo de consentimento em duas camadas (seção 3.1) e pela recomendação de exclusão física real (seção 3.3), mas a decisão final sobre o nível de rigor é sua, não assumida unilateralmente aqui.
- **vCard malformado/incompleto**: nome ausente, telefone sem código de país, múltiplos telefones sem indicação clara de principal — todos já endereçados pelo desenho da Rodada 1 (reaproveitado aqui sem mudança: nunca bloqueia por falta de sobrenome, sempre normaliza via `normalizeWhatsappPhone`, sempre pergunta quando ambíguo).
- **Concorrência**: duas mensagens quase simultâneas da mesma profissional (ex.: pedido novo + cartão chegando por engano fora de janela) — mitigado pelo MESMO claim atômico que `pending_delegated_contacts`/`channel_inbound_intakes` já usam; nenhum mecanismo de exclusão mútua novo a inventar.

## 7. Recomendação de sequência

1. **Aguardar a Fase 2 validada em staging** (ADR 0002) antes de tocar `route.ts` de novo — dependência explícita, não um adiamento arbitrário.
2. **Aprovação sua desta arquitetura** (schema de `professional_contact_memories`, escopo estreito do canal de cartão, decisões em aberto das seções 2.4 e 3.3) antes de qualquer migration ou código.
3. Implementação do MVP desta seção, com os testes da seção 4, mesmo rigor de validação local (Postgres real, typecheck/lint/vitest/build) das rodadas anteriores.
4. Fast-follow: wiring de `memory-policy.ts` (seção 5, item 1) — menor risco, pode andar logo depois, independente do MVP de contatos estar em staging ainda.

## Changelog da Rodada 2

- Este documento (nova seção). Nenhum código, nenhuma migration, nenhum push, nenhum deploy — proposta de arquitetura e MVP aguardando aprovação, exatamente como pedido.

---

# Rodada 3 (15/10/2026) — Aprovação da fundadora/Head of AI: núcleo de memória de contatos implementado e testado

A fundadora revisou a proposta da Rodada 2 com o ChatGPT (Head of AI) e **aprovou a arquitetura do MVP**, com 2 decisões e 3 condições + 2 condições de execução. Resposta ponto a ponto abaixo, seguida do que foi de fato implementado e testado nesta rodada.

## Decisão 1 — Memória ativa: CONFIRMADA, implementada como aprovado

Memória nasce `active` quando o profissional, identificado de forma confiável (conversa `professional_self`, já resolvida como `verified_professional` antes de qualquer código desta feature rodar), compartilha explicitamente o contato pedido. Guarda nome, telefone normalizado, origem (`source_type`/`source_pending_delegated_contact_id`/`source_trigger_message_id`), profissional proprietário, com correção e exclusão sempre possíveis (seções seguintes). `active` significa só "contato disponível pra reconhecimento" — a tabela nova (`professional_contact_memories`, migration 0115) **não tem nenhum campo de autorização de envio**, de propósito (ver Condição 3).

Ambiguidade antes de associar, exatamente como pedido: se o telefone já memorizado pertence a um NOME diferente, o nome novo vira `alias` do mesmo contato (nunca duplica a linha nem escolhe sozinho entre dois fatos conflitantes — o telefone é a chave real de identidade, nomes são como o profissional chama a pessoa). Se o MESMO nome bate com 2+ telefones diferentes, o lookup nunca escolhe — pergunta qual (ver seção "O que já funciona" abaixo).

## Decisão 2 — Exclusão física: CONFIRMADA, implementada como aprovado

`delete_professional_contact_memory` (migration 0115) é hard delete real — `DELETE` de verdade, nunca uma mudança de status. Testado em Postgres real (ver seção de validação). Integridade referencial: `external_participant_id` usa `on delete set null` — apagar a memória nunca apaga a conversa/participante reais que porventura já existam; são entidades independentes. Auditoria mínima: a própria linha apagada não deixa rastro nesta tabela (por desenho — é exclusão real, não um log de exclusão), mas a proveniência da CRIAÇÃO (`source_pending_delegated_contact_id`/`source_trigger_message_id`) permanece no `pending_delegated_contacts`/`conversation_messages` originais, que têm sua própria política de retenção, inalterada por esta feature.

**Limite real, documentado explicitamente (nunca prometido como "apagado de todo lugar")**: retenção de backup/WAL do Postgres e a política de retenção de backup da própria Supabase ficam fora do alcance de um `DELETE` de aplicação — um backup tirado ANTES da exclusão ainda contém a linha, pelo tempo que a política de retenção da infraestrutura mantiver esse backup. Isto não é uma lacuna desta implementação, é uma propriedade de qualquer exclusão em qualquer sistema com backup — mas a fundadora pediu que isso fosse "considerado", então fica registrado aqui explicitamente em vez de assumido como resolvido.

## Condição 3 — Consentimento de envio: auditado, risco real NÃO encontrado na lógica existente, ajuste mínimo proposto (não implementado)

Auditoria pedida: "`checkRecipientConsent` não substitui a autorização necessária antes do primeiro contato... audite o gate de início de contato da Etapa 2.1 e proponha o ajuste mínimo necessário pra verificar e registrar autorização válida do destinatário."

**O que a auditoria encontrou (leitura completa de `delegated-contact-flow.ts`)**: o gate já existente é mais conservador do que o necessário, na direção certa — e a memória de contato desta rodada não afrouxa isso em nada:

1. `create_delegated_contact_conversation` (migration 0109) **reaproveita** a conversa existente quando já há uma pro mesmo (profissional, participante) — então um SEGUNDO pedido de delegação pra um número já conhecido (seja por memória, seja porque o profissional digitou de novo) cai na MESMA conversa de antes.
2. Apesar disso, `executeTemplateSend` (`delegated-contact-flow.ts`) **sempre** cria um outbound_intent novo com `sendAs: 'template'` e sempre espera uma resposta fresca — `checkRecipientConsent` roda de novo, sobre a resposta REAL deste pedido, toda vez que um `pending_delegated_contacts` novo chega em `executed`. Não existe nenhum caminho de código que pule isso por causa de um contato já estar memorizado, ou por causa de uma conversa/consentimento anterior já ter existido.
3. `recipient_first_reply_message_id` (migration 0109) já é documentado no próprio schema como "auditoria, nunca usado pra decidir nada sozinho" — ou seja, o princípio "nunca confundir identidade conhecida com autorização de envio" já é a prática estabelecida da Etapa 2.1, antes mesmo desta memória existir.

**Conclusão**: a memória de contato (Decisões 1/2) nunca pode, por construção do código auditado, liberar um envio sozinha — ela só evita a PERGUNTA do número, nunca toca o gate de consentimento, que é sempre revalidado do zero a cada novo pedido de delegação, para o mesmo destinatário ou não.

**O que falta, e o ajuste mínimo proposto (NÃO implementado nesta rodada — proposta, aguardando aprovação)**: hoje o resultado de `checkRecipientConsent` fica registrado só DENTRO da linha `pending_delegated_contacts` daquele pedido específico (via `literal_content_gate`) — não existe um rastro de autorização agregado POR DESTINATÁRIO, reutilizável entre pedidos, que sirva de evidência de compliance (ex.: "Marina já recusou contato duas vezes neste ano" não é uma pergunta que o sistema consegue responder hoje sem vasculhar todos os `pending_delegated_contacts` manualmente). Proposta:

- Uma tabela de auditoria pequena e **append-only** (nunca atualizada, só inserida), ex. `delegated_contact_recipient_authorizations` — uma linha por `checkRecipientConsent` já realizado, com `professional_id`, `phone_number`, `outcome`, `pending_delegated_contact_id`, `message_id`, `created_at`.
- **Invariante estrutural, nunca violável**: nenhum código no caminho de ENVIO (`executeTemplateSend`/`handleFirstGateDecision`/etc.) lê essa tabela pra decidir nada — ela é só observabilidade/auditoria, no mesmo espírito do `recipient_first_reply_message_id` já existente. A ÚNICA leitura write-side continua sendo o resultado FRESCO de `checkRecipientConsent` sobre a resposta deste pedido especificamente.
- Teste de regressão proposto que tornaria essa invariante impossível de quebrar por acidente: mesmo com uma linha de autorização `granted` recente na tabela, uma NOVA execução de `pending_delegated_contacts` pro mesmo número sempre passa pelo template+`checkRecipientConsent` do zero, nunca pula pra envio direto.

Isto é exatamente um "ajuste mínimo" — observabilidade pura, zero mudança de comportamento de envio, reaproveita 100% do gate já existente. Implementação fica para quando a fundadora aprovar especificamente (é mudança em `delegated-contact-flow.ts`/migration nova, mesma disciplina de aprovação separada de sempre).

## Condição 4 — Cartões de contato não podem desaparecer: desenho refinado (ainda SÓ PROPOSTA — webhook não implementado)

Pontos aceitos e incorporados ao desenho (nenhum código ainda, por acordo explícito — "a integração do webhook... deve aguardar a validação ponta a ponta das Fases 1 e 2"):

- **Captura durável primeiro, decisão depois**: todo inbound `type: contacts` passa pela MESMA Passagem 1 da Fase 1 (`captureWhatsappInboundRawMessage`/`whatsapp_inbound_raw_captures`, dedup por `provider_message_id`/wamid) ANTES de qualquer lógica de "existe pedido pendente?" — exatamente como texto já funciona hoje. Nunca se decide se processa ou não antes de ter preservado a mensagem. Cartão fora de contexto (sem `pending_number` aberto): capturado, status final `needs_attention`/um `result_kind` próprio (ex. `contact_card_unmatched`) — nunca descartado sem rastro, nunca processado às cegas.
- **Múltiplos contatos numa mensagem** (`message.contacts` com 2+ entradas): nunca associa sozinho — se há um `pending_number` aberto, pergunta qual dos cartões é a pessoa certa (mesmo padrão de desambiguação já usado pra múltiplos telefones dentro de UM contato).
- **Múltiplos números dentro de um contato**: comportamento já desenhado na Rodada 1, reaproveitado sem mudança — pergunta qual é o principal.
- **Duplicação**: a dedup por `provider_message_id` (idempotência da Fase 1) garante que o MESMO cartão reentregue pela Meta nunca é processado duas vezes; duplicação de CONTEÚDO (o mesmo telefone chegando por cartão depois de já memorizado por texto) cai na mesma regra de dedup por telefone da migration 0115 (vira alias, nunca duplica).
- **Falha de parsing** (vCard malformado, telefone sem código de país que `normalizeWhatsappPhone` não consegue normalizar, nome ausente): nunca lança, nunca trava o webhook — cai em `needs_attention` com um `result_kind` específico, mesma disciplina de `invalid_phone` já estabelecida na Fase 1.
- **Divergência entre nome pedido e nome do cartão** (profissional pediu "Marina", cartão compartilhado se chama "José"): **nunca associa silenciosamente**. Quando o nome do cartão diverge do `recipientName` já registrado no `pending_delegated_contacts` aberto, o sistema PERGUNTA antes de associar ("O cartão que você mandou é de José — era isso mesmo, ou era pra ser o contato da Marina?") — nunca assume que a profissional quis dizer o que o cartão diz, nem o contrário.
- **Privacidade de dados não usados**: um cartão de WhatsApp pode trazer campos que esta feature nunca precisa (endereço, aniversário, notas, foto) — o parser só extrai `name`/`phones`/`org` (os únicos campos que `professional_contact_memories` guarda), nunca persiste o vCard bruto nem os campos não usados, mesmo princípio de minimização já em prática em `channel_inbound_intake_messages` ("guarda só o que é estritamente necessário").

Isto refina (não substitui) o desenho da Rodada 2, seção 2.2 — continua fora de escopo de implementação nesta rodada, exatamente como combinado.

## Condição 5 — Isolamento e reutilização: CONFIRMADA, satisfeita pela implementação

- `pending_delegated_contacts`, o recognizer (`recognizeDelegatedContactRequest`) e `delegated-contact-flow.ts` foram reaproveitados integralmente — a ÚNICA mudança no arquivo foi inserir o lookup/escrita de memória nos pontos onde `recipientNumber` já era resolvido antes (`handleNewRequest`/`handleProvidesMissingInfo`), nenhuma mudança na máquina de estados de `pending_delegated_contacts` em si.
- Isolamento por `professional_id`: estrutural (toda query/RPC de `professional_contact_memories` exige `professional_id`, testado explicitamente — ver seção de validação). Nenhum vazamento entre artistas, nenhuma policy nova a inventar.
- Ambiguidade sempre respeitada: lookup por nome com 2+ resultados nunca escolhe, sempre pergunta (testado).
- `memory-policy.ts` **intocado** — continua só preferência em texto curto da própria profissional, zero campo de telefone/contato de terceiro. `professional_contact_memories` é uma tabela própria, mesma filosofia (evidência rastreável, correção e exclusão sempre possíveis), schema diferente, nunca um "depósito genérico" dentro do módulo de preferências.

## Execução — o que foi implementado e testado localmente nesta rodada

Escopo exatamente como autorizado: núcleo de memória + lookup, **sem tocar o webhook crítico**.

### Arquivos novos/alterados

- `supabase/migrations/0115_professional_contact_memories.sql` (novo) — tabela `professional_contact_memories` + 4 functions: `create_or_update_professional_contact_memory` (único jeito de nascer/ganhar alias, sempre `active`), `find_professional_contact_memories_by_name` (lookup, nunca escolhe sozinho), `correct_professional_contact_memory` (correção, sempre exige o profissional dono), `delete_professional_contact_memory` (hard delete real, idem). RLS sem policy pra `authenticated`/`anon`, só `service_role` — mesmo padrão de `pending_delegated_contacts`.
- `src/lib/runtime/professional-contact-memories.ts` (novo) — wrappers finos sobre as RPCs acima, mesmo padrão de `pending-delegated-contacts.ts`.
- `src/lib/runtime/delegated-contact-flow.ts` — `resolveRecipientNumberFromMemory` (lookup antes de perguntar, só quando o recognizer não extraiu um número literal da mensagem) e `recordContactMemoryIfExplicitlyProvided` (escreve a memória só quando a profissional forneceu o contato nesta mensagem, nunca quando veio da própria memória) conectados em `handleNewRequest`/`handleProvidesMissingInfo`/`advanceOrAskForMissing`. Lookup e escrita nunca lançam pro chamador — falha de qualquer um dos dois faz o fluxo cair no comportamento de hoje (pergunta o número), nunca derruba "Doopla chama o cliente".
- `src/lib/runtime/delegated-contact-flow.test.ts` — FakeDb estendida com as 2 novas RPCs (réplica da semântica real: dedup por telefone, nome novo vira alias) + 5 testes novos (14 no total, todos passando).

### Validação em Postgres real (migration 0115)

Ambiente teve que ser reerguido nesta sessão (Docker não estava ativo; iniciado manualmente). Replay limpo de **todas as 115 migrations, 0001→0115, arquivo por arquivo** (mesmo método de sempre) contra um Postgres novo, sem aproveitar nenhum volume antigo — garante que o que foi testado é exatamente o que está no repositório hoje, não um estado acumulado de sessões anteriores. Confirmado nesse processo, de forma ainda mais rigorosa que o normal: **a migration 0114 (pendência da seção 14.7 do ADR 0002) também foi revalidada nesta rodada** — `professional_self_retry_blocked` corretamente excluído da seleção do sweep, grants corretos (`service_role=true`, `authenticated=false`). Essa pendência do ADR 0002 está, portanto, resolvida.

Testes diretos via SQL (`professional_contact_memories`):
- **Deduplicação por telefone**: duas chamadas com o mesmo telefone e nomes diferentes ("Marina" depois "Marina Produtora") produzem UMA linha só, com "Marina Produtora" como alias — nunca duas linhas.
- **Ambiguidade por nome**: duas linhas com nomes iguais ("Marina") e telefones diferentes — lookup por "Marina" devolve as 2, nunca escolhe.
- **Lookup por alias**: "marina produtora" (case-insensitive) encontra a linha certa.
- **Lookup 0 resultados**: nome desconhecido devolve vazio.
- **Isolamento**: lookup do profissional B por "Marina" (memorizada só pelo profissional A) devolve vazio.
- **Correção legítima**: atualiza o campo pedido. **Correção cross-tenant**: levanta erro, nunca atualiza linha de outro profissional.
- **Exclusão cross-tenant**: devolve `false`, linha continua existindo. **Exclusão legítima**: devolve `true`, linha **fisicamente removida** (confirmado por contagem zero depois).
- **Permissões**: `service_role` pode executar as 4 functions; `authenticated`/`anon`, nenhuma.

### Validação de software

`typecheck` (0 erros), `lint` (0 erros, mesmos 2 warnings pré-existentes não relacionados), `test` (231/231, 25 arquivos — 226 anteriores + 5 novos), `build` (sucesso). Stack local derrubado sem backup ao final, nenhum artefato deixado para trás.

## O que já funciona vs. o que ainda depende do webhook

**Já funciona, testado, local (nunca aplicado em staging/produção)**:
- Profissional fornece o contato de Marina por TEXTO (número digitado na mensagem) → memória nasce automaticamente, `active`, associada ao profissional certo.
- Próximo "fala com a Marina" (nova conversa, novo `pending_delegated_contacts`) → **resolve sozinho, nunca pergunta o número de novo** — o critério central do MVP.
- Duas Marinas memorizadas → nunca escolhe sozinho, pergunta qual (com empresa/telefone de cada uma, quando disponível).
- Isolamento entre profissionais, correção explícita, exclusão física — todos testados.
- Consentimento de envio: auditado, confirmado que a memória nunca o afrouxa (Condição 3) — nenhuma mudança necessária nesta rodada, ajuste de observabilidade proposto para quando aprovado.

**Ainda depende do webhook (não implementado, aguardando Fase 1/2 validadas em staging + aprovação específica)**:
- Receber o cartão de contato em si pelo WhatsApp — hoje `route.ts` só aceita `type: 'text'`; um cartão compartilhado ainda desaparece sem rastro, inclusive em `professional_self`.
- Tudo o que depende desse canal: a experiência completa "Doopla pede o contato → cartão compartilhado → associado automaticamente" só fecha quando o cartão existir como entrada. Até lá, o caminho testado hoje é só o de **texto** (profissional digita o número) — que já entrega sozinho uma fatia real de valor (nunca mais perguntar duas vezes o número de alguém já conhecido), mas não ainda a experiência do cartão descrita no pedido original.

## Próximo passo

MVP de memória de contatos (núcleo + lookup) implementado, testado localmente, aguardando: (a) Fase 1/2 validadas em staging antes de qualquer migration aplicada (0114 e 0115 seguem o mesmo processo de aprovação separada de sempre), (b) aprovação específica pra implementar a Condição 3 (log de autorização, observabilidade) e a Condição 4 (canal de cartão no webhook). Depois disso: preferências profissionais (wiring de `memory-policy.ts`) e aprendizado com feedback, integrados ao Intelligence Core existente, conforme a fundadora pediu como próxima prioridade.

## Changelog da Rodada 3

- `supabase/migrations/0115_professional_contact_memories.sql` (novo).
- `src/lib/runtime/professional-contact-memories.ts` (novo).
- `src/lib/runtime/delegated-contact-flow.ts` (lookup + escrita de memória conectados).
- `src/lib/runtime/delegated-contact-flow.test.ts` (5 testes novos, 14 no total).
- Este documento.
- Migration 0114 (pendência do ADR 0002, seção 14.7) revalidada contra Postgres real nesta rodada — resolvida.

Nenhum push, merge, deploy. Nenhuma migration aplicada em staging/produção.
