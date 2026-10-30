'use client';

import Link from 'next/link';
import { useState } from 'react';

import { ProCard, ProEmptyState } from '../../pro-ui';
import { removeTopicAction } from '../actions';
import { DeleteMenu } from '../[topicId]/delete-menu';
import { SaveTopicButton } from '../save-topic-button';

export type SavedTopicCard = {
  id: string;
  title: string;
  authorProfileId: string;
  authorName: string;
  replyCount: number;
  timeLabel: string;
};

// Item 6 (08/09/2026, correção do ••• ausente nos cards) — a rota
// dedicada /salvos (compat, não referenciada pela Home desde o item 2A)
// é um Server Component puro; precisa de UM client component filho só
// pra guardar o estado local que permite o card sumir depois de excluir
// sem reload — mesmo padrão de TopicCardGrid em pro-comunidade-home-view.tsx,
// nunca uma segunda implementação de exclusão.
export function SalvosGrid({ topics, currentProfileId }: { topics: SavedTopicCard[]; currentProfileId: string }) {
  const [topicsState, setTopicsState] = useState(topics);

  if (topicsState.length === 0) {
    return (
      <ProEmptyState message="Você ainda não salvou nenhum tópico. Toque no marcador em qualquer tópico da Comunidade pra guardá-lo aqui." />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
      {topicsState.map((topic) => (
        <ProCard key={topic.id} className="!p-4">
          <div className="flex items-start justify-between gap-3">
            <Link href={`/dashboard/comunidade/${topic.id}`} className="min-w-0 flex-1">
              <p className="font-pro-sub text-[13.5px] font-bold leading-snug">{topic.title}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--pro-tx-50)]">
                <span>{topic.authorName}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {topic.replyCount} {topic.replyCount === 1 ? 'resposta' : 'respostas'}
                </span>
                <span aria-hidden="true">·</span>
                <span>{topic.timeLabel}</span>
              </p>
            </Link>
            <div className="flex flex-none items-center gap-1">
              <SaveTopicButton topicId={topic.id} initialSaved className="flex-none text-[var(--pro-red)]" />
              {topic.authorProfileId === currentProfileId && (
                <DeleteMenu
                  itemLabel="tópico"
                  onDelete={async () => {
                    const result = await removeTopicAction(topic.id);
                    if ('error' in result) throw new Error(result.error);
                    setTopicsState((prev) => prev.filter((t) => t.id !== topic.id));
                  }}
                  triggerClassName="flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
                />
              )}
            </div>
          </div>
        </ProCard>
      ))}
    </div>
  );
}
