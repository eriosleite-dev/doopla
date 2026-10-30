# ADR 0004 — Roadmap: Doopla como representante inteligente (contatos, memória de relacionamento, aprendizado)

- **Data:** 2026-10-15
- **Status:** Rodada 1 (15/10/2026): auditoria concluída, proposta de desenho (Prioridade 2, cartões de contato) apresentada, nada implementado. Rodada 2 (15/10/2026, pós-revisão final da Fase 2): arquitetura integrada + MVP de memória de contatos ("fala com a Marina") propostos em detalhe. Rodada 3 (15/10/2026): arquitetura APROVADA pela fundadora/Head of AI com 2 decisões e 3 condições; núcleo de memória de contatos (migration 0115 + lookup em `delegated-contact-flow.ts`) **implementado e testado localmente** (Postgres real + vitest); integração do webhook pra cartões de contato permanece **só proposta**, aguardando Fase 1/2 validadas em staging. Rodada 4 (15/10/2026): auditoria de opt-in inicial (lacuna real encontrada e diagnosticada, correção mínima proposta, não implementada) + arquitetura de memória de preferências profissionais (proposta, não implementada). Rodada 5 (15/10/2026): proteção de opt-in **implementada, testada em Postgres real e vitest (242/242)**; especificação final da memória de preferências refinada (distinção verificável vs. probabilística) — ainda **sem implementação**, por instrução explícita.
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

---

# Rodada 4 (15/10/2026) — Auditoria de opt-in inicial + arquitetura de memória de preferências profissionais

Fundadora/Head of AI aprovaram o MVP de memória de contatos (Rodada 3) como concluído e validado. Antes de prosseguir, pediram duas coisas, **só diagnóstico e arquitetura, nenhuma implementação**: (1) distinguir com precisão o opt-in exigido pela Meta ANTES do primeiro contato de `checkRecipientConsent` (que avalia a resposta DEPOIS do primeiro template já enviado); (2) arquitetura mínima pra memória de preferências profissionais, usando `memory-policy.ts`. **Nenhum push, merge, deploy, migration nova ou mudança no webhook nesta rodada.**

## 1. Auditoria: verificação de opt-in inicial vs. `checkRecipientConsent`

A distinção que a fundadora pediu pra nunca confundir é real e a auditoria a confirma: **são dois mecanismos completamente diferentes, em momentos diferentes, e só um dos dois existe no código hoje.**

- **Opt-in exigido pela Meta**: autorização do DESTINATÁRIO, obtida ANTES de qualquer mensagem iniciada pelo negócio, que legitima o negócio a dar o primeiro passo (mandar um template). É uma exigência de política comercial da Meta (quem fiscaliza é a própria Meta, via qualidade do número/denúncias de spam — a API não verifica isso tecnicamente, só exige que a PRIMEIRA mensagem fora da janela de 24h seja um template aprovado).
- **`checkRecipientConsent`**: lê a PRIMEIRA RESPOSTA do destinatário DEPOIS que o template já foi enviado, decidindo só se o TEXTO LITERAL original da profissional pode seguir. Isso nunca é opt-in — é uma leitura de reação a um contato que JÁ aconteceu.

### As 5 perguntas, respondidas com evidência de código

**Onde a autorização inicial é verificada?** Em lugar nenhum. Rastreei `handleNewRequest` → `advanceOrAskForMissing` → `handleFirstGateDecision` (a profissional confirma "sim, pode mandar") → `executeTemplateSend` (`delegated-contact-flow.ts`). A ÚNICA confirmação exigida antes do template ser enviado é a da PRÓPRIA PROFISSIONAL aprovando seu próprio pedido — nunca uma confirmação de que o destinatário deu consentimento prévio pra ser contatado. Busquei "opt-in"/"optin" em todo o código: a única ocorrência é de uma feature não relacionada (Comunidade, `community_profiles`, migration 0059) — zero relação com WhatsApp/outreach.

**Qual é a evidência dessa autorização?** Nenhuma é coletada, nem antes nem depois. `recipient_first_reply_message_id` (migration 0109) é a única coisa que se parece com "evidência" — mas ela só existe DEPOIS do template já enviado, e o próprio comentário da migration já documenta isso como "auditoria, nunca usado pra decidir nada sozinho" (nunca foi desenhado como prova de opt-in prévio).

**O que acontece quando ela é desconhecida?** Nada — porque o sistema não tem a variável "opt-in do destinatário" em lugar nenhum do seu modelo de dados ou lógica. `executeTemplateSend` roda incondicionalmente assim que a profissional aprova; não existe um estado "desconhecido" que bloqueie, porque não existe o conceito pra começar.

