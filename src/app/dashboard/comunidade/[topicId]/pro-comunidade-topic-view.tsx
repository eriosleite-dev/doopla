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

type TrackedMention = { profileId: string; displayName: string; insertedText: string };
type MentionQuery = { start: number; query: string };

// Onde está o "@" ativo (se houver) relativo ao cursor: precisa estar
// no início de uma palavra (início do texto ou precedido de espaço) e
// sem espaço entre o "@" e o cursor — senão não é um contexto de
// menção em andamento (ex.: e-mail digitado, ou "@" de uma menção já
// fechada por um espaço).
function detectMentionQuery(value: string, caret: number): MentionQuery | null {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf('@');
  if (at === -1) return null;
  const before = at === 0 ? '' : upToCaret[at - 1];
  if (before && !/\s/.test(before)) return null;
  const between = upToCaret.slice(at + 1);
  if (/\s/.test(between)) return null;
  return { start: at, query: between };
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

// Correção de UX das menções (08/09/2026) — a versão anterior mostrava
// toggles @Nome permanentemente abaixo do composer. Trocado por
// autocomplete real (digitar "@" → sugestões → selecionar), sem
// nenhuma lista visível quando não há "@" ativo. Universo de
// candidatos inalterado (mentionCandidates, participantes já
// carregados pela página).
//
// Associação texto <-> profile_id (o ponto sensível desta correção):
// cada seleção do autocomplete vira um TrackedMention { profileId,
// displayName, insertedText } — nunca inferimos identidade lendo
// "@palavra" do texto. No submit, computeSurvivingMentionIds conta
// quantas vezes o literal insertedText ("@Nome ", exatamente o que foi
// inserido) ainda existe no texto atual e só mantém, na ordem em que
// foram selecionadas, tantas menções daquele nome quantas ocorrências
// sobraram — apagar o "@Nome " do texto derruba a menção estruturada
// correspondente; editar em volta sem tocar no literal não afeta nada.
// Isso é uma correspondência por texto literal, não uma associação
// posicional real (um editor rico com tokens seria o jeito
// definitivo, mas é exatamente a complexidade que este composer evita
// de propósito) — o único caso ambíguo remanescente é duas pessoas
// DIFERENTES com o mesmo nome de exibição, ambas mencionadas, com só
// uma das ocorrências apagada: sobra uma menção (nunca as duas, nunca
// nenhuma), mas não há garantia de qual delas — mesma ambiguidade que
// um leitor humano teria olhando só pro texto.
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
  const listboxId = useId();
  const wasPendingRef = useRef(false);
  const mentionedRef = useRef<TrackedMention[]>([]);
  const hiddenMentionsRef = useRef<HTMLDivElement | null>(null);
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Textarea é não-controlada (defaultValue) de propósito — reset
  // nativo de formulário já limparia sozinho, mas como reply-to/
  // mentions são estado React à parte, este efeito sincroniza os três
  // juntos assim que a submissão termina com sucesso (transição
  // pending: true -> false sem erro).
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      if (textareaRef.current) textareaRef.current.value = '';
      mentionedRef.current = [];
      if (hiddenMentionsRef.current) hiddenMentionsRef.current.replaceChildren();
      setMentionQuery(null);
      onCancelReply();
    }
    wasPendingRef.current = pending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state]);

  const suggestions = mentionQuery
    ? mentionCandidates.filter((c) => c.displayName.toLocaleLowerCase('pt-BR').includes(mentionQuery.query.toLocaleLowerCase('pt-BR'))).slice(0, 6)
    : [];

  function selectMention(candidate: MentionCandidate) {
    const el = textareaRef.current;
    if (!el || !mentionQuery) return;
    const insertion = `@${candidate.displayName} `;
    const value = el.value;
    el.value = value.slice(0, mentionQuery.start) + insertion + value.slice(mentionQuery.start + 1 + mentionQuery.query.length);
    const caret = mentionQuery.start + insertion.length;
    el.focus();
    el.setSelectionRange(caret, caret);
    // Cada seleção vira uma entrada própria, na ordem em que
    // aconteceu — nunca inferida depois lendo o texto.
    mentionedRef.current = [...mentionedRef.current, { profileId: candidate.profileId, displayName: candidate.displayName, insertedText: insertion }];
    setMentionQuery(null);
  }

  function handleTextareaChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = event.target;
    setMentionQuery(detectMentionQuery(el.value, el.selectionStart ?? el.value.length));
    setActiveIndex(0);
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionQuery) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      setMentionQuery(null);
      return;
    }
    if (suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      selectMention(suggestions[activeIndex] ?? suggestions[0]);
    }
  }

  function handleFormSubmit() {
    // Recalcula na hora do submit, direto no DOM (nunca via re-render
    // de estado React, que não teria garantia de terminar antes do
    // FormData do form action ser montado) — só o container próprio,
    // nunca tocado pelo React em nenhum outro momento, garante que o
    // valor final seja exatamente o computado aqui.
    const container = hiddenMentionsRef.current;
    const text = textareaRef.current?.value ?? '';
    if (!container) return;
    container.replaceChildren();
    const totalByText = new Map<string, number>();
    const claimedByText = new Map<string, number>();
    const survivors: string[] = [];
    for (const m of mentionedRef.current) {
      if (survivors.includes(m.profileId)) continue;
      if (!totalByText.has(m.insertedText)) totalByText.set(m.insertedText, countOccurrences(text, m.insertedText));
      const claimed = claimedByText.get(m.insertedText) ?? 0;
      if (claimed < (totalByText.get(m.insertedText) ?? 0)) {
        survivors.push(m.profileId);
        claimedByText.set(m.insertedText, claimed + 1);
      }
    }
    for (const profileId of survivors) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = 'mentionedProfileIds';
      input.value = profileId;
      container.appendChild(input);
    }
  }

  return (
    <form
      action={formAction}
      onSubmit={handleFormSubmit}
      className="flex flex-col gap-2.5 border-t border-[var(--pro-line)] pt-4"
    >
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
      {/* Nunca recebe children via JSX — só handleFormSubmit escreve
         aqui, direto no DOM, na hora do envio. */}
      <div ref={hiddenMentionsRef} hidden />

      <div className="relative">
        <label htmlFor={fieldId} className="sr-only">
          Escrever uma resposta
        </label>
        <textarea
          id={fieldId}
          ref={textareaRef}
          name="body"
          rows={3}
          placeholder="Escreva sua resposta… (@ para mencionar alguém da conversa)"
          className={`${proInputClass} resize-y`}
          required
          onChange={handleTextareaChange}
          onKeyDown={handleTextareaKeyDown}
          onBlur={() => setMentionQuery(null)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mentionQuery !== null}
          aria-controls={listboxId}
        />

        {mentionQuery && mentionCandidates.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
            aria-label="Sugestões de menção"
            className="absolute inset-x-0 top-full z-10 mt-1 max-h-[180px] overflow-y-auto rounded-[10px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,.35)]"
          >
            {suggestions.length === 0 ? (
              <p className="px-2.5 py-1.5 text-[11.5px] text-[var(--pro-tx-30)]">Nenhum participante encontrado.</p>
            ) : (
              suggestions.map((candidate, i) => (
                <button
                  key={candidate.profileId}
                  type="button"
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMention(candidate);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`block w-full rounded-[8px] px-2.5 py-1.5 text-left text-[12.5px] ${
                    i === activeIndex ? 'bg-white/[0.06] text-[var(--pro-off)]' : 'text-[var(--pro-tx-70)]'
                  }`}
                >
                  @{candidate.displayName}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}
      <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-end`}>
        {pending ? 'Enviando…' : 'Responder'}
      </button>
    </form>
  );
}
