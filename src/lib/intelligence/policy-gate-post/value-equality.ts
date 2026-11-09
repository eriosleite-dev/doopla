// Doopla Intelligence Core v1 — Post-model Policy Gate: igualdade
// estrutural de valor. Self-contained (não importa os internals não
// exportados de approval/canonicalize.ts — cada bloco fica dono da
// própria implementação, nunca acopla ao que o outro não expôs
// publicamente). Regra igual em espírito à canonicalização do Bloco 5:
// ordena chaves recursivamente, remove null (null e chave ausente são
// equivalentes), nunca reordena array (arrays são posicionalmente
// significativos, ex.: installments de payment_condition).

type JsonLike = null | boolean | number | string | JsonLike[] | { [key: string]: JsonLike };

function stripNullsAndSortKeys(value: JsonLike): JsonLike {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripNullsAndSortKeys);
  if (typeof value === 'object') {
    const out: { [key: string]: JsonLike } = {};
    for (const key of Object.keys(value).sort()) {
      const v = value[key];
      if (v === null || v === undefined) continue;
      out[key] = stripNullsAndSortKeys(v);
    }
    return out;
  }
  return value;
}

// Compara dois valores estruturados (approvedValue de approval_records
// vs valor extraído do draft) por igualdade EXATA, nunca aproximada.
// R$3000 nunca é "igual" a R$2900, nem a R$3000+campo extra (shape
// diferente já falha por igualdade estrutural).
export function valuesStructurallyEqual(a: Record<string, unknown> | null, b: Record<string, unknown> | null): boolean {
  if (a === null || b === null) return a === b;
  return JSON.stringify(stripNullsAndSortKeys(a as JsonLike)) === JSON.stringify(stripNullsAndSortKeys(b as JsonLike));
}
