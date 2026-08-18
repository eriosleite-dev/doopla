// Doopla — vocabulário de atributos com contador (doopla-perfis-avaliacoes
// final). 6 tags fixas por lado, sempre por quem avalia — pode marcar
// quantas fizerem sentido, sem limite artificial.

export type ReviewAttribute = { key: string; label: string; icon: string };

// Atributos que o BOOKER usa pra avaliar o ARTISTA — o booker normalmente
// não está no show, então as tags são sobre o processo de
// negociação/relação, não sobre o show em si.
export const ARTIST_REVIEW_ATTRIBUTES: ReviewAttribute[] = [
  { key: 'resposta_rapida', label: 'Resposta rápida', icon: '⚡' },
  { key: 'cumpriu_combinado', label: 'Cumpriu o combinado', icon: '✓' },
  { key: 'flexivel_negociacao', label: 'Flexível na negociação', icon: '⚖' },
  { key: 'facil_comunicacao', label: 'Fácil comunicação', icon: '💬' },
  { key: 'profissional', label: 'Profissional', icon: '🎯' },
  { key: 'recomendaria', label: 'Recomendaria novamente', icon: '🤝' },
];

// Atributos que o ARTISTA usa pra avaliar o BOOKER.
export const BOOKER_REVIEW_ATTRIBUTES: ReviewAttribute[] = [
  { key: 'atendimento_rapido', label: 'Atendimento rápido', icon: '⚡' },
  { key: 'atendimento_cordial', label: 'Atendimento cordial', icon: '🙂' },
  { key: 'negociacao_justa', label: 'Negociação justa', icon: '⚖' },
  { key: 'comunicacao_clara', label: 'Comunicação clara', icon: '💬' },
  { key: 'pontual', label: 'Pontual', icon: '⏱' },
  { key: 'recomendaria', label: 'Recomendaria novamente', icon: '🤝' },
];

export function reviewAttributesFor(revieweeRole: 'artista' | 'booker'): ReviewAttribute[] {
  return revieweeRole === 'artista' ? ARTIST_REVIEW_ATTRIBUTES : BOOKER_REVIEW_ATTRIBUTES;
}

export function labelForAttribute(revieweeRole: 'artista' | 'booker', key: string): string {
  const list = reviewAttributesFor(revieweeRole);
  return list.find((a) => a.key === key)?.label ?? key;
}
