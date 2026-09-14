import type { SupabaseClient } from '@supabase/supabase-js';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { whatsappAccessToken, whatsappPhoneNumberId } from '@/lib/supabase/env';
import { resolveOrCreateExternalParticipant } from '@/lib/runtime/intake';
import { triggerInboundMessage } from '@/lib/beta-integration/trigger';
import { sendWhatsappTextMessage } from './client';
import { findReusableWhatsappConversation } from './conversation';
import { extractDooplaSlugToken, evaluateWhatsappRouting, parseDisambiguationReply, textMentionsName, type PromptOption, type RoutingCandidate } from './intake-routing';

// Doopla Intelligence Core v1 — WhatsApp Inbound Foundation:
// orquestração (impura, fala com o banco e com a Meta). O algoritmo em
// si (evaluateWhatsappRouting) fica em intake-routing.ts, puro e
// testável isoladamente — este módulo só junta os sinais reais e
// decide o que fazer com o resultado.
//
// Nunca toca src/lib/runtime/ nem src/lib/intelligence/ — reaproveita
// exatamente as mesmas peças já provadas (triggerInboundMessage,
// resolveOrCreateExternalParticipant, findReusableWhatsappConversation)
// e só adiciona o caminho novo (create_conversation via service_role,
// as RPCs de channel_inbound_intake*) quando a identidade ainda não é
// conhecida.

const MAX_INTAKE_ATTEMPTS = 5;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any>;

export type WhatsappInboundHandlerParams = {
  providerMessageId: string; // wamid
  from: string; // telefone bruto, como a Meta manda
  body: string;
  contactName: string | null;
  providerTimestampSeconds: number | null; // message.timestamp (unix, segundos) quando a Meta manda
};

export type WhatsappInboundHandlerResult =
  | { kind: 'invalid_phone' }
  | { kind: 'duplicate_event' }
  | { kind: 'routed'; conversationId: string; method: string }
  | { kind: 'backlogged'; intakeId: string; promptSent: boolean }
  | { kind: 'abandoned'; intakeId: string };

type NamedCandidate = RoutingCandidate;

type IntakeSessionRow = {
  id: string;
  attempt_count: number;
  current_prompt_options: PromptOption[] | null;
};

// ============================================================
// Leitura de sinais — cada uma isolada, nenhuma decide sozinha.
// ============================================================

async function resolveProfessionalBySlug(supabase: AnySupabaseClient, slug: string): Promise<NamedCandidate | null> {
  const { data: profile } = await supabase.from('profiles').select('id, full_name').eq('slug', slug).maybeSingle<{ id: string; full_name: string }>();
  if (!profile) return null;
  // Nunca cria relação por um token de slug não-público/inativo — o
  // token só é um sinal válido se o profissional realmente aceita
  // contato público hoje.
  const { data: artist } = await supabase
    .from('artist_profiles')
    .select('stage_name, public_enabled')
    .eq('profile_id', profile.id)
    .eq('public_enabled', true)
    .maybeSingle<{ stage_name: string | null; public_enabled: boolean }>();
  if (!artist) return null;
  return { professionalId: profile.id, label: artist.stage_name || profile.full_name };
}

async function findNameMentionCandidates(supabase: AnySupabaseClient, combinedText: string): Promise<NamedCandidate[]> {
  const { data } = await supabase
    .from('artist_profiles')
    .select('profile_id, stage_name, public_enabled, profiles!inner(full_name)')
    .eq('public_enabled', true)
    .returns<Array<{ profile_id: string; stage_name: string | null; public_enabled: boolean; profiles: { full_name: string } }>>();

  const candidates: NamedCandidate[] = [];
  for (const row of data ?? []) {
    const label = row.stage_name || row.profiles.full_name;
    if (label && textMentionsName(combinedText, label)) {
      candidates.push({ professionalId: row.profile_id, label });
    }
  }
  return candidates;
}

