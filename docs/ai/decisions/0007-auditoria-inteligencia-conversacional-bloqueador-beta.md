# ADR 0007 — Auditoria da inteligência conversacional (bloqueador do beta)

- **Data:** 2026-10-20
- **Status:** Diagnóstico + proposta de arquitetura entregues. **Nenhuma implementação feita.** Aguardando aprovação da fundadora/Head de IA pra qualquer próximo passo, exatamente como pedido.
- **Autor:** Claude Code (Principal AI Engineer), a pedido da fundadora/Head de IA (ChatGPT), em resposta a uma sequência real de falhas no WhatsApp (09:49–10:06, 20/10/2026)
- **Escopo:** Etapa 1 do pedido dela — diagnóstico técnico, causas comprovadas, proposta de arquitetura, comparação de modelos (bloqueada, ver seção 5), roadmap, estimativa de custo/latência. **Nenhuma mudança estrutural, nenhum deploy** — só o que está escrito aqui.

## Limite honesto desta auditoria

Este sandbox não tem acesso a `OPENAI_API_KEY` nem às credenciais de produção do Supabase — não dá pra consultar `orchestrator_runs` reais nem rodar os modelos candidatos ao vivo daqui. Tudo abaixo vem de **leitura do código real**, nunca de suposição. Onde uma afirmação só poderia ser confirmada de verdade com logs de produção, isso está marcado explicitamente como hipótese, nunca misturado com o que já está provado.

---

## 1. O que foi observado (conversa real, professional_self, 09:49–10:06)

Resumo dos sintomas, todos com print real:
- Perguntou "quais os valores dos planos" repetidas vezes; às 10:06 a Doopla ainda perguntava "mensal, anual ou ambos?" — nunca chegou a dizer um valor.
- Corrigiu explicitamente "você está errada, não existe valores avulsos" (09:59) — a Doopla voltou a mencionar "serviços avulsos" depois disso.
- Respondeu "Mensal" (10:03) como complemento direto à própria pergunta da Doopla — a Doopla não conectou, perguntou de novo.
- Mandou 3 mensagens seguidas (10:03, 10:03, 10:05) sem receber nenhuma resposta entre elas — só uma resposta chegou, às 10:06, e essa resposta reverteu pro texto quase idêntico ao que já tinha perguntado antes.
- Perguntou duas coisas na mesma mensagem (valores + tipos de artista representados) — só uma foi respondida com qualidade.

## 2. Diagnóstico técnico — causas CONFIRMADAS por código

### 2.1 — P0: Zero fonte de conhecimento real sobre os próprios planos/preços da Doopla

**CONFIRMADO.** Varri `planner/prompt.ts` inteiro procurando "plano"/"mensal"/"anual"/"avulso"/"assinatura" — nenhuma menção, fora de um ponto não relacionado (comissão sobre cachê do profissional). Varri todas as migrations procurando uma tabela de planos/preços da própria Doopla — não existe (as únicas tabelas de "plano" são sobre o booker/artista, ex. `artist_plan_doopla_pro`, nada sobre o preço que a Doopla cobra). A taxonomia de `Intent` (`classification/intents.ts`) também não tem nenhuma categoria pra "pergunta sobre a própria plataforma Doopla" — cai tudo em `outro`.

**Isso é a causa raiz mais provável da invenção** ("avulsos", "anual", "PDF"): o model não tem nenhum fato real pra citar sobre o próprio produto, então improvisa a partir do que "parece plausível" pro treinamento dele — exatamente o padrão de alucinação que o resto do Planner evita estruturalmente pra dados do profissional (evidenceUsed/grounding), mas que nunca foi construído pra dados institucionais da própria Doopla, porque essa categoria de pergunta nunca foi prevista.

**Minha recomendação**: criar uma fonte de conhecimento institucional própria, no mesmo padrão já usado pro Playbook DJ/Música (`src/lib/intelligence/playbook/dj-musica.ts` — conteúdo versionado, revisado por você, nunca gerado pelo model) — um bloco "Doopla institucional v1" com os fatos reais (hoje: beta fechado, sem cobrança, sem "avulsos", categorias de artista atendidas) injetado sempre que o Classifier reconhecer uma pergunta institucional. Isso resolve o problema pela raiz: não ensina o model a "responder melhor sobre preço", tira dele a necessidade de inventar, porque passa a ter o fato real disponível.

### 2.2 — P0: Janela de histórico fixa em 10 mensagens, sem resumo/compactação

**CONFIRMADO.** `context-builder/budget.ts:9`: `CONTEXT_MAX_MESSAGES = 10` — um teto fixo, sem nenhum mecanismo de resumir o que sai da janela. Contando a conversa real, a correção dela ("não existe valores avulsos", 09:59) já estava a 9–11 mensagens de distância quando a Doopla repetiu o erro (10:05/10:06) — exatamente na borda de sair da janela. Essa categoria de falha JÁ tinha sido encontrada uma vez (ADR 0005, 16/10) — na época o Classifier via só 2 mensagens; foi corrigido pra usar a janela inteira do Context Builder, mas essa janela continua limitada a 10 mensagens totais, sem exceção pra fatos/correções importantes.

