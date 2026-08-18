import { ArtistProfileView } from './artist-profile-view';

export default async function ArtistProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <main className="mx-auto max-w-3xl overflow-hidden rounded-[24px] bg-[var(--paper)] shadow-sm">
      <ArtistProfileView id={id} />
    </main>
  );
}