**Um número recém-compartilhado pela artista pode gerar envio sem opt-in verificável?** **Sim — hoje, exatamente como qualquer outro número.** A memória de contatos (Rodada 3) não piora nem melhora isso: ela só decide se a Doopla PERGUNTA o número de novo, nunca se o número pode receber um template. Um telefone digitado agora mesmo segue o idêntico caminho de um memorizado há meses — aprovação da profissional, template enviado, zero verificação do lado do destinatário.

**Como são respeitados pedidos de descadastramento ou bloqueio?** Só PARCIALMENTE, e só DENTRO do pedido em andamento: se a resposta do destinatário ao template é lida como `declined` por `checkRecipientConsent`, o TEXTO LITERAL daquele pedido específico não é enviado. Mas isso não cria nenhum registro durável — busquei "blocklist"/"opt-out"/"descadastr"/"unsubscribe" no código inteiro: zero resultados relevantes. Nada impede um pedido de delegação FUTURO (de hoje, do mês que vem, de outra profissional até, se o número coincidir) de mandar outro template pro MESMO número que já recusou antes.

### Diagnóstico

A lacuna real: o sistema trata "autorização pra iniciar contato" como garantida pela aprovação da PRÓPRIA PROFISSIONAL — mas a exigência da Meta (e a base legal de LGPD pra contatar um terceiro) é sobre o DESTINATÁRIO, nunca sobre quem pede o contato. Tecnicamente a Cloud API não impede o envio (ela só exige que seja um template aprovado pra abrir a janela) — a responsabilidade de ter opt-in de verdade é inteiramente do negócio, fiscalizada indiretamente por qualidade do número/denúncias. Isso significa que toda a funcionalidade "Doopla chama o cliente", desde que existe, opera em modo de contato frio não verificado — um risco real de qualidade do número (denúncias de spam podem derrubar a classificação de qualidade da conta comercial) e de base legal sob LGPD, não uma preocupação abstrata.

### Menor correção necessária (PROPOSTA — não implementada, aguardando aprovação específica)

Duas peças, as mínimas que fecham a lacuna sem reescrever nada do que já funciona:

1. **Uma pergunta explícita adicional antes de `executeTemplateSend`**, separada da pergunta de conteúdo que já existe ("Vou iniciar o contato com Marina e mandar esta mensagem: '...'. Confirma?"). Algo como: "Você já tem autorização da Marina pra te contatar comercialmente pelo WhatsApp (ela topou receber mensagem, é cliente que já conversou com você, pediu o contato)?" — só avança pra `executeTemplateSend` com uma resposta afirmativa EXPLÍCITA, registrada como evidência (`authorization_basis`, texto curto categorizado: `client_relationship`/`explicit_request`/`other`, mais o id da mensagem de confirmação). Sem essa confirmação, o pedido fica bloqueado (mesmo padrão de `pending_approval` já existente, um novo "gate" antes dele, não uma reescrita).
2. **Registro durável de recusa/bloqueio por telefone**, estendendo a tabela de auditoria de autorização já proposta na Condição 3 da Rodada 3 (nunca implementada ainda): quando `checkRecipientConsent` retorna `declined`, grava isso de forma permanente por `(professional_id, phone_number)` — e QUALQUER pedido de delegação futuro pra esse número (resolvido via memória de contato ou não) é bloqueado automaticamente antes mesmo de chegar em `executeTemplateSend`, com uma mensagem clara pra profissional ("Esse número já pediu pra não ser contatado antes — não posso iniciar de novo automaticamente").

Nenhum dos dois toca `checkRecipientConsent` nem `executeTemplateSend` em si — ambos são gates ADICIONAIS, antes do fluxo já existente, nunca uma substituição. Implementação (migration + código) só mediante aprovação específica, como de praxe.

## 2. Arquitetura mínima — memória de preferências profissionais

Objetivo explícito da fundadora: "não é aumentar a quantidade de dados armazenados, é fazer a Doopla usar o que aprendeu pra representar cada artista de forma mais inteligente, sem ultrapassar sua autonomia autorizada." Toda a proposta abaixo reaproveita `memory-policy.ts` (já pronto, testado, zero wiring) — nenhum motor novo.

### 2.1 Taxonomia — mapeando as 5 categorias pedidas

