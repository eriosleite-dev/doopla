// ADR 0009 (20/10/2026) — Mecanismo C do incidente P0 (ADR 0008):
// similaridade de texto pura, sem chamada de IA/embeddings — barata e
// rápida o bastante pra rodar no caminho de envio. Jaccard sobre o
// conjunto de palavras normalizadas (nunca ordem/posição, só
// sobreposição de vocabulário — suficiente pra detectar repetição
// quase-idêntica, que é o único caso que interessa aqui).

function normalizeWords(text: string): Set<string> {
  const normalized = text
    .toLowerCase()
    .replace(/[.,!?;:()"'—\-]/g, ' ')
    .trim();
  if (!normalized) return new Set();
  return new Set(normalized.split(/\s+/));
}

export function jaccardWordSimilarity(a: string, b: string): number {
  const wordsA = normalizeWords(a);
  const wordsB = normalizeWords(b);
  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersectionSize += 1;
  }
  const unionSize = wordsA.size + wordsB.size - intersectionSize;
  return intersectionSize / unionSize;
}
