import { ConversaView } from '../../bookings/[id]/conversa/[conversationId]/conversa-view';

// Correção de UX de Decisões (06/09/2026) — achado da inspeção pedida
// antes de codar: a ÚNICA rota que renderiza uma conversa
// (bookings/[id]/conversa/[conversationId]) exige um bookingId na URL,
// mas nem toda conversa com decisão pendente tem `related_booking_id`
// preenchido (ex.: negociação antes de existir booking formal) — o
// [id] daquela rota nunca é sequer lido pelo componente (confirmado:
// ConversaView só usa conversationId). Pra essas conversas, "Ver
// conversa"/"Resolver" caía num fallback genérico (/dashboard/trabalhos),
// nunca abrindo a conversa real. Esta rota cobre exatamente esse caso —
// MESMO componente (ConversaView), mesma RLS/ownership, nenhuma lógica
// paralela — só sem exigir um bookingId que pode não existir ainda.
export default async function ConversaStandalonePage(props: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await props.params;

  return (
    <main className="mx-auto max-w-2xl">
      <ConversaView conversationId={conversationId} />
    </main>
  );
}