type HistoryMatch = { professionalId: string; externalParticipantId: string; label: string };

async function findHistoryMatches(supabase: AnySupabaseClient, normalizedPhone: string): Promise<HistoryMatch[]> {
  const { data: identities } = await supabase
    .from('external_participant_channel_identities')
    .select('professional_id, external_participant_id')
    .eq('channel', 'whatsapp')
    .eq('identifier', normalizedPhone)
    .returns<Array<{ professional_id: string; external_participant_id: string }>>();

  if (!identities || identities.length === 0) return [];

  const professionalIds = [...new Set(identities.map((i) => i.professional_id))];
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, artist_profiles(stage_name)')
    .in('id', professionalIds)
    .returns<Array<{ id: string; full_name: string; artist_profiles: { stage_name: string | null } | null }>>();

  const labelById = new Map((profiles ?? []).map((p) => [p.id, p.artist_profiles?.stage_name || p.full_name]));

  return identities.map((i) => ({
    professionalId: i.professional_id,
    externalParticipantId: i.external_participant_id,
    label: labelById.get(i.professional_id) ?? 'profissional',
  }));
}

async function findRecentActivityProfessionalId(supabase: AnySupabaseClient, candidates: HistoryMatch[]): Promise<string | null> {
  if (candidates.length < 2) return null;
  const participantIds = candidates.map((c) => c.externalParticipantId);
  const { data } = await supabase
    .from('conversations')
    .select('represented_professional_id, external_participant_id, last_activity_at')
    .in('external_participant_id', participantIds)
    .order('last_activity_at', { ascending: false })
    .limit(1)
    .returns<Array<{ represented_professional_id: string; external_participant_id: string; last_activity_at: string }>>();
  return data && data.length > 0 ? data[0].represented_professional_id : null;
}

// ============================================================
// Envio do prompt de desambiguação — boundary mínimo de sistema,
// nunca outbound_intents (que exige conversation_id, inexistente
// nesta fase — contaminaria conversations com sessão de routing).
// ============================================================

function buildPromptMessage(candidates: NamedCandidate[]): { text: string; options: PromptOption[] } {
  if (candidates.length === 1) {
    return {
      text: `Oi! Você quer falar com ${candidates[0].label} pela Doopla? Responda "sim" pra confirmar.`,
      options: [{ index: 1, professionalId: candidates[0].professionalId, label: candidates[0].label }],
    };
  }
  const lines = candidates.map((c, i) => `${i + 1}) ${c.label}`).join('\n');
  return {
    text: `Oi! Sou a Doopla 👋 Com quem você quer falar?\n${lines}\n(responda com o número)`,
    options: candidates.map((c, i) => ({ index: i + 1, professionalId: c.professionalId, label: c.label })),
  };
}

const OPENING_QUESTION = 'Oi! Sou a Doopla 👋 Quem você gostaria de contratar?';

async function sendSystemWhatsappMessage(to: string, body: string): Promise<void> {
  await sendWhatsappTextMessage({ accessToken: whatsappAccessToken(), phoneNumberId: whatsappPhoneNumberId() }, { to, body });
  // Resultado (sent_confirmed/sent_unknown/failed_*) não é rastreado
  // com o rigor de outbound_intents de propósito — é um prompt de
  // sistema, nunca visível a nenhum profissional em nenhuma tela;
  // falha de envio aqui só significa que o próximo turno do cliente
  // (se vier) reavalia do zero, nunca deixa a sessão presa.
}

// ============================================================
// Materialização do backlog — cada mensagem, na ordem, via RPC atômica
// (persist + rastro + fechamento do inbound_event, tudo ou nada).
// ============================================================

