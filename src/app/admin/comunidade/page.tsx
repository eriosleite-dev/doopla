import { searchAdminCommunityContent } from '@/lib/admin/data';
import type { AdminCommunityContentRow } from '@/lib/supabase/types';

import { getAdminSession } from '../session';
import {
  moderateRemovePostAction,
  moderateRemoveTopicAction,
  moderateRestorePostAction,
  moderateRestoreTopicAction,
  moderateSetVisibilityAction,
} from './actions';
import { SubmitButton } from './submit-button';

const ENTITY_LABEL: Record<AdminCommunityContentRow['entity_type'], string> = {
  community_profile: 'Perfil',
  community_topic: 'Tópico',
  community_post: 'Resposta',
};

function ModerationControls({ row, query }: { row: AdminCommunityContentRow; query: string }) {
  if (row.entity_type === 'community_profile') {
    return (
      <form action={moderateSetVisibilityAction} className="flex items-center gap-2">
        <input type="hidden" name="query" value={query} />
        <input type="hidden" name="profile_id" value={row.entity_id} />
        <select name="status" defaultValue={row.status} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px]">
          <option value="active">active</option>
          <option value="restricted">restricted</option>
          <option value="blocked">blocked</option>
        </select>
        <input
          type="text"
          name="reason"
          required
          placeholder="Motivo (obrigatório)"
          className="w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] placeholder:text-zinc-600"
        />
        <SubmitButton pendingLabel="Aplicando...">Aplicar</SubmitButton>
      </form>
    );
  }

  const isTopic = row.entity_type === 'community_topic';
  const isRemovedByModerator = row.status === 'removed_by_moderator';
  const isRemovedByAuthor = row.status === 'removed_by_author';
  const idField = isTopic ? 'topic_id' : 'post_id';

  if (isRemovedByAuthor) {
    return <span className="text-[12px] text-zinc-600">Removido pelo próprio autor — não restaurável pelo Admin.</span>;
  }

  const action = isRemovedByModerator
    ? isTopic
      ? moderateRestoreTopicAction
      : moderateRestorePostAction
    : isTopic
      ? moderateRemoveTopicAction
      : moderateRemovePostAction;

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="query" value={query} />
      <input type="hidden" name={idField} value={row.entity_id} />
      <input
        type="text"
        name="reason"
        required
        placeholder="Motivo (obrigatório)"
        className="w-48 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[12px] placeholder:text-zinc-600"
      />
      <SubmitButton pendingLabel={isRemovedByModerator ? 'Restaurando...' : 'Removendo...'}>
        {isRemovedByModerator ? 'Restaurar' : 'Remover'}
      </SubmitButton>
    </form>
  );
}

export default async function AdminComunidadePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; message?: string }>;
}) {
  const { supabase } = await getAdminSession();
  const { q, status, message } = await searchParams;
  const rows = await searchAdminCommunityContent(supabase, q?.trim() || null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Comunidade</h1>

      {status === 'ok' && (
        <p className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-emerald-950 px-4 py-2 text-[13px] text-emerald-300 shadow-lg">
          Ação aplicada.
        </p>
      )}
      {status === 'error' && (
        <p className="fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-red-950 px-4 py-2 text-[13px] text-red-300 shadow-lg">
          Não foi possível aplicar a ação: {message}
        </p>
      )}

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Nome do autor, título ou trecho"
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900">
          Buscar
        </button>
      </form>

      <div className="flex flex-col divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {rows.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">Nenhum resultado.</p>
        ) : (
          rows.map((row) => (
            <div key={`${row.entity_type}-${row.entity_id}`} className="flex flex-col gap-2 px-4 py-3">
              <div className="flex items-center justify-between text-[12px] text-zinc-500">
                <span>
                  {ENTITY_LABEL[row.entity_type]} · {row.author_name} · {row.status}
                </span>
                <span>{new Date(row.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              {row.excerpt && <p className="text-sm text-zinc-200">{row.excerpt}</p>}
              <ModerationControls row={row} query={q ?? ''} />
            </div>
          ))
        )}
      </div>
    </div>
  );
}
