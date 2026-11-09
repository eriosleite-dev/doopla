'use client';

import { useState } from 'react';

import {
  estimateConversationScenariosAction,
  getHarnessRunMetadataAction,
  listHarnessScenariosAction,
  runConversationScenarioChunkAction,
  runConversationScenariosBatchAction,
} from './actions';
import { SEMANTIC_CORRECTNESS_DISCLAIMER, buildScenarioResultFromTurns } from '@/lib/intelligence/conversation-scenarios/types';
import type { HarnessRunResult, ScenarioResult, TurnResult } from '@/lib/intelligence/conversation-scenarios/types';
import type { MessageContextItem } from '@/lib/intelligence/context-builder';
import type { ConversationStateSnapshot } from '@/lib/intelligence/conversation-state';

type ListedScenario = { id: string; name: string; category: string; source: string; turnCount: number };

// Execução em lotes (19/10/2026) — ver comentário em actions.ts. Nunca
// quebra um cenário ao meio: agrupa cenários inteiros (na ordem
// original) até este teto de turnos por lote, nunca turnos avulsos.
// 6 é conservador de propósito (folga grande sob o limite de 300s da
// Vercel mesmo em dias de latência alta da OpenAI) — prioriza nunca
// mais travar a página sobre velocidade total da rodada.
const HARNESS_BATCH_MAX_TURNS = 6;