async function materializeBacklog(supabase: AnySupabaseClient, intakeId: string, conversationId: string, externalParticipantId: string): Promise<void> {
  const { data: messages } = await supabase
    .from('channel_inbound_intake_messages')
    .select('id, materialized_conversation_message_id, provider_sent_at, created_at')
    .eq('intake_id', intakeId)
    .order('provider_sent_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .returns<Array<{ id: string; materialized_conversation_message_id: string | null }>>();

  for (const msg of messages ?? []) {
    if (msg.materialized_conversation_message_id) continue; // já materializada — idempotente, retry seguro
    const { error } = await supabase.rpc('materialize_channel_inbound_intake_message', {
      p_intake_message_id: msg.id,
      p_conversation_id: conversationId,
      p_external_participant_id: externalParticipantId,
      p_channel: 'whatsapp',
    });
    if (error) throw new Error(`materialize_channel_inbound_intake_message falhou: ${error.message}`);
  }
}

// ============================================================
// Resolução: participante + conversa (reaproveita ou cria via
// create_conversation estendida, nunca reimplementa a regra de
// isolamento/tenant).
// ============================================================

async function resolveParticipantAndConversation(
  supabase: AnySupabaseClient,
  params: { professionalId: string; normalizedPhone: string; contactName: string | null; existingExternalParticipantId: string | null; originReference: string | null }
): Promise<{ externalParticipantId: string; conversationId: string }> {
  const externalParticipantId =
    params.existingExternalParticipantId ??
    (
      await resolveOrCreateExternalParticipant(supabase, {
        professionalId: params.professionalId,
        channel: 'whatsapp',
        identifier: params.normalizedPhone,
        name: params.contactName,
      })
    ).id;

  const reusable = await findReusableWhatsappConversation(supabase, { professionalId: params.professionalId, externalParticipantId });
  if (reusable) return { externalParticipantId, conversationId: reusable };

  const { data, error } = await supabase
    .rpc('create_conversation', {
      p_represented_professional_id: params.professionalId,
      p_conversation_type: 'external_inquiry',
      p_external_participant_id: externalParticipantId,
      p_origin: 'whatsapp',
      p_origin_reference: params.originReference,
      p_channel: 'whatsapp',
    })
    .single<{ id: string }>();
  if (error || !data) throw new Error(`create_conversation (system) falhou: ${error?.message ?? 'sem dado'}`);
  return { externalParticipantId, conversationId: data.id };
}

// ============================================================
// Entry point único — chamado pelo webhook pra CADA mensagem inbound
// de WhatsApp, no lugar do handleInboundMessage antigo.
// ============================================================

async function resolveVerifiedProfessionalId(supabase: AnySupabaseClient, normalizedPhone: string): Promise<string | null> {
  const { data } = await supabase
    .from('professional_whatsapp_identities')
    .select('professional_id')
    .eq('verified_number', normalizedPhone)
    .maybeSingle<{ professional_id: string }>();
  return data?.professional_id ?? null;
}

async function resolveProfessionalSelfAndFinish(
  supabase: AnySupabaseClient,
  params: { professionalId: string; currentMessage: WhatsappInboundHandlerParams }
): Promise<WhatsappInboundHandlerResult> {
  const { data, error } = await supabase
    .rpc('create_conversation', {
      p_represented_professional_id: params.professionalId,
      p_conversation_type: 'professional_self',
      p_origin: 'whatsapp',
      p_channel: 'whatsapp',
    })
    .single<{ id: string }>();
  if (error || !data) throw new Error(`create_conversation (professional_self) falhou: ${error?.message ?? 'sem dado'}`);
  const conversationId = data.id;

  // professional_self nunca passa por intake/backlog/prompt de
  // desambiguação — identidade verificada resolve incondicionalmente
  // no passo 1 do algoritmo, sempre. Nunca confundido com conversas de
  // cliente (author_type='professional', nunca 'external_participant').
  await triggerInboundMessage({
    conversationId,
    authorType: 'professional',
    authorProfileId: params.professionalId,
    body: params.currentMessage.body,
    channel: 'whatsapp',
    providerEventId: params.currentMessage.providerMessageId,
    providerMessageId: params.currentMessage.providerMessageId,
    workerId: 'whatsapp:webhook',
  });

  return { kind: 'routed', conversationId, method: 'verified_professional' };
}

export async function handleWhatsappInboundMessage(
  supabase: AnySupabaseClient,
  normalizedPhone: string,
  params: WhatsappInboundHandlerParams
): Promise<WhatsappInboundHandlerResult> {
  const providerSentAt = params.providerTimestampSeconds ? new Date(params.providerTimestampSeconds * 1000).toISOString() : null;

  // Identidade verificada — checada incondicionalmente, ANTES de
  // qualquer sessão de intake/prompt/backlog (esses mecanismos são
  // exclusivos de identidade NÃO verificada). Responde só QUEM fala
  // (Professional WhatsApp Identity, 0064) — nunca decide destino
  // sozinha: um token determinístico pra OUTRO profissional nesta
  // mesma mensagem ainda vence (mesmo algoritmo, nunca alterado desde
  // 0062), texto livre nunca sobrepõe a identidade.
  const verifiedProfessionalId = await resolveVerifiedProfessionalId(supabase, normalizedPhone);
  if (verifiedProfessionalId) {
    const tokenSlug = await (async () => {
      const slug = extractDooplaSlugToken(params.body);
      return slug ? await resolveProfessionalBySlug(supabase, slug) : null;
    })();

    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId,
      token: tokenSlug ? { professionalId: tokenSlug.professionalId, slug: tokenSlug.label } : null,
      nameMentionCandidates: [],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });

    // Passo 1 do algoritmo nunca devolve outro outcome quando
    // verifiedProfessionalId != null — sempre 'resolved', sempre
    // 'verified_professional' (padrão) ou 'token' (override
    // determinístico pra outro profissional).
    if (decision.outcome === 'resolved' && decision.method === 'verified_professional') {
      return await resolveProfessionalSelfAndFinish(supabase, { professionalId: decision.professionalId, currentMessage: params });
    }
    if (decision.outcome === 'resolved') {
      return await resolveAndFinish(supabase, null, {
        method: decision.method,
        professionalId: decision.professionalId,
        normalizedPhone,
        contactName: params.contactName,
        currentMessage: params,
        providerSentAt,
        existingExternalParticipantId: null,
        originReference: tokenSlug ? tokenSlug.label : null,
      });
    }
  }

  const { data: existingSessionRows } = await supabase
    .from('channel_inbound_intakes')
    .select('*')
    .eq('channel', 'whatsapp')
    .eq('from_identifier', normalizedPhone)
    .eq('routing_status', 'pending_disambiguation')
    .limit(1)
    .returns<IntakeSessionRow[]>();
  const existingSession: IntakeSessionRow | null = existingSessionRows?.[0] ?? null;

  // 1) Resposta a um prompt ATIVO — checado primeiro, contra o que
  //    está gravado AGORA (nunca uma cópia potencialmente obsoleta).
  //    Resolve direto, nunca reabre fuzzy contra o catálogo inteiro.
  if (existingSession?.current_prompt_options) {
    const options = existingSession.current_prompt_options as PromptOption[];
    const answer = parseDisambiguationReply(params.body, options);
    if (answer) {
      return await resolveAndFinish(supabase, existingSession, {
        method: 'client_confirmation',
        professionalId: answer.professionalId,
        normalizedPhone,
        contactName: params.contactName,
        currentMessage: params,
        providerSentAt,
        existingExternalParticipantId: null,
        originReference: null,
      });
    }
  }

  // 2) Reavaliação geral — sinais atuais (token/nome desta mensagem +
  //    backlog acumulado) x histórico. Se já resolve, nunca manda
  //    outro prompt.
  const backlogBodies = existingSession ? await fetchBacklogBodies(supabase, existingSession.id) : [];
  const combinedText = [...backlogBodies, params.body].join('\n');

  const [tokenSlug, nameMentionCandidates, historyMatches] = await Promise.all([
    (async () => {
      const slug = extractDooplaSlugTokenFromAny([...backlogBodies, params.body]);
      return slug ? await resolveProfessionalBySlug(supabase, slug) : null;
    })(),
    findNameMentionCandidates(supabase, combinedText),
    findHistoryMatches(supabase, normalizedPhone),
  ]);
  const recentActivityProfessionalId = await findRecentActivityProfessionalId(supabase, historyMatches);

  const decision = evaluateWhatsappRouting({
    verifiedProfessionalId: null,
    token: tokenSlug ? { professionalId: tokenSlug.professionalId, slug: tokenSlug.label } : null,
    nameMentionCandidates,
    historyMatches: historyMatches.map((h) => ({ professionalId: h.professionalId, label: h.label })),
    recentActivityProfessionalId,
  });

  if (decision.outcome === 'resolved') {
    const historyEntry = historyMatches.find((h) => h.professionalId === decision.professionalId) ?? null;
    return await resolveAndFinish(supabase, existingSession, {
      method: decision.method,
      professionalId: decision.professionalId,
      normalizedPhone,
      contactName: params.contactName,
      currentMessage: params,
      providerSentAt,
      existingExternalParticipantId: historyEntry?.externalParticipantId ?? null,
      originReference: tokenSlug ? tokenSlug.label : null,
    });
  }

  // 3) Ainda ambíguo/sem sinal — preserva a mensagem (claim raw +
  //    sessão + backlog), nunca descarta.
  const claim = await claimRawInboundEvent(supabase, params.providerMessageId);
  if (!claim.claimed) return { kind: 'duplicate_event' };

  const session: IntakeSessionRow =
    existingSession ??
    (await callRpc<IntakeSessionRow>(supabase, 'claim_or_create_channel_inbound_intake', {
      p_channel: 'whatsapp',
      p_from_identifier: normalizedPhone,
      p_contact_display_name: params.contactName,
    }));

  await callRpc(supabase, 'append_channel_inbound_intake_message', {
    p_intake_id: session.id,
    p_inbound_event_id: claim.eventId,
    p_body: params.body,
    p_content_type: 'text',
    p_provider_sent_at: providerSentAt,
  });

  if (session.attempt_count >= MAX_INTAKE_ATTEMPTS) {
    await callRpc(supabase, 'mark_channel_inbound_intake_abandoned', { p_intake_id: session.id });
    return { kind: 'abandoned', intakeId: session.id };
  }

  if (decision.outcome === 'needs_confirmation') {
    const currentIds = new Set((session.current_prompt_options ?? []).map((o) => o.professionalId));
    const newIds = new Set(decision.candidates.map((c) => c.professionalId));
    const sameCandidates = currentIds.size === newIds.size && [...currentIds].every((id) => newIds.has(id));
    if (!sameCandidates) {
      const prompt = buildPromptMessage(decision.candidates);
      await sendSystemWhatsappMessage(normalizedPhone, prompt.text);
      await callRpc(supabase, 'set_channel_inbound_intake_prompt', { p_intake_id: session.id, p_options: prompt.options });
      return { kind: 'backlogged', intakeId: session.id, promptSent: true };
    }
    return { kind: 'backlogged', intakeId: session.id, promptSent: false };
  }

  // no_signal — abre a pergunta genérica só uma vez (sem opções
  // fechadas: a próxima resposta cai de novo na reavaliação geral).
  if (!session.current_prompt_options) {
    await sendSystemWhatsappMessage(normalizedPhone, OPENING_QUESTION);
    await callRpc(supabase, 'set_channel_inbound_intake_prompt', { p_intake_id: session.id, p_options: [] });
  }
  return { kind: 'backlogged', intakeId: session.id, promptSent: !session.current_prompt_options };
}

