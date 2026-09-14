import { BookerProfileView } from './booker-profile-view';

export default async function BookerProfilePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return <BookerProfileView id={id} />;
}
