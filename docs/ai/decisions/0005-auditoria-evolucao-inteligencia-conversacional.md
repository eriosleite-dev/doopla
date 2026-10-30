# ADR 0005 — Auditoria: evolução da inteligência conversacional (Etapa 1)

- **Data:** 2026-10-16
- **Status:** Etapa 1 (auditoria técnica) concluída — **nenhuma mudança de código ou de dado aplicada**, exceto uma leitura read-only de `app_settings` em produção. Aguardando aprovação da fundadora/Head of AI pra Etapa 2 (proposta de evolução).
- **Autor:** Claude Code (Principal AI Engineer), em resposta a pedido direto da fundadora/Head of AI após testes reais no WhatsApp oficial (produção, fluxo `professional_self`).
- **Contexto**: a fundadora testou a Doopla pelo WhatsApp oficial e relatou falhas de continuidade contextual, interpretação de delegação, memória, identidade institucional, tom e capacidade de recuperação. Pediu auditoria técnica completa antes de qualquer implementação (Etapa 1 do plano de 4 etapas que ela definiu: Auditoria → Proposta → Implementação controlada → Validação real).

Todas as citações abaixo vêm de leitura direta do código (três sub-auditorias paralelas em arquivos completos, não grep isolado) e de uma query read-only contra o Supabase de produção.

## 1. Perda de contexto em mensagens curtas e correções

**Causa — comprovada.** O Context Builder carrega até 10 mensagens/30 dias (`src/lib/intelligence/context-builder/budget.ts:9-10`) — isso não é o gargalo. Mas tanto `src/lib/intelligence/classification/classification-context.ts:27-28` quanto `src/lib/intelligence/planner/planner-context.ts:34-35` recortam esse array já carregado pra só a mensagem-gatilho + 2 anteriores, descartando o resto mesmo que ainda esteja disponível. Numa troca de 6 turnos (oferta → "Mostre" → explicação errada → correção → oferta genérica → "Sim"), ao processar "Sim" a IA só enxerga os 2 turnos imediatamente anteriores — a âncora original já saiu da janela.

Não existe nenhum estado de "pergunta pendente" ou de decisão anterior realimentado no próximo turno (`classification/types.ts:29-45`) — tudo é re-interpretado do zero a partir do texto cru a cada chamada. A lista fixa de intenções (`classification/intents.ts:8-35`) não tem categoria pra "correção do que a IA disse" nem pra "pedido de tutorial de funcionalidade" — força essas mensagens numa categoria errada (provavelmente `outro`/`suporte`), que leva o Planner por um caminho desalinhado. O prompt do Classifier já instrui o modelo a não adivinhar confirmações curtas sem contexto desambíguo (`classification/prompt.ts:26-27`) — mitigação real, mas insuficiente porque opera dentro da mesma janela de 2 mensagens.

**Arquivos/funções:** `classification-context.ts:27-28`, `planner-context.ts:34-35`, `classification/types.ts:29-45`, `classification/intents.ts:8-35`, `classification/prompt.ts:26-27`.

**Impacto:** qualquer correção ou resposta curta que dependa de mais de 2 turnos atrás se perde — o profissional precisa repetir tudo.

**Solução recomendada (não implementada):** (a) parar de descartar o que o Context Builder já carregou — usar mais do que 2 mensagens na re-fatiagem de `classification-context.ts`/`planner-context.ts`; (b) estado explícito de "pergunta pendente"/última decisão do Planner, realimentado no turno seguinte; (c) nova(s) intenção(ões) pra correção do assistente e pra pedido de tutorial, ou um mecanismo de intenção fora da lista fixa.

**Riscos/dependências:** janela maior aumenta tokens/custo por chamada; precisa de suíte de regressão pra não reintroduzir confusão entre assuntos antigos não relacionados.

## 2. Delegação mal interpretada + "E aí, conseguiu?"

**Causa — comprovada, inclusive o valor real em produção.** Existe um recognizer isolado e dedicado (`src/lib/intelligence/delegated-contact/recognizer.ts`) que roda antes do Classifier/Planner em todo turno de `professional_self` (`src/lib/runtime/pipeline.ts:240-249`) — mas só se `app_settings.delegated_contact_enabled = 'true'`. Essa flag nasce `'false'` na migration `0109_delegated_contact_execution.sql:776` e só é ligada por `UPDATE` manual, nunca registrado em migration nenhuma. **Confirmado por query direta em produção nesta auditoria: o valor real é `false`.**

Com a flag off, o recognizer nunca roda, e toda mensagem cai no Classifier/Planner comum, que: não tem nenhuma intenção pra delegação (`classification/intents.ts`); não tem nenhuma tool de consulta de status de tarefa pendente (`src/lib/intelligence/tools/index.ts:5-17` só registra perfil/oportunidade/booking/participante/contexto de negócio/histórico comercial — nada de `pending_delegated_contacts`); e gera resposta livre por LLM sem nenhuma estrutura de apoio. Busca completa por "você enviou"/"registrado" no repositório não encontrou essa frase em nenhum template determinístico — confirma que a resposta "Ok, registrado: você enviou..." foi inventada pela própria LLM ao tentar interpretar a situação sem contexto estruturado, não um bug de template errado.

Quando a flag está ligada e o recognizer acerta o sinal, a arquitetura já existe e está testada: `handleProvidesMissingInfo` reconhece número fornecido num turno posterior e mescla na mesma linha (`src/lib/runtime/delegated-contact-flow.ts:183-185,348-354`); `describeStatus`/`handleStatusInquiry` (`delegated-contact-flow.ts:606-665`) responde "conseguiu?" com o estado real de `pending_delegated_contacts`/`outbound_intents.delivery_state`. O problema não está em como o fluxo funciona quando é alcançado — está em alcançá-lo de forma confiável.

