'use server';

import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { runIntelligenceTestCall, type IntelligenceTestResult } from '@/lib/intelligence/test-call';
import type { Conversation } from '@/lib/supabase/types';

// Ferramenta de desenvolvimento/teste — não é parte do produto. Cada
// action revalida a sessão por conta própria (sem confiar em nenhum
// dado vindo do client) antes de tocar em qualquer coisa.

async function requireProfessional() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/intelligence-test');
  return { supabase, user };
}

export async function createTestConversationAction(): Promise<{ conversationId?: string; error?: string }> {
  const { supabase, user } = await requireProfessional();

  const { data, error } = await supabase.rpc('create_conversation', {
    p_represented_professional_id: user.id,
    p_conversation_type: 'professional_self',
    p_origin: 'painel',
  });

  if (error || !data) {
    return { error: 'Não foi possível criar a conversa de teste.' };
  }

  const conversation = data as Conversation;
  return { conversationId: conversation.id };
}

export async function runIntelligenceTestAction(conversationId: string): Promise<IntelligenceTestResult> {
  // A checagem de sessão aqui é só pra falhar cedo com um redirect —
  // a validação real de posse da conversa (o que realmente importa
  // pra segurança) acontece dentro de runIntelligenceTestCall, contra
  // o banco, não contra o que o client alega.
  await requireProfessional();
  return runIntelligenceTestCall(conversationId);
}
