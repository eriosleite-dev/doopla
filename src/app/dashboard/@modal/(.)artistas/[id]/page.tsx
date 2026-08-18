import { ArtistProfileView } from '../../../artistas/[id]/artist-profile-view';
import { ProfileModal } from '../../../profile-modal';

export default async function ArtistProfileModalPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <ProfileModal>
      <ArtistProfileView id={id} />
    </ProfileModal>
  );
}
