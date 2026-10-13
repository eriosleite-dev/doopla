import { timingSafeEqual } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/supabase/types';

// Diagnóstico TEMPORÁRIO (403 no handshake do webhook WhatsApp,
// 13/10/2026) — remover assim que o teste for concluído. Zero
// alteração em webhook/route.ts, webhook-verify.ts, env.ts ou qualquer
// lógica de OTP/outbound existente; este arquivo é inteiramente novo
// e isolado.
//
// Autenticação: nenhuma credencial nova, nenhum segredo no código —
// reusa a mesma checagem de admin de src/app/admin/session.ts
// (profiles.is_admin via sessão de cookie já autenticada), só adaptada
// pra devolver JSON (401/403) em vez de redirect, já que é uma rota de
// API, não uma página.
//
// Resposta: só { match: boolean }. Nunca o valor, nunca hash, nunca
// tamanho. Nenhum console.log/console.error em nenhum branch.
//
// Limite de tentativas: melhor-esforço (contador em memória por
// instância "quente" — não sobrevive cold start, não é um rate limit
// real/persistente). A barreira de verdade é a exigência de
// profiles.is_admin acima; este contador é só uma camada extra pra não
// permitir uso ilimitado na MESMA instância.
let attemptCount = 0;
const MAX_ATTEMPTS = 5;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single<Profile>();
  if (!profile || profile.status === 'closed' || !profile.is_admin) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  attemptCount += 1;
  if (attemptCount > MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 });
  }

  let body: { candidate?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  if (typeof body.candidate !== 'string' || body.candidate.length === 0) {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: 'env_missing' }, { status: 500 });
  }

  const candidateBuf = Buffer.from(body.candidate, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const match = candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);

  return NextResponse.json({ match });
}
