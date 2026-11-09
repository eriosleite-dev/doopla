'use client';

import { useState } from 'react';

import type { Conversation } from '@/lib/supabase/types';
import {
  createSmokeTestConversationAction,
  sendSmokeTestClientMessageAction,
  sendSmokeTestProfessionalMessageAction,
  runReconcileDueRuntimePendingRepliesAction,
} from './actions';

type LogEntry = { label: string; result: unknown };

export function SmokeTestPanel({ conversations }: { conversations: Conversation[] }) {
  const [conversationId, setConversationId] = useState(conversations[0]?.id ?? '');
  const [list, setList] = useState(conversations);
  const [creating, setCreating] = useState(false);

  const [clientIdentifier, setClientIdentifier] = useState(() => `smoke-test-${Date.now()}`);
  const [clientName, setClientName] = useState('Cliente Smoke Test');
  const [clientBody, setClientBody] = useState('');
  const [sendingClient, setSendingClient] = useState(false);

  const [professionalBody, setProfessionalBody] = useState('');
  const [sendingProfessional, setSendingProfessional] = useState(false);

  const [log, setLog] = useState<LogEntry[]>([]);
  const [reconciling, setReconciling] = useState(false);

  async function handleReconcile() {
    setReconciling(true);
    const res = await runReconcileDueRuntimePendingRepliesAction();
    setReconciling(false);
    setLog((prev) => [{ label: 'reconcileDueRuntimePendingReplies (manual, dev-only)', result: res }, ...prev]);
  }

  async function handleCreate() {
    setCreating(true);
    const res = await createSmokeTestConversationAction();
    setCreating(false);
    if (res.conversationId) {
      setConversationId(res.conversationId);
      setList((prev) => [{ id: res.conversationId! } as Conversation, ...prev]);
    } else {
      setLog((prev) => [{ label: 'criar conversa', result: { kind: 'action_error', error: res.error ?? 'erro desconhecido' } }, ...prev]);
    }
  }

  async function handleSendClient() {
    if (!conversationId || !clientBody.trim()) return;
    setSendingClient(true);
    const res = await sendSmokeTestClientMessageAction({
      conversationId,
      body: clientBody,
      clientIdentifier,
      clientName,
    });
    setSendingClient(false);
    setLog((prev) => [{ label: `cliente: "${clientBody}"`, result: res }, ...prev]);
  }

  async function handleSendProfessional() {
    if (!conversationId || !professionalBody.trim()) return;
    setSendingProfessional(true);
    const res = await sendSmokeTestProfessionalMessageAction({ conversationId, body: professionalBody });
    setSendingProfessional(false);
    setLog((prev) => [{ label: `profissional: "${professionalBody}"`, result: res }, ...prev]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, fontSize: 13 }}>
      <section>
        <label style={{ display: 'block', marginBottom: 6 }}>1. conversation_id</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={conversationId} onChange={(e) => setConversationId(e.target.value)} style={{ flex: 1, padding: 6, fontFamily: 'monospace' }}>
            <option value="">— selecione —</option>
            {list.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleCreate} disabled={creating} style={buttonStyle}>
            {creating ? 'criando…' : '+ criar conversa de teste'}
          </button>
        </div>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
        <strong>2. mensagem do cliente (external_participant)</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="nome do cliente" style={inputStyle} />
          <input value={clientIdentifier} onChange={(e) => setClientIdentifier(e.target.value)} placeholder="identificador (telefone/etc)" style={inputStyle} />
        </div>
        <textarea
          value={clientBody}
          onChange={(e) => setClientBody(e.target.value)}
          placeholder='ex.: "Oi, quanto custa tocar no meu casamento dia 20/12?"'
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <button type="button" onClick={handleSendClient} disabled={sendingClient || !conversationId || !clientBody.trim()} style={buttonStyle}>
          {sendingClient ? 'rodando o Runtime…' : 'enviar como cliente'}
        </button>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
        <strong>3. mensagem do profissional (você, na MESMA conversa)</strong>
        <textarea
          value={professionalBody}
          onChange={(e) => setProfessionalBody(e.target.value)}
          placeholder='ex.: "Pode fechar por R$3000!"'
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <button
          type="button"
          onClick={handleSendProfessional}
          disabled={sendingProfessional || !conversationId || !professionalBody.trim()}
          style={buttonStyle}
        >
          {sendingProfessional ? 'rodando o Runtime…' : 'enviar como profissional'}
        </button>
      </section>

      <section style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid #ddd', borderRadius: 6, padding: 12 }}>
        <strong>4. reconciler (validação do teste E — dev-only, chamada manual e única)</strong>
        <p style={{ margin: 0, color: '#666' }}>
          Não é o passo 5. Só invoca <code>reconcileDueRuntimePendingReplies</code> (já existente em resumption.ts) uma vez,
          sobre qualquer <code>runtime_pending_reply</code> que já esteja due — nenhum cron/fila/scheduler.
        </p>
        <button type="button" onClick={handleReconcile} disabled={reconciling} style={buttonStyle}>
          {reconciling ? 'rodando reconciler…' : 'rodar reconciler uma vez'}
        </button>
      </section>

      {log.length > 0 && (
        <section>
          <strong>Resultado (RuntimeCycleOutcome bruto, mais recente primeiro)</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
            {log.map((entry, i) => {
              const kind = entry.result && typeof entry.result === 'object' && 'kind' in entry.result ? (entry.result as { kind?: string }).kind : undefined;
              const color = kind === 'completed' ? '#7ee787' : kind === 'action_error' || kind === 'failed' ? '#ff7b72' : '#e3b341';
              return (
                <div key={i}>
                  <div style={{ color: '#555', marginBottom: 4 }}>{entry.label}</div>
                  <pre
                    style={{
                      background: '#111',
                      color,
                      padding: 12,
                      borderRadius: 6,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(entry.result, null, 2)}
                  </pre>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontFamily: 'monospace',
  fontSize: 13,
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: 6,
  fontFamily: 'monospace',
  fontSize: 13,
};
