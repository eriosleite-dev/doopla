import { AvaliarView } from '../../../../bookings/[id]/avaliar/avaliar-view';
import { ProfileModal } from '../../../../profile-modal';

export default async function AvaliarModalPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <ProfileModal>
      <AvaliarView id={id} />
    </ProfileModal>
  );
}
