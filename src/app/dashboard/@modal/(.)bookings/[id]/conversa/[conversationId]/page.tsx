import { ConversaView } from '../../../../../bookings/[id]/conversa/[conversationId]/conversa-view';
import { ProfileModal } from '../../../../../profile-modal';

export default async function ConversaModalPage(props: { params: Promise<{ id: string; conversationId: string }> }) {
  const { conversationId } = await props.params;

  return (
    <ProfileModal>
      <ConversaView conversationId={conversationId} />
    </ProfileModal>
  );
}
