// Doopla Intelligence Core v1 — canal WhatsApp, passo 6A+6B Fase 2:
// template fixo do primeiro contato ("profissional manda contato ->
// Doopla inicia", sem CSW aberta). Existe só UM template nesta fase —
// nome/idioma/estrutura de parâmetros ficam constantes versionadas em
// código (mesmo espírito de TRANSIENT_META_ERROR_CODES/
// PERMANENT_META_ERROR_CODES: tabela fechada, hand-curated, nunca uma
// tabela própria no banco). Aprovação do conteúdo em si é externa
// (Meta) — mudar o texto aqui é só a metade da mudança, a outra
// metade é resubmeter pra revisão.
//
// 100% puro — sem I/O. renderColdOutreachTemplateContent produz a
// MESMA string tanto pro content humano-legível de outbound_intents
// quanto pro parâmetro que de fato vai no payload da Meta — nunca duas
// fontes divergentes do que foi comunicado.

export const COLD_OUTREACH_TEMPLATE_NAME = 'doopla_cold_outreach_intro';
export const COLD_OUTREACH_TEMPLATE_LANGUAGE = 'pt_BR';

export function renderColdOutreachTemplateContent(professionalDisplayName: string): string {
  return `Olá! Aqui é a Doopla — ${professionalDisplayName} recebeu seu contato e gostaria de conversar sobre uma possível contratação. Pode responder por aqui que a conversa segue direto com ela.`;
}

export type WhatsappTemplateComponent = {
  type: 'body';
  parameters: Array<{ type: 'text'; text: string }>;
};

// Componentes no formato exigido pela Cloud API (POST .../messages,
// type:"template") — client.ts nunca decide o conteúdo, só transporta
// o que esta function monta.
export function buildColdOutreachTemplateComponents(professionalDisplayName: string): WhatsappTemplateComponent[] {
  return [{ type: 'body', parameters: [{ type: 'text', text: professionalDisplayName }] }];
}