**Arquivos/funções:** `delegated-contact-flow.ts:142-185,348-354,606-665`, `pipeline.ts:240-249`, `src/lib/runtime/app-settings.ts:13-16`, migration `0109:776`, `tools/index.ts:5-17`.

**Impacto:** delegação e consulta de status falham silenciosamente pro Planner genérico sempre que a flag está off — o comportamento relatado bate integralmente com isso.

**Nota de processo:** a flag foi deixada `false` por recomendação deste mesmo autor, horas antes desta auditoria, como proteção durante a fase de testes solo — sem perceber que ela desliga o reconhecimento inteiro, não só o envio final a terceiros. Registrado aqui como correção de rumo, não só como achado técnico.

**Solução recomendada:** (a) decisão da fundadora — religar a flag agora é seguro o bastante pra testar, dado que o gate de opt-in (migration 0116) já está em produção e testado (qualquer tentativa de contato real passaria primeiro pela pergunta de autorização, nunca enviaria direto); (b) registrar a próxima ativação em migration versionada, nunca mais via `UPDATE` solto; (c) expor ao Planner uma tool read-only de status de delegação como rede de segurança pros turnos em que o recognizer erra o sinal (Etapa 2).

**Riscos/dependências:** não há registro do motivo originalmente pretendido pra manter a flag off além da cautela genérica desta sessão — religar envolve contato real com terceiros, ainda que protegido pelo gate de opt-in.

## 3. Falta de memória contextual (repetição de contato)

**Causa — comprovada.** O Context Builder (`src/lib/intelligence/context-builder/build.ts:21-87`) monta só 7 seções pro Planner: perfil, contexto de negócio, histórico comercial, mensagens, oportunidade, booking, participante externo. Não existe seção nenhuma pra memória de contatos (`professional_contact_memories`, migration 0115) nem pra tarefas pendentes (`pending_delegated_contacts`). `src/lib/intelligence/learning/memory-policy.ts` não é referenciado em nenhum outro arquivo do módulo de inteligência além do próprio teste — está desconectado do Planner.

Os dois sistemas de memória construídos neste roadmap (contato + preferências, ADR 0004) são consultados apenas de dentro do fluxo isolado de delegação (`delegated-contact-flow.ts`) — nunca pelo Classifier/Planner comum. Quando a delegação cai fora desse fluxo isolado (Problema 2), a memória de contato também fica invisível, o que soma ao sintoma de "perguntar o mesmo contato de novo".

**Arquivos/funções:** `context-builder/build.ts:21-87`, `learning/memory-policy.ts` (não referenciado fora do próprio teste).

**Impacto:** qualquer pergunta sobre contatos/preferências fora do fluxo isolado de delegação não tem acesso a nada disso.

**Solução recomendada:** criar seção(ões) novas no Context Builder pra memória de contato e estado operacional — reaproveitando a distinção "Nível 1 (contexto probabilístico) vs Nível 2 (regra determinística)" já especificada no ADR 0004, Rodada 5, nunca implementada.

**Riscos/dependências:** precisa manter a separação já estabelecida entre "identidade conhecida" (memória de contato) e "autorização de envio" (gate de opt-in, intocado) — nunca confundir as duas ao expor isso como contexto pro Planner.

## 4. Doopla não conhece a própria identidade institucional

**Causa — comprovada.** Não existe nenhum texto institucional em nenhum prompt enviado ao modelo. `buildClassificationInstructions()` (`classification/prompt.ts`) é inteiramente sobre taxonomia de intenção; `buildPlannerInstructions()` (`planner/prompt.ts`) descreve o papel interno do Planner, nunca o que a Doopla é pra quem conversa com ela. A resposta genérica recebida é improvisação pura da LLM.

Existem 3 definições diferentes e inconsistentes já publicadas no repositório, nenhuma chegando à IA: `/sobre` ("nova forma de agenciamento"), `/cadastro` + `layout.tsx` ("plataforma de representação"), `/termos` seção "O que é a Doopla" ("plataforma digital de agenciamento... que utiliza tecnologia e IA...", a mais próxima da resposta genérica recebida), e `docs/head-of-ai-brief.md:26` ("plataforma de representação inteligente...", a mais próxima do posicionamento pretendido pela fundadora — mas um doc interno, nunca lido por nenhum código de IA).

**Arquivos:** `classification/prompt.ts`, `planner/prompt.ts`, `src/app/sobre/page.tsx:9,20`, `src/app/cadastro/page.tsx:79,82`, `src/app/layout.tsx:6`, `src/app/termos/page.tsx:44-48`, `docs/head-of-ai-brief.md:26`.

**Impacto:** além da resposta errada da IA, há uma inconsistência de posicionamento já publicada (site/termos) independente da IA.

**Solução recomendada:** consolidar uma fonte institucional única (base: `head-of-ai-brief.md`, revisado pela fundadora), injetá-la no prompt do Planner. Não alterar os Termos de Uso (fora de escopo, confirmado).

**Riscos/dependências:** nenhum técnico — é conteúdo, não arquitetura.

## 5. Tom robótico/formal

**Causa — comprovada.** A única regra determinística no código é a remoção de travessão (`src/lib/runtime/message-style.ts:23-31`, aplicada em todo envio real exceto templates). Todo o resto é instrução de prompt que o modelo pode ignorar (`planner/prompt.ts:52`). Não existe nenhuma regra, em código ou prompt, contra desculpas repetitivas, fórmulas de SAC, repetição de abertura entre mensagens consecutivas, ou limite de tamanho de resposta.

**Arquivos:** `message-style.ts:1-31`, `planner/prompt.ts:52`.

**Impacto:** bate diretamente com os exemplos reportados — nada no sistema hoje impede esse padrão.

