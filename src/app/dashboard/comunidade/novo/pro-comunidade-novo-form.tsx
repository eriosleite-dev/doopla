'use client';

import { useActionState, useState } from 'react';

import { proInputClass, proLabelClass, proPrimaryButtonClass } from '../../pro-format';
import { ProCard } from '../../pro-ui';
import { createTopicAction } from '../actions';

export function ProComunidadeNovoForm({
  categories,
  tags,
}: {
  categories: { id: string; label: string }[];
  tags: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState(createTopicAction, {});
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  function toggleTag(id: string) {
    setSelectedTagIds((prev) => {
      if (prev.includes(id)) return prev.filter((t) => t !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  }

  return (
    <ProCard>
      <form action={formAction} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Título</span>
          <input name="title" type="text" required minLength={3} maxLength={200} className={proInputClass} placeholder="Ex: Como negociar cachê com cliente antigo" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>O que você quer perguntar ou discutir?</span>
          <textarea name="body" required rows={5} maxLength={8000} className={`${proInputClass} resize-y`} />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={proLabelClass}>Categoria</span>
          <select name="categoryId" required defaultValue="" className={proInputClass}>
            <option value="" disabled>
              Escolha uma categoria
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {tags.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className={proLabelClass}>Tags (opcional, até 5)</span>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const checked = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    aria-pressed={checked}
                    className={`font-doopla-mono rounded-full border px-3 py-1.5 text-[10.5px] uppercase tracking-[.04em] transition-colors ${
                      checked
                        ? 'border-[var(--pro-red)] bg-[var(--pro-red)]/15 text-[var(--pro-red)]'
                        : 'border-[var(--pro-line)] text-[var(--pro-tx-50)] hover:border-[var(--pro-tx-30)]'
                    }`}
                  >
                    {tag.label}
                  </button>
                );
              })}
            </div>
            {selectedTagIds.map((id) => (
              <input key={id} type="hidden" name="tagIds" value={id} />
            ))}
          </div>
        )}

        {state?.error && <p className="text-[12.5px] text-[#ff8b80]">{state.error}</p>}

        <button type="submit" disabled={pending} className={`${proPrimaryButtonClass} self-start`}>
          {pending ? 'Publicando…' : 'Publicar tópico'}
        </button>
      </form>
    </ProCard>
  );
}
