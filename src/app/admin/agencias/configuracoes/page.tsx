import { getAgencyClassificationCriteria, listAgencyNotificationRecipients } from '@/lib/agencies/admin-data';

import { getAdminSession } from '../../session';
import { addAgencyRecipientAction, removeAgencyRecipientAction, setAgencyCriteriaAction } from '../actions';

function NumberField({ name, label, defaultValue }: { name: string; label: string; defaultValue: number }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] text-zinc-500">
      {label}
      <input
        type="number"
        name={name}
        min={0}
        defaultValue={defaultValue}
        className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[12.5px] text-zinc-100"
      />
    </label>
  );
}

export default async function AdminAgenciasConfigPage({ searchParams }: { searchParams: Promise<{ status?: string; message?: string }> }) {
  const { supabase } = await getAdminSession();
  const { status: flashStatus, message: flashMessage } = await searchParams;

  const [criteria, recipients] = await Promise.all([getAgencyClassificationCriteria(supabase), listAgencyNotificationRecipients(supabase)]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Agências Parceiras — Configurações</h1>

      {flashStatus === 'error' && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{flashMessage ?? 'Algo deu errado.'}</p>
      )}
      {flashStatus === 'ok' && <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12.5px] text-green-300">Salvo.</p>}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Critérios de classificação</p>
        <p className="mt-1 text-[12px] text-zinc-500">
          Uma inscrição só entra numa faixa quando bate os TRÊS mínimos dela (equipe, artistas e volume mensal) ao mesmo tempo.
        </p>
        <form action={setAgencyCriteriaAction} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <p className="col-span-2 text-[11px] font-semibold uppercase tracking-[.06em] text-red-300 sm:col-span-3">Prioridade alta — mínimos</p>
          <NumberField name="priority_min_team_size" label="Pessoas na equipe" defaultValue={criteria.priorityMinTeamSize} />
          <NumberField name="priority_min_artists" label="Artistas representados" defaultValue={criteria.priorityMinArtists} />
          <NumberField name="priority_min_monthly_requests" label="Volume mensal de solicitações" defaultValue={criteria.priorityMinMonthlyRequests} />

          <p className="col-span-2 mt-2 text-[11px] font-semibold uppercase tracking-[.06em] text-amber-300 sm:col-span-3">Potencial futuro — mínimos</p>
          <NumberField name="future_min_team_size" label="Pessoas na equipe" defaultValue={criteria.futureMinTeamSize} />
          <NumberField name="future_min_artists" label="Artistas representados" defaultValue={criteria.futureMinArtists} />
          <NumberField name="future_min_monthly_requests" label="Volume mensal de solicitações" defaultValue={criteria.futureMinMonthlyRequests} />

          <div className="col-span-2 sm:col-span-3">
            <button type="submit" className="mt-2 rounded-lg bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-900">
              Salvar critérios
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Destinatários de notificação (inscrições prioritárias)</p>

        <ul className="mt-3 flex flex-col gap-2">
          {recipients.length === 0 ? (
            <li className="text-[12.5px] text-zinc-600">Nenhum destinatário cadastrado ainda — inscrições prioritárias não geram e-mail até cadastrar um.</li>
          ) : (
            recipients.map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-[12.5px]">
                <span className={r.active ? 'text-zinc-100' : 'text-zinc-600 line-through'}>{r.email}</span>
                {r.active && (
                  <form action={removeAgencyRecipientAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="text-[11.5px] text-zinc-500 hover:text-red-300">
                      Remover
                    </button>
                  </form>
                )}
              </li>
            ))
          )}
        </ul>

        <form action={addAgencyRecipientAction} className="mt-4 flex gap-2">
          <input
            type="email"
            name="email"
            required
            placeholder="email@doopla.pro"
            className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[12.5px] text-zinc-100 placeholder:text-zinc-600"
          />
          <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-900">
            Adicionar
          </button>
        </form>
      </div>
    </div>
  );
}
