'use client';

import { useState, useTransition } from 'react';

import { toggleSaveTopicAction } from './actions';

// Fase 1 (06/09/2026) — "Salvar" (nunca "Pin"), mesmo padrão de
// otimismo local + revert em falha já usado em FavoriteButton
// (../favorite-button.tsx). Fonte única web+app: community_saved_topics
// (migration 0059), toggle direto por RLS — esta action só chama
// saveTopic/unsaveTopic, nunca um estado paralelo/local storage.
export function SaveTopicButton({
  topicId,
  initialSaved,
  className = '',
}: {
  topicId: string;
  initialSaved: boolean;
  className?: string;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [isPending, startTransition] = useTransition();

  function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaveTopicAction(topicId, next);
      if (!result.ok) setSaved(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={saved}
      aria-label={saved ? 'Remover dos salvos' : 'Salvar'}
      title={saved ? 'Remover dos salvos' : 'Salvar'}
      className={`flex items-center justify-center transition-opacity disabled:opacity-60 ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width="17"
        height="17"
        fill={saved ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" />
      </svg>
    </button>
  );
}
