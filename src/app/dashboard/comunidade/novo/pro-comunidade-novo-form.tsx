'use client';

import { useActionState, useState, type KeyboardEvent } from 'react';

import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { createTopicAction } from '../actions';
import { useComunidadeDraftGuard } from '../navigation-guard';

const MAX_TAGS = 5;

function normalizeTagForCompare(tag: string): string {
  return tag.trim().toLowerCase();
}

// Tags livres (16/09/2026, QA real) — decisão canônica reverte a
// "vocabulário controlado" de 0059 (ver DECISOES.md): a Comunidade não
// tenta prever todo assunto possível. A pessoa digita, Enter vira tag,
// até 5, removível antes de publicar — nunca um catálogo/dropdown de
// sugestões fixas. O texto vai como `tagLabels` (hidden inputs) pro
// createTopicAction, que manda pra create_community_topic (migration
// 0089) fazer find-or-create por slug no servidor — validação de
// verdade (limite, tamanho, dedupe) sempre server-side também, esta
// validação no client é só feedback imediato, nunca a única barreira.
export function ProComunidadeNovoForm() {
  const [state, formAction, pending] = useActionState(createTopicAction, {});
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  // Proteção de rascunho (07/09/2026) — o layout do slide-over consulta
  // isto antes de deixar Voltar/Fechar/Escape/clique-fora acontecerem.
  useComunidadeDraftGuard(() => title.trim().length > 0 || body.trim().length > 0 || tags.length > 0);

  function addTag() {
    const value = tagInput.trim();
    if (!value) {
      setTagError(null);
      return;
    }
    if (value.length < 2 || value.length > 40) {
      setTagError('A tag precisa ter entre 2 e 40 caracteres.');
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setTagError(`Máximo de ${MAX_TAGS} tags.`);
      return;
    }
    if (tags.some((t) => normalizeTagForCompare(t) === normalizeTagForCompare(value))) {
      setTagInput('');
      setTagError(null);
      return;
    }
    setTags((prev) => [...prev, value]);
    setTagInput('');
    setTagError(null);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    addTag();
  }

  // Bug real de QA (16/09/2026) — Enter dentro do campo Título publicava
  // o tópico sozinho: comportamento NATIVO do HTML (Enter num <input>
  // de uma linha dispara o submit implícito do <form> em volta), não
  // específico das tags — só ficou fácil de bater nele porque o fluxo
  // natural é preencher as tags antes e terminar no Título. O input de
  // tag já tinha seu próprio preventDefault (handleTagKeyDown acima,
  // pra virar chip em vez de submeter), mas o Título nunca tinha
  // nenhum tratamento. Guarda no <form> inteiro: Enter nunca submete
  // por conta própria em nenhum campo, só o clique real em "Publicar
  // tópico" — exceto dentro da Descrição (textarea), onde Enter precisa
  // continuar sendo quebra de linha, comportamento nativo de sempre.
  function handleFormKeyDown(e: KeyboardEvent<HTMLFormElement>) {
    if (e.key !== 'Enter') return;
    if ((e.target as HTMLElement).tagName === 'TEXTAREA') return;
    e.preventDefault();
  }

  return (
    <ProCard>
      <form action={formAction} onKeyDown={handleFormKeyDown} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Título</span>
          <input
            name="title"
            type="text"
            required
            minLength={3}
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={proInputClass}
            placeholder="O que você quer conversar?"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Descrição</span>
          <textarea
            name="body"
            required
            rows={5}
            maxLength={8000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={`${proInputClass} resize-y`}
            placeholder="Conte um pouco mais."
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Tags (opcional, até {MAX_TAGS})</span>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="font-doopla-mono inline-flex items-center gap-1.5 rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] py-1.5 pl-3 pr-2 text-[10.5px] uppercase tracking-[.04em] text-[var(--pro-tx-70)]"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    aria-label={`Remover tag ${tag}`}
                    className="flex h-4 w-4 items-center justify-center opacity-60 hover:opacity-100"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {tags.length < MAX_TAGS && (
            <input
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                if (tagError) setTagError(null);
              }}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              maxLength={40}
              className={proInputClass}
              placeholder="Adicione uma tag..."
            />
          )}

          {tagError && <p className="text-[12px] text-[#ff8b80]">{tagError}</p>}

          {tags.map((tag) => (
            <input key={tag} type="hidden" name="tagLabels" value={tag} />
          ))}
        </div>

        {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}

        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Publicando…' : 'Publicar tópico'}
        </button>
      </form>
    </ProCard>
  );
}
