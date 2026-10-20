'use client';

import { useState } from 'react';

import { runPlannerGoldenSuiteAction, type PlannerGoldenSuiteCaseResult, type PlannerGoldenSuiteRunSummary } from './actions';

// ADR 0007 item 5 (comparação de modelos, 20/10/2026) — input de texto
// livre em vez de dropdown fechado: nunca sabemos de antemão todo
// model id que a fundadora vai querer comparar, e um dropdown fixo
// exigiria deploy pra adicionar cada opção nova. gpt-5-mini é o
// default (= comportamento de produção hoje).
const DEFAULT_MODEL = 'gpt-5-mini';

function formatCents(cents: number | null): string {
  if (cents === null) return 'sem preço cadastrado';
  return `US$ ${(cents / 100).toFixed(4)}`;
}

export function PlannerGoldenSuitePanel() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<PlannerGoldenSuiteCaseResult[] | null>(null);
  const [summary, setSummary] = useState<PlannerGoldenSuiteRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResults(null);
    setSummary(null);
    const res = await runPlannerGoldenSuiteAction(model);
    setRunning(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResults(res.results ?? []);
    setSummary(res.summary ?? null);
  }

  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label htmlFor="golden-suite-model" style={{ color: '#aaa' }}>
          model:
        </label>
        <input
          id="golden-suite-model"
          type="text"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={running}
          style={{ fontFamily: 'monospace', fontSize: 13, padding: '6px 8px', width: 220 }}
        />
        <button type="button" onClick={handleRun} disabled={running} style={buttonStyle}>
          {running ? `rodando ${'…'} (chamadas reais à OpenAI, pode levar um tempo)` : `rodar golden suite do Planner contra ${model || '?'}`}
        </button>
      </div>

      {error === 'openai_not_configured' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          OPENAI_API_KEY não configurada neste ambiente — nada foi executado.
        </pre>
      )}
      {error === 'model_required' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          Digite um model id antes de rodar.
        </pre>
      )}

      {results && summary && (
        <>
          <div>
            <strong>
              {passCount}/{results.length}
            </strong>{' '}
            casos dentro do esperado (responsePlan + commitmentNature + requiresProfessionalDecision +
            professionalDecisionSignal + requiresProfessionalReviewBeforeSend, conforme cada caso define) — model{' '}
            <code>{summary.model}</code>.
          </div>
          <div style={{ color: '#aaa' }}>
            Tokens do Planner nesta rodada: {summary.totalPlannerInputTokens} in / {summary.totalPlannerOutputTokens} out — custo estimado:{' '}
            <strong>{formatCents(summary.totalPlannerCostCents)}</strong>
            {!summary.costConfigured && (
              <span style={{ color: '#d4a72c' }}>
                {' '}
                (sem preço cadastrado pra <code>{summary.model}</code> em <code>src/lib/admin/ai-pricing.ts</code> — some caso(s)
                entraram sem custo contabilizado; peça pra eu adicionar a linha de preço real desse model antes de comparar custo)
              </span>
            )}
            . Não inclui o Classifier (roda sempre no model de produção, fixo, pra não distorcer o que está sendo comparado).
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
                    'tokens (in/out)',
                    'custo',
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
                    <td style={tdStyle}>
                      {r.plannerInputTokens ?? '—'}/{r.plannerOutputTokens ?? '—'}
                    </td>
                    <td style={tdStyle}>{formatCents(r.plannerCostCents)}</td>
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
