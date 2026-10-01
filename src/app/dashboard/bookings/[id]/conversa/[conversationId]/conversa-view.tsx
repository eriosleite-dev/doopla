import { notFound } from 'next/navigation';

import { formatRelativeDate } from '@/lib/format';
import {
  getConversationMessages,
  getConversationOperationalFacts,
  getExternalParticipant,
  getPendingDraftForConversation,
  type ConversationMessage,
} from '@/lib/conversations/data';
import { getPendingReplyBlockReason } from '@/lib/decisions/data';

import { decisionBlockReasonLabel } from '../../../../decisoes/format-cards';
import { getSessionProfile } from '../../../../session';
import { PRO_CONVERSATION_STATE_TONE, proStatusPillClass } from '../../../../pro-format';
import { CONVERSATION_STATE_LABELS } from '../../../../ui';
import { DraftReviewPanel } from './draft-review-panel';
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

  // Decisões isolado (achado de QA, 01/10/2026) — sem rascunho pronto
  // mas com um pending_reply real (o Approval Engine pausou esperando
  // uma decisão), busca o blockReason real (mesma fonte de
  // Home/Bookings) pra explicar O QUE a Doopla precisa, em vez de só
  // "Responder" genérico. Só busca quando faz sentido: nunca nos casos
  // com draft (já tem sua própria explicação) nem conversa fechada.
  const blockReason =
    !draft && !conversationClosed && facts.hasPendingRuntimeReply
      ? await getPendingReplyBlockReason(supabase, conversationId)
      : null;

  // Hierarquia de revisão de rascunho (01/10/2026, pedido da
  // fundadora) — quando existe um rascunho pronto pra revisar
  // (draft != null, mesmo sinal que já classificava 'prepared_draft'
  // em lib/decisions/data.ts), a tela deixa de parecer uma janela de
  // conversa genérica e vira uma AÇÃO: título/subtítulo de revisão, o
  // rascunho como elemento principal (editável), a conversa anterior
  // só como contexto compacto. Sem rascunho (conversa comum ou
  // pending_reply sem draft), layout de sempre, intocado.
  if (draft && !conversationClosed) {
    const recentMessages = messages.slice(-2);
    return (
      <div className="flex flex-col gap-5 rounded-[24px] bg-[var(--pro-panel-solid)] p-6 sm:p-7">
        <header>
          <p className="font-doopla-mono text-[10.5px] font-bold uppercase tracking-[.08em] text-[var(--pro-red)]">
            Revisão pendente
          </p>
          <h2 className="font-pro-sub mt-1 text-[18px] font-bold text-[var(--pro-off)] sm:text-[19px]">
            Revise esta resposta antes de enviar
          </h2>
          <p className="mt-1 text-[12.5px] text-[var(--pro-tx-50)]">A Doopla precisa da sua aprovação antes de responder ao cliente.</p>
        </header>

        {recentMessages.length > 0 && (
          <section>
            <p className="font-doopla-mono mb-1.5 text-[9.5px] uppercase tracking-[.06em] text-[var(--pro-tx-30)]">
              Conversa recente — {title}
            </p>
            <div className="flex max-h-[150px] flex-col gap-2 overflow-y-auto rounded-[14px] border border-[var(--pro-line)] bg-white/[0.02] p-3">
              {recentMessages.map((message) => (
                <CompactMessage key={message.id} message={message} />
              ))}
            </div>
          </section>
        )}

        <DraftReviewPanel conversationId={conversationId} draft={draft} clientName={title} />
      </div>
    );
  }

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

      {!conversationClosed && facts.hasPendingRuntimeReply && (
        <div className="rounded-[14px] border border-[var(--pro-line)] bg-white/[0.02] p-4">
          <p className="font-doopla-mono text-[10px] uppercase tracking-[.06em] text-[var(--pro-tx-30)]">O que a Doopla precisa</p>
          <p className="mt-1 text-[13px] text-[var(--pro-tx-70)]">{decisionBlockReasonLabel(blockReason)}</p>
        </div>
      )}

      {!conversationClosed && <ReplyForm conversationId={conversationId} draft={draft} />}
    </div>
  );
}

// Versão compacta de MessageBubble, só pro contexto "Conversa recente"
// da revisão de rascunho — mesmos dados, texto truncado em 2 linhas,
// sem o selo "Você respondeu/editou" (não cabe nem faz sentido aqui:
// esse selo é sobre uma mensagem JÁ enviada, e o rascunho em revisão
// ainda não foi).
function CompactMessage({ message }: { message: ConversationMessage }) {
  const isFromProfessional = message.authorType === 'professional';
  const isFromClient = message.authorType === 'external_participant';
  const align = isFromProfessional ? 'items-end text-right' : 'items-start text-left';
  const label = isFromClient ? 'Cliente' : isFromProfessional ? 'Você' : 'Doopla';

  return (
    <div className={`flex flex-col gap-0.5 ${align}`}>
      <p className="font-doopla-mono text-[9px] uppercase tracking-[.05em] text-[var(--pro-tx-45)]">{label}</p>
      <p className="line-clamp-2 max-w-[90%] text-[12px] leading-snug text-[var(--pro-tx-70)]">
        {message.contentType === 'text' ? (message.body ?? '') : (message.transcript ?? `[${message.contentType}]`)}
      </p>
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