**Solução recomendada:** reforçar o prompt do Planner com instruções específicas contra os padrões listados; avaliar um verificador leve pós-geração pro caso mais grave (abertura idêntica consecutiva), já que prompt sozinho é probabilístico.

**Riscos/dependências:** baixo risco técnico; precisa de avaliação antes/depois via golden-suite pra não regredir noutro eixo (ex.: perder objetividade em troca de "naturalidade").

## 6. Falta de iniciativa/recuperação

Não é uma causa isolada — é consequência direta dos Problemas 1 e 2: sem estado de "pergunta pendente" e sem tool de consulta de status real, o Planner não tem como agir sobre uma situação que não consegue ver. Resolver a raiz dos Problemas 1/2/3 cobre a maior parte deste.

## 7/9/10. Modelos, testes automatizados, observabilidade — estado atual

- **Modelos:** Classifier (`classification/config.ts:11`) e Planner (`planner/config.ts:9`) já são independentemente configuráveis — constantes separadas, comentário explícito dizendo que podem divergir no futuro. Hoje os dois usam `gpt-5-mini` por escolha, não por acoplamento. Não existe etapa de geração de resposta separada do Planner — `proposedResponse` do Planner é o rascunho que vira a mensagem de saída (`src/lib/runtime/pipeline.ts:466` e outros pontos), só passando por `stripTravessao()` depois.
- **Testes:** já existe infraestrutura de golden-suite por componente (`classification/golden-suite.ts`, `planner/golden-suite.ts`, `approval/golden-suite.ts`, `inbound-proposal/golden-suite.ts`, `policy-gate-post/golden-suite.ts`) — reaproveitável pros cenários de regressão pedidos, sem mecanismo novo.
- **Observabilidade:** `orchestrator_runs` registra intenção, confiança, plano, categorias de decisão, latência só do turno inteiro (`src/lib/intelligence/observability.ts:12-28,142-175`). `ai_usage_events` registra modelo e tokens (`observability.ts:79-101,109-128`). Faltam hoje: resultado de cada tool chamada (só o nome fica em `called_tools`, nunca o resultado); quais fatos de contexto foram realmente usados (só um enum de 3 valores, `context_completeness`); tempo por etapa (só o total via `latency_ms`); e custo — a coluna `cost_cents_estimate` existe desde a migration `0018` mas nunca é preenchida, porque `logAiUsageEvent()` não manda esse campo no insert (`migration 0041:19-54`).

## Decisão pendente da fundadora

1. ~~Religar `app_settings.delegated_contact_enabled`~~ — feito (migration 0117, aplicada em produção pela fundadora em 16/10/2026).
2. Aprovação pra avançar à Etapa 2 (proposta de arquitetura, priorizada em P0/P1/P2 conforme pedido) com base neste diagnóstico.

## Addendum — validação real pós-correção (16/10/2026)

Com `delegated_contact_enabled = true` e o gate de opt-in (0116) ativos, a fundadora testou "Doopla chama a Gabi" ao vivo no WhatsApp oficial. Achados do teste real:

**Confirmado funcionando:** o recognizer isolado dispara corretamente, a orquestração determinística (`delegated-contact-flow.ts`) avança por recipient → conteúdo → execução, e `pending_delegated_contacts` chega a `status: executed` — o `outbound_intent` do template é criado e `send-outbound-intents` o envia, com a API da Meta confirmando (`delivery_state: sent_confirmed`, `providerMessageId` presente, sem erro).

**Bug novo encontrado — mensagem nunca chega ao destinatário real, apesar de `sent_confirmed`.** Investigação ao vivo (query direta em `pending_delegated_contacts`/`outbound_intents` em produção + painel da Meta) isolou a causa:

- Descartado: número de teste da Meta (confirmado que o número real comprado, `5511918527238`, é o que de fato envia — a profissional recebe respostas normais dele em suas próprias conversas).
- Descartado: limite de mensagens (nível atual 250 conversas/24h, só 2 usadas nos últimos 7 dias — longe do teto).
- Descartado: número de destino errado ou sem WhatsApp (confirmado pela fundadora).
- Confirmado sistêmico: reenviar pra um segundo número de teste diferente também nunca chegou — não é específico da Gabi.
- **Causa provável**: o template `doopla_primeiro_contato_v2` (`src/lib/channels/whatsapp/cold-outreach-template.ts:21-22`) está cadastrado na categoria **Marketing** no WhatsApp Manager (confirmado pela fundadora, 16/10/2026). A API da Meta aceita o envio e devolve `providerMessageId` (por isso `sent_confirmed`), mas nenhum status de `delivered`/`failed` chega depois — padrão consistente com os sistemas anti-spam da própria Meta descartando silenciosamente entregas de Marketing "frias" (destinatário sem nenhuma interação prévia com o número) de contas ainda não verificadas. Recomendação original de categorizar como Marketing partiu deste mesmo autor (Claude Code) — registrado aqui como erro de orientação anterior, não da fundadora.

**Solução recomendada:** completar a verificação da empresa junto à Meta (documentos, em andamento) — afeta a confiança/qualidade atribuída aos envios, não só o limite de volume. Recategorizar o template como "Utilidade" é desaconselhado — o conteúdo (convite de primeiro contato) não se qualifica pelos critérios da Meta pra essa categoria, risco real de rejeição na resubmissão. Mesmo após verificada, abordagem "fria" (sem nenhum sinal prévio de interesse do destinatário) deve continuar tendo entrega menos confiável no WhatsApp por desenho da própria plataforma — não é um defeito corrigível só no nosso lado.

**Risco/dependência:** verificação de empresa é processo externo (Meta), fora do controle de prazo deste time.

## Addendum — requisitos registrados pro bloco de personalidade/qualidade conversacional (16/10/2026)

