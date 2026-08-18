import { AvaliarView } from './avaliar-view';

export default async function AvaliarPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;

  return (
    <main className="mx-auto max-w-lg overflow-hidden rounded-[24px] bg-white shadow-sm">
      <AvaliarView id={id} />
    </main>
  );
}
