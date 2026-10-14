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

// Nome real aprovado pelo Meta (14/10/2026): doopla_primeiro_contato_v2.
// A primeira tentativa (doopla_cold_outreach_intro) nunca existiu de
// fato na Business Account (0 templates ativos), causando o erro real
// de produção #132001 "Template name does not exist in the
// translation" no primeiro teste controlado.
export const COLD_OUTREACH_TEMPLATE_NAME = 'doopla_primeiro_contato_v2';
export const COLD_OUTREACH_TEMPLATE_LANGUAGE = 'pt_BR';

export function renderColdOutreachTemplateContent(professionalDisplayName: string): string {
  return `Olá! Tudo bem? 👋\n\nSou a Doopla, representante inteligente de ${professionalDisplayName}. Podemos conversar?`;
}

export type WhatsappTemplateComponent = {
  type: 'body';
  parameters: Array<{ type: 'text'; parameter_name: string; text: string }>;
};

// Componentes no formato exigido pela Cloud API (POST .../messages,
// type:"template") — client.ts nunca decide o conteúdo, só transporta
// o que esta function monta. O template usa variável NOMEADA
// ({{professional_name}}, não posicional {{1}}), exigência da versão
// atual da UI do WhatsApp Manager para esta Business Account — por
// isso parameter_name é obrigatório em cada parâmetro de texto.
export function buildColdOutreachTemplateComponents(professionalDisplayName: string): WhatsappTemplateComponent[] {
  return [{ type: 'body', parameters: [{ type: 'text', parameter_name: 'professional_name', text: professionalDisplayName }] }];
}