function chunkScenarioIds(scenarios: { id: string; turnCount: number }[]): string[][] {
  const batches: string[][] = [];
  let current: string[] = [];
  let currentTurns = 0;
  for (const s of scenarios) {
    if (current.length > 0 && currentTurns + s.turnCount > HARNESS_BATCH_MAX_TURNS) {
      batches.push(current);
      current = [];
      currentTurns = 0;
    }
    current.push(s.id);
    currentTurns += s.turnCount;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// Task "Próxima fase: inteligência conversacional multiturno"
// (21/10/2026) — achado real: um cenário sozinho com mais turnos que
// HARNESS_BATCH_MAX_TURNS ignora o agrupamento acima (chunkScenarioIds
// nunca quebra um cenário ao meio) e rodaria inteiro numa Server
// Action só. Cenários "curtos" (cabem no lote normal) continuam
// exatamente no caminho de sempre; cenários "longos" (10-20 turnos,
// pensados pro laboratório de conversas completas) rodam pelo caminho
// novo e retomável abaixo, nunca misturados no mesmo lote.
function partitionScenarios(scenarios: ListedScenario[]): { short: ListedScenario[]; long: ListedScenario[] } {
  const short = scenarios.filter((s) => s.turnCount <= HARNESS_BATCH_MAX_TURNS);
  const long = scenarios.filter((s) => s.turnCount > HARNESS_BATCH_MAX_TURNS);
  return { short, long };
}

// Roda UM cenário longo inteiro, em pedaços de HARNESS_BATCH_MAX_TURNS
// turnos, retomando entre chamadas (items/nextTurnIndex devolvidos
// pela Server Action anterior) — nunca uma chamada só com o cenário
// inteiro. onChunkDone é chamado a cada pedaço concluído, pra reportar
// progresso turno a turno (um cenário de 15 turnos leva 3 chamadas
// reais, cada uma pode demorar; sem isso a barra de progresso ficaria
// parada por minutos sem nenhum sinal de vida).
async function runLongScenario(scenario: ListedScenario, onChunkDone: () => void): Promise<{ result?: ScenarioResult; error?: string }> {
  let items: MessageContextItem[] | null = null;
  let conversationState: ConversationStateSnapshot | null = null;
  let fromTurnIndex = 0;
  const turnResults: TurnResult[] = [];

  while (fromTurnIndex < scenario.turnCount) {
    const res = await runConversationScenarioChunkAction(scenario.id, items, fromTurnIndex, HARNESS_BATCH_MAX_TURNS, conversationState);
    if (res.error || !res.turnResults || res.nextTurnIndex === undefined || !res.items) {
      return { error: res.error ?? 'harness_execution_failed' };
    }
    turnResults.push(...res.turnResults);
    items = res.items;
    conversationState = res.conversationState ?? null;
    fromTurnIndex = res.nextTurnIndex;
    onChunkDone();
  }

  return { result: buildScenarioResultFromTurns(scenario, turnResults) };
}

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
        <strong>{turn.triggerAuthorType === 'professional' ? 'Profissional' : 'Cliente'}:</strong> {turn.triggerMessage}
      </div>
      {(turn.classifierError !== null || turn.plannerError !== null || turn.recognizerError !== null) && (
        <div style={{ fontSize: 12, marginBottom: 8, padding: '6px 10px', background: '#3a1414', border: '1px solid #8a2020', borderRadius: 4, color: '#ff9b93' }}>
          ⚠️ <strong>Erro real na chamada ao model (não é julgamento semântico)</strong> — os campos abaixo (intent/plano/texto) são o fallback
          determinístico, nunca uma resposta real do model. {turn.classifierError && <>Classifier: {turn.classifierError} </>}
          {turn.plannerError && <>Planner: {turn.plannerError} </>}
          {turn.recognizerError && <>Recognizer: {turn.recognizerError}</>}
        </div>
      )}
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
      {(turn.delegationRecipientName !== null || turn.delegationDraftMessageContent !== null) && (
        <div style={{ fontSize: 12, marginBottom: 8, padding: '6px 10px', background: '#0d1b2a', border: '1px solid #2a4a6a', borderRadius: 4, whiteSpace: 'pre-wrap' }}>
          <strong>Texto real que o recognizer prepararia pra envio (P0.1/P0.2 — nunca a resposta do Planner acima, que não é o que o destinatário recebe):</strong>
          <br />
          destinatário: {turn.delegationRecipientName ?? '(não extraído)'} · número: {turn.delegationRecipientNumber ?? '(não extraído)'} · motivo:{' '}
          {turn.delegationPurposeSummary ?? '(não extraído)'}
          <br />
          draftMessageContent: {turn.delegationDraftMessageContent ?? '(null — recognizer pediu esclarecimento em vez de arriscar um texto)'}
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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<HarnessRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareFile, setCompareFile] = useState<HarnessRunResult | null>(null);
  // Task "Próxima fase: inteligência conversacional multiturno"
  // (21/10/2026) — seleção de cenários, pra poder isolar um subconjunto
  // (ex.: só os novos "multiturno_*") sem precisar rodar os 28+ cenários
  // curtos de novo toda vez — achado real: um rate limit da OpenAI numa
  // rodada completa deixou os 3 cenários novos sem dado nenhum, e
  // reproduzir exigia uma forma de rodar só eles.
  const [scenarioList, setScenarioList] = useState<ListedScenario[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function handleEstimate() {
    setError(null);
    const [est, { scenarios }] = await Promise.all([estimateConversationScenariosAction(), listHarnessScenariosAction()]);
    setEstimate(est);
    setScenarioList(scenarios);
    setSelectedIds(new Set(scenarios.map((s) => s.id)));
  }

  function selectAll() {
    if (scenarioList) setSelectedIds(new Set(scenarioList.map((s) => s.id)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }
  function selectMultiturnoOnly() {
    if (scenarioList) setSelectedIds(new Set(scenarioList.filter((s) => s.category.startsWith('multiturno_')).map((s) => s.id)));
  }
  function toggleScenario(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setProgress(null);

    const scenarios = (scenarioList ?? []).filter((s) => selectedIds.has(s.id));
    const { short, long } = partitionScenarios(scenarios);
    const shortBatches = chunkScenarioIds(short);
    // Progresso conta "passos" dos dois caminhos juntos: um passo = um
    // lote de cenários curtos, OU um pedaço (HARNESS_BATCH_MAX_TURNS
    // turnos) de um cenário longo — mesma unidade de "uma chamada real
    // à Server Action", pra barra de progresso nunca ficar parada por
    // minutos sem sinal de vida num cenário de 15-20 turnos.
    const longSteps = long.reduce((sum, s) => sum + Math.ceil(s.turnCount / HARNESS_BATCH_MAX_TURNS), 0);
    const totalSteps = shortBatches.length + longSteps;
    let doneSteps = 0;
    const scenarioResults: ScenarioResult[] = [];
    let stepError: string | null = null;

    try {
      for (let i = 0; i < shortBatches.length && !stepError; i++) {
        setProgress({ done: doneSteps, total: totalSteps });
        const res = await runConversationScenariosBatchAction(shortBatches[i]);
        if (res.error) {
          stepError = res.error;
          break;
        }
        if (res.result) scenarioResults.push(...res.result.scenarios);
        doneSteps += 1;
      }

      for (const scenario of long) {
        if (stepError) break;
        const res = await runLongScenario(scenario, () => {
          doneSteps += 1;
          setProgress({ done: doneSteps, total: totalSteps });
        });
        if (res.error) {
          stepError = res.error;
          break;
        }
        if (res.result) scenarioResults.push(res.result);
      }

      if (stepError) setError(stepError);

      // Nunca descarta os cenários já rodados com sucesso só porque um
      // passo seguinte falhou (ex.: rate_limited por um lease de uma
      // execução anterior ainda não liberado) — mostra o que já tem,
      // erro ou não.
      if (scenarioResults.length > 0) {
        const { metadata } = await getHarnessRunMetadataAction();
        const costConfigured = scenarioResults.every((s) => s.totalCostCents !== null);
        setResult({
          metadata,
          semanticDisclaimer: SEMANTIC_CORRECTNESS_DISCLAIMER,
          scenarios: scenarioResults,
          totalCostCents: costConfigured ? scenarioResults.reduce((sum, s) => sum + (s.totalCostCents ?? 0), 0) : null,
          allPass: scenarioResults.every((s) => s.scenarioPass),
        });
      }
    } finally {
      setRunning(false);
      setProgress(null);
    }
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
            {estimate.scenarioCount} cenários, {estimate.totalTurns} turnos, até {estimate.totalModelCalls} chamadas ao modelo (TOTAL — a seleção
            abaixo decide o que de fato roda). Custo real por chamada depende do tamanho do contexto gerado a cada turno — calculado e mostrado por
            turno depois de rodar.
          </div>
          {scenarioList && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ color: '#aaa' }}>
                  {selectedIds.size} de {scenarioList.length} cenários selecionados ({scenarioList.filter((s) => selectedIds.has(s.id)).reduce((sum, s) => sum + s.turnCount, 0)}{' '}
                  turnos)
                </span>
                <button type="button" onClick={selectAll} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                  todos
                </button>
                <button type="button" onClick={selectNone} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                  nenhum
                </button>
                <button type="button" onClick={selectMultiturnoOnly} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 12 }}>
                  só os novos (multiturno)
                </button>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid #333', borderRadius: 6, padding: 8 }}>
                {scenarioList.map((s) => (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleScenario(s.id)} />
                    <span style={{ color: '#999' }}>[{s.turnCount}t]</span> {s.name}
                  </label>
                ))}
              </div>
            </div>
          )}
          <button type="button" onClick={() => setConfirmed(true)} disabled={selectedIds.size === 0} style={{ padding: '8px 16px', borderRadius: 6 }}>
            2. confirmar e liberar a execução real
          </button>
        </div>
      )}

      {confirmed && (
        <button type="button" onClick={handleRun} disabled={running} style={{ padding: '8px 16px', borderRadius: 6 }}>
          {running
            ? progress
              ? `rodando… passo ${progress.done + 1} de ${progress.total} (lotes pequenos — inclusive dentro de cenários longos — nunca trava a página num limite de tempo da Vercel)`
              : 'rodando… (chamadas reais à OpenAI, pode levar um tempo)'
            : '3. rodar os cenários'}
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