async function resolveAndFinish(
  supabase: AnySupabaseClient,
  existingSession: IntakeSessionRow | null,
  params: {
    method: 'verified_professional' | 'token' | 'unique_history' | 'client_confirmation';
    professionalId: string;
    normalizedPhone: string;
    contactName: string | null;
    currentMessage: WhatsappInboundHandlerParams;
    providerSentAt: string | null;
    existingExternalParticipantId: string | null;
    originReference: string | null;
  }
): Promise<WhatsappInboundHandlerResult> {
  const { externalParticipantId, conversationId } = await resolveParticipantAndConversation(supabase, {
    professionalId: params.professionalId,
    normalizedPhone: params.normalizedPhone,
    contactName: params.contactName,
    existingExternalParticipantId: params.existingExternalParticipantId,
    originReference: params.originReference,
  });

  if (existingSession) {
    await callRpc(supabase, 'resolve_channel_inbound_intake', {
      p_intake_id: existingSession.id,
      p_resolution_method: params.method,
      p_external_participant_id: externalParticipantId,
      p_conversation_id: conversationId,
    });
    await materializeBacklog(supabase, existingSession.id, conversationId, externalParticipantId);
  }

  // A mensagem ATUAL nunca é pré-materializada — segue pelo caminho
  // padrão (claim fresco + persist + ciclo completo do Runtime),
  // idêntico ao caminho já existente de identidade já conhecida.
  await triggerInboundMessage({
    conversationId,
    authorType: 'external_participant',
    externalParticipantIdentifier: { channel: 'whatsapp', identifier: params.normalizedPhone, name: params.contactName },
    body: params.currentMessage.body,
    channel: 'whatsapp',
    providerEventId: params.currentMessage.providerMessageId,
    providerMessageId: params.currentMessage.providerMessageId,
    workerId: 'whatsapp:webhook',
  });

  return { kind: 'routed', conversationId, method: params.method };
}

