# ADR 0004 — Roadmap: Doopla como representante inteligente (contatos, memória de relacionamento, aprendizado)

- **Data:** 2026-10-15
- **Status:** Auditoria concluída. Proposta de desenho (Prioridade 2, cartões de contato) apresentada, **nada implementado** — mudança no webhook crítico, aguardando aprovação explícita antes de qualquer código. Roadmap (Prioridades 3/5/6) integrado ao Charter, também sem implementação nesta rodada.
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

## Changelog desta rodada

- `src/lib/channels/whatsapp/intake-routing.ts` / `.test.ts`, `src/app/orcamento/[slug]/page.tsx` — correção do link de orçamento (commit local).
- `src/app/orcamento/[slug]/orcamento-form.tsx` — correção de copy enganosa (commit local).
- Este documento.

Nenhuma migration aplicada, nenhum push, nenhum deploy. Retomando agora a finalização da Fase 1 (testes com Postgres real + vitest), que estava em andamento quando esta mensagem chegou.
