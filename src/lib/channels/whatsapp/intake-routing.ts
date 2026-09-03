// Doopla Intelligence Core v1 — WhatsApp Inbound Foundation: núcleo
// determinístico do algoritmo de routing (matriz aprovada) + parsers
// de token/confirmação. 100% puro, sem I/O — testável isoladamente,
// nunca chama banco/rede. A parte que PRECISA de banco (buscar
// candidatos por nome, ler external_participant_channel_identities)
// fica em intake-orchestration.ts, que consome este módulo.
//
// Princípio central (aprovado): identidade nunca é sobreposta por
// texto livre — só um sinal DETERMINÍSTICO (token) pode redirecionar
// o destino de UMA mensagem, mesmo quando o remetente é um
// profissional verificado. Nome mencionado nunca decide sozinho.
// Histórico nunca atropela um sinal atual conflitante quando esse
// sinal é o token; quando o conflito é só nome-vs-histórico, sempre
// confirmação.

export type RoutingCandidate = { professionalId: string; label: string };

export type RoutingInput = {
  // Sempre null até o bloco "Professional WhatsApp Identity" existir
  // (whatsapp_verified_number) — parâmetro já presente pra não exigir
  // retrabalho do algoritmo quando esse bloco chegar.
  verifiedProfessionalId: string | null;
  // Contexto determinístico de entrada (doopla.com/<slug>) extraído da
  // mensagem atual OU de qualquer mensagem já acumulada na sessão.
  token: { professionalId: string; slug: string } | null;
  // Candidatos por nome mencionado no texto (atual + backlog) — nunca
  // decide sozinho, só reduz candidatos pra confirmação.
  nameMentionCandidates: RoutingCandidate[];
  // Relação(ões) já existentes em external_participant_channel_identities
  // pro telefone.
  historyMatches: RoutingCandidate[];
  // Desempate de QUAL candidato sugerir primeiro quando há ambiguidade
  // — nunca decide sozinho, só ordena a pergunta.
  recentActivityProfessionalId: string | null;
};

export type RoutingDecision =
  | { outcome: 'resolved'; method: 'verified_professional' | 'token' | 'unique_history'; professionalId: string }
  | { outcome: 'needs_confirmation'; candidates: RoutingCandidate[]; suggestedIndex: number | null }
  // Nenhum sinal nenhum — cabe ao chamador abrir a pergunta genérica
  // ("quem você gostaria de contratar?"), não uma confirmação fechada.
  | { outcome: 'no_signal' };

function dedupeCandidates(lists: RoutingCandidate[][]): RoutingCandidate[] {
  const seen = new Map<string, RoutingCandidate>();
  for (const list of lists) {
    for (const c of list) {
      if (!seen.has(c.professionalId)) seen.set(c.professionalId, c);
    }
  }
  return [...seen.values()];
}

function suggestedIndexFor(candidates: RoutingCandidate[], recentActivityProfessionalId: string | null): number | null {
  if (!recentActivityProfessionalId) return null;
  const idx = candidates.findIndex((c) => c.professionalId === recentActivityProfessionalId);
  return idx >= 0 ? idx : null;
}

export function evaluateWhatsappRouting(input: RoutingInput): RoutingDecision {
  const { verifiedProfessionalId, token, nameMentionCandidates, historyMatches, recentActivityProfessionalId } = input;

  // 1) Identidade verificada — sempre primeiro. Só um TOKEN pra outro
  //    profissional (nunca texto livre) pode redirecionar o destino
  //    desta mensagem específica, sem jamais alterar a identidade.
  if (verifiedProfessionalId !== null) {
    if (token !== null && token.professionalId !== verifiedProfessionalId) {
      return { outcome: 'resolved', method: 'token', professionalId: token.professionalId };
    }
    return { outcome: 'resolved', method: 'verified_professional', professionalId: verifiedProfessionalId };
  }

  // 2) Sinal de intenção atual: token presente.
  if (token !== null) {
    const conflictingMention = nameMentionCandidates.filter((c) => c.professionalId !== token.professionalId);
    if (conflictingMention.length > 0) {
      const candidates = dedupeCandidates([[{ professionalId: token.professionalId, label: token.slug }], nameMentionCandidates]);
      return { outcome: 'needs_confirmation', candidates, suggestedIndex: 0 };
    }
    // Token vence histórico conflitante, sem bloquear — sinal atual
    // determinístico nunca é atropelado pelo passado.
    return { outcome: 'resolved', method: 'token', professionalId: token.professionalId };
  }

  // 3) Sem token — nome mencionado no texto.
  if (nameMentionCandidates.length === 1) {
    const mentioned = nameMentionCandidates[0];
    if (historyMatches.length === 1 && historyMatches[0].professionalId === mentioned.professionalId) {
      // Concordam — continuidade real, sem necessidade de perguntar.
      return { outcome: 'resolved', method: 'unique_history', professionalId: mentioned.professionalId };
    }
    if (historyMatches.length === 0) {
      // Nome sozinho, sem histórico nenhum — confirmação leve (nunca
      // decide 100% sozinho, mesmo sendo a única opção).
      return { outcome: 'needs_confirmation', candidates: [mentioned], suggestedIndex: 0 };
    }
    // Histórico existe mas diverge (1 diferente, ou 2+) — nunca herda
    // o histórico silenciosamente. Confirmação com os dois lados.
    const candidates = dedupeCandidates([[mentioned], historyMatches]);
    return { outcome: 'needs_confirmation', candidates, suggestedIndex: 0 };
  }

  if (nameMentionCandidates.length >= 2) {
    const candidates = dedupeCandidates([nameMentionCandidates]);
    return { outcome: 'needs_confirmation', candidates, suggestedIndex: suggestedIndexFor(candidates, recentActivityProfessionalId) };
  }

  // 4) Nenhum sinal atual (nem token, nem nome) — só histórico decide.
  if (historyMatches.length === 1) {
    return { outcome: 'resolved', method: 'unique_history', professionalId: historyMatches[0].professionalId };
  }
  if (historyMatches.length >= 2) {
    return { outcome: 'needs_confirmation', candidates: historyMatches, suggestedIndex: suggestedIndexFor(historyMatches, recentActivityProfessionalId) };
  }

  return { outcome: 'no_signal' };
}

