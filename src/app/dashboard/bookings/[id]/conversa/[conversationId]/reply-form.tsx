'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { comparePreparedResponseText } from '@/lib/beta-integration/prepared-response';
import type { PendingDraft } from '@/lib/conversations/data';

import { sendProfessionalReplyAction, type ProfessionalReplyActionResult } from '../../../../professional-reply-action';
import { proGhostButtonClass, proPrimaryButtonClass } from '../../../../pro-format';

// Conversas Bloco 2 — passa pelo MESMO boundary do painel
// (sendProfessionalReplyAction -> submitProfessionalReply), nunca um
// caminho novo. Comparação draft x resposta AQUI é só preview de UX
// (comparePreparedResponseText, espelho não-autoritativo) — o fato
// real que fica gravado (prepared_response_outcome) é calculado
// server-side, dentro de persist_inbound_message (migration 0066),
// nunca por este componente.
//
// Re-skin --pro-* (Bloco 7, P1) — mesma lógica/estados/mensagens de
// erro, só o tema visual (ConversaView explica por que não há branch
// de role aqui).
export function ReplyForm({ conversationId, draft }: { conversationId: string; draft: PendingDraft | null }) {
  const router = useRouter();
  const [body, setBody] = useState(draft?.content ?? '');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ProfessionalReplyActionResult | null>(null);

  const editedPreview = draft && body.trim() ? comparePreparedResponseText(draft.content, body) === 'edited' : false;

  async function handleSend() {
    if (!body.trim() || sending) return;
    setSending(true);
    setResult(null);
    const res = await sendProfessionalReplyAction({
      conversationId,
      submissionId: crypto.randomUUID(),
      body,
      outboundIntentId: draft?.id ?? null,
    });
    setSending(false);
    setResult(res);
    if (res.kind !== 'action_error' && res.kind !== 'conversation_busy' && res.kind !== 'author_mismatch' && res.kind !== 'failed') {
      setBody('');
      router.refresh();
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[18px] border border-[var(--pro-line)] bg-white/[0.03] p-6">
      {draft ? (
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">
          Rascunho preparado pela Doopla — revise antes de enviar
        </p>
      ) : (
        <p className="font-doopla-mono text-[11px] uppercase tracking-[.08em] text-[var(--pro-tx-50)]">Responder</p>
      )}
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        placeholder="Escreva sua resposta…"
        className="w-full resize-y rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)] focus:border-[var(--pro-tx-30)]"
      />
      {editedPreview && <p className="text-[12px] text-[var(--pro-tx-50)]">Você está editando o rascunho antes de enviar.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSend} disabled={sending || !body.trim()} className={proPrimaryButtonClass}>
          {sending ? 'Enviando…' : 'Enviar resposta'}
        </button>
        {draft && body !== draft.content && (
          <button type="button" onClick={() => setBody(draft.content)} className={proGhostButtonClass}>
            Restaurar rascunho
          </button>
        )}
      </div>
      {result?.kind === 'action_error' && <p className="text-sm text-[#ff8b80]">{result.error}</p>}
      {result?.kind === 'conversation_busy' && (
        <p className="text-sm text-[#ff8b80]">A conversa está sendo processada agora — tente de novo em instantes.</p>
      )}
      {result?.kind === 'author_mismatch' && <p className="text-sm text-[#ff8b80]">Não foi possível confirmar sua identidade nesta conversa.</p>}
      {result?.kind === 'failed' && <p className="text-sm text-[#ff8b80]">Algo deu errado ao processar sua resposta. Tente de novo.</p>}
    </section>
  );
}
