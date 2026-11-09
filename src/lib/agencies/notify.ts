// Doopla — notificação por e-mail de inscrição de agência PRIORITÁRIA
// (via Resend, mesmo padrão de src/lib/contact/notify.ts). Server-only
// — só importado por Server Actions, nunca por componente client, pra
// RESEND_API_KEY nunca chegar no bundle do browser.
//
// Diferente de sendContactNotification: os destinatários nunca são
// fixos no código (requisito explícito) — quem chama já leu a lista
// ativa de agency_notification_recipients e passa aqui. Lista vazia
// nunca é tratada como erro (ok:true, sent:false) — a inscrição já
// está persistida de qualquer forma; só não há pra quem mandar ainda.

export type AgencyPriorityNotificationInput = {
  agencyName: string;
  contactName: string;
  contactEmail: string;
  city: string;
  country: string;
  teamSize: number;
  artistsRepresented: number;
  monthlyRequestsVolume: number;
  recipients: string[];
};

export type AgencyPriorityNotificationResult =
  | { ok: true; sent: boolean }
  | { ok: false; error: string };

export async function sendAgencyPriorityNotification(
  input: AgencyPriorityNotificationInput
): Promise<AgencyPriorityNotificationResult> {
  if (input.recipients.length === 0) {
    return { ok: true, sent: false };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }

  const from = process.env.CONTACT_EMAIL_FROM ?? 'Doopla <contato@doopla.pro>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.recipients,
        subject: `[Agências Doopla] Nova inscrição prioritária — ${input.agencyName}`,
        text:
          `Agência: ${input.agencyName}\n` +
          `Contato: ${input.contactName} <${input.contactEmail}>\n` +
          `Cidade/País: ${input.city}, ${input.country}\n` +
          `Equipe: ${input.teamSize} pessoas · Artistas representados: ${input.artistsRepresented} · Volume mensal de solicitações: ${input.monthlyRequestsVolume}\n\n` +
          `Classificada como PRIORIDADE ALTA. Avalie em Admin > Agências Parceiras.`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Resend respondeu ${response.status}: ${body.slice(0, 300)}` };
    }

    return { ok: true, sent: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Erro desconhecido ao chamar o Resend.' };
  }
}
