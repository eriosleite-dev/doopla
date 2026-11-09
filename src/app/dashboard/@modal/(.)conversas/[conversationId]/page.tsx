import { ConversaView } from '../../../bookings/[id]/conversa/[conversationId]/conversa-view';
import { ProfileModal } from '../../../profile-modal';

// Espelha @modal/(.)bookings/[id]/conversa/[conversationId] — mesma
// experiência de modal ao navegar de dentro do painel (ex.: Decisões),
// pra conversas sem booking ainda associado (ver page.tsx da rota
// normal em ../../../conversas/[conversationId]/page.tsx).
export default async function ConversaStandaloneModalPage(props: { params: Promise<{ conversationId: string }> }) {
  const { conversationId } = await props.params;

  return (
    <ProfileModal>
      <ConversaView conversationId={conversationId} />
    </ProfileModal>
  );
}