Bloco 1 (janela de histórico + identidade institucional) validado em produção pela fundadora — resposta real a "O que é a Doopla?" bateu com a definição registrada acima. Ela observou corretamente que isso valida só esse caminho, não todos os caminhos do Bloco 1.

Antes de avançar, registrou requisitos pro bloco de personalidade (P2, ainda não implementado — só documentado aqui pra não perder, nenhuma mudança de arquitetura/fluxo feita agora):

- Falar em primeira pessoa com o profissional (nunca descrever a Doopla na terceira pessoa/institucional numa conversa direta).
- Evitar linguagem institucional e explicações técnicas no dia a dia da conversa — a definição institucional completa é pra quando perguntada diretamente, nunca o tom padrão de toda resposta.
- Nunca expor informação interna sobre estágio do produto (ex.: "beta", "fase de testes") ou sobre quem é o público do beta.
- Priorizar mensagens curtas, naturais, adequadas ao formato WhatsApp.
- Evitar encerramentos artificiais oferecendo listas de funcionalidades (ex.: "quer que eu explique como funciona na prática, envio de mensagens, templates...").
- Preservar integralmente as regras de aprovação/autonomia existentes — este bloco é só tom, nunca comportamento de decisão.

Objetivo declarado pela fundadora: a Doopla deve parecer uma representante que trabalha com a profissional, não uma IA que conhece/explica o produto.

## Addendum — baseline oficial, primeira execução real do harness (16/10/2026, commit `bcbc63e`)

**Resultado bruto:** 4 cenários, 9 turnos, rodados em 2026-10-16T11:49:41Z contra `gpt-5-mini` (Classifier/Planner/recognizer). 3/4 cenários com `scenarioPass=false`, 1/4 (`numero-ja-informado-nao-repetir`) com `scenarioPass=true`. Custo total R$0,0622. JSON completo preservado em `docs/ai/decisions/evidence/0005-harness-baseline-bcbc63e.json` (validado sem PII/credenciais antes de arquivar — único telefone presente é o sintético `+55 11 90000-1111`, já documentado como fictício em `scenarios.ts`).

**Correção de contagem** (a fundadora apontou corretamente que eu disse "3 das 4 respostas" de forma imprecisa — contagem exata turno a turno, direto do JSON): dos 9 turnos, o check de **parágrafo** falhou em exatamente **2** (`correcao-apos-oferta-tutorial` turno 2: 780 caracteres sem `\n\n`; `legibilidade-resposta-longa` turno 1: 494 caracteres sem `\n\n`). O check de **travessão no texto bruto** falhou em outros **2** turnos (`correcao-apos-oferta-tutorial` turno 2; `delegacao-mudanca-assunto-retomada` turno 3) — sempre corrigido pela limpeza determinística antes do envio. O que é 3/4 é a contagem de **cenários** com pelo menos um turno reprovado, não de turnos com falha de parágrafo especificamente.

A avaliação humana que a fundadora pediu (e que o harness não automatiza, por desenho) encontrou um problema real no cenário que passou 100% nos critérios objetivos (`numero-ja-informado-nao-repetir`) — tratado em P0.1 abaixo. Isso confirma na prática o próprio `semanticDisclaimer` do harness: PASS estrutural não é prova de correção semântica.

### P0.1 — Identidade e papéis na representação

**Achado real, comprovado por duas fontes independentes de evidência (não suposição):**

1. No turno 1 de `numero-ja-informado-nao-repetir` (cenário que teve PASS estrutural), o Planner, pedido para "manda mensagem... fala que é a Gabi e que mandei beijos", redigiu: *"Rascunho... assinando como 'Gabi': 'Oi! Aqui é a Gabi. A Duda me pediu para te mandar beijos. Beijos!'"* — ou seja, o rascunho faz a Doopla **assinar a mensagem como se fosse a própria destinatária** (Gabi), falando dela mesma na terceira pessoa ("a Duda me pediu"), um resultado sem sentido operacional (ninguém manda pra alguém uma mensagem se apresentando com o nome dessa mesma pessoa).
2. Lido o prompt completo do Planner (`src/lib/intelligence/planner/prompt.ts`): **não existe nenhuma instrução sobre papéis** (quem é o artista representado, quem é a Doopla/representante, quem é o destinatário, quem é a autora do pedido) em nenhuma parte do texto. O prompt rege tom/formatação/regras de compromisso, mas nunca diz "ao redigir uma mensagem para um terceiro em nome da profissional, assine como a Doopla ou deixe claro que é a profissional falando — nunca assuma a identidade do destinatário".

**Causa comprovada:** ausência de instrução de papéis no prompt do Planner. Não é uma hipótese — é uma leitura direta do arquivo-fonte.

**Mas (ponto crítico que separa Harness de arquitetura real):** o texto que o Planner gerou aqui **nunca seria enviado a ninguém em produção**. Confirmado lendo `src/lib/runtime/delegated-contact-flow.ts` e `pipeline.ts`: quando a mensagem é da profissional em `professional_self`, `pipeline.ts` chama `runDelegatedContactRequestFlow` **antes** de `classifyIntent`/`planResponse` (linha 240-249), e se o recognizer reconhece qualquer sinal de delegação, a função retorna `handled=true` e o ciclo termina ali — **o Planner nunca roda para essas mensagens em produção**. O comentário no topo do próprio arquivo é explícito: *"NUNCA chama o Planner — todo texto enviado à profissional aqui é composto em código"*. O texto real que seria enviado ao destinatário (`draftMessageContent`) vem do **recognizer** (`recognizeDelegatedContactRequest`), não do Planner.

