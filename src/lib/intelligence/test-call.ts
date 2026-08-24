import { createClient } from '@/lib/supabase/server';
import type { ConversationMessage } from '@/lib/supabase/types';
import { resolveActorContext } from './actor-context';
import { AI_FEATURE_INTELLIGENCE_TEST, AI_MODEL, AI_TEST_RECENT_MESSAGES_LIMIT } from './config';
import { getOpenAIClient } from './openai-client';
import { finishOrchestratorRun, startOrchestratorRun } from './observability';
import { evaluatePreModelGate } from './policy-gate';
import { executeTool } from './tool-registry';
import './tools';
import type { ToolContext } from './types';

export type IntelligenceTestResult =
  | { ok: true; responseText: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; error: string; detail?: string };

// Instrução mínima só pra provar a integração — NÃO é o system prompt
// definitivo da Doopla (isso é trabalho do Response Planner/Context
// Builder completos, ainda não construídos). Deixa explícito: modo de
// teste, só usa o contexto dado, nunca inventa, sem autorização pra
// agir, pede pro profissional quando falta informação.
function buildTestInstructions(representedName: string): string {
  return `Você é a Doopla, representando ${representedName}. Você está rodando em MODO DE TESTE de infraestrutura — isto não é uma conversa real com um cliente e sua resposta não será enviada a ninguém.

Regras deste modo de teste:
- Use só o contexto fornecido abaixo. Nunca invente informação que não foi dada a você.
- Você não tem autorização pra executar nenhuma ação (negociar, confirmar valor, marcar compromisso, gerar contrato, etc.) — só pode responder em texto.
- Se faltar uma informação importante pra responder bem, diga claramente que precisaria consultar o profissional antes, em vez de supor.`;
}

function formatMessage(message: Pick<ConversationMessage, 'author_type' | 'body' | 'transcript'>): string {
  const author =
    message.author_type === 'professional'
      ? 'profissional'
      : message.author_type === 'external_participant'
        ? 'cliente'
        : message.author_type;
  const text = message.body ?? message.transcript ?? '(sem texto)';
  return `[${author}] ${text}`;
}

// Minimização de contexto deliberada: só os campos realmente úteis pra
// este teste — nunca o artist_profile inteiro. O perfil vem sempre da
// tool get_professional_profile (nunca de uma query direta aqui), pra
// já exercitar o Tool Registry/pre-model gate neste bloco.
function buildMinimalContext({
  fullName,
  stageName,
  category,
  bio,
  messages,
}: {
  fullName: string;
  stageName: string | null;
  category: string | null;
  bio: string | null;
  messages: ConversationMessage[];
}): string {
  const lines = [
    `Profissional representado: ${stageName ?? fullName}`,
    `Profissão/categoria: ${category ?? 'não informado'}`,
    `Sobre o trabalho: ${bio ?? 'não informado'}`,
  ];
  lines.push('', 'Mensagens recentes desta conversa (mais antiga primeiro):');
  if (messages.length === 0) {
    lines.push('(nenhuma mensagem ainda)');
  } else {
    for (const message of [...messages].reverse()) {
      lines.push(formatMessage(message));
    }
  }
  lines.push(
    '',
    'Com base só nisso, escreva uma resposta breve confirmando que você entendeu esse contexto e, se fizer sentido, uma pergunta que você faria em seguida.'
  );
  return lines.join('\n');
}

