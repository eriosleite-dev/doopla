'use server';

import { redirect } from 'next/navigation';

import {
  addAgencyApplicationNote,
  addAgencyNotificationRecipient,
  removeAgencyNotificationRecipient,
  resetAgencyNotification,
  setAgencyApplicationStatus,
  setAgencyClassificationCriteria,
} from '@/lib/agencies/admin-data';
import { sendAgencyPriorityNotification } from '@/lib/agencies/notify';
import { createClient } from '@/lib/supabase/server';

// Admin > Agências Parceiras — Server Actions finas sobre as RPCs
// admin_* (migration 0129). Mesmo padrão de admin/comunidade/actions.ts:
// nunca createServiceRoleClient() aqui, a autoridade real está dentro
// de cada RPC (_assert_is_admin).

function backToApplication(id: string, status: 'ok' | 'error', message?: string): never {
  const params = new URLSearchParams();
  params.set('status', status);
  if (message) params.set('message', message);
  redirect(`/admin/agencias/${id}?${params.toString()}`);
}

export async function setAgencyStatusAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const status = String(formData.get('status') ?? '');
  const reason = String(formData.get('reason') ?? '');

  try {
    await setAgencyApplicationStatus(supabase, { id, status, reason });
  } catch (err) {
    backToApplication(id, 'error', err instanceof Error ? err.message : 'Erro ao atualizar status.');
  }
  backToApplication(id, 'ok');
}

export async function addAgencyNoteAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const note = String(formData.get('note') ?? '');

  try {
    await addAgencyApplicationNote(supabase, { id, note });
  } catch (err) {
    backToApplication(id, 'error', err instanceof Error ? err.message : 'Erro ao adicionar observação.');
  }
  backToApplication(id, 'ok');
}

// Reenvio de notificação — nunca cria um cadastro novo: reabre a
// MESMA linha (admin_reset_agency_notification) e, se houver
// destinatário ativo, manda o e-mail de novo aqui mesmo, marcando o
// resultado com mark_agency_notification (mesma function usada no
// envio automático original).
export async function resendAgencyNotificationAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');
  const agencyName = String(formData.get('agency_name') ?? '');
  const contactName = String(formData.get('contact_name') ?? '');
  const contactEmail = String(formData.get('contact_email') ?? '');
  const city = String(formData.get('city') ?? '');
  const country = String(formData.get('country') ?? '');
  const teamSize = Number(formData.get('team_size') ?? 0);
  const artistsRepresented = Number(formData.get('artists_represented') ?? 0);
  const monthlyRequestsVolume = Number(formData.get('monthly_requests_volume') ?? 0);

  try {
    await resetAgencyNotification(supabase, id);

    const { data: recipientRows } = await supabase.from('agency_notification_recipients').select('email, active').eq('active', true);
    const activeEmails = ((recipientRows ?? []) as { email: string; active: boolean }[]).map((r) => r.email);

    const notification = await sendAgencyPriorityNotification({
      agencyName,
      contactName,
      contactEmail,
      city,
      country,
      teamSize,
      artistsRepresented,
      monthlyRequestsVolume,
      recipients: activeEmails,
    });

    if (!notification.ok) {
      await supabase.rpc('mark_agency_notification', { p_id: id, p_status: 'failed', p_error: notification.error });
      backToApplication(id, 'error', notification.error);
    } else if (notification.sent) {
      await supabase.rpc('mark_agency_notification', { p_id: id, p_status: 'sent' });
    }
  } catch (err) {
    backToApplication(id, 'error', err instanceof Error ? err.message : 'Erro ao reenviar notificação.');
  }
  backToApplication(id, 'ok');
}

function backToConfig(status: 'ok' | 'error', message?: string): never {
  const params = new URLSearchParams();
  params.set('status', status);
  if (message) params.set('message', message);
  redirect(`/admin/agencias/configuracoes?${params.toString()}`);
}

export async function setAgencyCriteriaAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const toNumber = (key: string) => {
    const n = Number(formData.get(key) ?? 0);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  try {
    await setAgencyClassificationCriteria(supabase, {
      priorityMinTeamSize: toNumber('priority_min_team_size'),
      priorityMinArtists: toNumber('priority_min_artists'),
      priorityMinMonthlyRequests: toNumber('priority_min_monthly_requests'),
      futureMinTeamSize: toNumber('future_min_team_size'),
      futureMinArtists: toNumber('future_min_artists'),
      futureMinMonthlyRequests: toNumber('future_min_monthly_requests'),
    });
  } catch (err) {
    backToConfig('error', err instanceof Error ? err.message : 'Erro ao salvar critérios.');
  }
  backToConfig('ok');
}

export async function addAgencyRecipientAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const email = String(formData.get('email') ?? '');

  try {
    await addAgencyNotificationRecipient(supabase, email);
  } catch (err) {
    backToConfig('error', err instanceof Error ? err.message : 'Erro ao adicionar destinatário.');
  }
  backToConfig('ok');
}

export async function removeAgencyRecipientAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const id = String(formData.get('id') ?? '');

  try {
    await removeAgencyNotificationRecipient(supabase, id);
  } catch (err) {
    backToConfig('error', err instanceof Error ? err.message : 'Erro ao remover destinatário.');
  }
  backToConfig('ok');
}