// ============================================================
// Helpers de baixo nível — RPC genérica + claim raw (só usado quando a
// mensagem vai ser backlogueada; a mensagem que resolve nunca passa
// por aqui, evita o double-claim do mesmo wamid).
// ============================================================

async function fetchBacklogBodies(supabase: AnySupabaseClient, intakeId: string): Promise<string[]> {
  const { data } = await supabase
    .from('channel_inbound_intake_messages')
    .select('body, provider_sent_at, created_at')
    .eq('intake_id', intakeId)
    .order('provider_sent_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .returns<Array<{ body: string | null }>>();
  return (data ?? []).map((m) => m.body ?? '').filter(Boolean);
}

function extractDooplaSlugTokenFromAny(texts: string[]): string | null {
  // Mais recente primeiro — uma correção do cliente numa mensagem
  // posterior (link diferente) prevalece sobre um token mais antigo.
  for (let i = texts.length - 1; i >= 0; i--) {
    const slug = extractDooplaSlugToken(texts[i]);
    if (slug) return slug;
  }
  return null;
}

async function claimRawInboundEvent(supabase: AnySupabaseClient, providerMessageId: string): Promise<{ claimed: boolean; eventId: string }> {
  const { data, error } = await supabase
    .rpc('claim_inbound_event', { p_channel: 'whatsapp', p_provider_event_id: providerMessageId, p_provider_message_id: providerMessageId })
    .single<{ claimed: boolean; event_id: string; already_processed: boolean }>();
  if (error || !data) throw new Error(`claim_inbound_event falhou: ${error?.message ?? 'sem dado'}`);
  return { claimed: data.claimed, eventId: data.event_id };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callRpc<T = any>(supabase: AnySupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args).single();
  if (error) throw new Error(`${fn} falhou: ${error.message}`);
  return data as T;
}

// Reexportado só pra conveniência de quem monta o client de sistema
// (webhook route já tem o seu próprio via createServiceRoleClient —
// nunca duplicar a construção do client aqui).
export { createServiceRoleClient };