// Função interna de teste — NÃO é o Orchestrator completo (sem Intent
// Classifier, Competence Router, Response Planner, post-model gate).
// Prova que o Bloco 1 do Core (ActorContext, pre-model gate, Tool
// Registry, observability) já roda de ponta a ponta antes de qualquer
// chamada à OpenAI. Resposta nunca é gravada em conversation_messages,
// nunca altera state/mandate/opportunity/booking, e a única tool
// chamada é get_professional_profile (READ).
export async function runIntelligenceTestCall(conversationId: string): Promise<IntelligenceTestResult> {
  const supabase = await createClient();

  const actorResult = await resolveActorContext(supabase, conversationId, {
    kind: 'authenticated_user',
    triggerSource: 'dev_test_panel',
  });
  if (!actorResult.ok) {
    return { ok: false, error: actorResult.error };
  }
  const { actorContext, conversation } = actorResult;

  const gateResult = evaluatePreModelGate({ actorContext, conversation });
  if (!gateResult.ok) {
    return { ok: false, error: gateResult.error };
  }
  const { eligibleTools } = gateResult;

  const run = await startOrchestratorRun(supabase, {
    conversationId,
    representedProfessionalId: actorContext.representedProfessionalId,
    actorType: actorContext.actorType,
    actorProfileId: actorContext.actorProfileId,
    externalParticipantId: conversation.external_participant_id,
    triggerSource: actorContext.triggerSource,
    eligibleTools,
  });

  const calledTools: string[] = [];

  async function finishRun(status: 'completed' | 'failed', error: string | null) {
    if (!run) return;
    await finishOrchestratorRun(supabase, {
      runId: run.id,
      status,
      calledTools,
      error,
      fallbackUsed: false,
    });
  }

  const toolCtx: ToolContext = {
    representedProfessionalId: actorContext.representedProfessionalId,
    actorContext,
    conversation,
    supabase,
  };

  const profileOutcome = await executeTool<{
    fullName: string;
    stageName: string | null;
    category: string | null;
    bio: string | null;
  }>('get_professional_profile', {}, toolCtx, eligibleTools);
  calledTools.push('get_professional_profile');

  if (!profileOutcome.ok) {
    await finishRun('failed', profileOutcome.error);
    return { ok: false, error: profileOutcome.error, detail: profileOutcome.detail };
  }

  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(AI_TEST_RECENT_MESSAGES_LIMIT)
    .returns<ConversationMessage[]>();

  const representedName = profileOutcome.output.stageName ?? profileOutcome.output.fullName;

  const context = buildMinimalContext({
    fullName: profileOutcome.output.fullName,
    stageName: profileOutcome.output.stageName,
    category: profileOutcome.output.category,
    bio: profileOutcome.output.bio,
    messages: messages ?? [],
  });

  async function logUsage(status: 'success' | 'error', inputTokens: number | null, outputTokens: number | null) {
    await supabase.rpc('log_ai_usage_event', {
      p_feature: AI_FEATURE_INTELLIGENCE_TEST,
      p_model: AI_MODEL,
      p_status: status,
      p_conversation_id: conversationId,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_run_id: run?.id ?? null,
    });
  }

  let client;
  try {
    client = getOpenAIClient();
  } catch (err) {
    const detail = err instanceof Error ? err.message : undefined;
    await logUsage('error', null, null);
    await finishRun('failed', 'openai_not_configured');
    return { ok: false, error: 'openai_not_configured', detail };
  }

  try {
    const response = await client.responses.create({
      model: AI_MODEL,
      instructions: buildTestInstructions(representedName),
      input: context,
    });

    const inputTokens = response.usage?.input_tokens ?? null;
    const outputTokens = response.usage?.output_tokens ?? null;
    await logUsage('success', inputTokens, outputTokens);
    await finishRun('completed', null);

    return { ok: true, responseText: response.output_text, inputTokens, outputTokens };
  } catch (err) {
    // Mensagem de erro do SDK da OpenAI nunca inclui a chave (vem do
    // corpo da resposta HTTP da API, que nunca ecoa a Authorization
    // header de volta) — segura pra devolver pro profissional testando
    // a própria chamada, e pra gravar em orchestrator_runs.error.
    const detail = err instanceof Error ? err.message : undefined;
    await logUsage('error', null, null);
    await finishRun('failed', detail ?? 'openai_call_failed');
    return { ok: false, error: 'openai_call_failed', detail };
  }
}