**Isso significa duas coisas, não uma:**
- O bug de identidade que vimos é, tecnicamente, um **artefato do Harness nesta forma atual** — ele expõe o Planner a um cenário que o Planner nunca enfrenta de verdade em produção.
- Mas é também um **sinal de risco real não verificado**: não sabemos se o recognizer — que *de fato* compõe o texto enviado via `draftMessageContent` — comete o mesmo erro de identidade com a mesma instrução ambígua, porque **o Harness nunca testou isso**. `runner.ts` captura só `signal`/tokens do recognizer; descarta `recipientName`, `recipientNumber`, `draftMessageContent` — exatamente os campos que importam para este risco. É hipótese em aberto, não bug confirmado na arquitetura real.

**Sobre a fixture em si:** "fala que é a Gabi" é genuinely ambíguo em português (pode ler como "diz que é a Gabi quem assina" ou como confusão de copy-paste do cenário irmão, onde Gabi é inequivocamente a destinatária). A fundadora pediu para não mascarar isso — concordo: a fixture precisa ser separada em (a) um caso inequívoco (diz que é a própria profissional/artista enviando) e (b) um caso de ambiguidade deliberada, onde o critério de sucesso é o sistema **perguntar**, nunca resolver sozinho silenciosamente — hoje nem o recognizer nem o Planner têm essa saída de "ambiguidade de identidade" explicitamente instruída.

**Minha recomendação:** tratar como dois blocos separados, nessa ordem: (1) adicionar ao prompt do recognizer uma regra explícita de papéis + instrução de nunca assumir identidade do destinatário/terceiro ao compor `draftMessageContent`, sempre que a autoria do texto for ambígua — isso sim, muda o componente real de produção. (2) evoluir a fixture pra separar o caso inequívoco do caso de ambiguidade proposital, e fazer o Harness capturar/testar `recipientName`/`recipientNumber`/`draftMessageContent` do recognizer diretamente (hoje invisível). O prompt do Planner também merece a mesma regra de papéis por disciplina e porque ele compõe texto em outros contextos (ex.: explicar pro profissional o que vai ser enviado) — mas isso é prioridade menor que o recognizer, que é quem de fato fala com o terceiro.

### P0.2 — Integração entre recognizer, Planner e estado operacional

**Achado comprovado, lendo `pipeline.ts` (linhas 233-258) e `delegated-contact-flow.ts` por completo:** a arquitetura real **não tem a ambiguidade que a pergunta presume**. Não há duplicação de decisão entre recognizer e Planner — eles nunca decidem a mesma coisa porque **nunca rodam na mesma mensagem em produção**. O fluxo é estritamente sequencial e exclusivo:

1. `pipeline.ts` chama `runDelegatedContactRequestFlow` primeiro, sempre, para toda mensagem da profissional em `professional_self`.
2. Essa função chama o recognizer isolado. Se o sinal for `no_delegation_signal`, devolve `handled=false` e **só então** o pipeline normal (Classifier → Planner → Policy Gate → Approval Engine) roda, exatamente como se a funcionalidade de delegação não existisse.
3. Se o sinal for qualquer outro (`new_request`, `confirms_pending`, `status_inquiry` etc.), a resposta à profissional é **inteiramente composta em código determinístico** (`advanceOrAskForMissing`, `describeStatus`, etc.), lendo o estado real persistido em `pending_delegated_contacts`/`outbound_intents`. O Classifier e o Planner **nunca são chamados** para essa mensagem.

**Portanto: o Harness, na forma atual, não testa o que o profissional realmente recebe nos turnos de delegação.** Quando a run mostrou "o reconhecedor identificou `status_inquiry` corretamente, mas o Planner continuou com uma resposta genérica" (turno 3 de `delegacao-mudanca-assunto-retomada`), isso é 100% esperado e não é bug nenhum — o Harness roda Classifier+Planner incondicionalmente em todo turno, inclusive nos que em produção nunca chegariam a eles. O texto real que a profissional veria ali seria o de `describeStatus()`, montado a partir do `status`/`literalContentGate` reais da linha — nunca o rascunho do Planner.

**Isso não é um defeito do Harness por acidente — é uma lacuna de cobertura real:** hoje não existe nenhum teste automatizado (golden-suite nem Harness) que valide o texto que `describeStatus`/`advanceOrAskForMissing` de fato produzem para cada combinação de estado (`pending_number`, `pending_authorization`, `executed` + cada `literalContentGate`, etc.) — só os testes unitários de orquestração em `delegated-contact-flow.test.ts`, que verificam `handled`/efeitos no banco, não a qualidade/naturalidade do texto de resposta. Isso é meio caminho andado (existe cobertura de que a lógica dispara certo), mas não cobre naturalidade/precisão do texto — exatamente a categoria de problema que a fundadora quer medir.

**Minha recomendação:** (1) não gastar esforço tentando "integrar" recognizer e Planner — a separação estrita é arquitetura correta e deliberada (comentário no próprio código confirma: decisão consciente de nunca deixar o Planner compor texto operacional sensível). (2) Em vez disso, evoluir o Harness para ter uma segunda trilha dedicada a `delegated-contact-flow.ts`: testar `runDelegatedContactRequestFlow` diretamente (função determinística, sem chamada a Classifier/Planner, só ao recognizer) com estado sintético variado — isso mede o componente que o profissional de fato vê. O que o Harness testa hoje (Classifier+Planner nos mesmos turnos) continua útil só para os turnos `no_delegation_signal`, onde o pipeline normal de fato roda.

### P0.3 — Correções e continuidade conversacional

**Bloco 1 (janela de histórico completa) segue validado, agora com dado real de execução, não só leitura visual.** No cenário `correcao-apos-oferta-tutorial`: turno 2 reconheceu a correção corretamente (sem iniciar um fluxo desconexo) e turno 3 ("Sim") ancorou corretamente em `conversation_message` real — nenhuma perda de contexto. Em `delegacao-mudanca-assunto-retomada` turno 3, a resposta do Planner (que, por P0.2, nunca seria a que o profissional recebe) ainda assim mostra o modelo relatando corretamente "não enviei nada ainda" em vez de inventar uma execução — zero alucinação de estado, mesmo fora do caminho real.

