# ADR 0013 — Diagnóstico de estabilidade/generalização do Planner (gpt-5-mini vs. gpt-5.6-terra) — fechamento da rodada de comparação de modelos

- **Data:** 2026-10-20 a 2026-10-21
- **Status:** Diagnóstico concluído com dados reais repetidos (não só passagem única). **Decisão: manter `gpt-5-mini` em produção, sem mudança.** Rodada de comparação de modelos encerrada por pedido da fundadora — desenvolvimento segue pras capacidades conversacionais.
- **Autor:** Claude Code (Principal AI Engineer), a pedido da fundadora/Head de IA (ChatGPT)
- **Escopo:** Continuação do ADR 0007 (seção 5, comparação de modelos) e da task "Otimização do Planner para gpt-5.6-terra" (variante `terra-v1`, rejeitada numa rodada anterior). Esta é a etapa final, pedida explicitamente como diagnóstico controlado de **consistência** (repetição, não passagem única) antes de fechar o assunto. **Nenhuma mudança de prompt/model/enum de produção. Nenhum deploy fora da ferramenta de dev.**

## 1. Método

Toda a comparação real (chamadas de verdade à OpenAI) foi executada pela fundadora em `/dev/planner-golden-suite` — este sandbox não tem `OPENAI_API_KEY`. Minha parte foi: construir a ferramenta (golden-suite + diagnóstico de repetição + captura de Classifier/reasoning), ler os resultados reais que ela colou, e sintetizar.

Ferramenta usada (toda nova nesta rodada, código em `src/app/dev/planner-golden-suite/` e `src/lib/intelligence/planner/golden-suite.ts`):
- **8 casos críticos** rodados **5× cada**, por model, em vez de uma passagem única — tallying de quantas das 5 repetições cada model acerta.
- **2 casos novos de generalização** (pares dos casos 11 e 26, que ainda não tinham um "irmão" testando o mesmo princípio com frase/assunto diferente — ao contrário de 8→29, 14→27, 25→28, já existentes de uma rodada anterior).
- **Saída do Classifier registrada em cada repetição** (não só o resultado final do Planner) — permite diferenciar variação do Classifier de variação do Planner.
- **Modo "classificação fixa"**: congela a saída do Classifier da 1ª repetição e reusa nas seguintes, isolando a variação observada ao Planner.
- **`reasoning.effort`/`reasoning.context` capturados de volta de `response.reasoning`** (campo que a própria API devolve) — não presumidos da documentação.

Três rodadas reais: (1) `gpt-5-mini` vs. `gpt-5.6-terra` sem variante de prompt; (2) mesma coisa com a variante `terra-v1` aplicada só ao terra; o baseline `gpt-5-mini` rodou nas duas (mesmo prompt, nunca alterado) só pra servir de controle de ruído.

## 2. Achado de arquitetura: `reasoning.effort`/`context` é real, mas não é a causa da instabilidade observada

Confirmado empiricamente em **todas** as chamadas reais feitas (80 por rodada): `gpt-5-mini` sempre devolveu `effort=medium, context=current_turn`; `gpt-5.6-terra` sempre devolveu `effort=medium, context=all_turns` — exatamente como a documentação do SDK da OpenAI descreve pra diferença de default entre as famílias de model. Nunca configurado explicitamente neste projeto, pra nenhum dos dois.

Como esse valor foi **constante** em toda repetição do mesmo model (nunca mudou de uma repetição pra outra), ele não explica a variação de resposta do terra entre repetições idênticas — essa variação vem de outro lugar (amostragem do próprio model). O achado fica registrado porque é real e pode explicar diferenças de latência/custo entre os dois models, mas não deve ser citado como causa da inconsistência medida aqui.

## 3. Resultado, caso a caso (5 repetições cada, 3 rodadas comparáveis)