**Minha recomendação**: duas camadas, não uma só (defesa em profundidade, igual o resto do projeto) — (a) aumentar o teto conservadoramente (ex. 20) como mitigação rápida, nunca a solução completa; (b) um mecanismo de "fatos/correções fixos" que sobrevivem à rotação da janela — uma correção explícita do profissional ("não existe X") devia virar um fato durável, não só uma mensagem que pode sair da janela em silêncio. Isso conecta diretamente com a fundação de memória de preferências que eu já tinha começado (pausada agora, por pedido seu) — uma correção factual é estruturalmente parecida com uma preferência aprendida, só que sobre fatos institucionais, não preferências pessoais.

### 2.3 — P0: Nenhum mecanismo geral contra repetir a mesma pergunta de esclarecimento

**CONFIRMADO, por ausência.** A "regra crítica de continuidade" que corrigi ontem (prompt.ts) existe só pra identidade/apresentação — nunca foi generalizada. Não existe, em lugar nenhum do código, um "não repita uma pergunta de esclarecimento que você já fez nesta conversa". Pior: o piso de decisão protegida que acabei de reforçar (`resolveResponsePlan`, estende pra `acknowledge`/`clarify_ambiguity`) só age quando a pergunta é uma decisão comercial protegida — uma pergunta institucional sobre o preço da própria Doopla nunca ativa isso, então o model fica livre pra gerar uma nova pergunta de esclarecimento, igual à anterior, a cada turno, sem nenhuma trava de código.

**Minha recomendação**: um mecanismo determinístico (mesmo padrão de `pending_delegated_contacts`/`channel_inbound_intakes.current_prompt_options`, nunca reinventado) — a Doopla registra a ÚLTIMA pergunta de esclarecimento que fez; se a próxima rodada for gerar uma pergunta muito parecida de novo, o código força uma resposta diferente (ex.: admitir que não tem a informação, ou escalar) em vez de deixar o model tentar de novo com as mesmas palavras.

## 3. Diagnóstico técnico — causas CONFIRMADAS, prioridade menor (P1)

- **Múltiplos assuntos na mesma mensagem — CONFIRMADO como lacuna estrutural.** `secondaryIntents` é calculado (`classification/prompt.ts`) mas só alimenta `routeCompetencies`/categorias de decisão (`plan.ts:129,190`) — nunca força o Planner a endereçar as duas perguntas explicitamente. A arquitetura produz **um** `proposedResponse` por turno, sem exigência estrutural de "cobrir os dois assuntos". Quando os dois são respondidos, é iniciativa do model, nunca reforçado por código.
- **Uso de correções do usuário — CONFIRMADO como ausente.** Nenhum caminho de código trata especificamente "o profissional está corrigindo uma afirmação que a própria Doopla acabou de fazer" — combinado com 2.1 (sem fato real pra ancorar) e 2.2 (a correção pode sair da janela), o model não tem razão estrutural pra parar de repetir uma alegação inventada.

## 4. Hipóteses levantadas, não confirmáveis sem logs

- **Agrupamento/concorrência de mensagens do WhatsApp**: `route.ts` processa mensagens elegíveis de um payload sequencialmente; `pipeline.ts` usa lease por conversa (`acquireConversationLease`, migration 0051) — uma segunda execução concorrente pra mesma conversa recebe `conversation_busy` e **falha sem fila de retry automática**. A sequência real tem um ponto concreto que merece checar com logs: ela mandou 3 mensagens seguidas (10:03, 10:03, 10:05) e só recebeu 1 resposta, às 10:06, que ignorou as 3 e repetiu a pergunta original quase ao pé da letra. Isso É compatível com uma run concorrente sendo rejeitada (`conversation_busy`) sem nunca ser reprocessada — mas só dá pra confirmar com uma consulta real em `orchestrator_runs`/logs de erro desse horário exato. **Risco residual real, independente da causa exata aqui**: hoje não existe retry automático quando uma mensagem perde a corrida pelo lease da conversa.
- **"Ressurgimento" do exemplo de tutorial antigo**: plausível (janela de 10 mensagens pequena, com tópicos antigos ainda dentro dela, pode fazer o model se ancorar no assunto errado), mas é uma questão de atenção do model mais que um bug de código — não hávia nada em `planner-context.ts` que privilegie história antiga de forma anormal.
- **Capacidade do modelo**: `gpt-5-mini` confirmado em uso no Classifier e no Planner (`classification/config.ts`, `planner/config.ts`). Nenhuma recomendação de troca feita aqui — ver seção 5.

