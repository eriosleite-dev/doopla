'use client';

import { Fragment, useActionState, useEffect, useId, useRef, useState } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../../pro-format';
import { createReplyAction } from '../actions';

export type ChatTimelineMessage = {
  id: string;
  // null = mensagem de abertura do tópico (nunca "respondível" — não
  // existe coluna equivalente a reply_to_post_id que aponte pro
  // tópico em si, só entre community_posts). Um valor aqui é sempre
  // um post.id real.
  postId: string | null;
  authorName: string;
  timeLabel: string;
  body: string;
  removed: boolean;
  removedLabel: string;
  replyTo: { postId: string; authorName: string; snippet: string; removed: boolean } | null;
  mentionedNames: string[];
};

export type MentionCandidate = { profileId: string; displayName: string };

type ReplyTarget = { postId: string; authorName: string; snippet: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Menções são estruturadas no backend (community_mentions: post_id ->
// profile_id, nunca parsing de texto) — mas pra destacar "@Nome" no
// corpo já publicado, aqui na apresentação, é seguro procurar o
// literal "@DisplayName" porque é exatamente o que o composer insere
// (ver insertMentionText abaixo). Nomes escapados antes de virar
// regex — só dado confiável (community_profiles_public), mas nunca
// custa tratar caractere especial em nome próprio (ex.: "D'Ávila").
function renderBodyWithMentions(body: string, mentionedNames: string[]) {
  if (mentionedNames.length === 0) return body;
  const pattern = new RegExp(`(@(?:${mentionedNames.map(escapeRegExp).join('|')}))`, 'g');
  return body.split(pattern).map((part, i) =>
    part.startsWith('@') && mentionedNames.includes(part.slice(1)) ? (
      <span key={i} className="font-semibold text-[var(--pro-off)]">
        {part}
      </span>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

function snippetOf(body: string, max = 80): string {
  const trimmed = body.trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

// Item 4 (08/09/2026) — reply-to + mentions sobre o vínculo REAL já
// existente desde a migration 0059 (community_posts.reply_to_post_id,
// community_mentions, create_community_post já aceitava os dois
// parâmetros — só a UI nunca os usava). Lista de mensagens e composer
// moram no mesmo client component porque precisam compartilhar o
// estado "a quem estou respondendo agora" — nenhuma mensagem nova de
// dado, tudo já resolvido em page.tsx (Server Component) e só passado
// pronto pra cá.
//
// Ir até a mensagem original (clique na citação) usa uma âncora nativa
// (<a href="#msg-ID">) — todas as mensagens do tópico já estão
// montadas no DOM (Item 5/paginação ainda não existe), então isso
// funciona sem nenhuma infraestrutura nova. Quando a paginação/scroll
// do Item 5 existir, uma mensagem citada pode não estar montada ainda
// — limite consciente, não resolvido aqui.
export function ProComunidadeTopicChat({
  topicId,
  timeline,
  mentionCandidates,
  topicRemoved,
}: {
  topicId: string;
  timeline: ChatTimelineMessage[];
  mentionCandidates: MentionCandidate[];
  topicRemoved: boolean;
}) {
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  function handleReply(target: ReplyTarget) {
    setReplyTarget(target);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <>
      <div className="divide-y divide-[var(--pro-line)]">
        {timeline.map((message) => (
          <div key={message.id} id={`msg-${message.id}`} className="py-3 first:pt-0">
            {message.replyTo && (
              <a
                href={`#msg-${message.replyTo.postId}`}
                className="mb-1.5 block rounded-[8px] border-l-2 border-[var(--pro-line)] bg-white/[0.02] py-1 pl-2.5 pr-2 text-[11px] text-[var(--pro-tx-30)] hover:border-[var(--pro-tx-30)]"
              >
                <span className="font-semibold text-[var(--pro-tx-50)]">{message.replyTo.authorName}</span>{' '}
                {message.replyTo.removed ? (
                  <span className="italic">Mensagem removida.</span>
                ) : (
                  <span className="italic">&ldquo;{message.replyTo.snippet}&rdquo;</span>
                )}
              </a>
            )}
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-pro-sub text-[12.5px] font-bold text-[var(--pro-off)]">{message.authorName}</span>
              <span className="font-doopla-mono text-[10px] text-[var(--pro-tx-30)]">{message.timeLabel}</span>
            </p>
            {message.removed ? (
              <p className="mt-1 text-[12.5px] italic text-[var(--pro-tx-30)]">{message.removedLabel}</p>
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--pro-tx-70)]">
                {renderBodyWithMentions(message.body, message.mentionedNames)}
              </p>
            )}
            {message.postId && !message.removed && (
              <button
                type="button"
                onClick={() =>
                  handleReply({
                    postId: message.postId as string,
                    authorName: message.authorName,
                    snippet: snippetOf(message.body),
                  })
                }
                className="mt-1 text-[11px] font-bold text-[var(--pro-tx-30)] hover:text-[var(--pro-red)]"
              >
                Responder
              </button>
            )}
          </div>
        ))}
      </div>

      {!topicRemoved && timeline.length <= 1 && (
        <p className="text-[12px] text-[var(--pro-tx-30)]">Nenhuma resposta ainda. Seja o primeiro a responder.</p>
      )}

      {!topicRemoved && (
        <ProComunidadeReplyForm
          topicId={topicId}
          replyTarget={replyTarget}
          onCancelReply={() => setReplyTarget(null)}
          mentionCandidates={mentionCandidates}
          textareaRef={textareaRef}
        />
      )}
    </>
  );
}

// O composer deixa de ser um <ProCard> flutuante e fecha a própria
// timeline com um separador fino. Reply-to e mentions se integram sem
// virar um editor complexo: um preview compacto e cancelável do alvo
// da resposta, e uma lista de toggles pra menção (nunca autocomplete
// digitado — os candidatos já são só os participantes desta conversa,
// já carregados pela página, zero busca nova).
function ProComunidadeReplyForm({
  topicId,
  replyTarget,
  onCancelReply,
  mentionCandidates,
  textareaRef,
}: {
  topicId: string;
  replyTarget: ReplyTarget | null;
  onCancelReply: () => void;
  mentionCandidates: MentionCandidate[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [state, formAction, pending] = useActionState(createReplyAction.bind(null, topicId), {});
  const fieldId = useId();
  const wasPendingRef = useRef(false);
  const [mentioned, setMentioned] = useState<MentionCandidate[]>([]);

  // Textarea é não-controlada (defaultValue) de propósito — reset
  // nativo de formulário já limparia sozinho, mas como reply-to/
  // mentions são estado React à parte, este efeito sincroniza os três
  // juntos assim que a submissão termina com sucesso (transição
  // pending: true -> false sem erro).
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      if (textareaRef.current) textareaRef.current.value = '';
      setMentioned([]);
      onCancelReply();
    }
    wasPendingRef.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  function insertMentionText(name: string) {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const insertion = `@${name} `;
    el.value = `${el.value.slice(0, start)}${insertion}${el.value.slice(end)}`;
    const caret = start + insertion.length;
    el.focus();
    el.setSelectionRange(caret, caret);
  }

  function toggleMention(candidate: MentionCandidate) {
    const el = textareaRef.current;
    setMentioned((prev) => {
      const exists = prev.some((m) => m.profileId === candidate.profileId);
      if (exists) {
        // Melhor esforço: remove o texto "@Nome " inserido ao marcar.
        // Se o usuário editou manualmente, isso vira um no-op inofensivo
        // — a menção sai da lista enviada de qualquer forma.
        if (el) el.value = el.value.replace(`@${candidate.displayName} `, '');
        return prev.filter((m) => m.profileId !== candidate.profileId);
      }
      if (prev.length >= 10) return prev;
      insertMentionText(candidate.displayName);
      return [...prev, candidate];
    });
  }

  return (
    <form action={formAction} className="flex flex-col gap-2.5 border-t border-[var(--pro-line)] pt-4">
      {replyTarget && (
        <div className="flex items-start justify-between gap-3 rounded-[10px] border-l-2 border-[var(--pro-red)] bg-white/[0.03] py-1.5 pl-3 pr-2">
          <p className="min-w-0 text-[11.5px] text-[var(--pro-tx-50)]">
            Respondendo a <span className="font-bold text-[var(--pro-tx-70)]">{replyTarget.authorName}</span>:{' '}
            <span className="italic">&ldquo;{replyTarget.snippet}&rdquo;</span>
          </p>
          <button
            type="button"
            onClick={onCancelReply}
            aria-label="Cancelar resposta"
            className="flex-none text-[12px] font-bold text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>
        </div>
      )}
      <input type="hidden" name="replyToPostId" value={replyTarget?.postId ?? ''} />
      {mentioned.map((m) => (
        <input key={m.profileId} type="hidden" name="mentionedProfileIds" value={m.profileId} />
      ))}

      <label htmlFor={fieldId} className="sr-only">
        Escrever uma resposta
      </label>
      <textarea
        id={fieldId}
        ref={textareaRef}
        name="body"
        rows={3}
        placeholder="Escreva sua resposta…"
        className={`${proInputClass} resize-y`}
        required
      />

      {mentionCandidates.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-[var(--pro-tx-30)]">Mencionar:</span>
          {mentionCandidates.map((candidate) => {
            const active = mentioned.some((m) => m.profileId === candidate.profileId);
            return (
              <button
                key={candidate.profileId}
                type="button"
                onClick={() => toggleMention(candidate)}
                aria-pressed={active}
                className={`font-doopla-mono rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[.03em] transition-colors ${
                  active
                    ? 'border-[var(--pro-red)] bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                    : 'border-[var(--pro-line)] text-[var(--pro-tx-50)] hover:border-[var(--pro-tx-30)]'
                }`}
              >
                @{candidate.displayName}
              </button>
            );
          })}
        </div>
      )}

      {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-end`}>
        {pending ? 'Enviando…' : 'Responder'}
      </button>
    </form>
  );
}