| Categoria pedida | `MemoryKind` | Exemplo | Observação |
|---|---|---|---|
| Preferências de comunicação | `communication_style` (já existe) | "mensagens mais curtas" | sem mudança |
| Informações sobre a carreira | `operational_preference` (já existe) | "não aceito eventos aos domingos" | sem mudança |
| Preferências de negociação | `commercial_preference` (já existe) | "costumo negociar parcelado" | sem mudança |
| Restrições comerciais | **novo kind: `commercial_restriction`** | "sempre me consulte antes de falar sobre valores com cliente novo" | ver 2.2 — motivo de ser um kind separado, não uma reaproveitamento de `commercial_preference` |
| Informações sobre relacionamentos específicos | **fora de `memory-policy.ts`** — campo novo em `professional_contact_memories` (Rodada 3) | "tom mais informal com a Marina" | ver 2.3 — nunca entra no módulo de preferência geral, porque tem uma dimensão (o contato) que `memory-policy.ts` não modela |

### 2.2 Por que `commercial_restriction` é um kind novo, não um valor de `commercial_preference`

Uma PREFERÊNCIA ("costumo negociar parcelado") é uma informação de contexto — o Planner pode usá-la pra escrever um draft melhor, mas nunca muda se algo precisa de revisão humana. Uma RESTRIÇÃO ("sempre me consulte antes de falar sobre valores") tem a forma de uma regra que a profissional quer ver respeitada — e é exatamente aí que **a Regra Fundamental da fundadora precisa ser estruturalmente impossível de violar**: memória nunca pode ser o mecanismo que decide se algo precisa de aprovação.

Auditoria confirma que isso já é estrutural, independente desta feature: `requiresProfessionalReviewBeforeSend` (`planner/invariants.ts`) é derivado DETERMINISTICAMENTE do `responsePlan` escolhido pelo model (`consult_professional` sempre exige revisão; os outros planos, por definição de `prompt.ts`, nunca afirmam compromisso) — nunca de texto livre, nunca de uma memória. Uma restrição como "sempre me consulte sobre valores" só pode, na prática, **influenciar qual `responsePlan` o model tende a escolher** (um nudge mais forte no prompt pra preferir `consult_professional` em tópicos de preço) — ela nunca pode, nem por desenho futuro, SUBSTITUIR o código que decide se `consult_professional` exige revisão. Separar `commercial_restriction` de `commercial_preference` como `MemoryKind` é o que permite o prompt tratar os dois com pesos textuais diferentes (uma restrição declarada merece destaque visual mais forte, "ATENÇÃO: restrição explícita da profissional") sem nunca lhes dar poder estrutural diferente — ambas continuam `contextOnly: true`, a mesma garantia de tipo que já existe hoje.

### 2.3 Por que "relacionamentos específicos" não entra em `memory-policy.ts`

`ProfessionalMemory` é escopada só por `professionalId` — não tem (nem deveria ganhar) uma dimensão de "sobre qual contato". Forçar isso dentro do `value: string` misturaria duas perguntas diferentes ("o que a profissional prefere, em geral" vs. "o que ela me disse sobre a Marina especificamente"). A Rodada 3 já construiu exatamente a peça certa pra isso: `professional_contact_memories`, que JÁ é escopada por contato. Proposta: um campo novo opcional nessa tabela (ex. `communication_note`, texto curto) — "pode usar tom mais informal, gosta de ser chamada de 'Má'" vira uma nota ligada à Marina, nunca uma memória genérica do profissional. Zero tabela nova, zero motor novo — só um campo a mais numa tabela que já existe e já tem toda a disciplina de proveniência/correção/exclusão resolvida.

### 2.4 Fluxo proposto (captura → revisão → persistência → recuperação)

**1. Captura de preferências explícitas**: um recognizer isolado novo (mesmo padrão de `delegated-contact/recognizer.ts` — model call pequeno, schema fechado, nunca decide nada sozinho, falha sempre vira "não reconheceu"), rodando SÓ em `professional_self` (nunca em conversas com cliente — ver 2.6). Reconhece quando a profissional declara uma preferência explicitamente, classifica o `kind`, extrai o valor.

**Diferença deliberada da Decisão 1 da Rodada 3 (memória de contato nasce `active` direto)**: aqui, a memória nasce **`proposed`** (o default de `proposeMemory`, já testado) — NUNCA ativa de origem. Motivo: um telefone errado falha alto e na hora (a Doopla pergunta nome/número de novo, sem dano); uma preferência mal interpretada influencia SILENCIOSAMENTE todas as conversas futuras até alguém notar. A Doopla confirma de volta ("Entendi — você prefere mensagens mais curtas a partir de agora, confirma?") e só uma confirmação explícita chama `reviewMemory(decision:'approved')`. Isso atende diretamente o item 2 da lista da fundadora ("revisão e correção pelo artista").