**Achado semântico real, exatamente o tipo que a fundadora pediu pra não deixar passar por trás de um PASS estrutural:** no mesmo turno 2 de `correcao-apos-oferta-tutorial` (que teve `turnPass=false`, mas só por formatação — a avaliação de conteúdo nem é objetivamente testada aqui), o texto é: *"Você tem razão, obrigado pelo toque, posso ajustar a explicação para esta versão: '[bloco de texto entre aspas]'. Está bom assim ou prefere alguma alteração?"* Isso é exatamente o padrão que a fundadora descreveu como problema: a Doopla trata a correção como **oferecer uma revisão de texto para aprovação**, em vez de **simplesmente corrigir a própria fala e seguir a conversa**. Nenhum critério objetivo do Harness hoje capturaria isso — é compreensão de tom, não estrutura. Validação direta de que a Harness precisa mesmo da camada de revisão semântica humana que a fundadora está pedindo, ao lado dos checks de código.

### P0.4 — Precisão sobre capacidades reais

**Achado real, comprovado por ausência no código:** no turno 1 de `delegacao-mudanca-assunto-retomada`, o Planner ofereceu: *"Você quer que eu envie por WhatsApp, ligação ou DM do Instagram?"* Busquei "ligação"/"Instagram" em todo `src/lib/intelligence` — a única ocorrência de "Instagram" é um exemplo de conteúdo de bio em `classification/prompt.ts` (nada a ver com canal de envio), e "ligação" não aparece em lugar nenhum. **A Doopla não tem, hoje, nenhuma capacidade de ligação ou DM do Instagram** — só WhatsApp (confirmado também em `delegated-contact-flow.ts`, `channel: 'whatsapp'` hardcoded em todo lugar). Isso é alucinação pura, sem nenhum grounding.

**Causa raiz:** o prompt do Planner (`prompt.ts`) não define em nenhum lugar quais canais/capacidades reais existem — não há uma lista de "isto você pode fazer, isto não". O modelo está livre para inventar qualquer canal plausível.

**Mitigação pela mesma razão de P0.1/P0.2:** este texto específico nunca seria enviado (P0.2 — mensagem de delegação nunca passa pelo Planner em produção). Mas o problema de fundo — Planner sem lista de capacidades reais — vale para **qualquer** caminho onde o Planner compõe texto que de fato chega ao profissional (a maioria das conversas normais, fora de delegação), e lá sim pode gerar uma promessa real de algo que a Doopla não faz.

**Minha recomendação:** adicionar ao prompt do Planner uma seção curta e explícita de capacidades reais (hoje: só mensagens de texto via WhatsApp; não liga, não manda DM de Instagram, não executa nada sem revisão humana) — baixo risco, mudança isolada e fácil de medir objetivamente com um check novo no Harness (lista de termos proibidos tipo "ligação"/"ligar"/"Instagram"/"chamada de vídeo" na resposta).

### P1 — Latência e custo

Latência por turno: 17,4s–32,6s total (classifier 3,6–12,2s, planner 11,6–19,4s, recognizer 2,6–10s quando presente — chamadas sequenciais, nunca em paralelo). Custo: R$0,0622 para 9 turnos (~R$0,007/turno), alinhado à tabela de preços do `gpt-5-mini`. Não investiguei ainda se isso bate com a latência real observada no WhatsApp em produção (pode ser maior, já que o Runtime real tem outras etapas: Policy Gate, Approval Engine, persistência) — como pedido, não estou tratando isso como aceitável só por ser sequencial, nem propondo trocar de modelo sem comparação. Fica como item de investigação separada, fora do bloco de prompts, antes de qualquer decisão.

### Causas comprovadas vs. hipóteses (resumo)

**Comprovado (leitura direta de código/dado real, não suposição):**
- Ausência de instrução de papéis/identidade no prompt do Planner (P0.1).
- Ausência de qualquer regra de papéis no prompt do recognizer, que é quem de fato compõe o texto operacional (P0.1).
- Separação estrita recognizer/Planner em produção — Planner nunca roda em turnos de delegação tratados (P0.2).
- Harness não captura `recipientName`/`recipientNumber`/`draftMessageContent` do recognizer — ponto cego real de cobertura (P0.1/P0.2).
- Zero cobertura automatizada da qualidade do texto gerado por `describeStatus`/`advanceOrAskForMissing` (só lógica de disparo, via testes unitários existentes) (P0.2).
- Ausência de lista de capacidades reais no prompt do Planner — alucinação de canais comprovada (P0.4).
- Contagem exata dos checks de formatação: 2/9 turnos falharam parágrafo, 2/9 falharam travessão bruto (corrigido por limpeza determinística em 100% dos casos) (P1 formatação).
- Padrão de "correção vira oferta de revisão de texto" em vez de correção natural, confirmado por leitura humana de um turno real (P0.3).

**Hipótese, ainda não verificada:**
- Se o recognizer real (não o Planner) comete o mesmo erro de identidade da Gabi com a mesma fixture ambígua — requer teste dedicado, ainda não feito.
- Se a latência medida no Harness corresponde à latência real end-to-end no WhatsApp em produção (o Harness não inclui Policy Gate/Approval Engine/persistência/envio).
- Se o padrão de "revisão de texto" em vez de correção natural é sistemático ou específico deste cenário — precisa de mais casos no golden-suite pra confirmar como padrão, não incidente isolado.

### Ordem de implementação recomendada

Minha recomendação de prioridade, por impacto em confiabilidade da representação primeiro (conforme pedido), nunca por aparência:

