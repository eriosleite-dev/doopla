-- Doopla Intelligence Core v1 — Post-model Policy Gate: fechamento dos
-- 2 riscos residuais reportados (decisão do usuário).
--
-- 1. Dependência entre categorias: uma approval só continua válida
--    enquanto as premissas comerciais sob as quais foi dada
--    continuarem aplicáveis. Resolvido inteiramente em TS
--    (dependencies.ts/matcher.ts) — este arquivo só estende o CHECK
--    físico de policy_gate_decisions.primary_block_reason pro novo
--    motivo 'stale_dependency'. Nenhuma tabela/RPC nova: get_active_approvals
--    (migration 0045) já retorna created_at de toda chain do
--    commercial root, suficiente pra comparação cross-categoria.
-- 2. Resolução temporal por closed-candidate-selection: 100% TS
--    (temporal.ts), sem estado novo no banco — nenhuma migration
--    necessária pra isso. timezone continua sem coluna própria
--    (decisão do usuário: não criar uma agora só pra isso, sem decisão
--    de produto sobre onde timezone pertence).

alter table public.policy_gate_decisions drop constraint policy_gate_decisions_primary_block_reason_check;

alter table public.policy_gate_decisions add constraint policy_gate_decisions_primary_block_reason_check
  check (primary_block_reason in (
    'no_matching_approval', 'value_mismatch', 'subject_key_unresolved',
    'commercial_root_terminal', 'invalid_extracted_value', 'extraction_unavailable',
    'stale_dependency'
  ));
