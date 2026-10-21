-- ADR 0005 (16/10/2026) — liga app_settings.delegated_contact_enabled,
-- que estava 'false' desde a migration 0109 (nunca ligada por migration
-- nenhuma, só por UPDATE manual não rastreado — achado da auditoria).
--
-- Decisão da fundadora/Head of AI: religar agora é seguro porque o gate
-- de opt-in (migration 0116, whatsapp_outreach_authorization_claims/
-- whatsapp_outreach_blocklist) já está em produção e testado — qualquer
-- tentativa real de contatar um terceiro passa primeiro pela pergunta
-- de autorização, nunca envia direto. Esta migration só liga a flag que
-- permite o RECOGNIZER isolado rodar (delegated-contact-flow.ts); não
-- cria nem altera nenhum gate de segurança existente.
--
-- Daqui pra frente, qualquer mudança neste flag é uma migration como
-- esta — nunca mais um UPDATE solto fora de controle de versão.
update public.app_settings
set value = 'true', updated_at = now()
where key = 'delegated_contact_enabled';
