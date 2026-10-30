# ADR 0001 — Adoção do AI Engineering Charter v1.0

- **Data:** 2026-10-15
- **Status:** Aceito
- **Proposto por:** ChatGPT (Head of AI / Chief AI Architect), via documento anexado pela fundadora
- **Incorporado por:** Claude Code (Principal AI Engineer)

## Contexto

A fundadora pediu para formalizar a estrutura de engenharia de IA da Doopla, com o ChatGPT atuando como Head of AI/revisor independente e o Claude Code como Principal AI Engineer responsável pela implementação no repositório real. O ChatGPT preparou `docs/ai/AI_ENGINEERING_CHARTER.md` (v1.0) a partir de uma inspeção remota do branch `claude/categoria-b-supabase-env-qsbdq9` no GitHub.

## Decisão

Adotar o charter como documento de referência versionado, incorporado em `docs/ai/AI_ENGINEERING_CHARTER.md`, com link a partir de `CLAUDE.md` (preservando o include de `AGENTS.md`). Toda decisão futura de arquitetura de IA relevante passa a ser registrada como um novo ADR nesta mesma pasta (`docs/ai/decisions/`), nunca só em conversa.

## Verificação feita na integração (nunca aceito às cegas)

Antes de aceitar o baseline técnico do §3 do charter como correto, conferi contra o código real desta working tree:

| Alegação do charter | Verificado contra | Resultado |
| --- | --- | --- |
| "até 10 mensagens recentes, janela de 30 dias" | `src/lib/intelligence/context-builder/budget.ts` | **Confirmado** (`CONTEXT_MAX_MESSAGES = 10`, `CONTEXT_MESSAGE_WINDOW_DAYS = 30`) |
| "5 bookings comerciais recentes" | idem | **Confirmado** (`CONTEXT_MAX_COMMERCIAL_HISTORY_ITEMS = 5`) |
| Tools registradas são só leitura | `src/lib/intelligence/tools/` | **Confirmado** (já auditado independentemente nesta sessão, antes do charter chegar) |
| `gpt-5-mini` usado sem validação de ser o modelo ideal | `classification/config.ts`, `planner/config.ts`, e também `approval/config.ts`, `policy-gate-post/config.ts`, `delegated-contact/config.ts`, `inbound-proposal/config.ts` | **Confirmado, e mais abrangente do que o charter registra** — são 6+ módulos com a mesma ressalva, não só Classifier/Planner |
| "três commits locais pendentes da Etapa 2.1" | `git log --oneline -8` nesta working tree | **DESATUALIZADO** — ver correção abaixo |

## Correção ao baseline do charter

O charter (§3, §8.3, §7) foi escrito a partir de uma inspeção remota (GitHub) num momento anterior a esta sessão, e citava um número fixo ("três commits locais pendentes"). A fundadora decidiu (15/10/2026) que o charter nunca deve fixar uma contagem de commits como regra permanente — esse número muda mais rápido do que o documento deveria ser editado. O texto do charter (§3, §5 Fase 0 item 3, §7, §8 item 3) foi corrigido para nunca mais citar um número fixo, remetendo sempre ao estado real do git/a este ADR.

O **estado real e atual** fica registrado aqui, atualizado a cada sessão relevante:

**Snapshot em 15/10/2026 (ainda não publicado, sem push):**

```
e157291 Head of AI: fecha lacuna de observabilidade de custo em 5 pontos de IA
04de7bc Head of AI: salva prompt de ativação persistente + 1ª melhoria (testes de ai-pricing.ts)
308a84d Corrige 4 achados de revisão de código na Etapa 2.1 (sem migration nova)
31a2e36 Corrige silêncio do Planner em clarify_ambiguity sem texto do model
97d35ff Atualiza template de primeiro contato e corrige mensagem de status confusa
```

5 commits locais, nenhum publicado. Os 2 primeiros (`04de7bc`, `e157291`) são trabalho de auditoria/observabilidade de IA desta sessão, adicionados antes deste charter chegar. Os 3 seguintes são a Etapa 2.1 (WhatsApp), aguardando aprovação do template no Meta. Nenhum conflita com a regra do charter (§7) de "no push/deploy enquanto aguarda aprovação da Meta."

## Gap de baseline corrigido no texto do charter

A versão original do charter recomendava, na Fase 0 item 3, "derivar estimativas de custo auditáveis" como trabalho futuro — mas essa capacidade **já existe** desde 01/10/2026 em `src/lib/admin/ai-pricing.ts` (tabela de preço versionada por data, confirmada pela fundadora) + painel `/admin/ia-custo`, e foi estendida em 15/10/2026 (commit `e157291`) pra cobrir 5 pontos de IA que antes não registravam uso nenhum. O texto do §5 Fase 0 item 3 foi corrigido (15/10/2026) pra reconhecer isso explicitamente e redirecionar a prioridade pra completar cobertura/validar retries e confiabilidade, em vez de reconstruir o que já existe.

## Nenhum conflito de arquitetura/segurança encontrado

As regras não-negociáveis do §2 (controle da profissional, contexto ≠ permissão, isolamento por tenant, conteúdo inbound como não confiável, sem auto-modificação de produção, sem travessão em copy do WhatsApp) são consistentes com tudo já implementado e reforçado nesta sessão — nenhuma mudança de rumo necessária.

## Consequências

- `docs/ai/AI_ENGINEERING_CHARTER.md` passa a ser citado em `CLAUDE.md`, carregado em qualquer sessão futura do Claude Code neste repositório.
- Decisões futuras de arquitetura de IA (inclusive discordâncias entre ChatGPT e Claude Code) ganham um ADR próprio nesta pasta, numerado sequencialmente.
- Nenhuma mudança de lógica de aplicação, migration, push ou deploy foi feita como parte desta adoção — só documentação.