**2. Revisão e correção — fechando uma lacuna já documentada no próprio módulo**: o topo de `memory-policy.ts` já lista como risco conhecido "Supersession: não existe um conceito de 'esta memória substitui aquela outra'". Proposta mínima pra fechar isso (requisito 5 da fundadora, "testes de contradição e atualização"): quando o recognizer propõe uma memória de um `kind` que já tem uma `approved` pro mesmo profissional, a confirmação de volta menciona as duas ("Antes você tinha dito X, agora Y — Y substitui X?"); a confirmação da profissional aprova a nova E revoga a antiga (`revokeMemory`) na MESMA transação. Sem isso, duas preferências contraditórias do mesmo kind conviveriam no contexto do Planner sem nenhuma delas vencer — risco real que esta correção fecha.

**3. Persistência segura por profissional**: nova migration (NÃO implementada nesta rodada) — tabela espelhando `ProfessionalMemory` 1:1 (`professional_memories`: id, professional_id, kind, value, evidence jsonb, confidence, status, created_at, reviewed_at, reviewed_by, expires_at), RLS sem policy pra `authenticated`/`anon` (mesmo padrão de sempre), RPCs atômicas (`propose_professional_memory`/`review_professional_memory`/`revoke_professional_memory`) com guarda de estado por `UPDATE ... WHERE status = 'proposed'` (mesmo rigor de claim já usado em todo o projeto — o próprio `memory-policy.ts` já pede isso explicitamente no seu comentário de riscos residuais).

**4. Recuperação contextual no momento certo**: o Context Builder (`context-builder/build.ts`) já tem exatamente o padrão certo pra isso — uma function por seção (`buildProfessionalBusinessContextSection` etc.), cada uma com seu próprio `ContextSection<ContextFact>`/status/citação em `evidenceUsed`. **Achado importante**: `professionalBusinessContext` (que `prompt.ts` já descreve como "preferências/dados de negócio que ele já declarou") NÃO é alimentada por `memory-policy.ts` — vem de uma tool separada (`get_professional_business_context`, dados estruturados que a profissional preenche no painel, ex. `pricingNotes`/`workTypes`/`feeRange`). São fontes de proveniência DIFERENTES (um dado digitado deliberadamente num formulário vs. algo aprendido numa conversa) — misturar as duas na mesma seção do contexto perderia essa distinção, importante pra auditoria/evidência. Proposta: uma seção NOVA, `professionalLearnedPreferences`, seguindo o MESMO padrão estrutural (nunca um mecanismo de contexto paralelo), alimentada por `selectContextMemories` (já pronta, já testada — só troca o array estático por uma leitura real da tabela nova). `prompt.ts` ganha uma frase curta reaproveitando EXATAMENTE a mesma linguagem de segurança que `professionalBusinessContext` já usa hoje ("CONHECER ≠ COMPARTILHAR... nunca marque nada como autorizado") — nunca uma política nova, a mesma já revisada.

**5. Testes de contradição e atualização**: cobertos pelo mecanismo de supersessão do item 2 — cenário completo proposto (não escrito): duas mensagens contraditórias do mesmo kind, confirmação da segunda revoga a primeira, `selectContextMemories` nunca devolve as duas.

### 2.5 Avaliação de qualidade antes/depois (requisito 7)

Proposta: estender o padrão já existente de golden-suite (`dev/*-golden-suite`, hoje usado pro Classifier/Planner/Policy Gate) com cenários que rodam o MESMO turno duas vezes — uma vez sem nenhuma `professionalLearnedPreferences`, uma vez com uma memória aprovada relevante — e comparam o draft resultante (ex.: memória diz "mensagens curtas" → draft da segunda rodada deve ser objetivamente mais curto). Reaproveita 100% da infraestrutura de golden-suite já existente, nenhum motor de avaliação novo.

### 2.6 Proteção contra instruções maliciosas vindas de mensagens de clientes (requisito 6)

`memory-policy.ts` já antecipa isso estruturalmente: `MemoryEvidenceSourceType` inclui `'client_message'`, mas `proposeMemory` SEMPRE nasce `'proposed'`, nunca aprovada, "mesmo com confiança máxima" (já testado, `memory-policy.test.ts`). A proteção adicional que esta proposta soma: **o recognizer desta rodada nunca roda fora de `professional_self`** — não é uma checagem em runtime que poderia ter um bug, é a ausência estrutural do caminho (o recognizer simplesmente nunca é chamado a partir do pipeline de conversa com cliente). Isso significa que, nesta primeira fase, `sourceType: 'client_message'` nunca é de fato usado por nenhum código novo — fica reservado no tipo pra um desenho futuro, deliberadamente mais cauteloso, nunca aberto por acidente agora.

