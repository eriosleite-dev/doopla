import { NextResponse, type NextRequest } from 'next/server';

import { extractBearerToken, resolveUserFromToken } from '@/lib/supabase/token-client';
import { requestWhatsappVerification } from '@/lib/whatsapp-identity/request-verification';

// Professional Product UI — Foundation. Único ponto de entrada do
// Mobile pra requestWhatsappVerification() — precisa ser um server
// real (nunca uma RPC chamada direto do app) porque o envio de
// verdade do código pelo WhatsApp usa WHATSAPP_ACCESS_TOKEN, segredo
// de servidor que nunca pode chegar ao client. Ver comentário
// detalhado em src/lib/whatsapp-identity/request-verification.ts.
//
// confirm_whatsapp_verification/revoke_whatsapp_verification NÃO
// precisam de rota equivalente — não expõem segredo nenhum, o Mobile
// chama essas duas RPCs direto (mobile/src/lib/data/whatsapp-identity.ts).
export async function POST(request: NextRequest) {
  const accessToken = extractBearerToken(request.headers.get('authorization'));
  if (!accessToken) {
    return NextResponse.json({ kind: 'error', error: 'unauthorized' }, { status: 401 });
  }

  const { supabase, user } = await resolveUserFromToken(accessToken);
  if (!user) {
    return NextResponse.json({ kind: 'error', error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ kind: 'error', error: 'invalid_json' }, { status: 400 });
  }

  const { candidateNumber } = (body ?? {}) as { candidateNumber?: unknown };
  if (typeof candidateNumber !== 'string') {
    return NextResponse.json({ kind: 'error', error: 'invalid_params' }, { status: 400 });
  }

  const result = await requestWhatsappVerification(supabase, user.id, candidateNumber);
  return NextResponse.json(result);
}
