import { createHmac, timingSafeEqual } from 'node:crypto';

// Doopla Intelligence Core v1 — canal WhatsApp (passo 6A): verificação
// de assinatura do webhook (X-Hub-Signature-256, HMAC-SHA256 do corpo
// BRUTO com o App Secret) — fail-closed antes de qualquer parsing.
// Puro, sem I/O — testável isoladamente, mesma disciplina de
// verifyWebhookSignature/webhook-verify.ts do resto do projeto (nunca
// confia em corpo já parseado, sempre a string bruta que a Meta
// assinou).

export function verifyWhatsappWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const prefix = 'sha256=';
  if (!signatureHeader.startsWith(prefix)) return false;

  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex');
  const providedHex = signatureHeader.slice(prefix.length);

  // Comparação em tempo constante — nunca String === (vaza timing).
  // Tamanhos diferentes já falham a comparação sem lançar (Buffer.from
  // hex de tamanhos diferentes quebraria timingSafeEqual).
  const expected = Buffer.from(expectedHex, 'hex');
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

// Handshake de verificação (GET, configurado uma vez no painel da
// Meta) — devolve o challenge cru SE o verify_token bater, null caso
// contrário (o chamador decide o status HTTP).
export function verifyWhatsappWebhookChallenge(params: {
  mode: string | null;
  verifyToken: string | null;
  challenge: string | null;
  expectedVerifyToken: string;
}): string | null {
  if (params.mode !== 'subscribe') return null;
  if (params.verifyToken !== params.expectedVerifyToken) return null;
  return params.challenge;
}
