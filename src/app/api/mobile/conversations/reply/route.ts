import { NextResponse, type NextRequest } from 'next/server';

import { extractBearerToken, resolveUserFromToken } from '@/lib/supabase/token-client';
import { submitProfessionalReply } from '@/lib/beta-integration/professional-reply';

// Conversas Bloco 2 — único ponto de entrada do Mobile pra
// submitProfessionalReply() (o MESMO boundary compartilhado que
// professional-reply-action.ts usa no painel web). Existe só porque o
// app Expo não roda Node/service_role — toda LEITURA de conversa que o
// Mobile faz é direto no Supabase via RLS (mobile/src/lib/data/
// conversations.ts, mesmo client de sempre), só a ESCRITA (que
// encadeia claim_inbound_event/Runtime/Approval Engine) precisa de um
// server real, daí esta rota.
//
// Autenticação: Bearer <access_token da sessão Supabase do usuário
// mobile> (nunca um secret de sistema, nunca service_role) — resolveUserFromToken
// valida o JWT contra o Auth server a cada chamada, exatamente como
// requireProfessional() faz no painel web com o client de cookie.
// Ownership/idempotência/state revalidation continuam 100% dentro de
// submitProfessionalReply — nenhuma lógica duplicada aqui, só
// transporte HTTP + auth.
export async function POST(request: NextRequest) {
  const accessToken = extractBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { supabase, user } = await resolveUserFromToken(accessToken);
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { conversationId, submissionId, replyBody, outboundIntentId } = (body ?? {}) as {
    conversationId?: unknown;
    submissionId?: unknown;
    replyBody?: unknown;
    outboundIntentId?: unknown;
  };
  if (typeof conversationId !== 'string' || typeof submissionId !== 'string' || typeof replyBody !== 'string') {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }
  if (outboundIntentId !== undefined && outboundIntentId !== null && typeof outboundIntentId !== 'string') {
    return NextResponse.json({ error: 'invalid_params' }, { status: 400 });
  }

  const result = await submitProfessionalReply(supabase, user.id, {
    conversationId,
    submissionId,
    body: replyBody,
    outboundIntentId: outboundIntentId ?? null,
    sourceSurface: 'mobile',
  });

  return NextResponse.json(result);
}
