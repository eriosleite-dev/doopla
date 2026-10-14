import type { SupabaseClient } from '@supabase/supabase-js';

import { sendWhatsappTextMessage } from '../channels/whatsapp/client';
import { whatsappAccessToken, whatsappPhoneNumberId } from '../supabase/env';
import { getWhatsappIdentitySnapshot } from '../whatsapp-identity/data';
import { stripTravessao } from './message-style';

// Doopla Intelligence Core v1 — Runtime: "Falar com minha Doopla"
// (produto, setembro/2026 — buildTalkToYourDooplaUrl/professional-doopla-cta.ts
// já formalizava o contrato; concluído 13/10/2026). Quando a conversa
// professional_self acontece PELO WhatsApp (event.channel='whatsapp'),
// a resposta da IA — já persistida no painel via persistAiMessage,
// fonte de verdade, nunca substituída — também precisa chegar no
// WhatsApp de verdade, senão o profissional só vê a resposta abrindo o
// painel, nunca dentro da própria conversa que iniciou.
//
// Nunca usa outbound_intents: esse mecanismo é exclusivo de canal
// externo real com provider (CSW, template de reengajamento, retry
// via cron) — aqui é sempre o PRÓPRIO profissional, nunca um cliente,
// então o mesmo padrão síncrono e best-effort de
// sendSystemWhatsappMessage (intake-orchestration.ts) já usado pros
// prompts de sistema do intake: falha de envio aqui NUNCA derruba o
// ciclo do Runtime (o painel já tem o registro autoritativo), só fica
// em log pra investigação.
//
// Defesa em profundidade: só envia quando o número é realmente
// VERIFICADO (nunca 'candidate'/pendente) — nunca confia no conteúdo
// da mensagem, só no estado real de professional_whatsapp_identities.
export async function sendProfessionalSelfReplyViaWhatsapp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { professionalId: string; body: string }
): Promise<void> {
  try {
    const identity = await getWhatsappIdentitySnapshot(supabase, params.professionalId);
    if (!identity || identity.status !== 'verified' || !identity.verifiedNumber) return;

    await sendWhatsappTextMessage(
      { accessToken: whatsappAccessToken(), phoneNumberId: whatsappPhoneNumberId() },
      // P1 UX (14/10/2026) — defesa em profundidade: já sanitizado em
      // persistAiMessage, mas este envio recebe sua própria cópia de
      // params.body do pipeline, nunca relida do banco — sanitiza de
      // novo aqui (idempotente, nunca duas vezes com efeito diferente).
      { to: identity.verifiedNumber, body: stripTravessao(params.body) }
    );
  } catch (err) {
    console.error('[professional-self] falha ao enviar resposta da IA pelo WhatsApp', err);
  }
}
