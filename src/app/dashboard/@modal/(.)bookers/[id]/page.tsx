import { BookerProfileView } from '../../../bookers/[id]/booker-profile-view';
import { ProfileModal } from '../../../profile-modal';

export default async function BookerProfileModalPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <ProfileModal>
      <BookerProfileView id={id} />
    </ProfileModal>
  );
}
