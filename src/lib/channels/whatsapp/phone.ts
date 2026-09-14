// Doopla Intelligence Core v1 — canal WhatsApp (passo 6A), fora de
// src/lib/runtime/ e src/lib/intelligence/ de propósito (mesmo padrão
// de beta-integration/ — nunca modifica os módulos congelados, só
// consome o entrypoint já existente via triggerInboundMessage).
//
// Normalização determinística, 100% pura — mesma identidade usada
// tanto quando a profissional informa o contato quanto quando o
// webhook correlaciona o remetente, garantindo que as duas pontas
// cheguem no MESMO identifier em external_participant_channel_identities.
// Mercado padrão Brasil (DDI 55) — nunca inventa heurística nova de
// outros países; número já vindo com "+" e DDI diferente é preservado
// como está.

// E.164: "+" seguido só de dígitos, 8-15 dígitos no total (padrão
// ITU-T E.164, nunca menos que um número de telefone plausível).
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeWhatsappPhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasExplicitPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  // Já veio com "+": preserva o DDI informado, só limpa formatação.
  if (hasExplicitPlus) {
    const candidate = `+${digits}`;
    return E164_PATTERN.test(candidate) ? candidate : null;
  }

  // Sem "+": assume Brasil (DDI 55) quando o número não já começa com
  // 55 seguido de um DDD plausível — heurística mínima, só pra não
  // duplicar "55" se a pessoa já digitou o DDI sem o "+".
  const withCountryCode = digits.startsWith('55') && digits.length >= 12 ? digits : `55${digits}`;
  const candidate = `+${withCountryCode}`;
  return E164_PATTERN.test(candidate) ? candidate : null;
}

// Formato que a Cloud API espera no campo "to" do payload de envio —
// E.164 SEM o "+" (documentado pela Meta). Nunca reimplementa a
// normalização — só remove o prefixo de um valor já normalizado.
export function toWhatsappApiRecipient(e164Phone: string): string {
  return e164Phone.replace(/^\+/, '');
}