// ============================================================
// Token determinístico de entrada — link individual público
// (doopla.com/<slug>), nunca um código escondido. Regex fechada: nunca
// fuzzy, nunca aceita variação de domínio.
// ============================================================
const DOOPLA_LINK_PATTERN = /doopla\.com\/([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)/i;

export function extractDooplaSlugToken(text: string): string | null {
  const match = text.match(DOOPLA_LINK_PATTERN);
  return match ? match[1].toLowerCase() : null;
}

// ============================================================
// Menção por nome — comparação simples, tolerante a acento/caixa,
// NUNCA fuzzy/tolerante a erro de digitação nesta v1 (documentado
// como simplificação deliberada — a segurança vem de nunca decidir
// sozinho, não da precisão do match).
// ============================================================
function normalizeForMatch(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function textMentionsName(text: string, name: string): boolean {
  const normalizedName = normalizeForMatch(name);
  if (!normalizedName) return false;
  return normalizeForMatch(text).includes(normalizedName);
}

// ============================================================
// Parser de confirmação — restrito e contextual: só resolve contra as
// opções JÁ oferecidas neste prompt específico (current_prompt_options),
// nunca reabre fuzzy matching contra o catálogo inteiro. Aceita
// posição numérica, ordinal por extenso, nome de uma das opções, ou
// afirmação simples quando havia 1 única opção — nunca URA
// burocrática, mas nunca decide fora do que foi perguntado.
// ============================================================
export type PromptOption = { index: number; professionalId: string; label: string };

const ORDINALS_PT = ['primeira', 'primeiro', 'segunda', 'segundo', 'terceira', 'terceiro', 'quarta', 'quarto'];
const AFFIRMATIVES_PT = ['sim', 'isso', 'exato', 'correto', 'isso mesmo', 'e ele', 'é ele', 'e ela', 'é ela', 'esse', 'essa'];

export function parseDisambiguationReply(reply: string, options: PromptOption[]): PromptOption | null {
  if (options.length === 0) return null;
  const normalized = normalizeForMatch(reply);
  if (!normalized) return null;

  const numMatch = normalized.match(/\d+/);
  if (numMatch) {
    const n = parseInt(numMatch[0], 10);
    const found = options.find((o) => o.index === n);
    if (found) return found;
  }

  // ORDINALS_PT é pares [feminino, masculino] por posição — opção 0
  // casa com índices 0/1 ("primeira"/"primeiro"), opção 1 com 2/3, etc.
  for (let i = 0; i < options.length; i++) {
    const feminino = ORDINALS_PT[i * 2];
    const masculino = ORDINALS_PT[i * 2 + 1];
    if ((feminino && normalized.includes(feminino)) || (masculino && normalized.includes(masculino))) {
      return options[i];
    }
  }

  if (options.length === 1 && AFFIRMATIVES_PT.some((a) => normalized === a || normalized.startsWith(`${a} `))) {
    return options[0];
  }

  const nameMatches = options.filter((o) => {
    const label = normalizeForMatch(o.label);
    return label.length > 0 && (normalized.includes(label) || label.includes(normalized));
  });
  if (nameMatches.length === 1) return nameMatches[0];

  return null;
}