| caso | mini (baseline) | terra sem variante | terra + variante terra-v1 |
|---|---|---|---|
| 8 — profissional responde decisão de logística | 5/5 estável | 2/5, variou (Classifier estável) | 4/5, melhorou |
| 11 — preço sem booking (casamento) | 2–3/5 | 2/5 | 5/5, estável — resolvido |
| 14 — relato de horário | 5/5 estável | 3/5, Planner **e** Classifier variaram | 3/5, sem mudança |
| **25 — fonte indisponível (valor/rider)** | 2–4/5 (Classifier variou, Planner resistiu) | **0/5, estável — erra sempre igual** | **0/5, sem nenhuma mudança** |
| 26 — sinal em tópico errado ("Manda") | 0/5, variou | 0/5, estável | 0/5, sem mudança |
| 28 — generalização de 25 (rider) | 5/5 estável | 4/5, variou pouco | 5/5, melhorou |
| 33 — generalização de 11 (preço, assunto diferente) | 2–4/5 | **5/5 estável** | 5/5, mantido |
| 34 — generalização de 26 | 0/5, variou | 1/5, variou | 2/5, leve melhora |

## 4. Diagnóstico

- **Caso 25 é a falha mais sólida contra o terra.** 0/5 nas duas rodadas, **sem nenhuma variação de resposta** — não é instabilidade, é erro sistemático e reproduzível. O reforço de prompt (`terra-v1`, que tinha item específico pra esse princípio) não mudou nada. Isolado do Classifier: no baseline mini, o Classifier também variou nesse caso e o Planner do mini resistiu (respondeu certo mesmo assim); no terra, o Planner não resiste ao mesmo ruído. Conclusão: limitação real do model nesse padrão específico (recall de valor financeiro vs. decisão nova), não resolvível só por prompt.
- **Generalização é melhor do que a hipótese inicial sugeria.** Nos pares 25→28 e 11→33, a taxa do terra melhora ou já é boa — enfraquece a ideia de "não entende o princípio geral". O padrão fraco parece mais específico (valor financeiro, caso 25) do que um déficit de raciocínio amplo.
- **Caso 26/34 falha nos DOIS models, nas duas rodadas.** Isso é achado de **prompt/Planner**, não de escolha de model — vale uma rodada de prompt futura, não pesa nesta decisão.
- **Caso 14 não melhorou com o reforço de prompt** — fraqueza real do terra, moderada (3/5 nas duas rodadas), incluindo uma repetição onde o próprio Classifier variou junto.
- **Casos 8, 11, 28, 34 responderam bem ao reforço de prompt** — eram mesmo sobre falta de ênfase, não limitação de fundo.
- **Segurança comercial**: nenhuma falha, em nenhum model, nenhuma rodada, resultou em ação comercial indevida — toda falha erra pro lado cauteloso (pede mais uma confirmação em vez de agir sozinho).

## 5. Conclusão e recomendação

**Manter `gpt-5-mini` em produção — nenhuma mudança de model.** Não há motivo suficiente pra trocar: o terra, mesmo com o reforço de prompt, ainda tem um buraco real e resistente (caso 25) que o mini não tem.

**Não recomendo testar `gpt-5.4-mini` agora.** O problema não é claramente "o model errado" — o ponto fraco do terra é específico de padrão (não generalizado), e o único ponto fraco real do mini (caso 26/34) é compartilhado com o terra, então não seria resolvido trocando de model.

**Encerro esta rodada de comparação de modelos**, conforme pedido. Fica pendente, pra uma rodada futura de prompt (não de model): investigar por que "Manda"/"Pode" respondendo a um tópico de suporte às vezes é lido como sinal de confirmação comercial — achado de arquitetura de prompt, não de escolha de model, e fora do escopo desta decisão.

## 6. O que fica no código (sem impacto em produção)

Toda a ferramenta construída nesta rodada continua disponível em `/dev/planner-golden-suite` pra qualquer comparação futura: golden-suite com 34 casos, diagnóstico de repetição com captura de Classifier e `reasoning.effort/context` reais, modo de classificação fixa. `src/lib/intelligence/planner/prompt-variants.ts` (variante `terra-v1`) permanece no código como registro histórico do que foi tentado — nunca importado pelo caminho de produção (`plan.ts` só usa `buildPlannerInstructions`, nunca a variante).
