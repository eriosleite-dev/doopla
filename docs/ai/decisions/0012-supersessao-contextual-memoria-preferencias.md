# ADR 0012 — Supersessão contextual de memórias de preferência (task #76)

- **Data:** 2026-10-20
- **Status:** Desenho + função pura de decisão implementada e testada (sem schema/wiring). Aguardando aprovação da fundadora pra qualquer mudança estrutural (migration, pipeline).
- **Autor:** Claude Code (Principal AI Engineer), em resposta à decisão da fundadora sobre task #76.
- **Relacionado:** ADR 0004 (fundação de `memory-policy.ts`), task #72 (fluxo de confirmação, em produção), `policy-gate-post/matcher.ts` (padrão de `subjectKey` reaproveitado aqui).

## 1. O que a fundadora decidiu

> Quando uma nova preferência aprovada contradizer diretamente uma preferência anterior do **mesmo assunto e escopo**, a antiga deve ser substituída, preservando seu histórico. Mas não quero substituição indiscriminada por `kind`.
>
> - "Sempre faço 2 horas" → "Agora sempre faço 4 horas": substituir após confirmação.
> - "Faço 2 horas em bares" e "4 horas em casamentos": manter ambas.
>
> A confirmação precisa estar vinculada à proposta correta. Se houver ambiguidade, esclarecer antes de alterar.

Três requisitos distintos, tratados separadamente abaixo: (A) decidir quando é contradição real vs. coexistência legítima; (B) nunca substituir sem a profissional confirmar explicitamente aquela substituição específica; (C) quando ambíguo, esclarecer — nunca adivinhar, nunca travar em silêncio.

## 2. Conceito: `subjectKey` (reaproveitado, não inventado)

O projeto já resolve exatamente este tipo de problema em `policy-gate-post/matcher.ts` (`resolveSubjectKey`), pra decidir se uma condição comercial nova é sobre a MESMA instância de uma approval já ativa (ex.: "transporte" vs. "hospedagem" dentro de `logistics_commitment`) ou uma instância nova. A mesma forma resolve o requisito da fundadora aqui:

- Cada preferência passa a ter, além do `kind` já existente (`operational_preference`, etc.), um **`subjectKey`** opcional: um rótulo curto e livre que descreve o ESCOPO a que ela se aplica (`"bar"`, `"casamento"`, `"cliente_corporativo"`...). `null` = regra geral, sem escopo (ex.: "sempre faço 2h").
- **O model PROPÕE o rótulo, nunca decide o que fazer com ele.** Quem decide supersede/coexist/ambiguous é sempre código puro (`resolveMemorySupersessionCandidate`, já implementada) — mesmo princípio de `resolveSubjectKey`: o model nunca é autoridade sobre uma transição de estado.

## 3. O que já está implementado (código + 42 testes, `memory-policy.ts`/`memory-policy.test.ts`)

Função pura, zero I/O, não wired a nada ainda:

```ts
export type ScopedMemoryCandidate = { id: string; kind: MemoryKind; subjectKey: string | null; value: string };

export type MemorySupersessionResolution =
  | { kind: 'coexist' }
  | { kind: 'supersede_candidate'; existing: ScopedMemoryCandidate }
  | { kind: 'ambiguous'; matches: ScopedMemoryCandidate[] };

export function resolveMemorySupersessionCandidate(
  declaration: { kind: MemoryKind; subjectKey: string | null },
  existingApproved: readonly ScopedMemoryCandidate[]
): MemorySupersessionResolution
```

Regra: filtra as aprovadas do MESMO `kind`; dentro dessas, compara `subjectKey` normalizado (trim + lowercase; `null` só casa com `null`). Zero matches → `coexist`. Exatamente um → `supersede_candidate` (aponta pra ela). Dois ou mais → `ambiguous` — **nunca escolhe uma arbitrariamente**, mesmo quando isso significa não decidir.

Também implementada: `buildMemorySupersessionQuestion(newValue, oldValue)` — pergunta determinística que **menciona explicitamente** a preferência antiga (nunca substitui silenciosamente): *"Anotei que você disse: '{nova}'. Isso substitui a preferência anterior ('{antiga}'), certo? Se sim, vou atualizar."*

Isso resolve o requisito (A) por completo e prepara (B) — a pergunta já nasce vinculada à proposta E à memória que ela substituiria, nunca uma confirmação genérica.