1. **P0.1b (recognizer) — regra de papéis no prompt do recognizer**, especificamente para `draftMessageContent`: nunca assumir a identidade do destinatário, sempre atribuir a autoria à profissional/artista representada salvo instrução inequívoca em contrário. Prompt-only, sem mudança de schema/orquestração. Risco de regressão: baixo (só adiciona uma restrição, schema `modelOutputSchema` inalterado).
2. **Evolução do Harness (pré-requisito pro restante ser medível com confiança):** capturar `recipientName`/`recipientNumber`/`draftMessageContent` no `TurnResult`; separar a fixture ambígua em caso inequívoco + caso de ambiguidade proposital (critério: sistema deve perguntar, não resolver sozinho); adicionar trilha dedicada testando `runDelegatedContactRequestFlow` diretamente (não só Classifier/Planner) para medir o texto real que o profissional recebe nos turnos de delegação.
3. **P0.4 — lista de capacidades reais no prompt do Planner**, com check objetivo novo no Harness (termos proibidos). Prompt-only, baixo risco, fácil de medir antes/depois.
4. **P0.3 — ajuste de tom pra correções** ("corrigir naturalmente" em vez de "oferecer revisão para aprovação"), unificado com os requisitos já registrados no addendum de personalidade acima (mesmo bloco, nunca dois blocos de prompt divergentes sobre tom). Precisa de mais casos no golden-suite antes, pra não medir uma mudança de prompt contra um único exemplo.
5. **P1 formatação** — reforço de instrução de parágrafos no prompt do Planner (já existe a regra em `prompt.ts`, mas o modelo não a segue de forma confiável; considerar também uma rede de segurança determinística equivalente ao `stripTravessao`, já que depender só de instrução já provou ser insuficiente pros dois casos medidos).
6. **P0.1a (Planner) — mesma regra de papéis**, por disciplina/consistência, prioridade menor que o recognizer porque o Planner não compõe texto que vai a terceiros no caminho de delegação.
7. **Latência** — investigação separada (medir no pipeline real, não só no Harness) antes de qualquer decisão de otimização ou troca de modelo.

**Nenhum destes exige mudança de orquestração/schema além do já mapeado** (recognizer ganha uma regra de prompt, Harness ganha captura de campos já existentes na resposta do recognizer — não precisa de nova migration nem novo RPC). O único item que toca o Harness em si (item 2) é código de teste, nunca produção.

### Riscos de regressão identificados

- Mudar o prompt do recognizer (item 1) tem superfície de risco real: ele já governa toda a extração de `recipientName`/`recipientNumber`/`draftMessageContent`/`signal` usada por `delegated-contact-flow.ts` para decidir criar/avançar `pending_delegated_contacts` de verdade. Qualquer ajuste de prompt aqui precisa rodar a suíte completa de `delegated-contact-flow.test.ts` (idempotência, concorrência, gates de autorização) antes de qualquer deploy — não só o Harness.
- Reforçar instrução de parágrafos no Planner (item 5) tem risco baixo mas não nulo: já existe uma regra equivalente no prompt atual que o modelo não segue de forma confiável — reforçá-la pode mudar como o modelo formata OUTRAS respostas também (booking, aprovação), não só os casos medidos. Recomendo rodar o golden-suite completo (classification + planner + approval, não só o Harness novo) antes de considerar fechado.
- Nenhuma mudança proposta aqui toca Policy Gate, Approval Engine, ou os fluxos de booking/pagamento diretamente — todas ficam contidas em prompt.ts (Planner) e recognizer.ts (delegação), superfície já coberta pelos testes existentes desses módulos.

### Evolução da golden-suite proposta

Confirmo a lista de 10 categorias da fundadora como o escopo certo pra próxima rodada de cenários, priorizando os que já têm evidência real nesta execução: (1) confusão remetente/destinatário — já evidenciado (P0.1); (3) capacidades inexistentes — já evidenciado (P0.4); (8) não reconhece correções/confirmações — parcialmente evidenciado, tom ainda problemático mesmo com conteúdo correto (P0.3); (9) respostas longas sem espaçamento — já evidenciado, contagem exata registrada acima. As demais (2, 4, 5, 6, 7, 10) ainda não têm cenário dedicado — proponho escrevê-los como bloco de trabalho separado, sempre a partir de casos reais ou hipóteses de falha plausíveis e documentadas (nunca buscando só palavra-chave, como já é a disciplina do Harness hoje), antes de qualquer mudança de prompt que dependa deles pra ser medida.

**Nenhuma mudança de prompt/modelo/Classifier/Planner/recognizer foi implementada nesta etapa — só leitura de código e documentação, conforme pedido.** Aguardando aprovação da fundadora sobre a ordem acima antes de abrir o primeiro bloco de implementação.

## Addendum — validação integrada antes/depois (Bloco 1 + Playbook DJ/Música, 19/10/2026)

Rodada pedida pela fundadora após aprovar a direção técnica (Bloco 1 identidade + Playbook ADR 0006 + 10 novos cenários): ambiente de avaliação isolado (preview Vercel), mesmo conjunto de 15 cenários golden-suite nas duas versões, sem nenhum envio real nem dado comercial de produção tocado.

### Ficha técnica

