'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { comparePreparedResponseText } from '@/lib/beta-integration/prepared-response';
import type { PendingDraft } from '@/lib/conversations/data';

import { sendProfessionalReplyAction, type ProfessionalReplyActionResult } from '../../../../professional-reply-action';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../../../../ui';

// Conversas Bloco 2 — passa pelo MESMO boundary do painel
// (sendProfessionalReplyAction -> submitProfessionalReply), nunca um
// caminho novo. Comparação draft x resposta AQUI é só preview de UX
// (comparePreparedResponseText, espelho não-autoritativo) — o fato
// real que fica gravado (prepared_response_outcome) é calculado
// server-side, dentro de persist_inbound_message (migration 0066),
// nunca por este componente.
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
    <section className="flex flex-col gap-3 rounded-[18px] bg-white p-6">
      {draft ? (
        <p className={eyebrowClass}>Rascunho preparado pela Doopla — revise antes de enviar</p>
      ) : (
        <p className={eyebrowClass}>Responder</p>
      )}
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={4}
        placeholder="Escreva sua resposta…"
        className="w-full resize-y rounded-[14px] border border-[var(--ink)]/15 bg-white px-4 py-3 text-sm"
      />
      {editedPreview && <p className="text-[12px] text-[var(--ink)]/55">Você está editando o rascunho antes de enviar.</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={handleSend} disabled={sending || !body.trim()} className={accentButtonClass}>
          {sending ? 'Enviando…' : 'Enviar resposta'}
        </button>
        {draft && body !== draft.content && (
          <button type="button" onClick={() => setBody(draft.content)} className={ghostButtonClass}>
            Restaurar rascunho
          </button>
        )}
      </div>
      {result?.kind === 'action_error' && <p className="text-sm text-red-700">{result.error}</p>}
      {result?.kind === 'conversation_busy' && (
        <p className="text-sm text-red-700">A conversa está sendo processada agora — tente de novo em instantes.</p>
      )}
      {result?.kind === 'author_mismatch' && <p className="text-sm text-red-700">Não foi possível confirmar sua identidade nesta conversa.</p>}
      {result?.kind === 'failed' && <p className="text-sm text-red-700">Algo deu errado ao processar sua resposta. Tente de novo.</p>}
    </section>
  );
}
