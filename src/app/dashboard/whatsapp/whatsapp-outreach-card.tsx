'use client';

import { useState } from 'react';

import { accentButtonClass, cardClass, eyebrowClass } from '../ui';
import { startWhatsappOutreachAction, type WhatsappOutreachActionResult } from '../whatsapp-outreach-action';

export function WhatsappOutreachCard() {
  const [clientPhone, setClientPhone] = useState('');
  const [clientName, setClientName] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<WhatsappOutreachActionResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSending(true);
    const res = await startWhatsappOutreachAction({ clientPhone, clientName: clientName || undefined, body });
    setSending(false);
    setResult(res);
  }

  return (
    <section className={cardClass}>
      <p className={eyebrowClass}>Iniciar contato pelo WhatsApp</p>
      <p className="mt-1.5 text-sm text-[var(--ink)]/60">
        Informe o WhatsApp do cliente e a mensagem inicial — a Doopla envia por você.
      </p>

      <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--ink)]/60">WhatsApp do cliente</span>
          <input
            type="text"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            placeholder="(11) 91234-5678"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            required
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--ink)]/60">Nome do cliente (opcional)</span>
          <input
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder="Nome"
            className="rounded-full border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs text-[var(--ink)]/60">Mensagem inicial</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Oi! Recebi seu contato pra tocar no seu evento, posso te ajudar?"
            className="rounded-[14px] border border-[var(--ink)]/20 bg-white px-4 py-2.5 text-sm"
            required
          />
        </label>

        <button type="submit" disabled={sending} className={accentButtonClass}>
          {sending ? 'Enviando…' : 'Iniciar conversa'}
        </button>
      </form>

      {result && (
        <pre className="mt-4 overflow-x-auto rounded-[14px] bg-[var(--ink)] p-4 text-[12px] text-[var(--paper)]">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </section>
  );
}
