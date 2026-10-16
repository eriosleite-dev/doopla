'use client';

import { useState } from 'react';

import { estimateConversationScenariosAction, runConversationScenariosAction } from './actions';
import type { HarnessRunResult, TurnResult } from '@/lib/intelligence/conversation-scenarios/types';

const cardStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 16 };
const okStyle: React.CSSProperties = { color: '#3fb950' };
const failStyle: React.CSSProperties = { color: '#ff7b72' };

function centsToBRL(cents: number | null): string {
  if (cents === null) return 'não calculado (modelo sem preço cadastrado)';
  return `R$ ${(cents / 100).toFixed(4)}`;
}

function TurnCard({ turn }: { turn: TurnResult }) {
  const allChecks = [...turn.assertions, ...turn.formatChecks];
  return (
    <div style={{ ...cardStyle, background: turn.turnPass ? '#0d1117' : '#2d1114' }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        Turno {turn.turnIndex + 1} —{' '}
        <span style={turn.turnPass ? okStyle : failStyle}>{turn.turnPass ? 'CRITÉRIOS OBJETIVOS: OK' : 'CRITÉRIOS OBJETIVOS: FALHOU'}</span>
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>Profissional:</strong> {turn.professionalMessage}
      </div>
      <div style={{ marginBottom: 8, whiteSpace: 'pre-wrap' }}>
        <strong>Doopla (texto final, pós-limpeza determinística — leia este texto você mesma, &quot;OK&quot; acima não avalia qualidade):</strong>{' '}
        {turn.proposedResponseFinal ?? '(sem resposta — plano não gera texto)'}
      </div>
      <div style={{ fontSize: 12, color: '#999', marginBottom: 8 }}>
        intent={turn.primaryIntent} · status={turn.classificationStatus} · confiança={turn.effectiveConfidence} · plano={turn.responsePlan} ·
        natureza={turn.commitmentNature} · evidências={turn.evidenceUsed.length}
      </div>
      {turn.usesSimulatedOperationalState && (
        <div style={{ fontSize: 12, marginBottom: 8, padding: '6px 10px', background: '#3d2a00', border: '1px solid #8a5a00', borderRadius: 4, color: '#ffc966' }}>
          ⚠️ este turno injeta um estado operacional (ex.: &quot;executed&quot;/&quot;sent&quot;) ESCRITO À MÃO no cenário — nunca produzido por uma execução
          real de delegated-contact-flow.ts. Testa só se o reconhecedor interpreta esse estado corretamente, nunca prova continuidade operacional de fato.
        </div>
      )}
      {turn.delegationExpectedSignal !== null && (
        <div style={{ fontSize: 12, marginBottom: 8, color: turn.delegationSignalMatches ? '#3fb950' : '#ff7b72' }}>
          reconhecedor de delegação (sinal isolado, nunca execução real): esperado &quot;{turn.delegationExpectedSignal}&quot;, veio &quot;{turn.delegationSignal}&quot;
        </div>
      )}
      {allChecks.length > 0 && (
        <ul style={{ fontSize: 12, margin: 0, paddingLeft: 18 }}>
          {allChecks.map((c, i) => (
            <li key={i} style={c.pass ? okStyle : failStyle}>
              {c.pass ? '✓' : '✗'} {c.name}
              {c.detail ? ` — ${c.detail}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div style={{ fontSize: 11, color: '#777', marginTop: 8 }}>
        custo: {centsToBRL(turn.costCents)} · latência: {turn.latencyMs.total}ms (classifier {turn.latencyMs.classifier}ms, planner {turn.latencyMs.planner}ms
        {turn.latencyMs.recognizer !== null ? `, recognizer ${turn.latencyMs.recognizer}ms` : ''}) · tokens: classifier{' '}
        {turn.tokens.classifierInput ?? '?'}/{turn.tokens.classifierOutput ?? '?'}, planner {turn.tokens.plannerInput ?? '?'}/{turn.tokens.plannerOutput ?? '?'}
      </div>
    </div>
  );
}

export function ConversationScenariosPanel() {
  const [estimate, setEstimate] = useState<{ totalTurns: number; totalModelCalls: number; scenarioCount: number } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<HarnessRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareFile, setCompareFile] = useState<HarnessRunResult | null>(null);

  async function handleEstimate() {
    setError(null);
    const est = await estimateConversationScenariosAction();
    setEstimate(est);
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    const res = await runConversationScenariosAction();
    setRunning(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setResult(res.result ?? null);
  }

  function handleDownload() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-scenarios-${result.metadata.gitCommit}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCompareFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        setCompareFile(JSON.parse(reader.result as string) as HarnessRunResult);
      } catch {
        setError('arquivo de comparação inválido (JSON malformado)');
      }
    };
    reader.readAsText(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontSize: 13 }}>
      <div style={{ ...cardStyle, background: '#1a1300' }}>
        🧪 <strong>Ferramenta administrativa — AI Evaluation Harness.</strong> Testa SÓ compreensão conversacional (Classifier, Planner, reconhecedor de
        delegação) contra o modelo real. NUNCA envia WhatsApp, cria pending_delegated_contacts/outbound_intents reais, altera booking ou produz cobrança —
        garantia estrutural (ver conversation-scenarios/runner.ts), não só esta mensagem. Um &ldquo;sinal de delegação reconhecido&rdquo; aqui mede a
        precisão do reconhecedor isolado, nunca confirma envio/entrega real.
      </div>

      {!estimate && (
        <button type="button" onClick={handleEstimate} style={{ padding: '8px 16px', borderRadius: 6 }}>
          1. calcular estimativa de custo antes de rodar
        </button>
      )}

      {estimate && !confirmed && (
        <div style={cardStyle}>
          <div style={{ marginBottom: 12 }}>
            {estimate.scenarioCount} cenários, {estimate.totalTurns} turnos, até {estimate.totalModelCalls} chamadas ao modelo. Custo real por chamada
            depende do tamanho do contexto gerado a cada turno — calculado e mostrado por turno depois de rodar.
          </div>
          <button type="button" onClick={() => setConfirmed(true)} style={{ padding: '8px 16px', borderRadius: 6 }}>
            2. confirmar e liberar a execução real
          </button>
        </div>
      )}

      {confirmed && (
        <button type="button" onClick={handleRun} disabled={running} style={{ padding: '8px 16px', borderRadius: 6 }}>
          {running ? 'rodando… (chamadas reais à OpenAI, pode levar um tempo)' : '3. rodar os cenários'}
        </button>
      )}

      {error === 'openai_not_configured' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6 }}>OPENAI_API_KEY não configurada — nada foi executado.</pre>
      )}
      {error?.startsWith('rate_limited') && (
        <pre style={{ background: '#111', color: '#ffc966', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>
          {error.split(':')[1]} — limite aplicado no servidor (migration 0118), não contorna recarregando a página.
        </pre>
      )}
      {error && !error.startsWith('rate_limited') && error !== 'openai_not_configured' && (
        <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>{error}</pre>
      )}

      {result && (
        <>
          <div style={{ ...cardStyle, background: '#1a1300', border: '1px solid #8a5a00' }}>
            ⚠️ <strong>{result.semanticDisclaimer}</strong>
          </div>
          <div style={cardStyle}>
            <div>
              <strong style={result.allPass ? okStyle : failStyle}>
                {result.allPass ? 'TODOS OS CRITÉRIOS OBJETIVOS PASSARAM' : 'HÁ CENÁRIOS COM CRITÉRIOS OBJETIVOS FALHANDO'}
              </strong>
            </div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
              commit: {result.metadata.gitCommit} · classifier: {result.metadata.classifierModel} (prompt hash {result.metadata.classifierInstructionsHash})
              · planner: {result.metadata.plannerModel} (prompt hash {result.metadata.plannerInstructionsHash}) · custo total:{' '}
              {centsToBRL(result.totalCostCents)} · rodado em {result.metadata.runAt}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
              <button type="button" onClick={handleDownload} style={{ padding: '6px 12px', borderRadius: 6 }}>
                baixar resultado (JSON)
              </button>
              <label style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #444', cursor: 'pointer' }}>
                comparar com rodada anterior (JSON)
                <input type="file" accept="application/json" onChange={handleCompareFile} style={{ display: 'none' }} />
              </label>
            </div>
            {compareFile && (
              <div style={{ fontSize: 12, marginTop: 8 }}>
                comparando com commit <strong>{compareFile.metadata.gitCommit}</strong> (prompt hashes: classifier {compareFile.metadata.classifierInstructionsHash}
                , planner {compareFile.metadata.plannerInstructionsHash}){' '}
                {compareFile.metadata.classifierInstructionsHash === result.metadata.classifierInstructionsHash &&
                compareFile.metadata.plannerInstructionsHash === result.metadata.plannerInstructionsHash
                  ? '— MESMOS prompts nas duas rodadas (diferença, se houver, é variação do modelo, não mudança de código)'
                  : '— prompts DIFERENTES entre as duas rodadas (comparação não é apples-to-apples)'}
              </div>
            )}
          </div>

          {result.scenarios.map((scenario) => (
            <div key={scenario.scenarioId} style={cardStyle}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>
                {scenario.name} — <span style={scenario.scenarioPass ? okStyle : failStyle}>{scenario.scenarioPass ? 'PASS' : 'FAIL'}</span>
              </div>
              <div style={{ fontSize: 11, color: '#777', marginBottom: 12 }}>
                categoria: {scenario.category} · origem: {scenario.source} · custo: {centsToBRL(scenario.totalCostCents)} · latência total:{' '}
                {scenario.totalLatencyMs}ms
              </div>
              {scenario.turns.map((turn) => (
                <TurnCard key={turn.turnIndex} turn={turn} />
              ))}
              {compareFile &&
                (() => {
                  const prev = compareFile.scenarios.find((s) => s.scenarioId === scenario.scenarioId);
                  if (!prev) return <div style={{ fontSize: 12, color: '#999' }}>cenário novo, não existia na rodada comparada.</div>;
                  if (prev.scenarioPass !== scenario.scenarioPass) {
                    return (
                      <div style={{ fontSize: 12, color: scenario.scenarioPass ? '#3fb950' : '#ff7b72' }}>
                        mudou de {prev.scenarioPass ? 'PASS' : 'FAIL'} para {scenario.scenarioPass ? 'PASS' : 'FAIL'} em relação à rodada comparada.
                      </div>
                    );
                  }
                  return <div style={{ fontSize: 12, color: '#777' }}>mesmo resultado ({scenario.scenarioPass ? 'PASS' : 'FAIL'}) da rodada comparada.</div>;
                })()}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
