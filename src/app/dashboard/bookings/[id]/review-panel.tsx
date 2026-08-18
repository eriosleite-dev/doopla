'use client';

import { useActionState, useState } from 'react';

import { contestReviewAction, requestReviewAction, submitReviewAction } from '../../actions';
import { reviewAttributesFor, labelForAttribute } from '../../review-attributes';
import { accentButtonClass, eyebrowClass, ghostButtonClass } from '../../ui';
import type { Review } from '@/lib/supabase/types';

function Stars({ rating }: { rating: number }) {
  return (
    <span className="font-doopla-display text-lg text-[var(--accent-ink)]">
      {'★'.repeat(rating)}
      <span className="text-[var(--ink)]/20">{'★'.repeat(5 - rating)}</span>
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
          className="font-doopla-display text-2xl leading-none"
          style={{ color: n <= value ? 'var(--accent-ink)' : 'var(--ink)' }}
          aria-label={`${n} estrelas`}
        >
          <span className={n <= value ? '' : 'opacity-20'}>★</span>
        </button>
      ))}
    </div>
  );
}

function ReviewForm({
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
    setAttributes((prev) =>
      prev.includes(key) ? prev.filter((a) => a !== key) : [...prev, key]
    );
  }

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      <input type="hidden" name="reviewId" value={review.id} />
      <input type="hidden" name="rating" value={rating} />
      {attributes.map((a) => (
        <input key={a} type="hidden" name="attributes" value={a} />
      ))}

      <div>
        <p className="text-sm text-[var(--ink)]/70">Como foi trabalhar com {otherPartyName}?</p>
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
                  ? 'border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]'
                  : 'border-[var(--line-light)] text-[var(--ink)]/60'
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
        className="rounded-[14px] border border-[var(--line-light)] bg-white px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
      />

      {state.error && <p className="text-sm text-red-700">{state.error}</p>}

      <div>
        <button type="submit" disabled={pending || rating === 0} className={accentButtonClass}>
          {pending ? 'Enviando…' : review.status === 'ativa' ? 'Salvar edição' : 'Enviar avaliação'}
        </button>
      </div>
    </form>
  );
}

export function ReviewPanel({
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
        <ReviewForm review={myReview} revieweeRole={otherRole} otherPartyName={otherPartyName} />
      )}
      {myReview && myReview.status === 'ativa' && !myEditWindowOpen && (
        <div>
          <p className="text-sm text-[var(--ink)]/70">Sua avaliação sobre {otherPartyName}:</p>
          <div className="mt-2 flex items-center gap-2">
            {myReview.rating != null && <Stars rating={myReview.rating} />}
          </div>
          {myReview.comment && (
            <p className="mt-2 text-sm text-[var(--ink)]/70">&ldquo;{myReview.comment}&rdquo;</p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--line-light)] pt-6">
        <p className={eyebrowClass}>Avaliação de {otherPartyName} sobre você</p>
        {!reviewOfMe && (
          <p className="mt-2 text-sm text-[var(--ink)]/55">Ainda não disponível.</p>
        )}
        {reviewOfMe?.status === 'pendente' && (
          <div className="mt-2 flex items-center gap-3">
            <span className="text-sm text-[var(--ink)]/60">
              {reviewOfMe.requested_at ? 'Solicitação enviada ✓' : 'Aguardando avaliação'}
            </span>
            {!reviewOfMe.requested_at && (
              <form action={requestReviewAction}>
                <input type="hidden" name="reviewId" value={reviewOfMe.id} />
                <button type="submit" className={ghostButtonClass}>
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
                    className="font-doopla-mono rounded-full bg-[var(--musgo)]/10 px-2.5 py-1 text-[10px] uppercase tracking-[.03em] text-[var(--musgo)]"
                  >
                    {labelForAttribute(myRole, key)}
                  </span>
                ))}
              </div>
            )}
            {reviewOfMe.comment && (
              <p className="text-sm text-[var(--ink)]/70">&ldquo;{reviewOfMe.comment}&rdquo;</p>
            )}
            {reviewOfMe.contested ? (
              <p className="text-[12px] text-[var(--ink)]/45">Contestação enviada, em análise.</p>
            ) : (
              <form action={contestReviewAction}>
                <input type="hidden" name="reviewId" value={reviewOfMe.id} />
                <button
                  type="submit"
                  className="font-doopla-mono text-left text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/40 underline"
                >
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
