import { createHash } from 'node:crypto';

// Doopla Intelligence Core v1 — Bloco 5: canonicalização determinística
// de ResolutionContext. Fonte de verdade: SPEC V3.10 (delta V3.7→V3.8).
//
// ÚNICA função usada tanto antes da inferência (F1) quanto na
// revalidação imediatamente antes do commit (F2, ver
// commit_approval_resolution na migration 0045) — nunca duas
// implementações paralelas que podem divergir. context_identity é
// SHA-256 (32 bytes) do JSON canônico produzido aqui, fisicamente
// separado do hash de 64 bits (hashtextextended, só em SQL) usado
// exclusivamente pro advisory lock de versionamento — nunca confundir
// os dois.
//
// Regras de canonicalização (V3.8), exaustivas:
// 1. Ordenação de chaves recursiva, lexicográfica (byte a byte), em
//    todo nível de aninhamento — sem exceção.
// 2. messageWindow/activeApprovalCandidates/communicatedProposalCandidates
//    são CONJUNTOS: pré-ordenados por id (UUID) e deduplicados pelo
//    chamador (buildResolutionContext) ANTES de chegar aqui — esta
//    função nunca reordena array nenhum sozinha.
// 3. Arrays semanticamente ordenados (ex.: installments de
//    payment_condition) são preservados na ordem de origem —
//    canonicalizeValue nunca reordena um array.
// 4. Números: só inteiros. Um número não-inteiro FALHA a
//    canonicalização (fail-closed) em vez de ser silenciosamente
//    coagido.
// 5. Datas/horas: strings já formatadas (YYYY-MM-DD / HH:MM) na
//    origem — esta função não reformata, só serializa como veio.
// 6. Strings: normalizadas (NFC) no momento em que o valor é
//    persistido em approval_records — nunca re-normalizadas aqui.
// 7. null e chave ausente são equivalentes: toda chave com valor null
//    é removida recursivamente antes de serializar.
// 8. contextSchemaVersion participa do objeto (já discrimina o
//    digest); a função em si é versionada por nome — canonicalizeV1
//    nunca é editada in-place; uma mudança de regra vira
//    canonicalizeV2, nunca uma mutação retroativa.

export type ContextSchemaVersion = 'v1';

export type ResolutionContextV1 = {
  contextSchemaVersion: 'v1';
  professionalId: string;
  commercialRootId: string;
  messageWindow: MessageWindowEntry[];
  activeApprovalCandidates: ActiveApprovalCandidate[];
  communicatedProposalCandidates: CommunicatedProposalCandidateEntry[];
  structuralFacts: Record<string, JsonValue>;
};

export type MessageWindowEntry = {
  messageId: string;
  authorType: string;
  contentDigest: string; // hex sha256 de {direction, contentType, usableText, transcriptionStatus}
};

export type ActiveApprovalCandidate = {
  approvalRecordId: string;
  decisionCategory: string;
  subjectKey: string;
  approvedValue: JsonValue;
  version: number;
};

export type CommunicatedProposalCandidateEntry = {
  candidateId: string;
  decisionCategory: string;
  subjectKey: string;
  proposedBy: string;
  sourceMessageId: string;
  proposedValue: JsonValue;
};

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export class CanonicalizationError extends Error {}

// Formata um número como inteiro estrito: sem ponto decimal, sem
// notação científica, sem sinal '+', sem zero à esquerda (exceto o
// literal '0'). Falha (fail-closed) se o valor não for um inteiro
// seguro — nunca coage silenciosamente.
function formatStrictInteger(n: number): string {
  if (!Number.isInteger(n) || !Number.isFinite(n)) {
    throw new CanonicalizationError(`valor numérico não-inteiro na canonicalização: ${n}`);
  }
  if (!Number.isSafeInteger(n)) {
    throw new CanonicalizationError(`inteiro fora do range seguro na canonicalização: ${n}`);
  }
  return String(n);
}

// Remove recursivamente toda chave cujo valor seja null (regra 7:
// null e ausente são equivalentes) e ordena chaves recursivamente
// (regra 1). Nunca reordena arrays (regra 2/3) — preserva a ordem
// exata como veio.
function stripNullsAndSortKeys(value: JsonValue): JsonValue {
  if (value === null) return null; // tratado na camada acima (removido do objeto pai)
  if (Array.isArray(value)) {
    return value.map((item) => stripNullsAndSortKeys(item));
  }
  if (typeof value === 'object') {
    const sortedKeys = Object.keys(value)
      .filter((k) => value[k] !== null && value[k] !== undefined)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const out: { [key: string]: JsonValue } = {};
    for (const k of sortedKeys) {
      out[k] = stripNullsAndSortKeys(value[k]);
    }
    return out;
  }
  return value;
}

