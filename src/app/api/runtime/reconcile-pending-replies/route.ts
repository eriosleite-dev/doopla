import { NextResponse, type NextRequest } from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { reconcileDueRuntimePendingReplies } from '@/lib/runtime';

// Doopla Intelligence Core v1 — Runtime, passo 5: disparo automático do
// reconciler já existente (resumption.ts, reconcileDueRuntimePendingReplies,
// escrito numa rodada anterior como "o ponto de entrada que um
// worker/trigger futuro chamaria periodicamente"). Esta rota É esse
// trigger — nenhuma lógica de retomada nova aqui, só o disparo
// periódico + autenticação. Chamada por vercel.json (crons), nunca
// exposta pro painel/browser.
//
// Autenticação: Vercel injeta automaticamente `Authorization: Bearer
// $CRON_SECRET` nas chamadas que ele mesmo dispara quando a env var
// CRON_SECRET está configurada no projeto — comparação simples,
// nenhuma sessão de usuário envolvida (é operação interna do sistema,
// mesmo espírito de is_system_caller() no banco). 401 antes de
// qualquer trabalho se o secret não bater.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const outcomes = await reconcileDueRuntimePendingReplies(supabase, { workerId: 'cron:reconcile-pending-replies', limit: 50 });

  return NextResponse.json({ processed: outcomes.length, outcomes });
}