Vale uma ressalva honesta: `professional_self` já é a mesma fronteira de confiança que TODA a Fase 2/Etapa 2.1 usa (`decision.method === 'verified_professional'`) — um comprometimento do próprio número de WhatsApp da profissional (troca de SIM, etc.) afetaria isso tanto quanto afeta "Doopla chama o cliente" hoje. Não é um risco novo desta feature, é herdado da mesma fronteira de identidade que todo o professional_self já depende — registrado por transparência, não uma lacuna desta proposta especificamente.

### 2.7 O que NÃO está nesta rodada

Nenhuma migration, nenhum código, nenhuma mudança em `pipeline.ts`/Context Builder/`prompt.ts`. Tudo acima é arquitetura pra aprovação — implementação (recognizer + migration + wiring no Context Builder + testes) fica pra quando autorizado especificamente, seguindo o mesmo processo de sempre.

## Changelog da Rodada 4

- Este documento (duas novas seções: auditoria de opt-in + arquitetura de memória de preferências).

Nenhum código, nenhuma migration, nenhum push, nenhum deploy.

---

# Rodada 5 (15/10/2026) — Opt-in implementado e testado; especificação final da memória de preferências (sem implementação)

Fundadora/Head of AI revisaram a Rodada 4 e tomaram duas decisões: **Decisão 1** (corrigir o opt-in, 8 requisitos, autorizada pra implementação local) e **Decisão 2** (aprovar a arquitetura de preferências, com uma distinção estrutural adicional — preparar a especificação final, **sem** implementação extensa nesta rodada).

## 5.1 Decisão 1 — proteção de opt-in: implementada e testada

Migration `0116_whatsapp_outreach_authorization.sql` (nova) + wiring em `delegated-contact-flow.ts`, `pending-delegated-contacts.ts`, `send-outbound-intents/route.ts`. Os 8 requisitos, um a um:

1. **Verificar autorização antes do primeiro contato**: `advanceOrAskForMissing` (`delegated-contact-flow.ts`) nunca arma a pergunta de conteúdo sem antes checar `whatsapp_outreach_authorization_claims` — se não existe, arma uma pergunta DEDICADA de autorização primeiro (`pending_authorization`, novo status), nunca pula direto pra `pending_approval`.
2. **Registrar origem/finalidade/data/evidência, nunca confundir com autorização do destinatário**: `whatsapp_outreach_authorization_claims` guarda `claimed_basis` (fixo em `'professional_attestation'` — deliberadamente não tentamos classificar SUBTIPOS de base a partir de texto livre, risco real de classificação errada), `purpose_summary`, `claimed_at`, `evidence_message_id`. Nome e comentários da tabela repetem, em dois lugares (SQL e TS), que isto é a ATESTAÇÃO da profissional — `checkRecipientConsent` continua sendo a ÚNICA fonte de consentimento real do destinatário, intocada.
3. **Autorização desconhecida nunca envia template; oferece convite por link**: confirmado, `buildInviteLinkText` reaproveita `/orcamento/[slug]` (link já existente, nunca duplicado) — a profissional pode mandar esse link por fora da Doopla pra que o PRÓPRIO contato inicie a conversa (sempre compatível com a política da Meta, conversa iniciada pelo cliente nunca precisa de template).
4. **Registro durável de opt-out/recusa, separado da memória de contatos**: `whatsapp_outreach_blocklist`, tabela própria, nunca um campo em `professional_contact_memories`. Escrita automaticamente quando `checkRecipientConsent` retorna `declined` (`runDelegatedContactRecipientReplyFlow`).
5. **Impedir novos contatos após recusa, inclusive memória e mensagens enfileiradas**: recheck em TRÊS pontos — (a) antes de perguntar/criar o pedido (`advanceOrAskForMissing`), (b) dentro de `executeTemplateSend` antes de criar o outbound_intent (cobre o intervalo entre aprovação e execução), (c) dentro de `sendOneOutboundIntent` (`send-outbound-intents/route.ts`) antes de QUALQUER chamada real à Meta — este último é universal, cobre qualquer outbound_intent já enfileirado ANTES do bloqueio existir, não só os de "Doopla chama o cliente". Testado explicitamente (`route.test.ts`, cenário "mensagem já enfileirada ANTES do número entrar na blocklist").
6. **Escopo correto entre artistas — bloqueio geral nunca ignorado por outro artista**: `whatsapp_outreach_blocklist` é escopada só por `phone_number`, nunca por `professional_id` — decisão deliberadamente conservadora (nunca tentamos classificar se uma recusa era "só deste pedido" ou "bloqueio geral"; qualquer `declined` bloqueia o número inteiro). Testado explicitamente: uma recusa num pedido da profissional A bloqueia um pedido NOVO da profissional B pro mesmo telefone, mesmo com a profissional B tendo sua própria atestação de autorização.
7. **Reverificar autorização e blocklist no momento efetivo do envio**: ver item 5(b)/5(c) — a blocklist é SEMPRE rechecada no instante real do envio, nunca só na hora de perguntar.
8. **Respeitar janela de 24h, templates aprovados, pedidos de interrupção**: nenhuma mudança na lógica de CSW/template (`cold-outreach.ts`, `resolveSendAction`) — o recheck de blocklist roda ANTES dela, nunca a substitui (testado explicitamente: bloqueio impede o envio mesmo com CSW aberta).

