'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { comparePreparedResponseText } from '@/lib/beta-integration/prepared-response';
import type { PendingDraft } from '@/lib/conversations/data';

import { sendProfessionalReplyAction, type ProfessionalReplyActionResult } from '../../../../professional-reply-action';
import { proGhostButtonClass, proPrimaryButtonClass } from '../../../../pro-format';

// Hierarquia de revisão de rascunho (01/10/2026, pedido da fundadora)
// — só apresentação/copy, passa pelo MESMO boundary de envio de
// ReplyForm (sendProfessionalReplyAction -> submitProfessionalReply),
// nenhuma mudança de backend/fluxo de envio. Componente separado de
// ReplyForm (não um branch dentro dele) de propósito: os dois casos
// têm hierarquias visuais genuinamente diferentes — aqui o rascunho da
// Doopla É a tela (ação de revisão/aprovação); em ReplyForm é
// "responder" genérico (sem rascunho, ou pending_reply sem draft
// pronto) — um componente só com os dois virava um emaranhado de
// condicionais nunca pedido.
export function DraftReviewPanel({
  conversationId,
  draft,
  clientName,
}: {
  conversationId: string;
  draft: PendingDraft;
  clientName: string;
}) {
  const router = useRouter();
  const [body, setBody] = useState(draft.content);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ProfessionalReplyActionResult | null>(null);
  const [sent, setSent] = useState(false);

  const edited = body.trim().length > 0 && comparePreparedResponseText(draft.content, body) === 'edited';

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    setResult(null);
    const res = await sendProfessionalReplyAction({
      conversationId,
      submissionId: crypto.randomUUID(),
      body,
      outboundIntentId: draft.id,
    });
    setSending(false);
    setResult(res);
    if (res.kind !== 'action_error' && res.kind !== 'conversation_busy' && res.kind !== 'author_mismatch' && res.kind !== 'failed') {
      setSent(true);
    }
  }

  // Confirmação explícita pós-envio (pedido da fundadora: "mostrar
  // confirmação clara de que a resposta foi enviada e que a Doopla
  // continua a conversa") — nunca mais um reset silencioso pro
  // formulário vazio. router.refresh() só acontece quando a pessoa
  // escolhe voltar, puxando a thread já com a mensagem enviada.
  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[16px] border border-[var(--pro-line)] bg-white/[0.03] px-6 py-7 text-center">
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[var(--pro-green)]/15 text-[var(--pro-green)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <p className="font-pro-sub text-[14px] font-bold text-[var(--pro-off)]">Resposta enviada</p>
          <p className="mt-1 max-w-[300px] text-[12px] leading-relaxed text-[var(--pro-tx-50)]">
            A Doopla já mandou pra {clientName} e continua a conversa a partir daqui.
          </p>
        </div>
        <button type="button" onClick={() => router.refresh()} className={proGhostButtonClass}>
          Voltar à conversa
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-doopla-mono text-[10px] uppercase tracking-[.06em] text-[var(--pro-tx-30)]">
        Rascunho da Doopla — pode editar antes de enviar
      </span>
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={5}
        className="w-full resize-y rounded-[14px] border border-[var(--pro-line)] bg-white/[0.04] px-4 py-3 text-sm text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)] focus:border-[var(--pro-tx-30)]"
      />
      {edited && <p className="text-[11.5px] text-[var(--pro-tx-50)]">Você editou o rascunho da Doopla.</p>}
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSend} disabled={sending || !body.trim()} className={proPrimaryButtonClass}>
          {sending ? 'Enviando…' : 'Enviar resposta'}
        </button>
        {/* "Agora não" (pedido da fundadora: o X não pode ser a ÚNICA
           forma explícita de não enviar) — mesma ação de sair que o X
           do modal já faz (router.back()), só com um rótulo que nomeia
           a decisão em vez de só "fechar". */}
        <button type="button" onClick={() => router.back()} className={proGhostButtonClass}>
          Agora não
        </button>
      </div>
      {result?.kind === 'action_error' && <p className="text-sm text-[#ff8b80]">{result.error}</p>}
      {result?.kind === 'conversation_busy' && (
        <p className="text-sm text-[#ff8b80]">A conversa está sendo processada agora — tente de novo em instantes.</p>
      )}
      {result?.kind === 'author_mismatch' && <p className="text-sm text-[#ff8b80]">Não foi possível confirmar sua identidade nesta conversa.</p>}
      {result?.kind === 'failed' && <p className="text-sm text-[#ff8b80]">Algo deu errado ao processar sua resposta. Tente de novo.</p>}
    </div>
  );
}
