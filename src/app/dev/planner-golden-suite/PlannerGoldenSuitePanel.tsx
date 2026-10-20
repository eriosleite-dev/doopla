'use client';

import { useState } from 'react';

import { checkModelAvailabilityAction, listPlannerGoldenSuiteCasesAction, runPlannerGoldenSuiteBatchAction } from './actions';
import { buildRunSummary, type PlannerGoldenSuiteCaseResult, type PlannerGoldenSuiteRunSummary } from './golden-suite-summary';
import { PLANNER_PROMPT_VARIANT_TERRA_V1 } from '@/lib/intelligence/planner/prompt-variants';
import type { IntentClassification } from '@/lib/intelligence/classification';

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

// Diagnóstico de estabilidade — task "CODE | Próxima etapa da
// avaliação do cérebro Doopla" (20/10/2026), requisito 1: rodar os
// casos críticos N>=5 vezes por model e contar quantas vezes CADA
// model acerta, não só um PASS/FAIL único. Nunca precisou de uma
// Server Action nova: reusa runPlannerGoldenSuiteBatchAction com um
// único caso por chamada, N vezes em sequência (mesma disciplina de
// timeout/try-catch do restante do painel) — zero mudança em
// actions.ts.
//
// Casos: os 6 citados pela fundadora (8, 11, 14, 25, 26, 28, pela
// numeração da tabela que ela colou) + os 2 novos pares de
// generalização adicionados agora pra fechar a lacuna (11 e 26 ainda
// não tinham uma segunda variação testando o mesmo princípio).
const STABILITY_CASE_NAMES = [
  'profissional responde decisivamente a pergunta interna da Doopla sobre logística', // caso 8
  'pergunta de coleta em turno de decisão fica elegível a auto-send', // caso 11
  'relato de fato existente — horário', // caso 14
  'fonte unavailable — nunca responder como se fosse inexistente', // caso 25
  'sinal de decisão em tópico errado — não confundir suporte com confirmação comercial', // caso 26
  'generalização — informação genuinamente indisponível (nunca inventar, nunca tratar como decisão nova)', // caso 28
  'generalização — pergunta de preço sem booking existente, assunto diferente', // par novo do caso 11
  'generalização — sinal de decisão em tópico errado, palavra diferente', // par novo do caso 26
] as const;

type StabilityRunOutcome = {
  pass: boolean;
  responsePlan: string;
  commitmentNature: string;
  professionalDecisionSignal: string;
  // Requisito 3 ("Próxima etapa"): registrar a saída do Classifier em
  // CADA repetição, nunca só o resultado final do Planner — dá pra
  // diferenciar variação do Classifier de variação do Planner.
  classificationPrimaryIntent: string;
  classificationStatus: string;
  classificationSource: 'computed' | 'fixed';
  // reasoning.effort/context EFETIVOS, lidos de volta da própria API
  // (requisito explícito: nunca atribuir diferença de qualidade/latência
  // a uma configuração não comprovada).
  plannerReasoningEffort: string | null;
  plannerReasoningContext: string | null;
  error?: string;
};

type StabilityModelTally = {
  model: string;
  variantLabel: string | null;
  fixedClassification: boolean;
  passCount: number;
  total: number;
  distinctResponsePlans: string[];
  distinctSignals: string[];
  distinctClassifications: string[];
  distinctReasoningEfforts: string[];
  distinctReasoningContexts: string[];
  runs: StabilityRunOutcome[];
};

type StabilityCaseResult = {
  caseName: string;
  baseline: StabilityModelTally;
  comparison: StabilityModelTally;
};

function formatTally(tally: StabilityModelTally): string {
  const flags = tally.distinctResponsePlans.length > 1 ? ' ⚠ responsePlan variou' : '';
  return `${tally.passCount}/${tally.total} PASS${flags}`;
}

