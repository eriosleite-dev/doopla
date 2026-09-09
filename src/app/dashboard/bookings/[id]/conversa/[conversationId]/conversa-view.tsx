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
import { PRO_CONVERSATION_STATE_TONE, proStatusPillClass } from '../../../../pro-format';
import { CONVERSATION_STATE_LABELS } from '../../../../ui';
import { ReplyForm } from './reply-form';

function conversationStatePill(state: string): string {
  return proStatusPillClass(PRO_CONVERSATION_STATE_TONE[state] ?? 'neutral');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Conversas Bloco 2 — conteúdo real da tela de conversa, compartilhado
// entre a rota normal (bookings/[id]/conversa/[conversationId]/page.tsx),
// a rota standalone (conversas/[conversationId]/page.tsx) e as duas
// rotas @modal correspondentes — mesmo padrão já usado por
// avaliar-view.tsx. Nenhuma lógica de posse/RLS nova: getSessionProfile()
// já entrega um client autenticado como cookie, e src/lib/conversations/
// data.ts só lê o que RLS já deixa (ou devolve null/vazio — nunca um
// erro que vazasse existência de conversa de outro profissional).
//
// Re-skin --pro-* (Bloco 7, P1, 08/09/2026): esta tela só é alcançável
// por quem a Doopla representa (sempre o artista — RLS de
// getConversationOperationalFacts nunca devolve dado real pra um
// booker), então, diferente de Booking Detail, nunca precisou de
// branch por role — sempre o tema atual, sem view legada paralela.
// Fundo/cantos arredondados agora vivem AQUI (não nos 4 wrappers que
// renderizam este componente), pra funcionar igual dentro do
// ProfileModal (fundo claro, fora de escopo desta rodada) e das rotas
// normais sem duplicar estilo em cada page.tsx.
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
    <div className="flex flex-col gap-6 rounded-[24px] bg-[var(--pro-panel-solid)] p-7 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="font-pro-sub flex h-11 w-11 flex-none items-center justify-center rounded-full bg-white/10 text-[13px] font-bold text-[var(--pro-off)]">
            {initials(title)}
          </span>
          <div>
            <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Conversa</p>
            <p className="text-[15px] font-semibold text-[var(--pro-off)]">{title}</p>
          </div>
        </div>
        <span className={conversationStatePill(facts.state)}>{CONVERSATION_STATE_LABELS[facts.state]}</span>
      </header>

      <section className="flex max-h-[440px] flex-col gap-3 overflow-y-auto rounded-[18px] border border-[var(--pro-line)] bg-white/[0.02] p-5 backdrop-blur-xl">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--pro-tx-50)]">Nenhuma mensagem ainda.</p>
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
    ? 'bg-white/[0.06] text-[var(--pro-off)]'
    : isFromProfessional
      ? 'bg-[var(--pro-red)] text-[var(--pro-off)]'
      : 'bg-[var(--pro-amber)]/20 text-[var(--pro-off)]';
  const label = isFromClient ? 'Cliente' : isFromProfessional ? 'Você' : 'Doopla';

  return (
    <div className={`flex flex-col gap-1 ${align}`}>
      <p className="font-doopla-mono text-[10px] uppercase tracking-[.06em] text-[var(--pro-tx-45)]">
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
