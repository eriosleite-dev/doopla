import { createClient } from '@/lib/supabase/server';
import type { ArtistProfile, Conversation, ConversationMessage, Profile } from '@/lib/supabase/types';
import { getOpenAIClient } from './openai-client';
import { AI_FEATURE_INTELLIGENCE_TEST, AI_MODEL, AI_TEST_RECENT_MESSAGES_LIMIT } from './config';

export type IntelligenceTestResult =
  | { ok: true; responseText: string; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; error: string; detail?: string };

// Instrução mínima só pra provar a integração — NÃO é o system prompt
// definitivo da Doopla (isso é trabalho do Orchestrator/Context
// Builder, ainda não construídos). Deixa explícito: modo de teste,
// só usa o contexto dado, nunca inventa, sem autorização pra agir,
// pede pro profissional quando falta informação.
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

// Minimização de contexto deliberada: só os campos realmente úteis
// pra este teste (nome/nome artístico, profissão, bio, regra de
// negociação quando existir, mensagens recentes) — nunca o
// artist_profile inteiro.
function buildMinimalContext({
  fullName,
  stageName,
  category,
  bio,
  negotiationNotes,
  messages,
}: {
  fullName: string;
  stageName: string | null;
  category: string | null;
  bio: string | null;
  negotiationNotes: string | null;
  messages: ConversationMessage[];
}): string {
  const lines = [
    `Profissional representado: ${stageName ?? fullName}`,
    `Profissão/categoria: ${category ?? 'não informado'}`,
    `Sobre o trabalho: ${bio ?? 'não informado'}`,
  ];
  if (negotiationNotes) {
    lines.push(`Regra que o profissional pediu pra sempre considerar antes de negociar: ${negotiationNotes}`);
  }
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

// Função interna de teste — NÃO é o Orchestrator. Só prova que o
// backend consegue: autenticar o usuário, validar posse da conversa,
// montar um contexto mínimo, chamar a OpenAI, e registrar o uso. A
// resposta nunca é gravada em conversation_messages, nunca altera
// state/mandate/opportunity/booking, nunca chama ferramenta nenhuma —
// só volta pra quem chamou esta função.
export async function runIntelligenceTestCall(conversationId: string): Promise<IntelligenceTestResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: 'not_authenticated' };
  }

  // RLS já garante isso sozinha (conversations só é legível pelo
  // representado), mas o filtro explícito dá um erro claro e testável
  // em vez de depender só do conjunto vazio implícito do RLS.
  const { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('represented_professional_id', user.id)
    .single<Conversation>();
  if (!conversation) {
    return { ok: false, error: 'conversation_not_found_or_not_owned' };
  }

  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(AI_TEST_RECENT_MESSAGES_LIMIT)
    .returns<ConversationMessage[]>();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single<Pick<Profile, 'full_name'>>();

  const { data: artistProfile } = await supabase
    .from('artist_profiles')
    .select('stage_name, category, bio, negotiation_notes')
    .eq('profile_id', user.id)
    .single<Pick<ArtistProfile, 'stage_name' | 'category' | 'bio' | 'negotiation_notes'>>();

  const representedName = artistProfile?.stage_name ?? profile?.full_name ?? 'profissional';

  const context = buildMinimalContext({
    fullName: profile?.full_name ?? 'profissional',
    stageName: artistProfile?.stage_name ?? null,
    category: artistProfile?.category ?? null,
    bio: artistProfile?.bio ?? null,
    negotiationNotes: artistProfile?.negotiation_notes ?? null,
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
    });
  }

  let client;
  try {
    client = getOpenAIClient();
  } catch (err) {
    await logUsage('error', null, null);
    return { ok: false, error: 'openai_not_configured', detail: err instanceof Error ? err.message : undefined };
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

    return { ok: true, responseText: response.output_text, inputTokens, outputTokens };
  } catch (err) {
    await logUsage('error', null, null);
    return {
      ok: false,
      error: 'openai_call_failed',
      // Mensagem de erro do SDK da OpenAI nunca inclui a chave (vem do
      // corpo da resposta HTTP da API, que nunca ecoa a Authorization
      // header de volta) — segura pra devolver pro profissional
      // testando a própria chamada.
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
