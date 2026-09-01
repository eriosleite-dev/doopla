import { classifyMetaSendError } from './error-classification';
import { toWhatsappApiRecipient } from './phone';
import type { WhatsappTemplateComponent } from './cold-outreach-template';

// Doopla Intelligence Core v1 — canal WhatsApp (passo 6B): client fino
// sobre a WhatsApp Cloud API (Graph API). Único ponto do projeto que
// fala HTTP com a Meta pra ENVIAR — nunca chamado pelo Planner/Gate/
// Approval Engine (não é uma tool, é o executor de outbound_intents
// já autorizados, chamado só pelo sender worker).
//
// Classificação de resultado alinhada ao contrato de
// outbound_intents.delivery_state (runtime/outbound.ts, migration
// 0051) — decisão do usuário: o critério é se recebemos uma resposta
// HTTP DEFINITIVA da Meta, nunca o tipo de exceção JS. Nenhuma
// resposta definitiva (timeout, conexão caída, exceção de rede,
// qualquer coisa antes de um status HTTP real chegar) → sentUnknown,
// nunca sentFailed. Resposta definitiva com erro → classificada por
// código real da Meta (classifyMetaSendError), nunca por status HTTP
// sozinho.

export type WhatsappSendResult =
  | { kind: 'sent_confirmed'; providerMessageId: string }
  | { kind: 'sent_unknown' }
  | { kind: 'failed_transient'; reason: string }
  | { kind: 'failed_permanent'; reason: string };

export type WhatsappClientConfig = {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
};

type MetaErrorBody = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type MetaSendSuccessBody = {
  messages?: Array<{ id?: string }>;
};

export async function sendWhatsappTextMessage(config: WhatsappClientConfig, params: { to: string; body: string }): Promise<WhatsappSendResult> {
  return postWhatsappMessage(config, {
    messaging_product: 'whatsapp',
    to: toWhatsappApiRecipient(params.to),
    type: 'text',
    text: { body: params.body },
  });
}

// Passo 6A+6B Fase 2 — primeiro contato sem CSW aberta. Nunca decide
// SE deve mandar template (isso é do chamador, ver cold-outreach.ts/
// send-outbound-intents/route.ts) — só monta o payload no formato que
// a Cloud API exige (nome/idioma/components, nunca texto livre) e
// reaproveita a MESMA classificação de resultado de sendWhatsappTextMessage
// (postWhatsappMessage abaixo) — 2xx+wamid/ambíguo/erro classificado
// por código são agnósticos ao tipo de mensagem enviada.
export async function sendWhatsappTemplateMessage(
  config: WhatsappClientConfig,
  params: { to: string; templateName: string; languageCode: string; components: WhatsappTemplateComponent[] }
): Promise<WhatsappSendResult> {
  return postWhatsappMessage(config, {
    messaging_product: 'whatsapp',
    to: toWhatsappApiRecipient(params.to),
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode },
      components: params.components,
    },
  });
}

async function postWhatsappMessage(config: WhatsappClientConfig, payload: Record<string, unknown>): Promise<WhatsappSendResult> {
  const apiVersion = config.apiVersion ?? 'v20.0';
  const url = `https://graph.facebook.com/${apiVersion}/${config.phoneNumberId}/messages`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    // Exceção de rede/timeout/conexão — nunca sabemos se a Meta
    // recebeu a requisição antes de a conexão cair. Nunca
    // failed_transient aqui (isso afirmaria "sabemos que não foi
    // aceito", o que não é verdade).
    return { kind: 'sent_unknown' };
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    // Conexão aceitou a resposta (status HTTP já existe) mas o corpo
    // nunca terminou de chegar — mesma ambiguidade de não ter resposta
    // definitiva nenhuma.
    return { kind: 'sent_unknown' };
  }

  if (response.ok) {
    let parsed: MetaSendSuccessBody | null = null;
    try {
      parsed = JSON.parse(bodyText) as MetaSendSuccessBody;
    } catch {
      parsed = null;
    }
    const providerMessageId = parsed?.messages?.[0]?.id;
    if (providerMessageId) {
      return { kind: 'sent_confirmed', providerMessageId };
    }
    // 2xx sem wamid no corpo — formato inesperado, efeito ambíguo
    // apesar de resposta HTTP definitiva (decisão do usuário: nunca
    // forçar sent_confirmed sem prova real). Nunca failed_* também —
    // a Meta respondeu 2xx, pode muito bem ter aceitado.
    return { kind: 'sent_unknown' };
  }

  let errorBody: MetaErrorBody | null = null;
  try {
    errorBody = JSON.parse(bodyText) as MetaErrorBody;
  } catch {
    errorBody = null;
  }
  const errorCode = errorBody?.error?.code ?? null;
  const reason = errorBody?.error?.message ?? `HTTP ${response.status} sem corpo de erro reconhecível`;

  const classification = classifyMetaSendError(errorCode);
  return classification === 'transient' ? { kind: 'failed_transient', reason } : { kind: 'failed_permanent', reason };
}