function formatClassifierVariance(tally: StabilityModelTally): string {
  if (tally.fixedClassification) return 'fixada (repetição 1) — Classifier não chamado nas demais';
  return tally.distinctClassifications.length > 1
    ? `⚠ Classifier variou: ${tally.distinctClassifications.join(', ')}`
    : `estável: ${tally.distinctClassifications[0] ?? '—'}`;
}

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

  const [stabilitySelectedCases, setStabilitySelectedCases] = useState<string[]>([...STABILITY_CASE_NAMES]);
  const [repeatCount, setRepeatCount] = useState(5);
  const [stabilityRunning, setStabilityRunning] = useState(false);
  const [stabilityProgress, setStabilityProgress] = useState<{ done: number; total: number } | null>(null);
  const [stabilityError, setStabilityError] = useState<string | null>(null);
  const [stabilityResults, setStabilityResults] = useState<StabilityCaseResult[] | null>(null);
  // Requisito explícito: "se houver variação no Classifier, precisamos
  // conseguir executar uma comparação posterior mantendo sua saída
  // fixa, para isolar o comportamento do Planner". Sempre uma rodada
  // SEPARADA — nunca automática: a profissional roda primeiro sem
  // fixar (pra ver se o Classifier varia de verdade) e só então, se
  // quiser, liga isto e roda de novo.
  const [fixedClassification, setFixedClassification] = useState(false);

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

  // Uma repetição = 1 chamada a runPlannerGoldenSuiteBatchAction com
  // um único caso (classifyIntent + planResponse reais) — sequencial
  // de propósito, nunca em paralelo: mantém o mesmo limite de
  // concorrência já validado no resto do painel, e cada chamada tem
  // seu próprio timeout/try-catch (BATCH_TIMEOUT_MS), então uma
  // repetição travada nunca prende o diagnóstico inteiro sem sinal.
  async function runRepeatedForModel(
    modelId: string,
    caseName: string,
    times: number,
    variant: string | null,
    useFixedClassification: boolean,
    onTick: () => void
  ): Promise<StabilityModelTally> {
    const runs: StabilityRunOutcome[] = [];
    // Classificação fixa (requisito explícito): a repetição 1 SEMPRE
    // chama o Classifier de verdade; se useFixedClassification estiver
    // ligado, as repetições 2..N reusam a classificação obtida na
    // repetição 1 (via fixedClassifications da Server Action), nunca
    // chamando o Classifier de novo — isola 100% a variação ao Planner.
    let frozenClassification: IntentClassification | null = null;

    for (let i = 0; i < times; i++) {
      let outcome: StabilityRunOutcome;
      try {
        const fixedClassifications: Record<string, IntentClassification> | null =
          useFixedClassification && frozenClassification ? { [caseName]: frozenClassification } : null;
        const res: { results?: PlannerGoldenSuiteCaseResult[]; error?: string } = await withTimeout(
          runPlannerGoldenSuiteBatchAction(modelId, [caseName], variant, fixedClassifications),
          BATCH_TIMEOUT_MS,
          `${modelId} / ${caseName} (${i + 1}/${times})`
        );
        const r = res.results?.[0];
        if (res.error || !r) {
          outcome = {
            pass: false,
            responsePlan: 'erro',
            commitmentNature: 'erro',
            professionalDecisionSignal: 'erro',
            classificationPrimaryIntent: 'erro',
            classificationStatus: 'erro',
            classificationSource: 'computed',
            plannerReasoningEffort: null,
            plannerReasoningContext: null,
            error: res.error ?? 'sem resultado',
          };
        } else {
          outcome = {
            pass: r.pass,
            responsePlan: r.responsePlan,
            commitmentNature: r.commitmentNature,
            professionalDecisionSignal: r.professionalDecisionSignal,
            classificationPrimaryIntent: r.classification.primaryIntent,
            classificationStatus: r.classification.classificationStatus,
            classificationSource: r.classificationSource,
            plannerReasoningEffort: r.plannerReasoningEffort,
            plannerReasoningContext: r.plannerReasoningContext,
            error: r.error,
          };
          if (!frozenClassification) frozenClassification = r.classification;
        }
      } catch (err) {
        outcome = {
          pass: false,
          responsePlan: 'erro',
          commitmentNature: 'erro',
          professionalDecisionSignal: 'erro',
          classificationPrimaryIntent: 'erro',
          classificationStatus: 'erro',
          classificationSource: 'computed',
          plannerReasoningEffort: null,
          plannerReasoningContext: null,
          error: err instanceof Error ? err.message : 'erro desconhecido',
        };
      }
      runs.push(outcome);
      onTick();
    }
    return {
      model: modelId,
      variantLabel: variant,
      fixedClassification: useFixedClassification,
      passCount: runs.filter((r) => r.pass).length,
      total: times,
      distinctResponsePlans: Array.from(new Set(runs.map((r) => r.responsePlan))),
      distinctSignals: Array.from(new Set(runs.map((r) => r.professionalDecisionSignal))),
      distinctClassifications: Array.from(new Set(runs.map((r) => r.classificationPrimaryIntent))),
      distinctReasoningEfforts: Array.from(new Set(runs.map((r) => r.plannerReasoningEffort ?? '—'))),
      distinctReasoningContexts: Array.from(new Set(runs.map((r) => r.plannerReasoningContext ?? '—'))),
      runs,
    };
  }

  // baseline = gpt-5-mini sem variante, SEMPRE (= produção hoje) —
  // comparison = o model/variante escolhidos acima no painel. Assim
  // a mesma dupla de controles já usada na suite estrutural também
  // define a comparação deste diagnóstico, nunca um terceiro conjunto
  // de inputs separado.
  async function handleRunStability() {
    setStabilityRunning(true);
    setStabilityError(null);
    setStabilityResults(null);
    setStabilityProgress(null);

    const casesToRun = stabilitySelectedCases;
    const comparisonVariant = useTerraVariant ? PLANNER_PROMPT_VARIANT_TERRA_V1 : null;
    const totalCalls = casesToRun.length * repeatCount * 2;
    let done = 0;
    const out: StabilityCaseResult[] = [];
    const onTick = () => {
      done += 1;
      setStabilityProgress({ done, total: totalCalls });
    };

    try {
      for (const caseName of casesToRun) {
        const baseline = await runRepeatedForModel(DEFAULT_MODEL, caseName, repeatCount, null, fixedClassification, onTick);
        const comparison = await runRepeatedForModel(model, caseName, repeatCount, comparisonVariant, fixedClassification, onTick);
        out.push({ caseName, baseline, comparison });
        setStabilityResults([...out]);
      }
    } catch (err) {
      setStabilityError(err instanceof Error ? err.message : 'erro desconhecido');
    } finally {
      setStabilityRunning(false);
      setStabilityProgress(null);
    }
  }

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
          <div style={{ color: '#aaa' }}>
            reasoning.effort/context EFETIVOS devolvidos pela API nesta rodada (nunca só o default documentado):{' '}
            <code>effort={Array.from(new Set(results.map((r) => r.plannerReasoningEffort ?? '—'))).join(', ')}</code>,{' '}
            <code>context={Array.from(new Set(results.map((r) => r.plannerReasoningContext ?? '—'))).join(', ')}</code>.
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

      <hr style={{ borderColor: '#333', width: '100%' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong>Diagnóstico de estabilidade (repetição)</strong>
        <div style={{ color: '#aaa' }}>
          Roda cada caso selecionado <code>repetições</code> vezes pra <code>gpt-5-mini</code> (baseline, sem variante — comportamento de
          produção hoje) e pra <code>{model || '?'}</code>
          {useTerraVariant && <> + variante terra-v1</>}, contando quantas vezes cada model acerta — não um PASS/FAIL único. Usa os mesmos ~2
          chamadas reais por execução da suite acima; com os defaults (8 casos × 5 repetições × 2 models) isso é ~160 chamadas reais à OpenAI,
          pode levar vários minutos.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {STABILITY_CASE_NAMES.map((name) => (
            <label key={name} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={stabilitySelectedCases.includes(name)}
                disabled={stabilityRunning}
                onChange={(e) =>
                  setStabilitySelectedCases((prev) => (e.target.checked ? [...prev, name] : prev.filter((n) => n !== name)))
                }
              />
              {name}
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="repeat-count" style={{ color: '#aaa' }}>
            repetições por model:
          </label>
          <input
            id="repeat-count"
            type="number"
            min={1}
            max={20}
            value={repeatCount}
            disabled={stabilityRunning}
            onChange={(e) => setRepeatCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            style={{ fontFamily: 'monospace', fontSize: 13, padding: '6px 8px', width: 70 }}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#aaa', cursor: 'pointer' }}>
            <input type="checkbox" checked={fixedClassification} onChange={(e) => setFixedClassification(e.target.checked)} disabled={stabilityRunning} />
            classificação fixa (congela a saída do Classifier da 1ª repetição nas demais — isola o Planner)
          </label>
          <button type="button" onClick={handleRunStability} disabled={stabilityRunning || stabilitySelectedCases.length === 0} style={buttonStyle}>
            {stabilityRunning
              ? stabilityProgress
                ? `rodando (${stabilityProgress.done}/${stabilityProgress.total} chamadas)…`
                : 'preparando…'
              : 'rodar diagnóstico de estabilidade'}
          </button>
        </div>
        <div style={{ color: '#888', fontSize: 11 }}>
          Rode primeiro SEM &ldquo;classificação fixa&rdquo; pra ver se o Classifier varia de verdade entre repetições. Se variar, marque a
          opção e rode de novo — a partir daí qualquer variação do responsePlan só pode vir do Planner, nunca do Classifier (que passa a ser
          reusado, não chamado de novo). Pra comparar a variante terra-v1 isoladamente (etapa 2 da avaliação), marque &ldquo;usar variante
          otimizada&rdquo; acima e rode esta seção de novo — nunca ao mesmo tempo que a etapa 1 (gpt-5-mini vs. gpt-5.6-terra sem variante).
        </div>

        {stabilityError && (
          <pre style={{ background: '#111', color: '#ff7b72', padding: 12, borderRadius: 6, whiteSpace: 'pre-wrap' }}>{stabilityError}</pre>
        )}

        {stabilityResults && stabilityResults.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
              <thead>
                <tr>
                  {['caso', `baseline (gpt-5-mini)`, `comparação (${model})`].map((h) => (
                    <th key={h} style={thStyle}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stabilityResults.map((r) => (
                  <tr key={r.caseName}>
                    <td style={tdStyle}>{r.caseName}</td>
                    {[r.baseline, r.comparison].map((tally, colIdx) => (
                      <td key={colIdx} style={tdStyle}>
                        <div>{formatTally(tally)}</div>
                        <div style={{ color: '#888', fontSize: 11 }}>
                          responsePlan: {tally.distinctResponsePlans.join(', ')}
                          {tally.distinctSignals.length > 1 && <> · signal: {tally.distinctSignals.join(', ')}</>}
                        </div>
                        <div style={{ color: '#888', fontSize: 11 }}>Classifier: {formatClassifierVariance(tally)}</div>
                        <div style={{ color: '#888', fontSize: 11 }}>
                          reasoning: effort=[{tally.distinctReasoningEfforts.join(', ')}] context=[{tally.distinctReasoningContexts.join(', ')}]
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
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
