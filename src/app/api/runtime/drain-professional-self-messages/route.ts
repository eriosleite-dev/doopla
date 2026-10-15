import { NextResponse, type NextRequest } from 'next/server';

import { recoverStuckLiteralContentSends, recoverStuckTemplateExecutions, sweepDelegatedContactExpirations } from '@/lib/runtime/delegated-contact-flow';
import {
  expireStalePendingDelegatedContacts,
  listPendingDelegatedContactsDueForNoReplyExpiry,
  listPendingDelegatedContactsWithExpiredExecutionLease,
  listPendingDelegatedContactsWithExpiredLiteralContentLease,
} from '@/lib/runtime/pending-delegated-contacts';
import {
  drainProfessionalSelfPendingMessages,
  listProfessionalSelfPendingProfessionals,
  purgeExpiredProfessionalSelfPendingMessageBodies,
} from '@/lib/runtime/professional-self-pending-messages';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Doopla Intelligence Core v1 — Runtime, P0 14/10/2026 (revisão 2):
// disparo periódico da fila persistida de professional_self
// (professional-self-pending-messages.ts, migration 0108). Mesmo
// padrão de reconcile-pending-replies/route.ts e
// send-outbound-intents/route.ts (Vercel Cron, 1min, CRON_SECRET) —
// nenhuma infra nova, só mais um consumidor do mesmo mecanismo já
// comprovado.
//
// Cobre o caso em que nem a tentativa inline (no próprio request do
// webhook) nem uma próxima mensagem do profissional destravam a fila
// — recuperação automática, sem depender de nenhum evento externo
// novo. list_professional_self_pending_professionals (migration 0108)
// ordena pelo pending MAIS ANTIGO primeiro, então mesmo acima de 50
// profissionais pendentes num mesmo tick ninguém fica esquecido pra
// sempre — o atraso extra fica limitado a (profissionais pendentes /
// 50) ticks, nunca indefinido.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const professionalIds = await listProfessionalSelfPendingProfessionals(supabase, { limit: 50 });
  const results: Array<{ professionalId: string; stoppedReason: string; completedCount: number }> = [];
  for (const professionalId of professionalIds) {
    try {
      const result = await drainProfessionalSelfPendingMessages(supabase, { professionalId, workerId: 'cron:drain-professional-self-messages' });
      results.push({ professionalId, stoppedReason: result.stoppedReason, completedCount: result.completedRowIds.length });
    } catch (err) {
      results.push({ professionalId, stoppedReason: `error: ${err instanceof Error ? err.message : 'unknown'}`, completedCount: 0 });
    }
  }

  // Retenção de dado pessoal (requisito 10, aprovação 14/10/2026) —
  // corpo de mensagens 'failed' (terminal) só é retido por 7 dias.
  // Roda no mesmo cron pra não introduzir um 4º agendamento só pra
  // isto.
  const purgedCount = await purgeExpiredProfessionalSelfPendingMessageBodies(supabase, { olderThanDays: 7 });

  // "Doopla chama o cliente" — Etapa 2.1 (14/10/2026). Mesmo padrão:
  // nenhum agendamento novo, só mais consumidores do mesmo cron de
  // 1min já comprovado. Cada chamada é independente e nunca derruba as
  // outras — uma falha aqui nunca pode impedir o drain normal acima
  // (já processado nesta mesma invocação) de ter rodado.
  //
  // Achado real (revisão de código, 15/10/2026): as 4 chamadas abaixo
  // estavam dentro de UM ÚNICO try/catch — contradizia o comentário
  // acima e repetia, pras 3 primeiras, exatamente a classe de bug que
  // a migration 0110 corrigiu só pra última (uma falha na 1ª chamada
  // escondia as outras 3 indefinidamente se persistente, não só nesse
  // tick). Cada chamada agora tem seu próprio try/catch, igual ao loop
  // por profissional logo acima.
  let delegatedContactExpired = 0;
  try {
    await expireStalePendingDelegatedContacts(supabase); // Etapa 1 (migration 0104) — RPC existente, nunca chamada até agora
  } catch (err) {
    console.error('[drain-professional-self-messages] falha ao expirar pending_delegated_contacts obsoletos', err);
  }

  try {
    const dueForNoReply = await listPendingDelegatedContactsDueForNoReplyExpiry(supabase);
    delegatedContactExpired = (await sweepDelegatedContactExpirations(supabase, { dueForNoReply })).expiredNoReply;
  } catch (err) {
    console.error('[drain-professional-self-messages] falha no sweep de expiração por falta de resposta (no_reply)', err);
  }

  try {
    const stuckTemplateExecutions = await listPendingDelegatedContactsWithExpiredExecutionLease(supabase);
    await recoverStuckTemplateExecutions(supabase, stuckTemplateExecutions);
  } catch (err) {
    console.error('[drain-professional-self-messages] falha na recuperação de leases travados (execução do template)', err);
  }

  try {
    const stuckLiteralContentSends = await listPendingDelegatedContactsWithExpiredLiteralContentLease(supabase);
    await recoverStuckLiteralContentSends(supabase, stuckLiteralContentSends);
  } catch (err) {
    console.error('[drain-professional-self-messages] falha na recuperação de leases travados (envio da mensagem original)', err);
  }

  return NextResponse.json({ processedProfessionals: results.length, results, purgedCount, delegatedContactExpired });
}
