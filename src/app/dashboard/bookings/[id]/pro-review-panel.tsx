'use client';

import { useActionState, useState } from 'react';

import { contestReviewAction, requestReviewAction, submitReviewAction } from '../../actions';
import { reviewAttributesFor, labelForAttribute } from '../../review-attributes';
import { proGhostButtonClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';
import type { Review } from '@/lib/supabase/types';

// Pro re-skin (Bloco 7, P1) de ReviewPanel — mesma action/lógica, só o
// tema --pro-*. Ver review-panel.tsx (legado, Booker) pra comparação.

function Stars({ rating }: { rating: number }) {
  return (
    <span className="font-pro-display text-lg text-[var(--pro-amber)]">
      {'★'.repeat(rating)}
      <span className="text-[var(--pro-tx-30)]">{'★'.repeat(5 - rating)}</span>
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="font-pro-display text-2xl leading-none"
          style={{ color: n <= value ? 'var(--pro-amber)' : 'var(--pro-tx-30)' }}
          aria-label={`${n} estrelas`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function ProReviewForm({
  review,
  revieweeRole,
  otherPartyName,
}: {
  review: Review;
  revieweeRole: 'artista' | 'booker';
  otherPartyName: string;
}) {
  const [state, formAction, pending] = useActionState(submitReviewAction, {});
  const [rating, setRating] = useState(review.rating ?? 0);
  const [attributes, setAttributes] = useState<string[]>(review.attributes ?? []);
  const attributeOptions = reviewAttributesFor(revieweeRole);

  function toggleAttribute(key: string) {
    setAttributes((prev) => (prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]));
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="reviewId" value={review.id} />
      <input type="hidden" name="rating" value={rating} />
      {attributes.map((a) => (
        <input key={a} type="hidden" name="attributes" value={a} />
      ))}

      <div>
        <p className="text-sm text-[var(--pro-tx-70)]">Como foi trabalhar com {otherPartyName}?</p>
        <div className="mt-2">
          <StarPicker value={rating} onChange={setRating} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {attributeOptions.map((attr) => {
          const active = attributes.includes(attr.key);
          return (
            <button
              key={attr.key}
              type="button"
              onClick={() => toggleAttribute(attr.key)}
              className={`font-doopla-mono rounded-full border px-3 py-2 text-[11px] uppercase tracking-[.03em] ${
                active
                  ? 'border-[var(--pro-red)] bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                  : 'border-[var(--pro-line)] text-[var(--pro-tx-50)]'
              }`}
            >
              {attr.icon} {attr.label}
            </button>
          );
        })}
      </div>

      <textarea
        name="comment"
        defaultValue={review.comment ?? ''}
        placeholder="Comentário opcional"
        rows={3}
        maxLength={400}
        className="rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] px-4 py-3 text-sm text-[var(--pro-off)] outline-none placeholder:text-[var(--pro-tx-30)] focus:border-[var(--pro-tx-30)]"
      />

      {state.error && <p className="text-sm text-[#ff8b80]">{state.error}</p>}

      <div>
        <button type="submit" disabled={pending || rating === 0} className={proPrimaryButtonClass}>
          {pending ? 'Enviando…' : review.status === 'ativa' ? 'Salvar edição' : 'Enviar avaliação'}
        </button>
      </div>
    </form>
  );
}

export function ProReviewPanel({
  myReview,
  reviewOfMe,
  myRole,
  otherPartyName,
}: {
  myReview: Review | null;
  reviewOfMe: Review | null;
  myRole: 'artista' | 'booker';
  otherPartyName: string;
}) {
  const otherRole = myRole === 'artista' ? 'booker' : 'artista';
  const [myEditWindowOpen] = useState(() =>
    myReview?.status === 'ativa' && myReview.submitted_at
      ? Date.now() - new Date(myReview.submitted_at).getTime() < 24 * 60 * 60 * 1000
      : true
  );

  return (
    <div className="flex flex-col gap-6">
      {myReview && (myReview.status === 'pendente' || (myReview.status === 'ativa' && myEditWindowOpen)) && (
        <ProReviewForm review={myReview} revieweeRole={otherRole} otherPartyName={otherPartyName} />
      )}
      {myReview && myReview.status === 'ativa' && !myEditWindowOpen && (
        <div>
          <p className="text-sm text-[var(--pro-tx-70)]">Sua avaliação sobre {otherPartyName}:</p>
          <div className="mt-2 flex items-center gap-2">
            {myReview.rating != null && <Stars rating={myReview.rating} />}
          </div>
          {myReview.comment && <p className="mt-2 text-sm text-[var(--pro-tx-70)]">&ldquo;{myReview.comment}&rdquo;</p>}
        </div>
      )}

      <div className="border-t border-[var(--pro-line)] pt-6">
        <p className={proLabelClass}>Avaliação de {otherPartyName} sobre você</p>
        {!reviewOfMe && <p className="mt-2 text-sm text-[var(--pro-tx-50)]">Ainda não disponível.</p>}
        {reviewOfMe?.status === 'pendente' && (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-[var(--pro-tx-50)]">
              {reviewOfMe.requested_at ? 'Solicitação enviada ✓' : 'Aguardando avaliação'}
            </span>
            {!reviewOfMe.requested_at && (
              <form action={requestReviewAction}>
                <input type="hidden" name="reviewId" value={reviewOfMe.id} />
                <button type="submit" className={proGhostButtonClass}>
                  Pedir avaliação
                </button>
              </form>
            )}
          </div>
        )}
        {reviewOfMe?.status === 'ativa' && (
          <div className="mt-2 flex flex-col gap-2">
            {reviewOfMe.rating != null && <Stars rating={reviewOfMe.rating} />}
            {reviewOfMe.attributes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {reviewOfMe.attributes.map((key) => (
                  <span
                    key={key}
                    className="font-doopla-mono rounded-full bg-[var(--pro-green)]/10 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--pro-green)]"
                  >
                    {labelForAttribute(myRole, key)}
                  </span>
                ))}
              </div>
            )}
            {reviewOfMe.comment && <p className="text-sm text-[var(--pro-tx-70)]">&ldquo;{reviewOfMe.comment}&rdquo;</p>}
            {reviewOfMe.contested ? (
              <p className="text-[12px] text-[var(--pro-tx-30)]">Contestação enviada, em análise.</p>
            ) : (
              <form action={contestReviewAction}>
                <input type="hidden" name="reviewId" value={reviewOfMe.id} />
                <button type="submit" className="font-doopla-mono text-left text-[11px] uppercase tracking-[.05em] text-[var(--pro-tx-30)] underline hover:text-[var(--pro-tx-50)]">
                  Contestar avaliação
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
