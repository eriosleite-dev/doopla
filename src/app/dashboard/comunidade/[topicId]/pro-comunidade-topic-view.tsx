'use client';

import { Fragment, useActionState, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useTransition } from 'react';

import { proInputClass, proPrimaryButtonClass } from '../../pro-format';
import { createReplyAction, loadEarlierCommunityPostsAction } from '../actions';
import { useComunidadeScrollAnchor } from '../navigation-guard';
import { snippetOf, type ChatTimelineMessage } from './timeline';

export type { ChatTimelineMessage };

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

// Caminha pelos ancestrais a partir de um nó qualquer dentro do painel
// até achar o elemento que realmente rola (o <aside> do slide-over do
// Item 1 quando renderizado dentro do modal; a própria página, via
// document.scrollingElement, na rota cheia de fallback/deep link sem
// interceptação). Nunca assume qual é — layout.tsx nunca precisa saber
// que este cálculo existe.
function getScrollContainer(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

type PendingPrependRestore = { container: HTMLElement | null; prevScrollHeight: number; prevScrollTop: number };

// Correção do Item 5 (08/09/2026, arquitetura C aprovada após
// auditoria) — a lista de mensagens é ESTADO DO CLIENT, semeada uma
// única vez a partir de initialMessages (a página mais RECENTE,
// resolvida em page.tsx) — nunca ressincronizada a partir de props
// depois disso. É por isso que createReplyAction (actions.ts) parou de
// dar revalidatePath nesta rota: um revalidate re-executaria o Server
// Component e devolveria de novo só a página mais recente, apagando
// qualquer página anterior que o client já tivesse carregado via
// "carregar mensagens anteriores".
//
// Direção trocada da v1 deste item (que carregava sempre do início pra
// frente): pousar sempre no começo do tópico não escalava pra
// conversas longas e exigiria essa mesma correção de scroll-anchor
// mais tarde de qualquer forma, quando o Item 12 (posição de leitura)
// chegasse — ver navigation-guard.tsx/layout.tsx. Nesta direção, o
// alvo de um reply-to pode legitimamente estar fora de QUALQUER página
// já carregada (uma resposta perto do fim pode citar algo lá do
// começo, ainda não buscado) — `loadedIds` abaixo decide, a cada
// render, se a citação vira link (`<a href="#msg-ID">`) ou só uma
// referência visual sem link, nunca um link quebrado.
export function ProComunidadeTopicChat({
  topicId,
  initialMessages,
  initialHasMore,
  currentProfileId,
  topicRemoved,
}: {
  topicId: string;
  initialMessages: ChatTimelineMessage[];
  // Nome herdado da v1 deste item — agora significa "há mensagens
  // ANTERIORES às já carregadas", nunca "mais recentes pendentes"
  // (essas já vêm sempre no load inicial).
  initialHasMore: boolean;
  currentProfileId: string;
  topicRemoved: boolean;
}) {
  const [messages, setMessages] = useState(() => initialMessages);
  const [hasEarlier, setHasEarlier] = useState(initialHasMore);
  const [hasLoadedEarlierOnce, setHasLoadedEarlierOnce] = useState(false);
  const [loadEarlierError, setLoadEarlierError] = useState(false);
  const [isLoadingEarlier, startLoadingEarlier] = useTransition();
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingPrependRestoreRef = useRef<PendingPrependRestore | null>(null);
  const pendingScrollToBottomRef = useRef(false);

  // Registro do anchor pro Item 1 (layout.tsx) consultar quando não
  // houver posição em cache pra esta rota — ver navigation-guard.tsx
  // pro porquê disso precisar ser useLayoutEffect. isContentPristine
  // volta a `false` assim que "carregar anteriores" é usado uma vez
  // nesta montagem: a partir daí, um pixel salvo enquanto esse
  // conteúdo extra estava carregado não descreve mais o que um mount
  // novo (só a página recente) vai produzir sozinho.
  useComunidadeScrollAnchor({
    getAnchor: () => 'end',
    isContentPristine: () => !hasLoadedEarlierOnce,
  });

  // Universo de menção = participantes das mensagens já carregadas
  // (nunca uma busca nova de perfil) — cresce conforme mais páginas
  // são carregadas, sem query adicional: só deriva do que já está em
  // `messages`.
  const mentionCandidates = useMemo<MentionCandidate[]>(() => {
    const seen = new Map<string, string>();
    for (const m of messages) {
      if (m.authorProfileId === currentProfileId) continue;
      if (!seen.has(m.authorProfileId)) seen.set(m.authorProfileId, m.authorName);
    }
    return [...seen.entries()].map(([profileId, displayName]) => ({ profileId, displayName }));
  }, [messages, currentProfileId]);

  const loadedIds = useMemo(() => new Set(messages.map((m) => m.id)), [messages]);

  // Aplica, depois que o DOM já refletiu a mudança de `messages` (mas
  // antes do browser pintar), exatamente UMA das duas correções
  // pendentes: reposicionar o scroll pela diferença de altura (prepend
  // de "carregar anteriores", nunca um salto) ou ir pro fim (resposta
  // nova enviada estando perto do fim). Nunca as duas ao mesmo tempo —
  // são gatilhos mutuamente exclusivos (um clique de cada vez).
  useLayoutEffect(() => {
    const pendingPrepend = pendingPrependRestoreRef.current;
    if (pendingPrepend) {
      pendingPrependRestoreRef.current = null;
      const { container, prevScrollHeight, prevScrollTop } = pendingPrepend;
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = prevScrollTop + (newScrollHeight - prevScrollHeight);
      }
      return;
    }
    if (pendingScrollToBottomRef.current) {
      pendingScrollToBottomRef.current = false;
      const container = getScrollContainer(messagesContainerRef.current);
      if (container) container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  function handleReply(target: ReplyTarget) {
    setReplyTarget(target);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function handleLoadEarlier() {
    const earliestPost = messages.find((m) => m.postId !== null);
    if (!earliestPost || isLoadingEarlier) return;
    setLoadEarlierError(false);
    const container = getScrollContainer(messagesContainerRef.current);
    const prevScrollHeight = container?.scrollHeight ?? 0;
    const prevScrollTop = container?.scrollTop ?? 0;

    startLoadingEarlier(async () => {
      const result = await loadEarlierCommunityPostsAction(topicId, {
        createdAt: earliestPost.createdAt,
        id: earliestPost.postId as string,
      });
      if ('error' in result) {
        setLoadEarlierError(true);
        return;
      }
      // Medição feita ANTES do fetch (acima) — determinística, nunca
      // um timeout: a diferença de altura entre agora e depois do
      // useLayoutEffect é exatamente o quanto o conteúdo novo ocupou.
      pendingPrependRestoreRef.current = { container, prevScrollHeight, prevScrollTop };
      setHasLoadedEarlierOnce(true);
      setMessages((prev) => [prev[0], ...result.messages, ...prev.slice(1)]);
      setHasEarlier(result.hasMore);
    });
  }

  function handleSent(message: ChatTimelineMessage) {
    // "Perto do fim" checado ANTES de anexar — se o autor estava lendo
    // histórico mais acima (não perto do fim), enviar não deve
    // arrastá-lo pra baixo; se já estava ali (o caso comum), a resposta
    // nova aparece com um scroll suave até ela, sem comportamento
    // estranho.
    const container = getScrollContainer(messagesContainerRef.current);
    const nearBottom = container ? container.scrollHeight - container.scrollTop - container.clientHeight < 120 : true;
    pendingScrollToBottomRef.current = nearBottom;
    setMessages((prev) => [...prev, message]);
  }

  function renderMessage(message: ChatTimelineMessage) {
    const replyToLoaded = message.replyTo ? loadedIds.has(message.replyTo.postId) : false;
    const replyToContent = message.replyTo && (
      <>
        <span className="font-semibold text-[var(--pro-tx-50)]">{message.replyTo.authorName}</span>{' '}
        {message.replyTo.removed ? (
          <span className="italic">Mensagem removida.</span>
        ) : (
          <span className="italic">&ldquo;{message.replyTo.snippet}&rdquo;</span>
        )}
      </>
    );
    const replyToClassName = 'mb-1.5 block rounded-[8px] border-l-2 border-[var(--pro-line)] bg-white/[0.02] py-1 pl-2.5 pr-2 text-[11px] text-[var(--pro-tx-30)]';
    return (
      <div key={message.id} id={`msg-${message.id}`} className="py-3 first:pt-0">
        {message.replyTo &&
          (replyToLoaded ? (
            <a href={`#msg-${message.replyTo.postId}`} className={`${replyToClassName} hover:border-[var(--pro-tx-30)]`}>
              {replyToContent}
            </a>
          ) : (
            <div className={replyToClassName}>{replyToContent}</div>
          ))}
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
    );
  }

  return (
    <>
      <div className="divide-y divide-[var(--pro-line)]" ref={messagesContainerRef}>
        {renderMessage(messages[0])}
        {hasEarlier && (
          <div className="flex flex-col items-center gap-2 py-3">
            <button
              type="button"
              onClick={handleLoadEarlier}
              disabled={isLoadingEarlier}
              aria-busy={isLoadingEarlier}
              className="font-pro-sub text-[12px] font-bold text-[var(--pro-red)] hover:underline disabled:opacity-60"
            >
              {isLoadingEarlier ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
            {loadEarlierError && (
              <p role="alert" className="text-[11.5px] text-[#ff8b80]">
                Não deu pra carregar mensagens anteriores.{' '}
                <button type="button" onClick={handleLoadEarlier} className="font-bold underline">
                  Tentar de novo
                </button>
              </p>
            )}
          </div>
        )}
        {messages.slice(1).map((message) => renderMessage(message))}
      </div>

      {!topicRemoved && !hasEarlier && messages.length <= 1 && (
        <p className="text-[12px] text-[var(--pro-tx-30)]">Nenhuma resposta ainda. Seja o primeiro a responder.</p>
      )}

      {!topicRemoved && (
        <ProComunidadeReplyForm
          topicId={topicId}
          replyTarget={replyTarget}
          onCancelReply={() => setReplyTarget(null)}
          mentionCandidates={mentionCandidates}
          textareaRef={textareaRef}
          onSent={handleSent}
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

// Correção de UX das menções (08/09/2026) — autocomplete real
// (digitar "@" → sugestões → selecionar), sem lista permanente.
// Associação texto <-> profile_id via TrackedMention { profileId,
// displayName, insertedText } — nunca inferida lendo "@palavra" do
// texto depois (ver computeSurvivors dentro de handleFormSubmit).
//
// Correção do Item 5 (08/09/2026) — campo novo: `onSent` (recebe a
// mensagem pronta devolvida pela action e a repassa pro estado do
// chat, que a anexa no fim). Como a paginação agora é sempre
// "recentes primeiro", o que já está carregado nunca fica "atrasado"
// em relação ao que acabou de ser publicado — não existe mais o
// parâmetro caughtUp que a v1 deste item precisava (ver actions.ts).
// Nada do fluxo de reply-to/mentions em si mudou.
function ProComunidadeReplyForm({
  topicId,
  replyTarget,
  onCancelReply,
  mentionCandidates,
  textareaRef,
  onSent,
}: {
  topicId: string;
  replyTarget: ReplyTarget | null;
  onCancelReply: () => void;
  mentionCandidates: MentionCandidate[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onSent: (message: ChatTimelineMessage) => void;
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
  // pending: true -> false sem erro), e repassa a mensagem devolvida
  // (se houver — só existe quando caughtUp era true) pra cima.
  useEffect(() => {
    if (wasPendingRef.current && !pending && !state?.error) {
      if (textareaRef.current) textareaRef.current.value = '';
      mentionedRef.current = [];
      if (hiddenMentionsRef.current) hiddenMentionsRef.current.replaceChildren();
      setMentionQuery(null);
      onCancelReply();
      if (state?.post) onSent(state.post);
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
