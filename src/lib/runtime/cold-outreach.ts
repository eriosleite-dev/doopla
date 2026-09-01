import type { SupabaseClient } from '@supabase/supabase-js';

// Doopla Intelligence Core v1 — Runtime, passo 6A+6B Fase 2: elegibilidade
// do ramo determinístico de outreach frio (pipeline.ts) e revalidação
// da CSW no momento do envio (send-outbound-intents/route.ts). Duas
// funções puras (testáveis sem I/O) + um wrapper de leitura — CSW é
// SEMPRE derivada de conversation_messages real (get_last_whatsapp_inbound_at,
// migration 0058), nunca um estado persistido à parte.

// Mesma janela que a Meta usa (Customer Service Window) — fonte única,
// nunca duplicada entre a decisão de criação e a revalidação de envio.
export const CSW_WINDOW_MS = 24 * 60 * 60 * 1000;

export function isCswOpen(lastWhatsappInboundAt: string | null, now: Date): boolean {
  if (lastWhatsappInboundAt === null) return false;
  return now.getTime() - new Date(lastWhatsappInboundAt).getTime() < CSW_WINDOW_MS;
}

// Decide, na CRIAÇÃO (pipeline.ts), se este evento é candidato ao ramo
// determinístico de template — nenhuma chamada a model/Planner
// envolvida nesta decisão nem em nada que ela habilita. Só profissional
// iniciando um whatsapp external_inquiry SEM CSW aberta (nunca falou
// antes, ou a última mensagem inbound saiu da janela).
export function shouldSendColdOutreachTemplate(params: {
  authorType: 'external_participant' | 'professional';
  channel: string;
  conversationType: string;
  externalParticipantId: string | null;
  lastWhatsappInboundAt: string | null;
  now: Date;
}): boolean {
  if (params.authorType !== 'professional') return false;
  if (params.channel !== 'whatsapp') return false;
  if (params.conversationType !== 'external_inquiry') return false;
  if (!params.externalParticipantId) return false;
  return !isCswOpen(params.lastWhatsappInboundAt, params.now);
}

export type SendAction = 'send_free_text' | 'send_template' | 'fail_closed_csw_expired';

// Revalidação no momento do ENVIO (send-outbound-intents/route.ts) —
// send_as é a intenção registrada na criação, NUNCA uma autorização de
// envio incondicional (a CSW pode ter fechado no intervalo entre criar
// o outbound_intent e o cron reclamá-lo). Decisão do usuário, 3 ramos
// fechados, nenhuma conversão automática:
// - send_as='template' -> sempre pode mandar o template (não depende
//   de CSW por definição da própria Cloud API).
// - send_as='free_text' + CSW ainda aberta -> manda texto, sem mudança.
// - send_as='free_text' + CSW fechada -> fail closed. NUNCA converte
//   pra template sozinho (o conteúdo aprovado pelo Runtime pro texto
//   livre pode ter semântica completamente diferente do template fixo
//   de introdução) — quem chama isto usa markOutboundIntentFailed
//   (permanent:true), o MESMO estado/função já existente, nunca um
//   estado novo inventado pra este caso.
export function resolveSendAction(sendAs: string, cswOpen: boolean): SendAction {
  if (sendAs === 'template') return 'send_template';
  return cswOpen ? 'send_free_text' : 'fail_closed_csw_expired';
}

export async function getLastWhatsappInboundAt(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  params: { externalParticipantId: string }
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_last_whatsapp_inbound_at', { p_external_participant_id: params.externalParticipantId });
  if (error) throw new Error(`get_last_whatsapp_inbound_at falhou: ${error.message}`);
  return (data as string | null) ?? null;
}
