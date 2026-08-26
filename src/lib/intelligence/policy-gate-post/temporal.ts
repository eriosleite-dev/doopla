// Doopla Intelligence Core v1 — Post-model Policy Gate: resolução
// temporal por closed-candidate-selection (decisão do usuário).
//
// O model NUNCA calcula/inventa uma data — o CÓDIGO gera uma lista
// fechada de candidatos plausíveis a partir de referenceTimestamp +
// timezone (dados estruturais explícitos, nunca new Date() implícito
// do servidor); o extrator só SELECIONA um label dessa lista (ou
// declara não resolvido); o código valida de novo antes de aceitar.
// Mesmo princípio já usado no Approval Resolver (V2, closed-candidate-
// selection): o model nunca referencia livremente algo fora do que o
// código já enumerou.
//
// timezone é SEMPRE explícito, fornecido por quem chama — nunca um
// default silencioso do domínio (decisão do usuário: Doopla começa no
// Brasil, mas profissionais/bookings podem estar em outro fuso, e não
// existe hoje nenhuma coluna de timezone no schema pra derivar isso
// com confiança). timezone=null é um estado válido e comum ainda —
// significa "sem candidatos", nunca "assume America/Sao_Paulo".

export type TemporalContext = {
  // ISO-8601 — da mensagem-gatilho real da conversa (conversation_messages.created_at),
  // nunca new Date() do processo rodando o Gate.
  referenceTimestamp: string;
  // IANA (ex.: 'America/Sao_Paulo') — null quando não há fonte
  // confiável. Nunca um default implícito.
  timezone: string | null;
  // YYYY-MM-DD — quando o commercial root já tem uma data estrutural
  // conhecida (ex.: bookings/opportunities.event_date), fornecida
  // explicitamente por quem monta o input do Gate.
  knownEventDate: string | null;
};

export type TemporalCandidate = { label: string; date: string };

const WEEKDAY_KEYS = ['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'] as const;

// Horizonte de plausibilidade — mesmo espírito de MAX_EVIDENCE_USED
// (planner/invariants.ts): nunca uma trava de produto, só higiene
// estrutural contra um extrator hostil/quebrado devolvendo uma data
// absurda mesmo que bem-formada.
export const MAX_DATE_HORIZON_DAYS = 730;

type YMD = { year: number; month: number; day: number };

function formatYMD(ymd: YMD): string {
  const mm = String(ymd.month).padStart(2, '0');
  const dd = String(ymd.day).padStart(2, '0');
  return `${ymd.year}-${mm}-${dd}`;
}

function parseYMD(date: string): YMD | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

// Data de calendário (Y-M-D) de um instante NUM TIMEZONE específico —
// única parte que depende de timezone; usa só Intl.DateTimeFormat
// (built-in, sem dependência nova). A partir daqui, toda aritmética é
// pura sobre a tripla Y-M-D (Date.UTC como calculadora de calendário,
// nunca como instante real) — nunca mistura instante+timezone de novo,
// o que evita bugs de DST na aritmética.
function localYMD(instant: Date, timezone: string): YMD | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = fmt.formatToParts(instant);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (!year || !month || !day) return null;
    return { year, month, day };
  } catch {
    // timezone inválido (IANA desconhecido) — nunca lança, nunca
    // assume um fallback. Chamador trata null como "sem candidatos".
    return null;
  }
}

function addDays(ymd: YMD, days: number): YMD {
  const d = new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

// 0=domingo..6=sabado — puramente derivado da tripla Y-M-D (calendário
// proléptico gregoriano), nunca depende de timezone de novo.
function weekdayIndex(ymd: YMD): number {
  return new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day)).getUTCDay();
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Lista fechada de candidatos plausíveis — hoje, amanhã, próxima E
// seguinte ocorrência de cada dia da semana (cobre a ambiguidade real
// de "sábado" vs "sábado que vem" apresentando as duas leituras como
// candidatos DISTINTOS, nunca escolhendo uma sozinho), dia-do-mês 1..31
// pro mês corrente e o seguinte, e a data estrutural conhecida do
// commercial root quando existir. timezone=null (ou inválido) ou
// referenceTimestamp não-parseável => nenhum candidato relativo (só
// known_event_date, se houver) — nunca adivinha.
export function generateTemporalCandidates(temporal: TemporalContext): TemporalCandidate[] {
  const candidates: TemporalCandidate[] = [];
  if (temporal.knownEventDate && parseYMD(temporal.knownEventDate)) {
    candidates.push({ label: 'known_event_date', date: temporal.knownEventDate });
  }

  if (!temporal.timezone) return candidates;
  const ref = new Date(temporal.referenceTimestamp);
  if (Number.isNaN(ref.getTime())) return candidates;

  const today = localYMD(ref, temporal.timezone);
  if (!today) return candidates;

  candidates.push({ label: 'today', date: formatYMD(today) });
  candidates.push({ label: 'tomorrow', date: formatYMD(addDays(today, 1)) });

  for (let offset = 1; offset <= 14; offset++) {
    const d = addDays(today, offset);
    const weekdayName = WEEKDAY_KEYS[weekdayIndex(d)];
    const label = offset <= 7 ? `next_${weekdayName}` : `following_${weekdayName}`;
    candidates.push({ label, date: formatYMD(d) });
  }

  for (const monthOffset of [0, 1]) {
    let year = today.year;
    let month = today.month + monthOffset;
    if (month > 12) {
      month -= 12;
      year += 1;
    }
    const total = daysInMonth(year, month);
    const monthLabel = monthOffset === 0 ? 'current_month' : 'next_month';
    for (let day = 1; day <= total; day++) {
      candidates.push({ label: `day_${day}_${monthLabel}`, date: formatYMD({ year, month, day }) });
    }
  }

  return candidates;
}

export function resolveTemporalCandidateLabel(label: string, candidates: readonly TemporalCandidate[]): string | null {
  return candidates.find((c) => c.label === label)?.date ?? null;
}

// Backstop determinístico (nunca confia só no formato regex já
// existente em value-schemas.ts) — uma data bem-formada mas absurda
// (ex.: um extrator hostil/quebrado devolvendo 10 anos no futuro)
// nunca deveria virar um commitment "válido" só porque passou no
// regex. Nunca uma trava de produto — só higiene estrutural.
export function isDatePlausible(date: string, referenceTimestamp: string): boolean {
  const ymd = parseYMD(date);
  if (!ymd) return false;
  const ref = new Date(referenceTimestamp);
  if (Number.isNaN(ref.getTime())) return false;
  const target = Date.UTC(ymd.year, ymd.month - 1, ymd.day);
  const diffDays = Math.abs(target - ref.getTime()) / 86_400_000;
  return diffDays <= MAX_DATE_HORIZON_DAYS;
}
