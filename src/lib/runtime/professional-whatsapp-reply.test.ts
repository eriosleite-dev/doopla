import { beforeEach, describe, expect, it, vi } from 'vitest';

// Doopla — suíte de regressão do WhatsApp (13/10/2026). Cobre
// "Falar com minha Doopla": a resposta da IA só pode sair pelo
// WhatsApp quando o número é realmente VERIFICADO (defesa em
// profundidade — nunca confia em nada além do estado real de
// professional_whatsapp_identities). Nunca manda mensagem real nem
// toca produção: os pontos de I/O (identidade + envio + gates) são
// mockados.

const getWhatsappIdentitySnapshot = vi.fn();
const sendWhatsappTextMessage = vi.fn();
const readAppSettingFlag = vi.fn();
const claimProfessionalSelfWhatsappSend = vi.fn();
const isLatestInboundProfessionalMessage = vi.fn();

vi.mock('../whatsapp-identity/data', () => ({
  getWhatsappIdentitySnapshot: (...args: unknown[]) => getWhatsappIdentitySnapshot(...args),
}));

vi.mock('../channels/whatsapp/client', () => ({
  sendWhatsappTextMessage: (...args: unknown[]) => sendWhatsappTextMessage(...args),
}));

vi.mock('../supabase/env', () => ({
  whatsappAccessToken: () => 'test-token',
  whatsappPhoneNumberId: () => 'test-phone-id',
}));

vi.mock('./app-settings', () => ({
  readAppSettingFlag: (...args: unknown[]) => readAppSettingFlag(...args),
}));

vi.mock('./professional-self-whatsapp-sends', () => ({
  claimProfessionalSelfWhatsappSend: (...args: unknown[]) => claimProfessionalSelfWhatsappSend(...args),
}));

vi.mock('./conversation-freshness', () => ({
  isLatestInboundProfessionalMessage: (...args: unknown[]) => isLatestInboundProfessionalMessage(...args),
}));

const fakeSupabase = {} as never;

