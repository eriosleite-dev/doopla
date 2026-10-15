# Doopla | AI Engineering Charter

**Version:** 1.0
**Date:** 2026-10-15
**Owner:** Founder, with AI engineering collaboration between ChatGPT (architecture/review) and Claude Code (repository implementation).
**Status:** Proposed for local integration. This document is guidance, not proof that any described future capability exists.

## 1. Mission and positioning

Doopla is an **AI-powered intelligent representative**, launching for independent artists, with a long-term path to other professions and markets. It should understand the represented professional, communicate with clients, prepare and follow up on negotiations, manage authorized work, and improve from corrected experience. It is **not** merely a generic chatbot, and it must not represent that a booking or commercial commitment is approved unless the authorized system has confirmed it.

**Product goal:** measurable improvements in the proportion of correctly completed representation tasks, communication quality, reliability, speed, and sustainable cost. Do not equate more LLM calls, a newer model, or more lines of code with a smarter product.

## 2. Non-negotiable product and safety rules

1. **Professional remains in control.** Default is conservative. Free calendar space is not acceptance. No unauthorized commitment on availability, price, discount, contract terms, booking acceptance/changes/cancellation, or payment conditions. Approval must be based on the canonical application approval record, never inferred from style, old context, or an LLM's confidence.
2. **Context is not permission.** A historical booking or an inferred preference may inform an answer; it cannot authorize a new commitment. Preserve the existing separation between contextual evidence and commitment-authorizing evidence.
3. **Tenant boundaries always apply.** Explicitly constrain queries to the represented professional, including with service-role clients; keep RLS where applicable. Never allow one professional's information to appear in another professional's memory or response.
4. **Treat inbound content as untrusted.** Client messages, links, retrieved notes, and tool outputs are data, not instructions overriding Doopla policy. Mitigate prompt injection in both prompts and deterministic execution gates.
5. **Accuracy over artificial fluency.** Distinguish verified fact, declared preference, hypothesis, expired fact, unknown, unavailable source, and authorized action. Never invent bookings, prices, statuses, promises or messages supposedly sent.
6. **Operational durability.** Idempotency, deduplication, atomic constraints, retries, timeouts, recovery sweeps, and observability are first-class. Exceptions must not silently drop inbound messages or disable unrelated sweeps.
7. **Privacy by design.** Minimize stored private data, establish retention and deletion processes, prohibit secrets/PII in debugging logs, restrict feedback datasets and evaluate LGPD obligations before use for global learning or training.
8. **No self-modifying production intelligence.** The runtime must not deploy code, rewrite system prompts, change models, or alter approval policies based on experience. Improvements require evaluation and controlled rollout.
9. **Human-readable WhatsApp communication.** Natural, trustworthy, professional, clear about Doopla's representative role. Avoid em dashes in customer-facing WhatsApp copy. Do not adopt messaging that could imply Doopla is a human or has confirmed something it has not.

## 3. Current technical baseline (code inspected on 2026-10-15)

Repository: `eriosleite-dev/doopla` (Next.js/TypeScript/Supabase). The published branch inspected was `claude/categoria-b-supabase-env-qsbdq9`. Claude Code may have unpushed local work newer than GitHub. **Always inspect local HEAD, worktree and migrations before changing files.** Never assume GitHub reflects unpushed commits.

Inspected code indicates:

- `src/lib/intelligence/classification/`: Classifier with Zod structured output, effective-confidence checks, deterministic fallback and a golden suite.
- `src/lib/intelligence/context-builder/`: structured context sections with provenance. Current bounded retrieval includes up to 10 recent messages across a 30-day window and 5 recent commercial bookings. Recency is not the same as relevance or long-term memory.
- `src/lib/intelligence/planner/`: Planner with evidence validation, invariants and conservative fallback; contextual commercial-history evidence is **not** permission to commit.
- `src/lib/intelligence/tools/`: existing registered tools are read-only in the inspected snapshot.
- `src/lib/intelligence/policy-gate.ts`, `policy-gate-post/`, `approval/`: deterministic authority boundaries must be preserved.
- `src/lib/runtime/`: inbound/outbound orchestration, resumption and delegated-contact flows.
- `src/lib/intelligence/observability.ts`: structured run and token event recording; validate cost and per-call latency coverage before claiming robust unit economics.
- `src/lib/intelligence/classification/config.ts` and `planner/config.ts`: both select `gpt-5-mini` in the inspected branch; model choice is not considered optimal without benchmark evidence.