**Achado real durante os testes** (corrigido): `draft_message_content` se perdia entre a pergunta de autorização e a pergunta de conteúdo — só existia na memória do primeiro turno, nunca sobrevivia a uma segunda requisição HTTP (o professional respondendo em outra mensagem, dias depois até). `prepare_pending_delegated_contact_authorization_review` agora persiste o rascunho (coalesce, nunca sobrescreve um valor já salvo).

### Testes (os 6 cenários pedidos, todos cobertos)

`delegated-contact-flow.test.ts` (19 testes, incluindo os 14 de rodadas anteriores) + `send-outbound-intents/route.test.ts` (novo, 3 testes):

- **Sem consentimento**: profissional nega autorização → `blocked_unauthorized`, oferece link, zero `outbound_intent` criado.
- **Autorização válida**: claim pré-existente → pula a pergunta, vai direto pra `pending_approval`.
- **Revogação**: destinatário recusa → blocklist grava → pedido NOVO de OUTRO profissional pro mesmo telefone é bloqueado automaticamente, mesmo com atestação própria.
- **Contato já memorizado**: memória de contato (Rodada 3) resolve o número sozinha, mas o gate de autorização AINDA pergunta — memória de identidade nunca é autorização.
- **Mensagem enfileirada**: outbound_intent criado antes do bloqueio existir → recheck no cron impede o envio real, nunca chama a Meta.
- **Concorrência**: duas respostas simultâneas à pergunta de autorização → claim atômico garante avanço único, nunca duas claims.

### Validação final

Replay limpo de **0001→0116** (116 migrations, arquivo por arquivo) contra Postgres real — confirmado que o arquivo final (não os patches incrementais aplicados durante o desenvolvimento) se comporta identicamente. `typecheck`/`lint` limpos, `test` **242/242** (226 anteriores + 19 em `delegated-contact-flow.test.ts`, incluindo os 5 novos cenários − 3 antigos substituídos, + 3 em `route.test.ts` − já contava alguns antes), `build` com sucesso.

### Riscos residuais declarados

- **Alternativa de convite por link depende de slug cadastrado**: se a profissional não tem slug configurado no perfil, a mensagem avisa isso explicitamente em vez de gerar um link quebrado — nunca falha silenciosamente, mas é uma fricção a mais que a fundadora pode querer resolver depois (ex.: gerar slug automaticamente).
- **Blocklist nunca distingue "recusa deste pedido" de "bloqueio permanente"**: decisão deliberada (seção acima), mas significa que um "não, agora não" malinterpretado como recusa bloqueia permanentemente — mitigado pelo fato de `checkRecipientConsent` já ser bem conservador classificando `declined` (fail-closed pro lado de NUNCA enviar), mas é um residual real: não há hoje um caminho de "desbloquear" um número manualmente. Registrado como item futuro se a fundadora quiser.
- **`claimed_basis` sempre `'professional_attestation'`, nunca sub-tipado**: por desenho (evitar classificação errada a partir de texto livre) — a auditoria de compliance futura sabe QUE a profissional atestou, mas não exatamente POR QUE categoria. Suficiente pro MVP, pode ser refinado depois com um fluxo estruturado (ex.: botões/opções em vez de texto livre).

## 5.2 Decisão 2 — especificação final da memória de preferências (SEM implementação, por instrução explícita)

