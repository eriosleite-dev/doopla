# ADR 0011 — Sistema de evolução contínua da Doopla: diagnóstico técnico (Entrega 1)

- **Data:** 2026-10-20
- **Status:** **Diagnóstico entregue, conforme pedido explicitamente ("antes de implementar, quero um diagnóstico técnico"). Nenhum código escrito.** Aguardando sua aprovação pra iniciar qualquer Fase.
- **Autor:** Claude Code (Principal AI Engineer), em resposta ao pedido "CODE | Sistema de evolução contínua da inteligência Doopla"
- **Relacionado:** ADR 0007 (causas P0 da inteligência conversacional, já em correção), ADR 0010 (incidente real que se encaixa neste sistema como caso de teste permanente).

Estrutura deste documento = os 10 pontos que você pediu na "Primeira entrega obrigatória" (seção 12 do seu pedido), nessa ordem.

## 1. O que já existe e pode ser reaproveitado

| Peça | Onde | Reaproveitável pra |
|---|---|---|
| **Fundação de memória por profissional** | `src/lib/intelligence/learning/memory-policy.ts` (puro, isolado), `professional_memories` (migration 0119), `professional-memories.ts` (wrapper) | Seção 1 do seu pedido (memória/adaptação) — já distingue `proposed`/`approved`/`rejected`/`revoked`, já separa `communication_style`/`operational_preference`/`commercial_preference`/`client_context`, já documenta "memória nunca é autorização comercial". **Falta**: o fluxo de CONFIRMAÇÃO (como o profissional aprova uma memória proposta) nunca foi construído — ver seção 2 abaixo, é a peça que falta pra isto virar realidade em produção. |
| **Recognizer isolado de preferências** | `src/lib/intelligence/learning/preference-recognizer.ts` | Já reconhece declarações em 1ª pessoa (nunca relato de cliente) — mesma disciplina que o feedback do WhatsApp (seção 2 do seu pedido) vai precisar: reconhecimento SEMÂNTICO, nunca lista de frases. |
| **Golden-suite / harness de cenários** | `src/lib/intelligence/conversation-scenarios/` (`scenarios.ts`, `runner.ts`, `types.ts`) | Já é exatamente o "laboratório" que você pede na seção 6 — multiturno, `seedHistory`, `seedOpportunityFacts`, checks de conteúdo (`mustNotContain`, `expectedResponsePlanFamily`, `mustCiteConversationEvidence`, `mustNotOfferUnrequestedExample`). Já comparável por model via injeção (`classification/config.ts`/`planner/config.ts` aceitam `modelCall` injetado). 26 cenários hoje, todos baseados em conversas reais, nunca hipotéticos. |
| **Telemetria de uso de IA** | `ai_usage_events` (migration 0018, `conversation_id` ligado depois) — `feature`, `input_tokens`, `output_tokens`, `cost_cents_estimate` | Custo por conversa/feature (seção 9) — já funciona, só falta agregação/painel. |
| **Metadados de execução do Core** | `orchestrator_runs` (migration 0042) — `status`, `error`, `fallback_used`, `eligible_tools`/`called_tools`, `started_at`/`finished_at`/`latency_ms`, classification e plan completos (ver `pipeline.ts:finishOrchestratorRun`) | Latência (seção 9), detecção de falha/fallback (seção 4) — a maior parte do dado bruto pra avaliação automática JÁ é gravado, hoje, em toda execução real. Nunca analisado/agregado ainda. |
| **Padrão de recognizer isolado** | `delegated-contact/recognizer.ts`, `professional-self-pause/recognizer.ts` (hoje), `inbound-proposal/detector.ts` | Molde pronto pra "reconhecer feedback no WhatsApp" (seção 2): model call pequeno, schema fechado, fail-closed, nunca decide sozinho. |
| **`app_settings` (kill switch por feature)** | migration 0099 | Qualquer feature nova desta iniciativa nasce desligada, liga só depois de validada — mesmo padrão já usado 2x nesta sessão (ADR 0008/0009). |

## 2. O que está ausente ou incompleto

