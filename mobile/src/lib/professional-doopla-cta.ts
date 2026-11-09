// Espelha src/lib/professional-doopla-cta.ts (painel web) — mesmo
// contrato, mesmo número público, mesma pré-condição
// (whatsappIdentityStatus === 'verified'). Ver o arquivo web pro
// racional completo de como professional_self é resolvido — nenhuma
// mudança de algoritmo, só formalização de contrato de UI.
export function buildTalkToYourDooplaUrl(dooplaWhatsappNumber: string): string {
  const text = 'Oi, Doopla! Aqui é a minha própria conta — quero falar com você.';
  return `https://wa.me/${dooplaWhatsappNumber}?text=${encodeURIComponent(text)}`;
}
