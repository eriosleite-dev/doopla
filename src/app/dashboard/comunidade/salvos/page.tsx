import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCommunityAuthors, listCommunityTopicsByIds, listSavedTopicIds } from '@/lib/community/data';

import { formatRelativeTime } from '../../pro-format';
import { ProCard, ProEmptyState, ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { SaveTopicButton } from '../save-topic-button';

export const metadata: Metadata = {
  title: 'Salvos | Comunidade | Doopla',
};

// Comunidade — Fase 1 (06/09/2026). Área dedicada de "Salvos", pedida
// explicitamente separada da Home (que só mostra um preview + link pra
// cá). Mesma fonte de dado que o preview e o botão de salvar em
// qualquer outra tela — community_saved_topics (migration 0059).
export default async function ComunidadeSalvosPage() {
  const { supabase, profile } = await getSessionProfile();
  if (profile.role !== 'artista') redirect('/dashboard');

  const savedTopicIds = await listSavedTopicIds(supabase);
  const topics = await listCommunityTopicsByIds(supabase, savedTopicIds, 100);
  const authorsById = await getCommunityAuthors(supabase, [...new Set(topics.map((t) => t.author_profile_id))]);

  return (
    <main className="@container">
      <ProPageHeader title="Salvos" subtitle="Tópicos que você guardou pra voltar depois." />

      {topics.length === 0 ? (
        <ProEmptyState message="Você ainda não salvou nenhum tópico. Toque no marcador em qualquer tópico da Comunidade pra guardá-lo aqui." />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 @lg:grid-cols-2">
          {topics.map((topic) => (
            <ProCard key={topic.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/dashboard/comunidade/${topic.id}`} className="min-w-0 flex-1">
                  <p className="font-pro-sub text-[13.5px] font-bold leading-snug">{topic.title}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--pro-tx-50)]">
                    <span>{authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {topic.reply_count} {topic.reply_count === 1 ? 'resposta' : 'respostas'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatRelativeTime(topic.last_activity_at)}</span>
                  </p>
                </Link>
                <SaveTopicButton topicId={topic.id} initialSaved className="flex-none text-[var(--pro-red)]" />
              </div>
            </ProCard>
          ))}
        </div>
      )}
    </main>
  );
}