- **Fluxo de confirmação de memória** (proposed → approved): não existe nenhuma UI nem comando de WhatsApp pra isso ainda — é a peça que mais bloqueia a seção 1 do seu pedido virar realidade.
- **Captura de feedback no WhatsApp**: zero. Não existe reconhecimento de "Erro"/"Perfeito"/variações, nem vínculo a uma mensagem específica. **Achado concreto, confirmado por código**: a Meta/WhatsApp Cloud API manda o ID da mensagem citada (`context.id`) quando alguém responde a uma mensagem específica — conferi o parsing do webhook e **isso não é capturado em lugar nenhum hoje** (`repliedToOutboundIntentId`, que existe, é um conceito só do PAINEL — profissional respondendo a um outbound_intent específico de dentro do dashboard, nunca vindo do WhatsApp real). Se você quiser o "responder a uma mensagem específica" funcionando de verdade, isso precisa ser adicionado no parsing do webhook primeiro — não é reaproveitamento, é peça nova.
- **Avaliação automática de conversas** (seção 4): não existe nenhum "juiz" (LLM-as-judge ou determinístico) rodando sobre conversas já fechadas. O dado bruto existe (`orchestrator_runs`, `conversation_messages`), mas nada hoje lê isso de volta pra apontar "essa conversa teve uma pergunta sem resposta".
- **Agrupamento/classificação de falhas recorrentes** (seção 5): não existe.
- **Qualquer coisa de "ciclo automático"** (seção 7: detectar → agrupar → propor → testar → aprovar): não existe infraestrutura nenhuma disso hoje — é 100% a construir.
- **Acesso do Code a dados de produção** (seção 8): confirmado nesta própria sessão, por experiência direta — este sandbox só alcança o banco de **staging** (`doopla-qa-staging`), nunca o de produção real (`doopla`), mesmo quando eu tentei por engano mais cedo hoje. Qualquer "o Code analisa os erros registrados" depende de você rodar consultas/exportar dados, ou de um mecanismo novo de acesso que ainda não existe — não posso prometer acesso direto.
- **Painel de qualidade** (seção 9): não existe nenhuma página agregando os indicadores que você listou — só o dado bruto espalhado (`ai_usage_events`, `orchestrator_runs`).

## 3. Como implementar feedback sem depender da fila problemática

Dois requisitos seus, direto: "independente do Planner conversacional e da fila normal de respostas `professional_self`" e "não pode gerar loops, respostas duplicadas ou novos incidentes".

**Proposta mínima (não implementada)**: um recognizer isolado novo (mesmo molde de `professional-self-pause/recognizer.ts`, construído hoje) que roda **em paralelo** ao fluxo normal — nunca substituindo nem atrasando o ciclo principal. Reconhece `feedback_negative`/`feedback_positive`/`no_signal` a partir da mensagem + (quando disponível) o texto da última resposta de IA nesta conversation (mesmo dado que `plan.ts` já usa pro Mecanismo de não-repetição, ADR 0009). Nunca grava em `professional_self_pending_messages` (essa fila é só pra tentativas de CICLO, não serve pra isto) — grava direto numa tabela nova e dedicada (ver seção abaixo), fora do caminho de retry/drain. A confirmação "Registrei esse erro para análise" é opcional e, quando existir, reaproveita exatamente o mesmo choke point e as mesmas proteções já construídas hoje (`sendProfessionalSelfReplyViaWhatsapp`: contenção, pausa, atualidade, idempotência, loop) — nunca um caminho de envio novo e paralelo sem essas garantias.

## 4. Como os registros poderão ser acessados pelo Code

Dado o limite confirmado na seção 2 (sem acesso a produção real neste sandbox), a opção mais simples e já validada nesta sessão: você roda uma consulta read-only que eu preparo (mesmo padrão usado nos ADRs 0008/0009/0010) e cola o resultado aqui, ou exporta um relatório. Entre as opções que você listou, recomendo **registro estruturado no banco + relatório sob demanda** como v1 (mais simples, menor superfície nova) — painel administrativo e integração com GitHub Issues ficam como evolução de Fase E, não Fase A.

## 5. Arquitetura mínima proposta (Fase A apenas — feedback no WhatsApp)

```
Mensagem no WhatsApp (professional_self)
        │
        ▼
pipeline.ts (ciclo normal, inalterado)
        │
        ├──▶ Classifier → Planner → envio (como já funciona hoje)
        │
        └──▶ [NOVO] feedback-recognizer (paralelo, nunca bloqueia o ciclo acima)
                   │
                   ▼
             conversation_feedback (tabela nova)
                   │
                   ▼
        (Fase B) avaliação automática lê daqui + de orchestrator_runs
```

Nenhuma arquitetura paralela grande — um recognizer a mais (mesmo padrão já usado 3x nesta sessão) + uma tabela nova, lida depois por quem for construir a Fase B.

## 6. Estrutura de dados necessária (Fase A)

Tabela nova `conversation_feedback` (nomes de coluna meramente ilustrativos, pra discussão):

