'use client';

import { useState } from 'react';

import { runPolicyGateGoldenSuiteAction, type PolicyGateGoldenSuiteCaseResult } from './actions';

export function PolicyGateGoldenSuitePanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PolicyGateGoldenSuiteCaseResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResults(null);
    const res = await runPolicyGateGoldenSuiteAction();
    setRunning(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResults(res.results ?? []);
  }

  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <button type="button" onClick={handleRun} disabled={running} style={buttonStyle}>
        {running ? 'rodando… (chamadas reais à OpenAI, pode levar um tempo)' : 'rodar golden suite do extrator do Policy Gate'}
      </button>

      {error === 'openai_not_configured' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          OPENAI_API_KEY não configurada neste ambiente — nada foi executado.
        </pre>
      )}

      {results && (
        <>
          <div style={{ fontWeight: 'bold' }}>
            {passCount}/{results.length} casos passaram
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #ccc' }}>
                <th style={cellStyle}>caso</th>
                <th style={cellStyle}>proposedResponse</th>
                <th style={cellStyle}>categorias esperadas</th>
                <th style={cellStyle}>categorias extraídas</th>
                <th style={cellStyle}>resultado</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.name} style={{ borderBottom: '1px solid #eee', background: r.pass ? undefined : '#fff0f0' }}>
                  <td style={cellStyle}>
                    <strong>{r.name}</strong>
                    {r.note && <div style={{ color: '#888', fontStyle: 'italic' }}>{r.note}</div>}
                  </td>
                  <td style={cellStyle}>{r.proposedResponse}</td>
                  <td style={cellStyle}>{r.expectedCategories.join(', ') || '—'}</td>
                  <td style={cellStyle}>{r.extractedCategories.join(', ') || '—'}</td>
                  <td style={cellStyle}>
                    {r.pass ? '✅ PASS' : '❌ FAIL'}
                    {r.error && <div style={{ color: '#c00' }}>{r.error}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 16px',
  background: '#111',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 13,
  width: 'fit-content',
};

const cellStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
