// Doopla — vocabulário de atributos com contador (doopla-perfis-avaliacoes.md).
// Máximo de 3 selecionáveis por avaliação, sempre por quem avalia.

export type ReviewAttribute = { key: string; label: string; icon: string };

export const MAX_REVIEW_ATTRIBUTES = 3;

// Atributos que o BOOKER usa pra avaliar o ARTISTA — lista literal do
// documento ("pontual, boa comunicação, profissional, envia informações
// rápido, ótimo de trabalhar, cumpre o combinado").
export const ARTIST_REVIEW_ATTRIBUTES: ReviewAttribute[] = [
  { key: 'pontual', label: 'Pontual', icon: '⏱' },
  { key: 'boa_comunicacao', label: 'Boa comunicação', icon: '💬' },
  { key: 'profissional', label: 'Profissional', icon: '🎯' },
  { key: 'envia_info_rapido', label: 'Envia informações rápido', icon: '⚡' },
  { key: 'otimo_de_trabalhar', label: 'Ótimo de trabalhar', icon: '🤝' },
  { key: 'cumpre_combinado', label: 'Cumpre o combinado', icon: '✓' },
];

// Atributos que o ARTISTA usa pra avaliar o BOOKER. O documento só dá um
// exemplo ("Responde rápido") — esta lista completa segue o mesmo tom, mas
// ainda não foi confirmada palavra por palavra por quem define o produto.
export const BOOKER_REVIEW_ATTRIBUTES: ReviewAttribute[] = [
  { key: 'responde_rapido', label: 'Responde rápido', icon: '⚡' },
  { key: 'negocia_com_clareza', label: 'Negocia com clareza', icon: '💬' },
  { key: 'paga_em_dia', label: 'Paga em dia', icon: '💰' },
  { key: 'organizado', label: 'Organizado', icon: '🗂' },
  { key: 'cumpre_combinado', label: 'Cumpre o combinado', icon: '✓' },
  { key: 'indicaria_de_novo', label: 'Indicaria de novo', icon: '🤝' },
];

export function reviewAttributesFor(revieweeRole: 'artista' | 'booker'): ReviewAttribute[] {
  return revieweeRole === 'artista' ? ARTIST_REVIEW_ATTRIBUTES : BOOKER_REVIEW_ATTRIBUTES;
}

export function labelForAttribute(revieweeRole: 'artista' | 'booker', key: string): string {
  const list = reviewAttributesFor(revieweeRole);
  return list.find((a) => a.key === key)?.label ?? key;
}