- Modelo: `gpt-5-mini` (classifier, planner, recognizer) nas duas versões.
- **Antes**: commit `0769092` (branch `claude/baseline-harness-14-cenarios`) — código pré-Bloco1/Playbook (`recognizer.ts`/`planner/prompt.ts`/`planner/plan.ts` no estado de `bcbc63e`), com a infraestrutura do Harness (cenários, captura de campos, execução em lotes) já sincronizada da branch "depois" para permitir comparação apples-to-apples.
- **Depois**: commit `20c627c` (branch `claude/lote-p0-96-144-cenarios`) — Bloco 1 (identidade na delegação) + Playbook DJ/Música (ADR 0006) + os 10 novos cenários.
- Hash do prompt do Planner idêntico nas duas versões (`fe01472b4d8b`) — **esperado, não é falha de medição**: o hash registrado em `metadata` é calculado sem nenhuma competência roteada, e o bloco do Playbook só é anexado condicionalmente quando a competência roteada é `comercial_negociacao`/`producao` (ver `prompt.test.ts`). A diferença real só aparece no texto de cada turno, nunca nesse hash agregado — registrado aqui para não induzir a uma leitura equivocada de "prompts idênticos = nenhuma mudança".
- Execuções: 3 rodadas "antes" (commit `0769092`, 14:18/14:30/14:43) e 1 rodada "depois" (commit `20c627c`, 15:03) — a diferença no número de rodadas "antes" foi um efeito colateral de confusão na navegação entre deployments de preview na Vercel, não um desenho intencional, mas acabou dando um sinal útil de variação natural do modelo na mesma versão.
- JSONs completos arquivados em `docs/ai/decisions/evidence/0005-antes-0769092-run{1,2,3}-*.json` e `docs/ai/decisions/evidence/0006-depois-20c627c-run1-15h03.json` — checados por PII antes do arquivamento (só o número sintético já estabelecido `+55 11 90000-1111`/`-2222` e o nome sintético `Duda`, nenhum dado real).

### Segurança da delegação (`draftMessageContent`, caminho real de execução)

Em nenhuma das 4 rodadas (3 antes, 1 depois) o `draftMessageContent` produziu uma mensagem se autoapresentando como a destinatária — o bug original do P0.1 (commit `bcbc63e`) não se reproduziu nesta rodada em nenhuma versão. Isso significa que **não é possível afirmar, com esta rodada, que o Bloco 1 corrigiu uma falha observada agora** — ela simplesmente não ocorreu, nem antes nem depois. O backstop determinístico do Bloco 1 continua existindo como rede de segurança para quando isso acontecer (prova estrutural já coberta por `recognizer.test.ts`), mas esta validação não exercitou esse caminho. Em 2 das 4 rodadas, o recognizer devolveu o texto da instrução ambígua quase sem alteração em vez de um rascunho limpo — não é inseguro (nunca chega a assinar como a destinatária), mas é uma oportunidade de melhoria de qualidade, não de segurança.

### Comercial DJ/Música (Playbook, ADR 0006)

Sinal qualitativo favorável ao Playbook em 2 dos cenários de proteção comercial:

- **`protecao-condicao-comercial-bilheteria`**: a resposta "depois" estrutura a decisão em 3 opções (recusar / negociar garantia mínima + % / aceitar só % com piso definido), nomeia a urgência (36h) e propõe formalizar por escrito com o promotor antes de qualquer resposta — mais estruturado que 2 das 3 rodadas "antes".
- **`memoria-nao-e-permissao-sinal`**: a resposta "depois" questiona explicitamente o precedente citado pelo profissional ("igual rolou uma vez") antes de tratá-lo como regra, e lista alternativas concretas — a regra "memória não é permissão" do Playbook em ação direta. Em 2 das 3 rodadas "antes", a resposta foi o fallback genérico (ver abaixo), sem engajar com o conteúdo.

Amostra pequena (1 "depois" contra 3 "antes") — sinal sugestivo, não prova estatística. Nos demais cenários comerciais (`cancelamento-com-clausula-contratual`, `autorizacao-nao-se-estende-a-outro-cliente`) o comportamento já era correto antes do Playbook e não regrediu.

### Achado novo, fora do escopo desta rodada (P1 real de produção)

Em várias rodadas (antes e depois igualmente) a resposta final foi a frase fixa do fallback determinístico (`deterministicFallbackResponse`, `invariants.ts`) — ex.: *"Preciso que você confirme esse ponto antes de eu responder ao cliente, pode revisar a conversa e me dar uma posição?"* — em vez de uma resposta específica. Isso acontece quando o plano final diverge do que o modelo propôs e o rascunho é descartado (comportamento documentado em `plan.ts`). Afeta as duas versões igualmente, não é efeito do Playbook, e reduz a qualidade real de respostas comerciais onde um rascunho específico seria claramente melhor. Recomendo investigação dedicada como próximo item, de prioridade real.

### Achado de calibração do Harness (não da IA)

A assertiva `mustNotContain` do cenário `escopo-divulgacao-nao-combinada` reprovou nas **4 rodadas** (antes e depois) só por a resposta conter a palavra "combinado" — em todos os casos a IA está perguntando "o que foi combinado originalmente?", nunca confirmando nada por conta própria. Falso positivo consistente do próprio teste; recomendo ajustar a lista de frases proibidas desse cenário em `scenarios.ts` (baixa prioridade).

### Taxa de PASS objetivo (contexto, não conclusão isolada)

Antes: 7/15, 6/15, 8/15. Depois: 5/15. A diferença é quase inteiramente formatação (travessão no texto bruto / parágrafo ausente — P1 já registrado acima, nunca chega ao profissional por causa de `stripTravessao`), não conteúdo ou segurança. Não há regressão de conteúdo/segurança entre antes e depois nesta rodada.

### Recomendação

Recomendo seguir com o merge do Bloco 1 + Playbook para produção — nenhuma regressão de segurança/conteúdo identificada em 4 execuções, com sinal qualitativo favorável em 2 cenários comerciais-chave. Os dois achados novos (fallback genérico e calibração do teste "combinado") não bloqueiam este deploy; ficam registrados como próximos itens de trabalho, o fallback genérico com prioridade real por afetar qualidade de resposta em produção.

**Nenhuma mudança em produção foi feita a partir desta rodada além deste registro em documentação — merge e push para a branch de produção aguardam confirmação explícita separada da fundadora**, conforme o Charter.
