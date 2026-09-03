import { notFound } from 'next/navigation';

import { formatRelativeDate } from '@/lib/format';
import {
  getConversationMessages,
  getConversationOperationalFacts,
  getExternalParticipant,
  getPendingDraftForConversation,
  type ConversationMessage,
} from '@/lib/conversations/data';

import { getSessionProfile } from '../../../../session';
import {
  avatarClass,
  cardClass,
  CONVERSATION_STATE_LABELS,
  conversationStatePillClasses,
  eyebrowClass,
  initialsFromName,
} from '../../../../ui';
import { ReplyForm } from './reply-form';

// Conversas Bloco 2 — conteúdo real da tela de conversa, compartilhado
// entre a rota normal (bookings/[id]/conversa/[conversationId]/page.tsx)
// e a rota interceptadora (@modal/.../conversa/[conversationId]/page.tsx),
// mesmo padrão já usado por avaliar-view.tsx. Nenhuma lógica de
// posse/RLS nova: getSessionProfile() já entrega um client autenticado
// como cookie, e src/lib/conversations/data.ts só lê o que RLS já
// deixa (ou devolve null/vazio — nunca um erro que vazasse existência
// de conversa de outro profissional).
export async function ConversaView({ conversationId }: { conversationId: string }) {
  const { supabase } = await getSessionProfile();

  const facts = await getConversationOperationalFacts(supabase, conversationId);
  if (!facts) notFound();

  const [messages, draft, externalParticipant] = await Promise.all([
    getConversationMessages(supabase, conversationId),
    getPendingDraftForConversation(supabase, conversationId),
    facts.externalParticipantId ? getExternalParticipant(supabase, facts.externalParticipantId) : Promise.resolve(null),
  ]);

  const title = facts.conversationType === 'professional_self' ? 'Você e a Doopla' : (externalParticipant?.name ?? 'Cliente');
  const conversationClosed = facts.status === 'closed' || facts.status === 'archived';

  return (
    <div className="flex flex-col gap-6 p-7">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={avatarClass}>{initialsFromName(title)}</span>
          <div>
            <p className={eyebrowClass}>Conversa</p>
            <p className="text-[15px] font-semibold">{title}</p>
          </div>
        </div>
        <span className={conversationStatePillClasses[facts.state]}>{CONVERSATION_STATE_LABELS[facts.state]}</span>
      </header>

      <section className={`${cardClass} flex max-h-[440px] flex-col gap-3 overflow-y-auto`}>
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--ink)]/55">Nenhuma mensagem ainda.</p>
        ) : (
          messages.map((message) => <MessageBubble key={message.id} message={message} />)
        )}
      </section>

      {!conversationClosed && <ReplyForm conversationId={conversationId} draft={draft} />}
    </div>
  );
}

// "Você respondeu"/"Você editou o rascunho antes de enviar" — fato de
// MENSAGEM individual (conversation_messages.prepared_response_outcome,
// migration 0066), nunca um estado de conversa. Renderizado só como
// selo informativo por bolha, exatamente como o usuário pediu ("Você
// respondeu" demovido de estado pra info de thread).
function MessageBubble({ message }: { message: ConversationMessage }) {
  const isFromProfessional = message.authorType === 'professional';
  const isFromClient = message.authorType === 'external_participant';
  const align = isFromProfessional ? 'items-end text-right' : 'items-start text-left';
  const bubbleTone = isFromClient
    ? 'bg-[var(--paper-dim)] text-[var(--ink)]'
    : isFromProfessional
      ? 'bg-[var(--ink)] text-[var(--paper)]'
      : 'bg-[var(--accent)]/20 text-[var(--ink)]';
  const label = isFromClient ? 'Cliente' : isFromProfessional ? 'Você' : 'Doopla';

  return (
    <div className={`flex flex-col gap-1 ${align}`}>
      <p className="font-doopla-mono text-[10px] uppercase tracking-[.06em] text-[var(--ink)]/45">
        {label} · {formatRelativeDate(message.createdAt)}
        {message.preparedResponseOutcome === 'sent' && ' · Você respondeu'}
        {message.preparedResponseOutcome === 'edited' && ' · Você editou o rascunho antes de enviar'}
      </p>
      <p className={`inline-block max-w-[85%] rounded-[16px] px-4 py-2.5 text-sm whitespace-pre-wrap ${bubbleTone}`}>
        {message.contentType === 'text' ? (message.body ?? '') : (message.transcript ?? `[${message.contentType}]`)}
      </p>
    </div>
  );
}