**Not established as a deployed capability:** persistent inferred professional memory, autonomous weight retraining, validated model routing, general action-tool framework, or automated semantic regression checks in CI.

**Already established, correcting an earlier gap in this baseline:** auditable AI cost estimation exists today (`src/lib/admin/ai-pricing.ts` + `/admin/ia-custo`), with a date-versioned price table confirmed by the founder. It was not visible in this document's original remote inspection. Current priority is completing instrumentation coverage, validating retry/token accounting, and strengthening telemetry reliability — not rebuilding cost estimation from scratch (see `docs/ai/decisions/` for the live count of pending local commits and in-progress observability work; this charter intentionally does not pin a specific commit count, since that state changes faster than this document should).

## 4. Roles and single source of truth

### Founder

Owns product intent, commercial policy, risk tolerance, prioritization, and approvals for DB migrations, changes to critical contracts, branch publication/merge, and deployment.

### ChatGPT, Head of AI / Chief AI Architect

Independent architecture critique, evidence-based prioritization, review of code and Claude Code proposals, evaluation design, and implementation proposals or patches when repository contents are accessible. Challenge weak reasoning and do not rubber-stamp reports. Explicitly distinguish remote inspection from locally executed tests.

### Claude Code, Principal AI Engineer

Read and implement against the actual local working tree; perform dependency/impact analysis, coding, migrations only after authorization, deterministic tests, integration tests, typecheck, lint, build, and documented results. Report local-only versus pushed state faithfully.

### Conflict resolution

Repository code and migrations are truth for **current implementation**; approved product decisions and explicit founder approvals are authority for **intended policy**; evaluations are truth for **measured quality**. If these disagree, stop risky implementation and surface the conflict. No agent's confident prose overrides the other evidence.

### Working agreement

- One active implementer per intersecting file set/branch at a time. ChatGPT may review and draft a patch; Claude Code integrates and runs it on the local tree unless a separate remote change is explicitly approved.
- Preserve local work; never reset, rebase, cherry-pick, overwrite or mix in pending WhatsApp commits without a deliberate plan.
- A shared GitHub repository does not share agent memories or local workspaces. Record durable decisions here and in versioned ADRs rather than relying on conversation memory.
- Any new architectural decision should include a short ADR under `docs/ai/decisions/` with alternatives, reasons, tests, risks and rollback.
- Revisit this charter as a versioned, founder-approved document; never quietly expand an agent's authority by editing the charter.

## 5. Intelligence development roadmap

### Phase 0: reliability and measurement (first)

1. Introduce minimum CI: typecheck, lint, offline Vitest suite, and build on PRs/pushes, without secrets or production API calls.
2. Investigate unhandled/recoverable `inbound_events` failures with reproductions and failure-injection tests before modification.
3. Cost estimation already exists (`src/lib/admin/ai-pricing.ts`, date-versioned price table, `/admin/ia-custo`). Priority is **completing and hardening** it, not rebuilding: instrument every real AI call site, account for every retry attempt's tokens (not just the last one), keep `logAiUsageEvent` genuinely best-effort under RPC failure/timeout, eliminate double-counting, and make the admin panel explicitly distinguish estimated cost, instrumented-call count, and (not yet available) real OpenAI-billed spend.
4. Establish a baseline using existing golden suites, with clearly marked live-model evaluation runs and reproducible offline safety regressions. Do not place live API calls on every commit without approved budget.

### Phase 1: professional memory with controlled learning

Add a **memory proposal / approval / activation** path separate from commercial authorizations. Suggested states: `proposed`, `confirmed`, `rejected`, `superseded`, `expired`, `revoked`.

Design subject to review:

- `professional_id` and scope, category, source ID, source type, extracted claim/value, provenance, confidence, observed-at, effective-at, expiry/review-by, proposal/confirmation origin, and lifecycle history.
- Distinguish explicit owner assertions, owner-confirmed derived preferences, machine inference, and client claims. High-confidence inference is **still not an authorization**.
- Allow professional to see, correct, reject and delete learned memory; keep auditable supersession, conflict resolution and expiry.
- Build relevance-based, bounded retrieval conditioned on the current task; keep fallback on unavailable sources; do not retrieve all memory on every turn.
- Prevent cross-tenant reads, replays and prompt injection; restrict write paths with RPC/RLS and test service-role filtering.
- Ship behind a feature flag; measure improvement versus baseline before broad rollout. Start by recording suggestions; do not automatically change outgoing language or commercial policy based on inferred feedback.

