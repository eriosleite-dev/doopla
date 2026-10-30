# ADR 0003 — Diagnóstico: impacto de latência do timeout de 5s em `logAiUsageEvent`

- **Data:** 2026-10-15
- **Status:** Diagnóstico concluído, solução recomendada — **nenhuma mudança de runtime aplicada**. Só os testes diagnósticos (já no repo) comprovam o comportamento.
- **Autor:** Claude Code (Principal AI Engineer), Etapa 2 do plano de Fase 0 do AI Engineering Charter
- **Contexto**: investigação pedida pelo Head of AI sobre o timeout de 5s adicionado em `src/lib/intelligence/observability.ts` (commit `574c5e7`, Etapa A).

## 1. Latência adicionada no caminho feliz (RPC rápida, sucesso)

Nenhuma, além do round-trip de rede que já existia antes do fix. `raceWithTimeout` só adiciona um `setTimeout`/`clearTimeout` (microssegundos) — o `Promise.race` resolve com o resultado real assim que ele chega, nunca espera o timeout vencer quando a RPC responde normalmente. O fix de hoje não piora o caso normal, só limita o pior caso.

## 2. Comportamento quando a RPC está lenta ou indisponível

Cada chamada de `logAiUsageEvent` agora trava no MÁXIMO 5s antes de desistir e seguir em frente (confirmado por teste, `observability.test.ts`). Antes do fix de hoje (Etapa A), uma RPC lenta/indisponível travava **indefinidamente** — o fix já é uma melhoria real, mas 5s por chamada ainda é significativo porque **as chamadas nunca acontecem sozinhas** (ver item 3).

## 3. Efeito de múltiplos registros no mesmo ciclo (achado mais importante)

`logAiUsageEvent` é chamada com `await` síncrono, uma depois da outra, NUNCA em paralelo, em até 5 pontos dentro de um único `runCycle` (`pipeline.ts`):

| # | Chamada | Condição |
|---|---|---|
| 1 | Classifier | sempre |
| 2 | Inbound Proposal Detector | só se `commercialRootId` existir |
| 3 | Planner | sempre |
| 4 | Approval Resolver (dentro de `runApprovalEngine`) | só se `shouldRunApprovalEngine` |
| 5 | Policy Gate Extractor (dentro de `evaluatePostModelGate`) | só se houver `proposedResponse` |

**Achado mais sério**: `attemptResumptionsAfterApproval` (resumption.ts) roda **dentro do mesmo ciclo síncrono**, logo depois do Approval Engine (pipeline.ts linha 440), num `for...of` sequencial sobre TODAS as pending replies destravadas por aquela aprovação — cada uma re-executa Classifier + Planner inteiros, cada um com sua própria chamada a `logAiUsageEvent`.

**Pior caso real**: uma aprovação que destrava N conversas pendentes soma `(5 + 2×N) × 5s` de atraso potencial antes da resposta HTTP voltar pro profissional. Com N=5 (razoável pra uma profissional ativa), isso é até **75 segundos** de atraso numa mensagem comercial real, só por causa de telemetria — exatamente o cenário que a fundadora/Head of AI temiam.

Comprovado por teste (`observability.test.ts`, "chamadas sequenciais SOMAM atraso, nunca se sobrepõem") — 3 chamadas sequenciais com RPC travada somam exatamente `3 × 5000ms`, nunca menos.

## 4. O timeout cancela a operação ou só encerra a espera?

**Só encerra a espera — nunca cancela.** Comprovado empiricamente (`observability.test.ts`, "o timeout nunca CANCELA a RPC"): uma RPC simulada que demora 8s (mais que o timeout de 5s) continua rodando em segundo plano depois do `Promise.race` já ter devolvido o resultado de timeout em 5s — ela só termina sozinha aos 8s, sem que nenhum código nosso jamais a interrompa (`fetch`/driver HTTP não tem `AbortController` nenhum ligado aqui).

## 5. Risco de perda ou duplicação de registros

- **Perda**: se a operação original eventualmente FALHA de verdade (nunca resolve, ou demora mais que o worker/processo viver), o evento de telemetria nunca é gravado — perda real, mas é só o EVENTO DE CUSTO, nunca a mensagem do cliente nem a resposta comercial (essas não dependem de `logAiUsageEvent` ter sucesso).
- **"Atraso invisível"**: se a RPC só estava lenta (não morta), ela PODE terminar com sucesso depois que já devolvemos `ok:false` pro chamador — o evento acaba sendo gravado mesmo assim, só que tarde e sem que o código que chamou saiba disso. Não é perda nem duplicação, mas pode confundir quem for depurar ("por que esse evento existe se o log disse que falhou?").
- **Duplicação**: nenhum risco identificado. Nenhum call site tenta de novo `logAiUsageEvent` depois de uma falha/timeout — cada chamada acontece exatamente uma vez por operação de IA real.
- **Consumo de recurso sob degradação sustentada**: cada timeout deixa uma operação órfã rodando até completar sozinha (ou até o processo/worker terminar). Sob uma degradação PROLONGADA da RPC (não um blip único), isso pode acumular conexões/handles abertos — risco real sob estresse sustentado, não sob uma falha pontual.

## Solução recomendada (NÃO implementada — proposta)

**Parar de usar `await` síncrono pra telemetria no caminho crítico.** `logAiUsageEvent` já é, por desenho, "nunca lança, falha de telemetria nunca derruba o ciclo principal" — a extensão natural e consistente desse mesmo princípio é "a DURAÇÃO da telemetria também nunca atrasa o ciclo principal". Trocar `await logAiUsageEvent(...)` por uma chamada não bloqueante (fire-and-forget, ainda com o mesmo timeout de 5s como teto de uso de recurso em segundo plano, só que sem o caminho principal esperar por ela) elimina o problema na raiz, nos ~10 call sites, sem precisar de fila/infra nova.

Isso é uma mudança de runtime (ainda que pequena e mecânica) — fica pra uma etapa separada, com aprovação explícita, conforme pedido.

## Testes

`src/lib/intelligence/observability.test.ts` — 2 testes diagnósticos novos: comprovam (1) que o timeout nunca cancela a operação original, e (2) que chamadas sequenciais somam atraso linearmente. Rodados contra o código real do projeto (não um script solto), fazem parte da suíte de 192 testes.
