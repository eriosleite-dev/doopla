'use server';

import { z } from 'zod';

import { recordAgencyFunnelEvent } from '@/lib/agencies/funnel';
import { sendAgencyPriorityNotification } from '@/lib/agencies/notify';
import { submitAgencyApplication } from '@/lib/agencies/submit';
import type { AgencyClassification, AgencyInterest } from '@/lib/agencies/types';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

// Doopla — Server Action do formulário público de qualificação de
// agências (3 etapas, Home). Honeypot checado AQUI (mesmo padrão de
// src/app/contato/actions.ts), antes de qualquer chamada ao banco.
// Notificação por e-mail (só pra prioritárias) é best-effort — a
// inscrição já está persistida antes de qualquer tentativa de envio,
// nunca se perde por falha do Resend.

const AgencyApplicationSchema = z.object({
  agencyName: z.string().trim().min(1).max(160),
  websiteOrInstagram: z.string().trim().min(1).max(200),
  city: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(120),
  contactName: z.string().trim().min(1).max(160),
  contactRole: z.string().trim().min(1).max(120),
  contactEmail: z.string().trim().min(1).email(),
  teamSize: z.number().int().positive().max(100000),
  artistsRepresented: z.number().int().nonnegative().max(1000000),
  monthlyRequestsVolume: z.number().int().nonnegative().max(1000000),
  interest: z.enum(['discovery_metrics', 'recurring_revenue', 'both']),
  consent: z.literal(true),
  sessionToken: z.string().trim().min(1).max(200),
  honeypot: z.string().optional(),
});

export type SubmitAgencyApplicationActionInput = z.infer<typeof AgencyApplicationSchema>;

export type SubmitAgencyApplicationActionResult =
  | { status: 'success'; classification: AgencyClassification }
  | { status: 'error'; message: string };

const GENERIC_ERROR = 'Não foi possível enviar sua inscrição agora. Tente novamente em instantes.';

export async function submitAgencyApplicationAction(
  input: SubmitAgencyApplicationActionInput
): Promise<SubmitAgencyApplicationActionResult> {
  // Honeypot: campo escondido do usuário real — se veio preenchido, é
  // bot. Finge sucesso sem persistir nem notificar, sem revelar o
  // filtro.
  if (input.honeypot && input.honeypot.trim().length > 0) {
    return { status: 'success', classification: 'future_potential' };
  }

  const parsed = AgencyApplicationSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? GENERIC_ERROR };
  }
  const data = parsed.data;

  const supabase = await createClient();

  const result = await submitAgencyApplication(supabase, {
    agencyName: data.agencyName,
    websiteOrInstagram: data.websiteOrInstagram,
    city: data.city,
    country: data.country,
    contactName: data.contactName,
    contactRole: data.contactRole,
    contactEmail: data.contactEmail,
    teamSize: data.teamSize,
    artistsRepresented: data.artistsRepresented,
    monthlyRequestsVolume: data.monthlyRequestsVolume,
    interest: data.interest as AgencyInterest,
    consent: true,
  });

  if (!result.ok) {
    if (result.error.includes('rate_limited')) {
      return { status: 'error', message: 'Muitas inscrições em pouco tempo. Tente novamente em instantes.' };
    }
    return { status: 'error', message: GENERIC_ERROR };
  }

  await recordAgencyFunnelEvent(supabase, {
    eventType: 'form_submit',
    sessionToken: data.sessionToken,
    applicationId: result.id,
  });
  await recordAgencyFunnelEvent(supabase, {
    eventType: 'classified',
    sessionToken: data.sessionToken,
    applicationId: result.id,
    classification: result.classification,
  });

  // Notificação (painel + e-mail) só pra prioritárias — requisito
  // explícito. "Painel" é o próprio Admin > Agências Parceiras (a
  // inscrição já aparece lá, não há um sistema de notificação push
  // separado); o e-mail é best-effort via Resend, nunca bloqueia a
  // resposta ao usuário.
  if (result.classification === 'priority') {
    try {
      // Lista de destinatários não tem nenhuma policy pra
      // anon/authenticated (RLS enabled + zero policies, migration
      // 0129) — só as RPCs admin_* (que exigem profiles.is_admin via
      // auth.uid(), não aplicável aqui) ou service_role leem. Este é
      // o sistema notificando a si mesmo, não um admin agindo, então
      // lê a tabela direto via service_role (mesmo padrão de
      // src/lib/runtime/, nunca passa pela RPC admin_*).
      const serviceSupabase = createServiceRoleClient();
      const { data: recipientRows } = await serviceSupabase
        .from('agency_notification_recipients')
        .select('email, active')
        .eq('active', true);
      const activeEmails = ((recipientRows ?? []) as { email: string; active: boolean }[]).map((r) => r.email);

      const notification = await sendAgencyPriorityNotification({
        agencyName: data.agencyName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        city: data.city,
        country: data.country,
        teamSize: data.teamSize,
        artistsRepresented: data.artistsRepresented,
        monthlyRequestsVolume: data.monthlyRequestsVolume,
        recipients: activeEmails,
      });

      if (!notification.ok) {
        await supabase.rpc('mark_agency_notification', { p_id: result.id, p_status: 'failed', p_error: notification.error });
      } else if (notification.sent) {
        await supabase.rpc('mark_agency_notification', { p_id: result.id, p_status: 'sent' });
      }
      // notification.ok && !notification.sent: sem destinatário ativo
      // configurado ainda — fica 'pending', nunca 'failed' (não foi
      // falha de envio, é falta de configuração; o Admin reenvia
      // depois de cadastrar um destinatário).
    } catch {
      // Best-effort mesmo em falha inesperada — a inscrição já está
      // persistida e classificada; isso nunca vira erro pro usuário.
    }
  }

  return { status: 'success', classification: result.classification };
}

export async function recordAgencyFunnelEventAction(params: {
  eventType: 'section_view' | 'cta_click' | 'form_start' | 'form_step_completed' | 'form_abandon';
  sessionToken: string;
  step?: number;
}): Promise<void> {
  const supabase = await createClient();
  await recordAgencyFunnelEvent(supabase, {
    eventType: params.eventType,
    sessionToken: params.sessionToken,
    step: params.step ?? null,
  });
}
