'use server';

import { z } from 'zod';

import { sendContactNotification } from '@/lib/contact/notify';
import { createClient } from '@/lib/supabase/server';

export type ContactFormValues = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export type ContactFormState = {
  status?: 'success' | 'error';
  message?: string;
  values?: ContactFormValues;
};

const ContactSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  email: z.string().trim().min(1, 'Informe seu e-mail.').email('Informe um e-mail válido.'),
  subject: z.string().trim().min(1, 'Informe o assunto.').max(160, 'Assunto muito longo.'),
  message: z
    .string()
    .trim()
    .min(1, 'Escreva sua mensagem.')
    .max(4000, 'Mensagem muito longa.'),
});

const GENERIC_ERROR = 'Não foi possível enviar sua mensagem agora. Tente novamente em instantes.';

export async function sendContactMessageAction(
  _prevState: ContactFormState,
  formData: FormData
): Promise<ContactFormState> {
  const raw: ContactFormValues = {
    name: String(formData.get('name') ?? ''),
    email: String(formData.get('email') ?? ''),
    subject: String(formData.get('subject') ?? ''),
    message: String(formData.get('message') ?? ''),
  };

  // Honeypot: campo escondido do usuário real (CSS + aria-hidden), que
  // bots de preenchimento automático tendem a preencher. Se veio algo
  // aqui, finge sucesso sem persistir nem notificar nada — não revela
  // ao bot que foi filtrado.
  const honeypot = String(formData.get('company') ?? '').trim();
  if (honeypot) {
    return { status: 'success' };
  }

  const parsed = ContactSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? GENERIC_ERROR,
      values: raw,
    };
  }

  const { name, email, subject, message } = parsed.data;

  const supabase = await createClient();

  // Passo 1: persistir. Isso precisa ter sucesso antes de qualquer
  // tentativa de notificação — é a regra central deste fluxo (mensagem
  // nunca pode se perder por causa de uma falha no Resend).
  const { data: messageId, error: insertError } = await supabase.rpc('submit_contact_message', {
    p_name: name,
    p_email: email,
    p_subject: subject,
    p_message: message,
  });

  if (insertError) {
    if (insertError.message.includes('rate_limited')) {
      return {
        status: 'error',
        message:
          'Você já enviou várias mensagens recentemente. Aguarde alguns minutos ou escreva direto para contato@doopla.pro.',
        values: raw,
      };
    }
    return { status: 'error', message: GENERIC_ERROR, values: raw };
  }

  // Passo 2: notificar (best-effort). A mensagem já está salva — se
  // isso falhar, o usuário ainda vê sucesso (a mensagem chegou pra
  // Doopla, só a notificação por e-mail que não saiu), e o resultado
  // fica registrado em contact_messages.notification_status pra
  // acompanhamento manual.
  const notification = await sendContactNotification({ name, email, subject, message });

  await supabase.rpc('mark_contact_message_notification', {
    p_id: messageId,
    p_status: notification.ok ? 'sent' : 'failed',
    p_error: notification.ok ? null : notification.error,
  });

  return { status: 'success' };
}
