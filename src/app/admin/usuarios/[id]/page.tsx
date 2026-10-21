import { notFound } from 'next/navigation';

import { getAdminProfileDetail } from '@/lib/admin/data';

import { getAdminSession } from '../../session';

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

export default async function AdminUsuarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await getAdminSession();
  const { id } = await params;
  const profile = await getAdminProfileDetail(supabase, id);

  if (!profile) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{profile.full_name}</h1>

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-3">
        <Field label="E-mail" value={profile.email} />
        <Field label="Telefone" value={profile.phone} />
        <Field label="ID público" value={profile.slug} />
        <Field label="Papel" value={profile.role} />
        <Field label="Cidade/UF" value={profile.city && profile.state ? `${profile.city}/${profile.state}` : null} />
        <Field label="Status da conta" value={profile.status} />
        <Field label="Status da assinatura" value={profile.plan_status} />
        <Field label="Papel da assinatura" value={profile.plan_role} />
        <Field label="Fim do trial" value={profile.trial_ends_at} />
        <Field label="Visibilidade na Comunidade" value={profile.community_visibility_status} />
        <Field label="Admin" value={profile.is_admin ? 'sim' : 'não'} />
        <Field label="Cadastrado em" value={new Date(profile.created_at).toLocaleDateString('pt-BR')} />
      </div>

      <p className="text-[12px] text-zinc-600">Somente leitura nesta rodada — nenhuma edição de perfil pelo Admin no V1.</p>
    </div>
  );
}
