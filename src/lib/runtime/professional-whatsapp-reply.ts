import type { SupabaseClient } from '@supabase/supabase-js';

import { readAppSettingFlag } from './app-settings';
import { sendWhatsappTextMessage } from '../channels/whatsapp/client';
import { isLatestInboundProfessionalMessage } from './conversation-freshness';
import { isReplyLoopDetected } from './reply-loop-detection';
import { claimProfessionalSelfWhatsappSend } from './professional-self-whatsapp-sends';
import { isProfessionalSelfReplyPaused } from './professional-self-reply-pause';
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
//
// ADR 0009 (20/10/2026) — Mecanismo D do incidente P0 (ADR 0008):
// aiMessageId é o id real já persistido em conversation_messages
// (nunca um identificador novo inventado) — reivindicado via
// claim_professional_self_whatsapp_send (migration 0122) ANTES de
// qualquer envio real. Um retry do drain pra uma linha cujo envio
// anterior teve sucesso do lado do provider (ex.: timeout de rede na
// resposta, mas a mensagem chegou) nunca manda duas vezes a mesma
// mensagem — a segunda tentativa encontra a reivindicação já feita e
// retorna sem chamar o provider.
//
// ADR 0009 (20/10/2026) — Mecanismo A do incidente P0 (ADR 0008):
// triggerMessageId é OPCIONAL de propósito — só os fluxos onde existe
// uma mensagem INBOUND real da profissional por trás desta resposta
// (ciclo principal do pipeline.ts, pedido de delegação em
// delegated-contact-flow.ts) passam ele; fluxos sem uma mensagem
// "gatilho" natural (ex.: resposta a uma reply do DESTINATÁRIO externo)
// omitem e nunca sofrem a checagem — nunca forçado onde o conceito não
// se aplica. Quando presente: se a profissional já escreveu algo MAIS
// NOVO que triggerMessageId nesta conversation enquanto o ciclo
// rodava, a resposta já está obsoleta — o envio é descartado (nunca a
// mensagem de IA em si, que já está persistida no painel).
//
// ADR 0009 (20/10/2026) — Mecanismo C do incidente P0 (ADR 0008):
// detecção de loop (rede de segurança adicional, ver reply-loop-detection.ts).
export async function sendProfessionalSelfReplyViaWhatsapp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { professionalId: string; conversationId: string; body: string; aiMessageId: string; triggerMessageId?: string | null }
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
    // ADR 0009 (20/10/2026) — Mecanismo B do incidente P0 (ADR 0008):
    // pausa real, reconhecida semanticamente pelo recognizer isolado em
    // intelligence/professional-self-pause e setada por pipeline.ts.
    // Checada aqui, nunca no Policy Gate (ver migration 0123 pro
    // porquê) — a mensagem de IA já está persistida no painel; só o
    // envio físico é suprimido enquanto pausado.
    if (await isProfessionalSelfReplyPaused(supabase, params.conversationId)) {
      console.error('[professional-self] envio suprimido — conversa pausada a pedido da profissional (Mecanismo B, ADR 0009)', {
        professionalId: params.professionalId,
        conversationId: params.conversationId,
      });
      return;
    }

    if (params.triggerMessageId) {
      const fresh = await isLatestInboundProfessionalMessage(supabase, { conversationId: params.conversationId, triggerMessageId: params.triggerMessageId });
      if (!fresh) {
        // Resposta obsoleta — a profissional já escreveu algo mais novo.
        // A mensagem de IA já está persistida no painel (nunca
        // descartada); só o envio físico pelo WhatsApp é suprimido.
        console.error('[professional-self] envio descartado — resposta obsoleta (atualidade, ADR 0009)', {
          professionalId: params.professionalId,
          triggerMessageId: params.triggerMessageId,
        });
        return;
      }
    }

    // ADR 0009 (20/10/2026) — Mecanismo C do incidente P0 (ADR 0008):
    // rede de segurança adicional, nunca a correção da causa raiz
    // (essa é A/B acima). Suprime só quando as últimas 3 respostas de
    // IA nesta conversation já são quase-idênticas à que está pra
    // sair — nunca bloqueia uma resposta parecida só uma vez. A
    // mensagem de IA já está persistida no painel; só o envio físico é
    // suprimido, nunca uma mensagem automática de "não consegui
    // resolver" é mandada no lugar (decisão de produto: alertar via
    // log, nunca decidir um novo texto sem revisão).
    if (await isReplyLoopDetected(supabase, { conversationId: params.conversationId, aiMessageId: params.aiMessageId, body: params.body })) {
      console.error('[professional-self] envio suprimido — padrão de repetição detectado (Mecanismo C, ADR 0009)', {
        professionalId: params.professionalId,
        conversationId: params.conversationId,
        aiMessageId: params.aiMessageId,
      });
      return;
    }

    const claimed = await claimProfessionalSelfWhatsappSend(supabase, { aiMessageId: params.aiMessageId });
    if (!claimed) {
      // Já reivindicada antes (enviada ou em voo nesse exato instante)
      // — nunca um segundo envio físico da mesma mensagem de IA.
      console.error('[professional-self] envio ignorado — aiMessageId já reivindicado antes (idempotência, ADR 0009)', {
        professionalId: params.professionalId,
        aiMessageId: params.aiMessageId,
      });
      return;
    }

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