- `id`, `conversation_id`, `flagged_message_id` (nullable — a mensagem de IA sinalizada, quando identificável), `trigger_message_id` (a mensagem do profissional que deu o feedback), `signal` (`negative`/`positive`), `comment` (texto livre do profissional, quando houver), `model_used`, `prompt_version` (ver observação abaixo), `run_id` (liga a `orchestrator_runs`), `failure_category_suggested` (nullable, preenchido só na Fase B), `investigation_status` (`new`/`reviewing`/`resolved`/`wont_fix`), `created_at`.

**Achado a resolver antes de implementar**: hoje não existe um conceito de "versão de prompt" em lugar nenhum do código (os prompts são só texto literal nos arquivos `.ts`, versionados pelo git, nunca por uma string própria) — se você quiser rastrear "qual versão do prompt gerou esta resposta" como campo de dado, isso é uma peça nova (ex.: uma constante `PLANNER_PROMPT_VERSION` incrementada manualmente a cada mudança de prompt, ou o hash do commit). Sinalizando aqui pra decisão sua, não assumindo.

## 7. Roadmap incremental (suas fases, mantidas)

Concordo com sua priorização (Fase A → E). Recomendo adicionalmente: **Fase A entra primeiro na golden-suite como teste de regressão** (nunca enviar feedback de verdade durante os próprios testes) antes de ir pra produção — mesmo processo já seguido em toda esta sessão.

## 8. Custos estimados

Preço real confirmado (`ai-pricing.ts`): `gpt-5-mini` = $0,25/milhão tokens de entrada, $2,00/milhão de saída — mesmo modelo que os outros recognizers isolados já usam, candidato natural pro feedback-recognizer (chamada pequena, schema fechado). Fase B (avaliação automática via LLM-as-judge) teria um custo adicional por conversa avaliada — não estimo esse número agora porque depende de uma decisão de desenho (avaliar toda conversa? só uma amostra? síncrono ou em lote noturno?) que ainda não foi tomada; prefiro não inventar um número solto.

## 9. Critérios objetivos de sucesso (Fase A)

1. Escrever "Erro" numa conversa real gera uma linha em `conversation_feedback` dentro de alguns segundos, sem nenhum envio automático de resposta se a contenção/pausa estiver ativa (reaproveitando os mesmos gates do ADR 0009).
2. Zero impacto mensurável no ciclo principal (latência de `orchestrator_runs` não aumenta pela presença do recognizer paralelo).
3. Golden-suite cobre: feedback isolado ("Erro"), feedback com comentário, elogio isolado, elogio com instrução de comportamento, ausência de feedback (mensagem normal não gera registro).
4. Zero regressão nos 393 testes/26 cenários já existentes.

## 10. Riscos técnicos, operacionais e de privacidade

- **Técnico**: um recognizer a mais por mensagem em `professional_self` significa mais uma chamada de IA por turno (custo/latência marginal, pequeno mas real — mesmo já aceito pro recognizer de pausa, hoje em produção).
- **Operacional**: se o feedback-recognizer falhar (timeout/erro), ele precisa falhar fechado (nunca registra, nunca trava o ciclo principal) — mesmo princípio de todo recognizer isolado já construído.
- **Privacidade**: `conversation_feedback` guardaria texto de conversa real (o comentário do profissional, possivelmente trechos da mensagem sinalizada) — precisa do mesmo tratamento de RLS/retenção já aplicado a `conversation_messages`/`whatsapp_inbound_raw_captures` (migration 0113, retenção de 7 dias pra corpo bruto). Decisão de retenção específica pra feedback fica pra sua aprovação, nunca assumida por mim.
- **Risco de escopo**: a Fase D inteira (ciclo automático: detectar → agrupar → propor → testar → aprovar) é, na prática, uma segunda iniciativa de engenharia do tamanho desta inteira — recomendo tratar cada uma das Fases B/C/D/E como sua própria rodada de diagnóstico + aprovação quando chegar a vez, nunca assumir hoje o desenho de algo tão à frente.

## Minha recomendação

Começar pela Fase A (feedback no WhatsApp) isolada — é a peça mais barata, mais testável, e já tem molde de código pronto (recognizer isolado) pra copiar. Recomendo que as Fases B em diante só sejam desenhadas depois de Fase A estar rodando de verdade em produção por um tempo, com dado real (nem que poucos dias) — desenhar "avaliação automática" e "ciclo de melhoria" sem nenhum feedback real ainda coletado é desenho no escuro.

## Restrições respeitadas

Nenhum código escrito. Nenhum enum, tool, regra comercial, modelo ou política de aprovação alterados. Nenhum deploy. Este documento é só o diagnóstico pedido — aguardando sua aprovação pra iniciar a Fase A.
