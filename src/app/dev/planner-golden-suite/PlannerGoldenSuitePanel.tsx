'use client';

import { useState } from 'react';

import { runPlannerGoldenSuiteAction, type PlannerGoldenSuiteCaseResult } from './actions';

export function PlannerGoldenSuitePanel() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PlannerGoldenSuiteCaseResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResults(null);
    const res = await runPlannerGoldenSuiteAction();
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
        {running ? `rodando ${'…'} (chamadas reais à OpenAI, pode levar um tempo)` : 'rodar golden suite do Planner'}
      </button>

      {error === 'openai_not_configured' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          OPENAI_API_KEY não configurada neste ambiente — nada foi executado.
        </pre>
      )}

      {results && (
        <>
          <div>
            <strong>
              {passCount}/{results.length}
            </strong>{' '}
            casos dentro do esperado (responsePlan + commitmentNature + requiresProfessionalDecision +
            professionalDecisionSignal + requiresProfessionalReviewBeforeSend, conforme cada caso define).
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {[
                    '#',
                    'caso',
                    'input',
                    'responsePlan',
                    'commitmentNature',
                    'requiresDecision',
                    'categoria(s)',
                    'signal',
                    'reviewBeforeSend',
                    'draft',
                    'pass',
                  ].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={r.name} style={{ background: r.pass ? undefined : '#3a1414' }}>
                    <td style={tdStyle}>{i + 1}</td>
                    <td style={tdStyle}>
                      {r.name}
                      {r.note && <div style={{ color: '#888', fontSize: 11 }}>{r.note}</div>}
                      {r.error && <div style={{ color: '#ff7b72', fontSize: 11 }}>{r.error}</div>}
                    </td>
                    <td style={{ ...tdStyle, maxWidth: 220 }}>{r.input}</td>
                    <td style={tdStyle}>{r.responsePlan}</td>
                    <td style={tdStyle}>{r.commitmentNature}</td>
                    <td style={tdStyle}>{String(r.requiresProfessionalDecision)}</td>
                    <td style={tdStyle}>{r.professionalDecisionCategory.join(', ') || '—'}</td>
                    <td style={tdStyle}>{r.professionalDecisionSignal}</td>
                    <td style={tdStyle}>{String(r.requiresProfessionalReviewBeforeSend)}</td>
                    <td style={{ ...tdStyle, maxWidth: 260 }}>{r.proposedResponse ?? '—'}</td>
                    <td style={{ ...tdStyle, color: r.pass ? '#7ee787' : '#ff7b72', fontWeight: 700 }}>{r.pass ? 'PASS' : 'FAIL'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontFamily: 'monospace',
  fontSize: 13,
  cursor: 'pointer',
  width: 'fit-content',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid #444',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '4px 8px',
  borderBottom: '1px solid #222',
  verticalAlign: 'top',
};
