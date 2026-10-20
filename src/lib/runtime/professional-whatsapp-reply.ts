import type { SupabaseClient } from '@supabase/supabase-js';

import { readAppSettingFlag } from './app-settings';
import { sendWhatsappTextMessage } from '../channels/whatsapp/client';
import { whatsappAccessToken, whatsappPhoneNumberId } from '../supabase/env';
import { getWhatsappIdentitySnapshot } from '../whatsapp-identity/data';
import { stripTravessao } from './message-style';

// ADR 0008 (20/10/2026) — contenção do incidente P0 de loop de
// mensagens. Mesmo padrão já estabelecido de app_settings
// (billing_enabled/delegated_contact_enabled, migrations 0099/0109):
// fonte de verdade no banco, reversível por uma linha, nunca por nova
// migration a cada toggle.
//
// Polaridade escolhida DE PROPÓSITO pra ficar fail-closed de graça,
// sem nenhum código extra de tratamento de erro: readAppSettingFlag
// (app-settings.ts) devolve `false` tanto quando a linha não existe
// quanto quando a consulta falhar (ela nunca propaga o erro da query,
// só o ignora e cai no `null?.value === 'true'` -> false). Chamando a
// flag "ENABLED" (nunca "PAUSED"), uma falha de leitura do banco
// SEMPRE vira "não habilitado" -> bloqueia o envio — nunca o
// contrário. Isto é o requisito explícito da fundadora: "uma falha de
// banco não pode permitir envios indevidos durante a contenção".
//
// Escopo confirmado (varredura de todos os call sites): só
// pipeline.ts e delegated-contact-flow.ts chamam esta function — nunca
// o caminho de mensagem pra CLIENTE (outbound_intents/
// send-outbound-intents, tabela e função inteiramente separadas).
// Gatear aqui nunca afeta atendimento a cliente nem booking.
//
// Decisão de propósito: o gate fica só no ENVIO, nunca no
// processamento/fila (professional-self-pending-messages.ts) — o
// Classifier/Planner continuam rodando e persistAiMessage continua
// escrevendo no painel normalmente enquanto pausado (o painel já é o
// registro de verdade, ver comentário abaixo). Consequência desejada:
// a fila NÃO acumula backlog enquanto a flag está desligada — cada
// linha ainda é processada e marcada completed, só o WhatsApp real não
// sai. A profissional continua vendo as respostas abrindo o painel.
export const PROFESSIONAL_SELF_AUTO_REPLY_ENABLED_FLAG = 'professional_self_auto_reply_enabled';

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
  const enabled = await readAppSettingFlag(supabase, PROFESSIONAL_SELF_AUTO_REPLY_ENABLED_FLAG);
  if (!enabled) {
    // Log greppable de propósito (ADR 0008, requisito 7 — confirmar
    // por log real que nenhum envio automático continua acontecendo)
    // — nunca silencioso, mesmo sendo o caminho "normal" de contenção.
    console.error('[professional-self] envio bloqueado pela contenção (app_settings.professional_self_auto_reply_enabled != true)', {
      professionalId: params.professionalId,
    });
    return;
  }

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