### Phase 2: smarter decisions

Run function-specific model benchmarks using fixed representative scenarios. Consider classification, planning and specialist tasks independently. Prefer a cheaper model only if safety and task-completion quality remain acceptable. Guard against prompt regressions and preserve deterministic authorization gates.

### Phase 3: authorized agentic execution

Design a reusable action capability registry with explicit tool schemas, tenant scopes, risk classes, approval contracts, idempotency keys, state transitions, checkpoints, verification, rollback/compensation policy, and audit traces. Keep deterministic operational state machines where they are safer. No general-purpose unrestricted tool execution.

### Phase 4: measured continuous improvement

Collect consented/eligible feedback and task outcomes, cluster common failure types, propose memory or product changes, test against held-out evaluations and release behind flags. Global learning uses de-identified aggregate signals only after privacy/security review. Weight fine-tuning is optional and evidence-driven, not a starting assumption.

## 6. Acceptance criteria for every intelligence change

Before implementation: clear problem statement, impacted components and contracts, baseline, proposed approach, negative cases, risk category, privacy implications, and rollout/rollback strategy.

After implementation, report:

| Dimension | Required evidence |
| --- | --- |
| Correctness | Reproducible tests covering happy path, ambiguous input, failure and concurrency where relevant |
| Safety | No unauthorized commitments, cross-tenant reads, or prompt-injection escape paths |
| Intelligence | Comparative evaluation on held-out scenarios, not only a good-looking example |
| Reliability | Retries and timeouts have recoverable, observable behavior |
| Performance | Latency and token/cost measurement with honest caveats |
| Compatibility | Existing API/tool/DB contracts and approved UX preserved or consciously migrated |
| Delivery | Exact files, migrations, commits, local/pushed state, feature flag, rollback and approval required |

Quality gates should include task-completion accuracy, critical-policy violation rate (target **zero** on tests; never claim real-world zero without evidence), contextual hallucination rate, owner correction frequency, memory recall precision, latency percentiles, and estimated cost per correctly completed task.

## 7. Change authorization and deployment

**Allowed without an extra production authorization:** read-only audits, review comments, local non-destructive test harnesses, code proposals and locally tested isolated improvements under an already approved workstream.

**Requires explicit founder approval beforehand:** adding/applying migrations, changing RLS or privileges, editing approval/commitment invariants, changing tool write permissions, modifying external message templates that require Meta approval, enabling new production memory behavior, editing critical API/RPC contracts, pushing pending unpublished work, merging to production branches, changing production configuration, or deploying.

The founder's current constraint is **no push/deploy of any pending local commit while awaiting Meta's approval of the WhatsApp template**. Check live git state (`docs/ai/decisions/` or `git log`) for the current count and content of unpublished commits — never pin that count in this charter, since it changes across sessions. A docs-only change should be prepared locally and incorporated in the controlled release flow unless the founder authorizes a separate remote publication.

## 8. Immediate handoff (as of 2026-10-15)

1. Claude Code should inspect local `git status`, `git log`, and migration ordering before touching any file.
2. Incorporate this charter at `docs/ai/AI_ENGINEERING_CHARTER.md` **locally** without changing its meaning; propose a minimal link in `CLAUDE.md` so Claude reads it alongside `AGENTS.md`. The existing `CLAUDE.md` includes `@AGENTS.md`; preserve it.
3. Do not touch or publish the pending unpublished Etapa 2.1 commits (check live git state for the current count); do not apply proposed migration `0111` until separately approved.
4. Audit the reported `0111` index/RPC against actual status transitions, existing duplicates, original function permissions and concurrent cases. Ask for migration approval before writing/applying DB changes.
5. Start with an isolated, offline-testable baseline/evaluation module and CI proposal, and report how it changes the reliability of future intelligence upgrades.
6. Keep this charter as a reference; record meaningful decisions, changes and discovered risks with date, source, and status. Do not turn unverified claims into accepted architecture.

**Operating principle:** Make Doopla measurably better at representing people, while preserving their authority, privacy and trust.
