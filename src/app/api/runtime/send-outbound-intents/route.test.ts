import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Doopla — ADR 0004, Rodada 5 (15/10/2026): requisito 5/7 do opt-in —
// "mensagem já enfileirada" nunca sai se o número entrar na blocklist
// DEPOIS do outbound_intent já criado. Testa o handler REAL (GET),
// mockando só os limites externos (RPCs via @/lib/runtime, a Cloud API
// via client.ts) — nunca uma reimplementação da lógica do cron.

const claimOutboundIntentForSend = vi.fn();
const listClaimableOutboundIntents = vi.fn();
const markOutboundIntentFailed = vi.fn();
const markOutboundIntentSendUnknown = vi.fn();
const markOutboundIntentSentConfirmed = vi.fn();
const getLastWhatsappInboundAt = vi.fn();
const isCswOpen = vi.fn();
const resolveSendAction = vi.fn();
const resolveProfessionalDisplayName = vi.fn();
const sendWhatsappTemplateMessage = vi.fn();
const sendWhatsappTextMessage = vi.fn();
const isWhatsappOutreachBlocked = vi.fn();

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => fakeSupabase() }));
vi.mock('@/lib/runtime', () => ({
  claimOutboundIntentForSend: (...args: unknown[]) => claimOutboundIntentForSend(...args),
  getLastWhatsappInboundAt: (...args: unknown[]) => getLastWhatsappInboundAt(...args),
  isCswOpen: (...args: unknown[]) => isCswOpen(...args),
  listClaimableOutboundIntents: (...args: unknown[]) => listClaimableOutboundIntents(...args),
  markOutboundIntentFailed: (...args: unknown[]) => markOutboundIntentFailed(...args),
  markOutboundIntentSendUnknown: (...args: unknown[]) => markOutboundIntentSendUnknown(...args),
  markOutboundIntentSentConfirmed: (...args: unknown[]) => markOutboundIntentSentConfirmed(...args),
  resolveProfessionalDisplayName: (...args: unknown[]) => resolveProfessionalDisplayName(...args),
  resolveSendAction: (...args: unknown[]) => resolveSendAction(...args),
}));
vi.mock('@/lib/channels/whatsapp/client', () => ({
  sendWhatsappTemplateMessage: (...args: unknown[]) => sendWhatsappTemplateMessage(...args),
  sendWhatsappTextMessage: (...args: unknown[]) => sendWhatsappTextMessage(...args),
}));
vi.mock('@/lib/runtime/whatsapp-outreach-authorization', () => ({
  isWhatsappOutreachBlocked: (...args: unknown[]) => isWhatsappOutreachBlocked(...args),
}));
vi.mock('@/lib/supabase/env', () => ({
  whatsappAccessToken: () => 'test-token',
  whatsappPhoneNumberId: () => 'test-phone-id',
}));

const RECIPIENT_IDENTIFIER = '+5511988887777';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fakeSupabase(): any {
  return {
    from: (table: string) => {
      if (table === 'external_participant_channel_identities') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { identifier: RECIPIENT_IDENTIFIER } }) }) }) }) };
      }
      throw new Error(`fakeSupabase.from não implementa ${table}`);
    },
  };
}

function makeCronRequest(): NextRequest {
  return new NextRequest('http://localhost/api/runtime/send-outbound-intents', { headers: { authorization: 'Bearer test-cron-secret' } });
}

describe('send-outbound-intents — recheck de blocklist no momento do envio (ADR 0004, Rodada 5, 15/10/2026)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
    process.env.WHATSAPP_ACCESS_TOKEN = 'token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-id';

    claimOutboundIntentForSend.mockResolvedValue({ granted: true, sendAttemptId: 'attempt-1' });
    listClaimableOutboundIntents.mockResolvedValue([{ id: 'intent-1', professionalId: 'prof-1', recipientExternalParticipantId: 'participant-1', content: 'oi', sendAs: 'free_text' }]);
    getLastWhatsappInboundAt.mockResolvedValue(new Date().toISOString());
    isCswOpen.mockReturnValue(true);
    resolveSendAction.mockReturnValue('send_free_text');
    resolveProfessionalDisplayName.mockResolvedValue('Profissional Teste');
    sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });
  });

  it('mensagem já enfileirada ANTES do número entrar na blocklist: nunca chama a Meta, marca failed_permanent', async () => {
    const { GET } = await import('./route');
    isWhatsappOutreachBlocked.mockResolvedValue(true); // bloqueado agora, mesmo que o intent já existisse antes do bloqueio

    const response = await GET(makeCronRequest());
    const body = await response.json();

    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
    expect(markOutboundIntentFailed).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ outboundIntentId: 'intent-1', permanent: true, reason: expect.stringContaining('blocklist') })
    );
    expect(body.results[0].outcome).toContain('bloqueado');
  });

  it('número não bloqueado: segue o fluxo normal de envio, Meta é chamada', async () => {
    const { GET } = await import('./route');
    isWhatsappOutreachBlocked.mockResolvedValue(false);

    await GET(makeCronRequest());

    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    expect(markOutboundIntentFailed).not.toHaveBeenCalled();
  });

  it('checagem de blocklist roda ANTES da revalidação de CSW — nunca chama a Meta mesmo com CSW aberta', async () => {
    const { GET } = await import('./route');
    isWhatsappOutreachBlocked.mockResolvedValue(true);
    isCswOpen.mockReturnValue(true);
    resolveSendAction.mockReturnValue('send_free_text');

    await GET(makeCronRequest());

    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
    expect(sendWhatsappTemplateMessage).not.toHaveBeenCalled();
  });
});
