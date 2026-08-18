import { BookerProfileView } from './booker-profile-view';

export default async function BookerProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <main className="mx-auto max-w-3xl overflow-hidden rounded-[24px] bg-[var(--paper)] shadow-sm">
      <BookerProfileView id={id} />
    </main>
  );
}
