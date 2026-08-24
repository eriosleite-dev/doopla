'use client';

import { useState } from 'react';

import type { Conversation } from '@/lib/supabase/types';
import { createTestConversationAction, runIntelligenceTestAction } from './actions';
import type { IntelligenceTestResult } from '@/lib/intelligence/test-call';

export function TestPanel({ conversations }: { conversations: Conversation[] }) {
  const [conversationId, setConversationId] = useState(conversations[0]?.id ?? '');
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IntelligenceTestResult | null>(null);
  const [list, setList] = useState(conversations);

  async function handleCreate() {
    setCreating(true);
    setResult(null);
    const res = await createTestConversationAction();
    setCreating(false);
    if (res.conversationId) {
      setConversationId(res.conversationId);
      setList((prev) => [{ id: res.conversationId! } as Conversation, ...prev]);
    } else {
      setResult({ ok: false, error: res.error ?? 'erro desconhecido ao criar conversa' });
    }
  }

  async function handleRun() {
    if (!conversationId) return;
    setRunning(true);
    setResult(null);
    const res = await runIntelligenceTestAction(conversationId);
    setRunning(false);
    setResult(res);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div>
        <label style={{ display: 'block', marginBottom: 6 }}>conversation_id</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <select
            value={conversationId}
            onChange={(e) => setConversationId(e.target.value)}
            style={{ flex: 1, padding: 6, fontFamily: 'monospace' }}
          >
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
      </div>

      <button type="button" onClick={handleRun} disabled={running || !conversationId} style={buttonStyle}>
        {running ? 'chamando a OpenAI…' : 'rodar teste de IA nessa conversa'}
      </button>

      {result && (
        <pre
          style={{
            background: '#111',
            color: result.ok ? '#7ee787' : '#ff7b72',
            padding: 12,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
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
