import { notFound } from 'next/navigation';

import { getAgencyApplication, listAgencyApplicationHistory } from '@/lib/agencies/admin-data';
import { AGENCY_STATUSES, type AgencyClassification, type AgencyStatus } from '@/lib/agencies/types';

import { getAdminSession } from '../../session';
import { addAgencyNoteAction, resendAgencyNotificationAction, setAgencyStatusAction } from '../actions';

const CLASSIFICATION_LABEL: Record<AgencyClassification, string> = {
  priority: 'Prioridade alta',
  future_potential: 'Potencial futuro',
  out_of_profile: 'Fora do perfil',
};

const STATUS_LABEL: Record<AgencyStatus, string> = {
  new: 'Nova',
  under_review: 'Em avaliação',
  contacted: 'Contatada',
  in_conversation: 'Em conversa',
  partner: 'Parceira',
  rejected: 'Rejeitada',
  archived: 'Arquivada',
};

const ACTION_LABEL: Record<string, string> = {
  agency_status_changed: 'Status alterado',
  agency_note_added: 'Observação adicionada',
  agency_classification_criteria_changed: 'Critérios de classificação ajustados',
  agency_notification_retry_requested: 'Reenvio de notificação solicitado',
};

function Field({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm text-zinc-100">{value ?? '—'}</p>
    </div>
  );
}

export default async function AdminAgenciaDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; message?: string }>;
}) {
  const { supabase } = await getAdminSession();
  const { id } = await params;
  const { status: flashStatus, message: flashMessage } = await searchParams;

  const application = await getAgencyApplication(supabase, id);
  if (!application) notFound();

  const history = await listAgencyApplicationHistory(supabase, id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">{application.agencyName}</h1>
        <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[11px] text-zinc-300">{CLASSIFICATION_LABEL[application.classification]}</span>
      </div>

      {flashStatus === 'error' && (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-300">{flashMessage ?? 'Algo deu errado.'}</p>
      )}
      {flashStatus === 'ok' && <p className="rounded-lg border border-green-500/30 bg-green-500/10 px-3 py-2 text-[12.5px] text-green-300">Atualizado.</p>}

      <div className="grid grid-cols-2 gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:grid-cols-3">
        <Field label="Site ou Instagram" value={application.websiteOrInstagram} />
        <Field label="Cidade/País" value={`${application.city}, ${application.country}`} />
        <Field label="Responsável" value={application.contactRole ? `${application.contactName} (${application.contactRole})` : application.contactName} />
        <Field label="E-mail" value={application.contactEmail} />
        <Field label="Pessoas na operação" value={application.teamSize} />
        <Field label="Artistas representados" value={application.artistsRepresented} />
        <Field label="Volume mensal de solicitações" value={application.monthlyRequestsVolume} />
        <Field label="Interesse" value={application.interest} />
        <Field label="Status" value={STATUS_LABEL[application.status]} />
        <Field label="Inscrita em" value={new Date(application.createdAt).toLocaleString('pt-BR')} />
        <Field label="Última atualização" value={new Date(application.updatedAt).toLocaleString('pt-BR')} />
        <Field label="Consentimento de contato" value={new Date(application.consentContactAt).toLocaleString('pt-BR')} />
      </div>

      {application.classification === 'priority' && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Notificação por e-mail</p>
          <p className="mt-1 text-sm text-zinc-100">
            {application.notificationStatus}
            {application.notificationError ? ` — ${application.notificationError}` : ''}
          </p>
          {application.notificationStatus === 'failed' && (
            <form action={resendAgencyNotificationAction} className="mt-2">
              <input type="hidden" name="id" value={application.id} />
              <input type="hidden" name="agency_name" value={application.agencyName} />
              <input type="hidden" name="contact_name" value={application.contactName} />
              <input type="hidden" name="contact_email" value={application.contactEmail} />
              <input type="hidden" name="city" value={application.city} />
              <input type="hidden" name="country" value={application.country} />
              <input type="hidden" name="team_size" value={application.teamSize} />
              <input type="hidden" name="artists_represented" value={application.artistsRepresented} />
              <input type="hidden" name="monthly_requests_volume" value={application.monthlyRequestsVolume} />
              <button type="submit" className="rounded-lg bg-zinc-100 px-3 py-1.5 text-[12px] font-semibold text-zinc-900">
                Reenviar notificação
              </button>
            </form>
          )}
        </div>
      )}

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Alterar status</p>
        <form action={setAgencyStatusAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={application.id} />
          <select name="status" defaultValue={application.status} className="rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[12.5px] text-zinc-100">
            {AGENCY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <input
            type="text"
            name="reason"
            required
            placeholder="Motivo (obrigatório)"
            className="min-w-[220px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[12.5px] text-zinc-100 placeholder:text-zinc-600"
          />
          <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-900">
            Aplicar
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Adicionar observação interna</p>
        <form action={addAgencyNoteAction} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="id" value={application.id} />
          <input
            type="text"
            name="note"
            required
            placeholder="Observação"
            className="min-w-[260px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[12.5px] text-zinc-100 placeholder:text-zinc-600"
          />
          <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-[12.5px] font-semibold text-zinc-900">
            Adicionar
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[.06em] text-zinc-500">Histórico</p>
        {history.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-zinc-600">Nenhum evento ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.id} className="border-l-2 border-zinc-700 pl-3 text-[12.5px]">
                <p className="text-zinc-100">
                  {ACTION_LABEL[entry.action] ?? entry.action} <span className="text-zinc-500">por {entry.adminName}</span>
                </p>
                {entry.reason && <p className="text-zinc-400">{entry.reason}</p>}
                <p className="text-zinc-600">{new Date(entry.createdAt).toLocaleString('pt-BR')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
