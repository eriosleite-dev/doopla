'use client';

import { useState } from 'react';

import { checkModelAvailabilityAction, listPlannerGoldenSuiteCasesAction, runPlannerGoldenSuiteBatchAction } from './actions';
import { buildRunSummary, type PlannerGoldenSuiteCaseResult, type PlannerGoldenSuiteRunSummary } from './golden-suite-summary';
import { PLANNER_PROMPT_VARIANT_TERRA_V1 } from '@/lib/intelligence/planner/prompt-variants';

// ADR 0007 item 5 (comparação de modelos, 20/10/2026) — input de texto
// livre em vez de dropdown fechado: nunca sabemos de antemão todo
// model id que a fundadora vai querer comparar, e um dropdown fixo
// exigiria deploy pra adicionar cada opção nova. gpt-5-mini é o
// default (= comportamento de produção hoje).
const DEFAULT_MODEL = 'gpt-5-mini';

// Execução em lotes (20/10/2026) — ver comentário em actions.ts e em
// admin/conversation-scenarios/Panel.tsx (mesmo achado real:
// "Task timed out", UI pendurada sem nunca voltar). Cada caso aqui
// custa ~2 chamadas reais (classifyIntent + planResponse) — 4 casos
// por lote é conservador de propósito, mesma prioridade de "nunca
// travar de novo" sobre velocidade total.
const BATCH_SIZE = 4;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

