import Link from 'next/link';

import { searchAdminProfiles } from '@/lib/admin/data';

import { getAdminSession } from '../session';

export default async function AdminUsuariosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await getAdminSession();
  const { q } = await searchParams;
  const rows = await searchAdminProfiles(supabase, q?.trim() || null);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Usuários</h1>

      <form className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ''}
          placeholder="Nome, e-mail, telefone ou ID público"
          className="w-full max-w-sm rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
        />
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-900">
          Buscar
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-normal">Nome</th>
              <th className="px-4 py-2 font-normal">E-mail</th>
              <th className="px-4 py-2 font-normal">Papel</th>
              <th className="px-4 py-2 font-normal">Plano</th>
              <th className="px-4 py-2 font-normal">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                  Nenhum usuário encontrado.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.profile_id} className="hover:bg-zinc-900">
                  <td className="px-4 py-2">
                    <Link href={`/admin/usuarios/${row.profile_id}`} className="text-zinc-100 underline-offset-2 hover:underline">
                      {row.full_name}
                    </Link>
                    {row.is_admin && <span className="ml-2 text-[10px] text-amber-400">admin</span>}
                  </td>
                  <td className="px-4 py-2 text-zinc-400">{row.email}</td>
                  <td className="px-4 py-2 text-zinc-400">{row.role}</td>
                  <td className="px-4 py-2 text-zinc-400">{row.plan_status ?? '—'}</td>
                  <td className="px-4 py-2 text-zinc-400">{row.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