A fundadora pediu uma distinção estrutural adicional sobre a proposta da Rodada 4: **"preferências de linguagem/estilo podem orientar o Planner" vs. "restrições comerciais obrigatórias precisam de aplicação verificável, independente da obediência probabilística do modelo."** Esse ponto refina — e em parte CORRIGE — a seção 2.2 da Rodada 4, que tinha proposto `commercial_restriction` como só mais um `MemoryKind` alimentando o prompt do Planner com destaque visual mais forte. Isso NUNCA seria "aplicação verificável" de verdade — é ainda um nudge textual, e um model sempre pode, probabilisticamente, ignorar um nudge textual por melhor que ele seja escrito. A especificação final corrige isso.

### Dois níveis, tratados de forma estruturalmente diferente (nunca a mesma mecânica pros dois)

**Nível 1 — Preferências de linguagem/estilo** (`communication_style`, `operational_preference`, `commercial_preference` — os 3 `MemoryKind` já existentes, inalterados): continuam exatamente como desenhado na Rodada 4 — memória vira contexto no prompt do Planner (`professionalLearnedPreferences`, nova seção do Context Builder, nunca confundida com `professionalBusinessContext`), `contextOnly: true`, só orienta o TOM/ESTILO do draft. Nunca decide nada estrutural. Isso é aceitável ficar "probabilístico" porque a pior consequência de o model ignorar é um draft mais longo do que a profissional preferia — nunca um risco comercial real.

**Nível 2 — Restrições comerciais obrigatórias** (nova categoria, NUNCA mais chamada `MemoryKind`/alimentando o prompt como as de Nível 1 — reclassificada): deixa de ser "memória que o Planner lê" e passa a ser uma **regra estruturada que o Post-model Policy Gate aplica em código**, no MESMO lugar determinístico que já decide `requiresProfessionalReviewBeforeSend` hoje (`planner/invariants.ts`, achado da auditoria desta rodada: essa decisão já é 100% derivada do `responsePlan` escolhido, uma taxonomia fechada, nunca de texto livre — a fundação certa pra pendurar uma regra nova sem reescrever nada).

Desenho proposto (ainda sem código, por instrução explícita):
- Uma restrição nasce com um **tópico estruturado de uma lista fechada** (ex.: `pricing`, `discount`, `new_client_scheduling`, `payment_terms` — nunca texto livre classificado por um model), nunca um valor livre interpretado por LLM na hora de aplicar.
- Quando aprovada, o Post-model Gate ganha UM checagem adicional, puramente aditiva: se o turno atual toca o tópico restrito (usando os MESMOS sinais estruturados que o Orchestrator já calcula pra classificar o turno — ex.: o `intent`/`commitmentNature` que a auditoria da Rodada 1 já tinha identificado ativando `price_or_cache` pra pedidos de orçamento — nunca uma nova leitura do texto livre do draft) E a profissional tem uma restrição ativa pra esse tópico, `requiresProfessionalReviewBeforeSend` é forçado pra `true` — **a regra só pode ESCALAR proteção, nunca reduzir**. Nenhuma restrição jamais pode fazer `requiresProfessionalReviewBeforeSend` virar `false` quando o código já o calcularia `true` por outro motivo.
- Isso é "aplicação verificável, independente da obediência probabilística do modelo" no sentido literal: o model nunca precisa "lembrar" ou "escolher respeitar" a restrição — o código aplica sozinho, sempre, de forma auditável e testável com um caso determinístico (dado um tópico restrito ativo + um turno que toca esse tópico, SEMPRE force revisão — nenhuma chamada de IA no meio dessa decisão específica).

### Regra fundamental, reafirmada e tornada estrutural (nunca só uma frase)

"Nenhuma memória pode autorizar preços, descontos, bookings, pagamentos ou mudanças sem os gates já existentes" — isso já era verdade por desenho na Rodada 4 (memória nunca é lida por nenhum gate, só pelo Planner), e continua verdade aqui com uma garantia adicional: mesmo a regra de Nível 2 (que SIM é lida por código, diferente das de Nível 1) só pode **adicionar** uma exigência de revisão, nunca remover uma. Nenhum caminho de código (nem Nível 1, nem Nível 2) pode fazer `requiresProfessionalReviewBeforeSend` passar de `true` pra `false`. Esta é a invariante central — critério de aceitação proposto: um teste que prova que uma memória/restrição dizendo "pode falar de valores livremente" NUNCA desliga uma revisão que o código já exigiria por outro motivo.

### Fluxo de aprendizado — proveniência, confirmação, atualização, exclusão (reafirmado da Rodada 4, sem mudança de desenho)