## 5. Comparação de modelos — BLOQUEADA neste ambiente, proposta de execução

Não consigo rodar `gpt-5-mini` x `gpt-5.4-mini` x `gpt-5.4` ao vivo neste sandbox (sem `OPENAI_API_KEY`). Também preciso ser honesto: não tenho confirmação de que `gpt-5.4-mini`/`gpt-5.4` sejam IDs reais disponíveis na API da OpenAI hoje — preciso confirmar isso antes de qualquer teste, nunca assumir.

**Minha recomendação de como destravar isso**: o harness golden-suite já é injetável por model (`classification/config.ts`/`planner/config.ts` — mesma troca usada hoje só pra `gpt-5-mini`). Preparo (próxima etapa, após sua aprovação) uma variante do harness que aceita o model como parâmetro de execução e um lote de cenários-regressão baseados exatamente nesta conversa real (pergunta institucional + correção + complemento curto + duas perguntas simultâneas), pra você rodar no painel contra cada candidato, do mesmo jeito que já roda hoje — e eu comparo os resultados reais, nunca estimo sem dado.

## 6. Estimativa de custo/latência

Preço confirmado hoje (`ai-pricing.ts`): `gpt-5-mini` = $0,25/milhão tokens de entrada, $2,00/milhão de saída. **Não tenho preço público confirmado pra `gpt-5.4-mini`/`gpt-5.4`** — qualquer número que eu desse agora seria inventado, exatamente o tipo de erro que esta auditoria inteira existe pra evitar. Assim que os IDs dos modelos forem confirmados e a comparação da seção 5 rodar, calculo custo/latência real a partir dos tokens de fato consumidos (mesma telemetria que já existe, `inputTokens`/`outputTokens` em cada chamada) — nunca uma projeção solta.

## 7. Proposta de arquitetura evoluída (NÃO implementada)

Mapeando as 5 capacidades que vocês propuseram contra o que já existe, sem inventar um sistema paralelo — sempre estendendo o que já funciona:

| Capacidade | Hoje | Proposta mínima |
|---|---|---|
| Compreensão | Classifier (1 intent primário + secundários, sem uso downstream real) | Planner passa a tratar explicitamente múltiplas perguntas na mesma mensagem (seção 3) |
| Estado da conversa | Janela fixa de 10 mensagens, sem pendência genérica de esclarecimento | Fatos/correções duráveis (seção 2.2) + registro da última pergunta de esclarecimento (seção 2.3) |
| Conhecimento | Só sobre o profissional (business context/histórico); zero sobre a própria Doopla | Bloco institucional v1 (seção 2.1), mesmo padrão do Playbook |
| Raciocínio/decisão | Pisos determinísticos já existentes (`resolveResponsePlan`) — sólidos pra decisão comercial, nunca pensados pra pergunta institucional | Estender o mesmo piso pra reconhecer "não tenho fato real, não invente" como caso geral, não só comercial |
| Expressão/verificação | Sem checagem de "essa resposta repete uma alegação já corrigida" | Decorre diretamente de 2.1+2.2+2.3 juntos — nenhum mecanismo novo de verificação separado é necessário se as causas raiz forem corrigidas |

**Nenhuma arquitetura multiagente, nenhuma reescrita do Classifier/Planner** — as 3 causas P0 (seções 2.1–2.3) são aditivas sobre o que já existe, mesmo espírito de todo o Intelligence Core até aqui.

## 8. Roadmap incremental proposto (aguardando aprovação pra iniciar)

1. Bloco de conhecimento institucional da Doopla (2.1) — conteúdo revisado por você antes de qualquer injeção no prompt, testado com os cenários reais desta conversa.
2. Fatos/correções duráveis que sobrevivem à rotação da janela (2.2) — reaproveita a fundação de memória já construída (pausada), adaptada pra fatos institucionais corrigidos pelo profissional.
3. Mecanismo de não-repetição de pergunta de esclarecimento (2.3).
4. Cobertura estrutural de múltiplos assuntos na mesma mensagem (3).
5. Comparação real de modelos (seção 5), assim que os IDs forem confirmados.
6. Golden-suite: cenários novos de regressão baseados literalmente nesta conversa (pergunta institucional sem resposta, correção ignorada, complemento curto não reconhecido, duas perguntas simultâneas, 3 mensagens seguidas sem resposta) — avaliação de CONTEÚDO, nunca só "respondeu em formato válido".

Cada item pequeno, testável isoladamente, validado localmente (typecheck/lint/vitest/build) antes de qualquer um ir pra uma branch de teste real — mesmo processo de sempre, nenhum deploy sem sua aprovação explícita em cada etapa.

## Restrições respeitadas nesta rodada

Nenhum enum, tool, regra comercial ou fluxo de aprovação alterado. Nenhuma mudança em produção. Nenhum deploy. Este documento é só diagnóstico + proposta — implementação começa só quando você aprovar, item por item se preferir.