## 4. O que NÃO está implementado — precisa da sua decisão antes de eu tocar schema/pipeline

### 4.1 Extrair `subjectKey` na declaração (mudança pequena, recomendo seguir)
Estender `recognizePreferenceDeclaration` (`preference-recognizer.ts`, já em produção) pra devolver também `subjectKey: string | null` — mesmo padrão do extractor do Policy Gate: um campo novo na instrução do model, nunca um recognizer novo. Baixo risco (aditivo, nullable, recognizer já é isolado e testado).

### 4.2 Coluna `subject_key` em `professional_memories` (migration nova)
Pra persistir o que a 4.1 extrai. Sem isso, a função pura da seção 3 não tem dado real pra comparar — hoje toda memória aprovada tem `subjectKey` implícito = `null` (porque a coluna não existe), então TUDO cairia em "mesmo escopo" indevidamente. **Preciso dessa migration antes de ligar qualquer coisa daqui.**

### 4.3 Wiring no fluxo de confirmação (`memory-confirmation-flow.ts`, task #72, já em produção atrás de flag desligada)
Antes de propor uma memória nova, consultar as aprovadas do mesmo profissional+kind, chamar `resolveMemorySupersessionCandidate`. Se `supersede_candidate`: a pergunta de confirmação passa a ser `buildMemorySupersessionQuestion` em vez da genérica; ao confirmar, aprova a nova E revoga a antiga (via `revokeMemory`, mesma transação lógica — preserva histórico, nunca apaga, exatamente como você pediu). Se `coexist`: fluxo de hoje, sem mudança.

### 4.4 O caso `ambiguous` — "esclarecer antes de alterar" (minha recomendação: não implementar ainda)
Este é o ponto genuinamente novo e em aberto. "Esclarecer" significa a Doopla fazer uma PERGUNTA ABERTA (não um simples sim/não) — ex.: *"Você tem preferências diferentes hoje: '2h em bares' e '4h em casamentos'. Isso que você disse agora é pra qual contexto, ou é uma regra geral nova?"* — e então REPROCESSAR a resposta dela pra extrair um `subjectKey` novo a partir de texto livre. Isso é uma forma de interação que não existe em nenhum fluxo atual do projeto (confirmação simples sim/não/ambíguo, sim — uma pergunta aberta com reprocessamento, não).

**Minha recomendação:** não implementar o ciclo de esclarecimento nesta rodada. Em vez disso, quando `ambiguous` (hoje, na prática, só acontece com 2+ matches — dado legado, ou extração genuinamente malfeita do `subjectKey`), tratar como `coexist`: propõe a memória nova normalmente, confirmação genérica, nunca substitui nada. Isso significa que a `ambiguous` genuína que a fundadora quer ("não sei se é geral ou só pra bares") **ainda não gera uma pergunta de esclarecimento de verdade nesta entrega** — é a limitação explícita que estou documentando, não escondendo. Se você quiser o ciclo de esclarecimento completo, é um desenho de interação separado (pergunta aberta → recognizer que extrai `subjectKey` da resposta → reprocessa a proposta original) que posso desenhar numa rodada própria, já que é maior que "só" a função de decisão.

## 5. Resumo do impacto, pra sua aprovação

| Item | Tipo de mudança | Risco | Já feito? |
|---|---|---|---|
| Função pura de decisão + pergunta de supersessão | Código, zero I/O, zero schema | Nenhum (não wired) | ✅ Sim, testado (42 testes) |
| `subjectKey` no recognizer de declaração | Código, campo novo nullable | Baixo (aditivo) | ❌ Não |
| Coluna `subject_key` em `professional_memories` | **Migration** | Médio (schema de produção) | ❌ Não |
| Wiring supersessão no fluxo de confirmação | Pipeline (`memory-confirmation-flow.ts`) | Médio (já atrás da flag desligada de task #72) | ❌ Não |
| Ciclo de esclarecimento pra `ambiguous` real | Desenho de interação novo | Alto (padrão de conversa inédito) | ❌ Não — recomendo não fazer ainda |

**Minha recomendação de sequência, se você aprovar:** 4.1 → 4.2 (migration, você roda) → 4.3 (wiring, ainda atrás da MESMA flag desligada de task #72 — nada muda em produção até você ligar os dois juntos) → 4.4 só depois, como entrega separada.

Me diz se aprova essa sequência, ou quer ajustar algo antes de eu tocar o recognizer/migration.