- **Só instruções confiáveis da própria artista**: recognizer roda SÓ em `professional_self` (estrutural, nunca um caminho de código que alcance conversa com cliente) — reafirmado da seção 2.6 da Rodada 4.
- **Proveniência**: toda memória/restrição carrega `evidence` (sourceType + sourceId), nunca um texto solto sem origem rastreável — mesmo padrão de `memory-policy.ts` já testado.
- **Confirmação quando necessário**: Nível 1 nasce `proposed`, Doopla confirma de volta antes de `reviewMemory(approved)` (seção 2.4 da Rodada 4). Nível 2 (restrição obrigatória), por ter consequência estrutural maior, deveria exigir confirmação SEMPRE, nunca uma via rápida — proposta: a mesma confirmação de Nível 1, mas o texto de confirmação nomeia explicitamente o efeito ("a partir de agora, qualquer conversa sobre valores com cliente novo vai sempre pedir sua revisão antes de responder — confirma?"), nunca escondendo o que a regra vai fazer.
- **Atualização**: mecanismo de supersessão (seção 2.4 da Rodada 4) — uma correção nova revoga a antiga na mesma confirmação, nunca duas memórias/regras contraditórias do mesmo tópico convivendo.
- **Exclusão**: Nível 1 seguindo o padrão de `memory-policy.ts` (soft-revoke, dado da própria profissional, trilha de auditoria aceitável). Nível 2, por ser uma regra com efeito de segurança, também aceita exclusão explícita — mas como é uma regra que só RESTRINGE (nunca libera nada sozinha), uma exclusão aqui nunca é tão sensível quanto excluir uma `professional_contact_memories` (dado de terceiro) — soft-revoke é suficiente, mesmo padrão de Nível 1.

### Proteção contra instrução privilegiada vinda de mensagem de cliente CITADA (requisito novo, mais específico que a Rodada 4)

A fundadora pediu explicitamente: "mensagens de clientes **e trechos citados** não podem gravar instruções privilegiadas na memória." A Rodada 4 já fechava o caso óbvio (recognizer nunca roda em conversa com cliente) — este requisito pede mais: e se a PRÓPRIA profissional, dentro de `professional_self`, **citar/relatar** um pedido do cliente ("o cliente pediu 20% de desconto, pode considerar isso pra próxima vez")? Isso é uma mensagem de `professional_self` (passa pelo filtro estrutural), mas o CONTEÚDO da regra extraída seria, na prática, uma instrução de um terceiro, só retransmitida.

**Especificação da correção** (ainda sem implementação): as instruções do recognizer (mesmo padrão de `delegated-contact/recognizer.ts`) precisam de uma regra explícita: só extrai preferência/restrição quando a profissional está declarando algo como **sua própria regra, em primeira pessoa** ("eu prefiro...", "sempre me consulte...", "não aceito...") — nunca quando está RELATANDO ou CITANDO um pedido/instrução de terceiro, mesmo dentro de `professional_self`. Um relato ("o cliente pediu desconto") nunca vira `commercial_preference`/`commercial_restriction` sozinho — na melhor das hipóteses vira um FATO sobre aquela conversa específica (já coberto por `client_context`/dados operacionais existentes, nunca uma regra geral aplicada a conversas futuras). Teste de aceitação proposto: uma mensagem relatando um pedido de cliente nunca propõe uma memória de preferência/restrição; só uma declaração em primeira pessoa da própria profissional propõe.

### O que NÃO está nesta rodada

Confirmado, por instrução explícita ("prepare a especificação final... mas não inicie uma implementação extensa em paralelo"): zero migration, zero código, zero mudança em `planner/invariants.ts`/Context Builder/recognizer novo. Esta seção é a especificação completa pronta pra aprovação de implementação numa rodada futura.

## Changelog da Rodada 5

- `supabase/migrations/0116_whatsapp_outreach_authorization.sql` (novo).
- `src/lib/runtime/whatsapp-outreach-authorization.ts` (novo).
- `src/lib/runtime/delegated-contact-flow.ts`, `src/lib/runtime/pending-delegated-contacts.ts` (gate de autorização).
- `src/app/api/runtime/send-outbound-intents/route.ts` (recheck universal de blocklist).
- `src/app/api/runtime/send-outbound-intents/route.test.ts` (novo).
- `src/lib/runtime/delegated-contact-flow.test.ts` (5 cenários novos de segurança).
- Este documento (implementação do opt-in documentada; especificação final da memória de preferências, sem código).

Nenhum push, merge, deploy. Nenhuma migration aplicada em staging/produção.