describe('sendProfessionalSelfReplyViaWhatsapp', () => {
  beforeEach(() => {
    getWhatsappIdentitySnapshot.mockReset();
    sendWhatsappTextMessage.mockReset();
    readAppSettingFlag.mockReset();
    claimProfessionalSelfWhatsappSend.mockReset();
    isLatestInboundProfessionalMessage.mockReset();
    // Default: contenção DESLIGADA (comportamento de hoje), idempotência
    // SEMPRE concede (primeira vez) e atualidade SEMPRE confirma — só os
    // testes dos próprios gates (ADR 0008/0009) sobrescrevem isto.
    readAppSettingFlag.mockResolvedValue(true);
    claimProfessionalSelfWhatsappSend.mockResolvedValue(true);
    isLatestInboundProfessionalMessage.mockResolvedValue(true);
  });

  it('envia pro número verificado quando status é verified', async () => {
    const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
    getWhatsappIdentitySnapshot.mockResolvedValue({
      status: 'verified',
      verifiedNumber: '+5511999999999',
      verifiedAt: '2026-10-01T00:00:00Z',
      candidateNumber: null,
      candidateRequestedAt: null,
    });
    sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

    await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

    expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    expect(sendWhatsappTextMessage).toHaveBeenCalledWith(
      { accessToken: 'test-token', phoneNumberId: 'test-phone-id' },
      { to: '+5511999999999', body: 'oi!' }
    );
  });

  it('P1 UX (14/10/2026): sanitiza travessão do body antes de enviar pro WhatsApp', async () => {
    const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
    getWhatsappIdentitySnapshot.mockResolvedValue({
      status: 'verified',
      verifiedNumber: '+5511999999999',
      verifiedAt: '2026-10-01T00:00:00Z',
      candidateNumber: null,
      candidateRequestedAt: null,
    });
    sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

    await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, {
      professionalId: 'eduarda',
      conversationId: 'conv-1',
      body: 'Posso ajudar — só preciso de um detalhe.',
      aiMessageId: 'msg-1',
    });

    expect(sendWhatsappTextMessage).toHaveBeenCalledWith(
      { accessToken: 'test-token', phoneNumberId: 'test-phone-id' },
      { to: '+5511999999999', body: 'Posso ajudar, só preciso de um detalhe.' }
    );
  });

  it('NUNCA envia quando não existe identidade nenhuma (nunca fabrica número)', async () => {
    const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
    getWhatsappIdentitySnapshot.mockResolvedValue(null);

    await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('NUNCA envia quando o status é "candidate" (ainda não confirmado)', async () => {
    const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
    getWhatsappIdentitySnapshot.mockResolvedValue({
      status: 'candidate',
      verifiedNumber: null,
      verifiedAt: null,
      candidateNumber: '+5511999999999',
      candidateRequestedAt: '2026-10-01T00:00:00Z',
    });

    await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

    expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
  });

  it('nunca derruba o chamador se o envio falhar (best-effort, painel já tem o registro autoritativo)', async () => {
    const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
    getWhatsappIdentitySnapshot.mockResolvedValue({
      status: 'verified',
      verifiedNumber: '+5511999999999',
      verifiedAt: '2026-10-01T00:00:00Z',
      candidateNumber: null,
      candidateRequestedAt: null,
    });
    sendWhatsappTextMessage.mockRejectedValue(new Error('falha de rede simulada'));

    await expect(
      sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' })
    ).resolves.toBeUndefined();
  });

  // ADR 0008 (20/10/2026) — contenção do incidente P0 de loop de
  // mensagens: gate de app_settings antes de qualquer envio.
  describe('contenção (ADR 0008 — app_settings.professional_self_auto_reply_enabled)', () => {
    it('NUNCA envia quando a flag está desligada (\'false\'), mesmo com identidade verificada', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      readAppSettingFlag.mockResolvedValue(false);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

      expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
      expect(getWhatsappIdentitySnapshot).not.toHaveBeenCalled();
    });

    it('fail-closed: se a leitura da flag falhar (ou a linha não existir), NUNCA envia', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp, PROFESSIONAL_SELF_AUTO_REPLY_ENABLED_FLAG } = await import(
        './professional-whatsapp-reply'
      );
      // readAppSettingFlag (app-settings.ts) já devolve `false` tanto se
      // a linha não existir quanto se a query falhar — aqui simulamos o
      // próprio contrato dela (nunca propaga erro, só devolve false).
      readAppSettingFlag.mockResolvedValue(false);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

      expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
      expect(readAppSettingFlag).toHaveBeenCalledWith(fakeSupabase, PROFESSIONAL_SELF_AUTO_REPLY_ENABLED_FLAG);
    });

    it('com a flag ligada (\'true\'), envia normalmente (regressão: contenção não afeta o fluxo padrão)', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      readAppSettingFlag.mockResolvedValue(true);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });
      sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

      expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    });
  });

  // ADR 0009 (20/10/2026) — Mecanismo D do incidente P0 (ADR 0008):
  // idempotência real via claim_professional_self_whatsapp_send.
  describe('idempotência (ADR 0009 — claim_professional_self_whatsapp_send)', () => {
    it('reivindica o aiMessageId ANTES de checar identidade/enviar', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });
      sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-42' });

      expect(claimProfessionalSelfWhatsappSend).toHaveBeenCalledWith(fakeSupabase, { aiMessageId: 'msg-42' });
    });

    it('NUNCA envia quando o aiMessageId já foi reivindicado antes (retry/duplicata)', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      claimProfessionalSelfWhatsappSend.mockResolvedValue(false);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-42' });

      expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
      expect(getWhatsappIdentitySnapshot).not.toHaveBeenCalled();
    });

    it('com a flag de contenção desligada, nunca chega a tentar reivindicar (ordem dos gates)', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      readAppSettingFlag.mockResolvedValue(false);

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-42' });

      expect(claimProfessionalSelfWhatsappSend).not.toHaveBeenCalled();
    });
  });

  // ADR 0009 (20/10/2026) — Mecanismo A do incidente P0 (ADR 0008):
  // atualidade antes de enviar (triggerMessageId opcional).
  describe('atualidade (ADR 0009 — triggerMessageId)', () => {
    it('sem triggerMessageId, nunca checa atualidade e envia normalmente (fluxos sem mensagem-gatilho natural)', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });
      sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, { professionalId: 'eduarda', conversationId: 'conv-1', body: 'oi!', aiMessageId: 'msg-1' });

      expect(isLatestInboundProfessionalMessage).not.toHaveBeenCalled();
      expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    });

    it('com triggerMessageId e resposta ainda atual, envia normalmente', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      isLatestInboundProfessionalMessage.mockResolvedValue(true);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });
      sendWhatsappTextMessage.mockResolvedValue({ kind: 'sent_confirmed', providerMessageId: 'wamid.1' });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, {
        professionalId: 'eduarda',
        conversationId: 'conv-1',
        body: 'oi!',
        aiMessageId: 'msg-1',
        triggerMessageId: 'msg-trigger',
      });

      expect(isLatestInboundProfessionalMessage).toHaveBeenCalledWith(fakeSupabase, { conversationId: 'conv-1', triggerMessageId: 'msg-trigger' });
      expect(sendWhatsappTextMessage).toHaveBeenCalledTimes(1);
    });

    it('com triggerMessageId e resposta obsoleta, NUNCA envia (nem chega a reivindicar idempotência)', async () => {
      const { sendProfessionalSelfReplyViaWhatsapp } = await import('./professional-whatsapp-reply');
      isLatestInboundProfessionalMessage.mockResolvedValue(false);
      getWhatsappIdentitySnapshot.mockResolvedValue({
        status: 'verified',
        verifiedNumber: '+5511999999999',
        verifiedAt: '2026-10-01T00:00:00Z',
        candidateNumber: null,
        candidateRequestedAt: null,
      });

      await sendProfessionalSelfReplyViaWhatsapp(fakeSupabase, {
        professionalId: 'eduarda',
        conversationId: 'conv-1',
        body: 'oi!',
        aiMessageId: 'msg-1',
        triggerMessageId: 'msg-trigger',
      });

      expect(sendWhatsappTextMessage).not.toHaveBeenCalled();
      expect(claimProfessionalSelfWhatsappSend).not.toHaveBeenCalled();
      expect(getWhatsappIdentitySnapshot).not.toHaveBeenCalled();
    });
  });
});
