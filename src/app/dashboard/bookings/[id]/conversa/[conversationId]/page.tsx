import { ConversaView } from './conversa-view';

export default async function ConversaPage(props: { params: Promise<{ id: string; conversationId: string }> }) {
  const { conversationId } = await props.params;

  return (
    <main className="mx-auto max-w-2xl">
      <ConversaView conversationId={conversationId} />
    </main>
  );
}
