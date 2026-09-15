// Notificação por e-mail do formulário /contato via API do Resend
// (chamada direta por fetch — sem SDK, sem Nodemailer/SMTP, sem
// dependência nova). Server-only: só é importado por
// src/app/contato/actions.ts ('use server'), nunca por um componente
// client, então RESEND_API_KEY nunca chega no bundle do browser.
//
// Best-effort de propósito: quem chama (a Server Action) já persistiu a
// mensagem em contact_messages ANTES desta função rodar — uma falha
// aqui nunca perde a mensagem, só fica registrada como
// notification_status='failed' pra follow-up manual.

const CONTACT_NOTIFICATION_TO = 'contato@doopla.pro';

export type ContactNotificationInput = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactNotificationResult =
  | { ok: true }
  | { ok: false; error: string };

export async function sendContactNotification(
  input: ContactNotificationInput
): Promise<ContactNotificationResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'RESEND_API_KEY não configurada.' };
  }

  // Remetente configurável por env pra não hardcodar domínio — só
  // funciona de verdade depois que o domínio remetente estiver
  // verificado no Resend (ver instruções fora do código).
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
        to: CONTACT_NOTIFICATION_TO,
        reply_to: input.email,
        subject: `[Contato Doopla] ${input.subject}`,
        text: `Nome: ${input.name}\nE-mail: ${input.email}\n\n${input.message}`,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Resend respondeu ${response.status}: ${body.slice(0, 300)}` };
    }

    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Erro desconhecido ao chamar o Resend.',
    };
  }
}