// 90s por lote — uma Server Action travada (rede/OpenAI sem resposta)
// nunca deve deixar o botão preso em "rodando" pra sempre sem
// explicação. 90s é folgado pra 4 casos reais (~8 chamadas) em
// operação normal, mas finito — achado real (20/10/2026): sem isto, um
// handleRun sem try/catch ao redor de um await que trava vira uma
// promise pendurada, e a UI nunca volta a dar sinal de vida.
const BATCH_TIMEOUT_MS = 90_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label} não respondeu em ${ms / 1000}s`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function formatCents(cents: number | null): string {
  if (cents === null) return 'sem preço cadastrado';
  return `US$ ${(cents / 100).toFixed(4)}`;
}

function formatMs(ms: number): string {
  return `${Math.round(ms)}ms`;
}

type AvailabilityState = { checking: boolean; result: { available: boolean; error?: string } | null };

export function PlannerGoldenSuitePanel() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<PlannerGoldenSuiteCaseResult[] | null>(null);
  const [summary, setSummary] = useState<PlannerGoldenSuiteRunSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityState>({ checking: false, result: null });
  const [useTerraVariant, setUseTerraVariant] = useState(false);
  // Capturado no início de CADA rodada (nunca lido ao vivo do
  // checkbox na hora de exibir) — se a profissional mudar o checkbox
  // depois de rodar, o resumo de uma rodada já concluída precisa
  // continuar dizendo a verdade sobre o que foi usado NAQUELA rodada.
  const [lastRunVariant, setLastRunVariant] = useState<string | null>(null);

  async function handleCheckAvailability() {
    setAvailability({ checking: true, result: null });
    const res = await checkModelAvailabilityAction(model);
    setAvailability({ checking: false, result: res });
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResults(null);
    setSummary(null);
    setProgress(null);

    let merged: PlannerGoldenSuiteCaseResult[] = [];
    const runVariant = useTerraVariant ? PLANNER_PROMPT_VARIANT_TERRA_V1 : null;
    setLastRunVariant(runVariant);

    // try/finally é a parte que importa aqui: NENHUM caminho (sucesso,
    // erro de lote, exceção/timeout) pode deixar running=true parado
    // pra sempre sem explicação — achado real (20/10/2026): a versão
    // anterior não tinha isto, e uma Server Action travada deixava o
    // botão preso em "rodando" indefinidamente, sem nenhum sinal de
    // erro na tela.
    try {
      const { cases } = await withTimeout(listPlannerGoldenSuiteCasesAction(), BATCH_TIMEOUT_MS, 'listar casos');
      const batches = chunk(cases.map((c) => c.name), BATCH_SIZE);

      for (let i = 0; i < batches.length; i++) {
        setProgress({ done: i, total: batches.length });
        const res = await withTimeout(runPlannerGoldenSuiteBatchAction(model, batches[i], runVariant), BATCH_TIMEOUT_MS, `lote ${i + 1}/${batches.length}`);
        if (res.error) {
          setError(res.error);
          return;
        }
        merged = [...merged, ...(res.results ?? [])];
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'erro desconhecido');
    } finally {
      setRunning(false);
      setProgress(null);
      // Nunca descarta os lotes que já rodaram com sucesso só porque
      // um lote seguinte falhou/estourou o tempo — mostra o que já tem.
      setResults(merged.length > 0 ? merged : null);
      if (merged.length > 0) setSummary(buildRunSummary(model, merged));
    }
  }

  const passCount = results?.filter((r) => r.pass).length ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="golden-suite-model" style={{ color: '#aaa' }}>
          model:
        </label>
        <input
          id="golden-suite-model"
          type="text"
          value={model}
          onChange={(e) => {
            setModel(e.target.value);
            setAvailability({ checking: false, result: null });
          }}
          disabled={running}
          style={{ fontFamily: 'monospace', fontSize: 13, padding: '6px 8px', width: 220 }}
        />
        <button type="button" onClick={handleCheckAvailability} disabled={running || availability.checking} style={buttonStyle}>
          {availability.checking ? 'verificando…' : 'verificar disponibilidade na conta'}
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa', cursor: 'pointer' }}>
          <input type="checkbox" checked={useTerraVariant} onChange={(e) => setUseTerraVariant(e.target.checked)} disabled={running} />
          usar variante otimizada (prompt-variants.ts, terra-v1)
        </label>
        <button type="button" onClick={handleRun} disabled={running} style={buttonStyle}>
          {running
            ? progress
              ? `rodando lote ${progress.done + 1}/${progress.total} (chamadas reais à OpenAI)…`
              : 'preparando…'
            : `rodar golden suite do Planner contra ${model || '?'}`}
        </button>
      </div>

      {availability.result && (
        <pre
          style={{
            background: '#111',
            color: availability.result.available ? '#7ee787' : '#ff7b72',
            padding: 12,
            borderRadius: 6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {availability.result.available
            ? `"${model}" está disponível nesta conta da OpenAI.`
            : `"${model}" NÃO está disponível, ou não foi possível verificar: ${availability.result.error ?? 'erro desconhecido'}`}
        </pre>
      )}

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
      {error && error !== 'openai_not_configured' && error !== 'model_required' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          Um lote falhou: {error}. {results ? 'Os lotes anteriores aparecem abaixo.' : 'Nenhum resultado foi obtido ainda.'}
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
            <code>{summary.model}</code>
            {lastRunVariant && (
              <>
                {' '}
                + variante <code>{lastRunVariant}</code>
              </>
            )}
            .
          </div>
          <div style={{ color: '#aaa' }}>
            Tokens do Planner nesta rodada: {summary.totalPlannerInputTokens} in ({summary.totalPlannerCachedInputTokens} do cache) / {summary.totalPlannerOutputTokens} out
            — custo estimado: <strong>{formatCents(summary.totalPlannerCostCents)}</strong>
            {!summary.costConfigured && (
              <span style={{ color: '#d4a72c' }}>
                {' '}
                (sem preço cadastrado pra <code>{summary.model}</code> em <code>src/lib/admin/ai-pricing.ts</code> — some caso(s)
                entraram sem custo contabilizado; peça pra eu adicionar a linha de preço real desse model antes de comparar custo)
              </span>
            )}
            . Latência total do Planner: {formatMs(summary.totalLatencyMs)} — média por caso: {formatMs(summary.averageLatencyMs)}. Não inclui o Classifier
            (roda sempre no model de produção, fixo, pra não distorcer o que está sendo comparado).
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
                    'tokens (in/out, cache)',
                    'custo',
                    'latência',
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
                      {r.plannerInputTokens ?? '—'}/{r.plannerOutputTokens ?? '—'} ({r.plannerCachedInputTokens})
                    </td>
                    <td style={tdStyle}>{formatCents(r.plannerCostCents)}</td>
                    <td style={tdStyle}>{formatMs(r.plannerLatencyMs)}</td>
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