// Serializa um JsonValue já normalizado (stripNullsAndSortKeys) em
// texto canônico, com formatação estrita de número (regra 4).
function serializeCanonical(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return formatStrictInteger(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map(serializeCanonical).join(',') + ']';
  }
  const keys = Object.keys(value);
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + serializeCanonical(value[k])).join(',') + '}';
}

function compareById<T extends { id: string }>(a: T, b: T): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Ordena e deduplica os três campos que são CONJUNTOS (regra 2) —
// única função de pré-ordenação, chamada antes de canonicalizeV1.
// Deduplicação por id: em caso de duplicata (não deveria ocorrer,
// dado que os ids têm origem em PKs reais), mantém a primeira
// ocorrência — nunca decide por conteúdo.
function sortAndDedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of [...items].sort(compareById)) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      deduped.push(item);
    }
  }
  return deduped;
}

// Ponto de entrada único — v1. Nunca editar in-place (ver regra 8):
// uma mudança de comportamento exige canonicalizeV2 + um novo
// dispatch em canonicalize(), preservando o significado de todo
// context_identity já gravado sob v1.
export function canonicalizeV1(ctx: ResolutionContextV1): string {
  if (ctx.contextSchemaVersion !== 'v1') {
    throw new CanonicalizationError(`canonicalizeV1 chamada com contextSchemaVersion=${ctx.contextSchemaVersion}`);
  }

  const messageWindow = sortAndDedupeById(ctx.messageWindow.map((m) => ({ id: m.messageId, ...m })));
  const activeApprovalCandidates = sortAndDedupeById(ctx.activeApprovalCandidates.map((c) => ({ id: c.approvalRecordId, ...c })));
  const communicatedProposalCandidates = sortAndDedupeById(ctx.communicatedProposalCandidates.map((c) => ({ id: c.candidateId, ...c })));

  const omitId = <T extends { id: string }>(item: T): JsonValue => {
    const { id, ...rest } = item;
    void id;
    return rest as unknown as JsonValue;
  };

  const normalized: JsonValue = {
    contextSchemaVersion: ctx.contextSchemaVersion,
    professionalId: ctx.professionalId,
    commercialRootId: ctx.commercialRootId,
    messageWindow: messageWindow.map(omitId),
    activeApprovalCandidates: activeApprovalCandidates.map(omitId),
    communicatedProposalCandidates: communicatedProposalCandidates.map(omitId),
    structuralFacts: ctx.structuralFacts,
  };

  return serializeCanonical(stripNullsAndSortKeys(normalized));
}

// Dispatch versionado — o único ponto que decide qual canonicalizador
// usar, nunca decidido inline no chamador (evita duas implementações
// divergentes acidentais, achado da V3.4).
const CANONICALIZERS: Record<ContextSchemaVersion, (ctx: ResolutionContextV1) => string> = {
  v1: canonicalizeV1,
};

// computeContextIdentity — SHA-256 (32 bytes) do JSON canônico. Usada
// literalmente no mesmo código em F1 (pré-inferência) e F2
// (revalidação pré-commit) — nunca duas implementações.
export function computeContextIdentity(ctx: ResolutionContextV1): Buffer {
  const canonicalizer = CANONICALIZERS[ctx.contextSchemaVersion];
  if (!canonicalizer) {
    throw new CanonicalizationError(`contextSchemaVersion desconhecida: ${ctx.contextSchemaVersion}`);
  }
  const canonicalJson = canonicalizer(ctx);
  return createHash('sha256').update(canonicalJson, 'utf8').digest();
}

// contentDigest de uma mensagem — participa de MessageWindowEntry.
// Cobre exatamente os campos consumidos como input do resolver
// (direction, contentType, usableText, transcriptionStatus) — nunca
// depende de messageId sozinho como proxy de conteúdo (a auditoria da
// V3.5 mostrou que isso não é garantido estruturalmente por
// conversation_messages).
export function computeMessageContentDigest(params: {
  direction: string;
  contentType: string;
  usableText: string | null;
  transcriptionStatus: string | null;
}): string {
  const canonical = serializeCanonical(
    stripNullsAndSortKeys({
      direction: params.direction,
      contentType: params.contentType,
      usableText: params.usableText,
      transcriptionStatus: params.transcriptionStatus,
    })
  );
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// usableText — deterístico, sem inferência (V3.5): texto se
// content_type='text'; transcript se content_type='audio' E
// transcription_status='done'; null caso contrário (attachment, ou
// áudio ainda não transcrito/falho).
export function computeUsableText(params: { contentType: string; body: string | null; transcript: string | null; transcriptionStatus: string | null }): string | null {
  if (params.contentType === 'text') return params.body;
  if (params.contentType === 'audio' && params.transcriptionStatus === 'done') return params.transcript;
  return null;
}
