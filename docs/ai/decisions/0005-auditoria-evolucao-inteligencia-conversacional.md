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

1. Religar `app_settings.delegated_contact_enabled` agora (recomendação deste autor, dado o gate de opt-in já validado em produção) ou investigar antes o motivo de tê-la deixado off.
2. Aprovação pra avançar à Etapa 2 (proposta de arquitetura, priorizada em P0/P1/P2 conforme pedido) com base neste diagnóstico.
