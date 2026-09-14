import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getCommunityAuthors, listCommunityTopicsByIds, listSavedTopicIds } from '@/lib/community/data';

import { formatRelativeTime } from '../../pro-format';
import { ProPageHeader } from '../../pro-ui';
import { getSessionProfile } from '../../session';
import { SalvosGrid } from './salvos-grid';

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

      <SalvosGrid
        topics={topics.map((topic) => ({
          id: topic.id,
          title: topic.title,
          authorProfileId: topic.author_profile_id,
          authorName: authorsById.get(topic.author_profile_id)?.displayName ?? 'Profissional Doopla',
          replyCount: topic.reply_count,
          timeLabel: formatRelativeTime(topic.last_activity_at),
        }))}
        currentProfileId={profile.id}
      />
    </main>
  );
}
