// Professional Product UI — Foundation. Contrato de "Falar com minha
// Doopla" — PROFISSIONAL falando com a PRÓPRIA Doopla, nunca reusa
// cegamente o CTA do CLIENTE (buildWhatsappCtaUrl,
// src/app/orcamento/[slug]/page.tsx), que é semanticamente diferente
// (cliente iniciando um external_inquiry via token de slug).
//
// Como o professional_self é resolvido (arquitetura já existente,
// NENHUMA mudança de código aqui — só documentação do contrato já
// congelado):
//   1. Mesmo número público da Doopla pra TODO inbound
//      (NEXT_PUBLIC_WHATSAPP_NUMBER) — nunca um número por
//      profissional. Confirmado em src/app/orcamento/[slug]/page.tsx.
//   2. O profissional precisa estar mandando a mensagem A PARTIR do
//      número que ele mesmo verificou (professional_whatsapp_identities.verified_number,
//      migration 0064) — é isso, e SÓ isso, que o webhook usa pra
//      resolver quem fala (nunca o conteúdo da mensagem pra identidade,
//      só pra intent/routing de ambiguidade).
//   3. evaluateWhatsappRouting (intake-routing.ts, CONGELADO desde
//      WhatsApp Inbound Foundation) já tem, como prioridade 1,
//      "identidade profissional verificada" -> conversation_type=
//      'professional_self'. Nenhuma mudança de algoritmo necessária —
//      esta Foundation só formaliza o contrato de UI em cima do que já
//      existe.
//
// Pré-condição: whatsappIdentityStatus === 'verified'. Sem isso, o
// CTA não deveria nem aparecer (ou deveria aparecer levando pro fluxo
// de verificação primeiro) — a UI final decide a UX exata, mas o
// contrato aqui é claro: nunca oferecer "Falar com minha Doopla" como
// se fosse identidade confiável antes da verificação real.
//
// Limite honesto, documentado (não uma garantia do código): um wa.me
// link abre o app WhatsApp já instalado no dispositivo, com QUALQUER
// conta que esteja logada nele — nada aqui garante que essa conta é o
// verified_number. Se abrir de um número diferente, o roteamento cai
// pras prioridades seguintes do algoritmo (nunca falha silenciosamente
// nem finge identidade) — comportamento já coberto pelo algoritmo
// congelado, não uma lacuna nova.
export function buildTalkToYourDooplaUrl(dooplaWhatsappNumber: string): string {
  const text = 'Oi, Doopla! Aqui é a minha própria conta — quero falar com você.';
  return `https://wa.me/${dooplaWhatsappNumber}?text=${encodeURIComponent(text)}`;
}
