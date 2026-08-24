import type { ToolContext, ToolDefinition, ToolExecutionResult } from './types';

// Doopla Intelligence Core v1 — Tool Registry.
//
// Contrato definitivo aprovado na arquitetura: toda tool declara
// baseRiskLevel + resolveRisk() — o risco final NUNCA pode ser mais
// baixo que baseRiskLevel (só escala, nunca reduz), e o model nunca é
// consultado nem tratado como autoridade sobre risco.
//
// eligibleTools (calculado pelo pre-model gate, nunca pelo chamador
// nem pelo model) é sempre exigido em executeTool — uma tool
// registrada mas não elegível para este ActorContext/conversa não
// executa (teste obrigatório: nenhuma tool não registrada executa).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ToolDefinition<any, any>>();

export function registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
  if (registry.has(tool.name)) {
    throw new Error(`tool já registrada: ${tool.name}`);
  }
  registry.set(tool.name, tool);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getRegisteredTool(name: string): ToolDefinition<any, any> | undefined {
  return registry.get(name);
}

export function listRegisteredTools(): string[] {
  return Array.from(registry.keys());
}

export async function executeTool<TOutput = unknown>(
  toolName: string,
  rawInput: unknown,
  ctx: ToolContext,
  eligibleTools: string[]
): Promise<ToolExecutionResult<TOutput>> {
  const tool = registry.get(toolName);
  if (!tool) {
    return { ok: false, error: 'tool_not_registered' };
  }

  // eligibleTools vem sempre do pre-model gate (calculado a partir de
  // actorContext.capabilities) — nunca de uma lista declarada pelo
  // chamador ou pelo model.
  if (!eligibleTools.includes(toolName)) {
    return { ok: false, error: 'tool_not_eligible' };
  }

  const parsed = tool.inputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: 'invalid_input', detail: parsed.error.message };
  }

  let outcome;
  try {
    outcome = await tool.execute(parsed.data, ctx);
  } catch (err) {
    return { ok: false, error: 'execution_failed', detail: err instanceof Error ? err.message : undefined };
  }

  if (!outcome.ok) {
    return outcome.error === 'invalid_input'
      ? { ok: false, error: 'invalid_input', detail: outcome.detail }
      : { ok: false, error: 'execution_failed', detail: outcome.detail };
  }

  const riskLevel = tool.resolveRisk(parsed.data, ctx);
  const riskRank: Record<string, number> = { low: 0, medium: 1, high: 2 };
  // resolveRisk só pode escalar — se por bug de implementação alguma
  // tool devolvesse um risco abaixo do baseRiskLevel, o registry corrige
  // pro piso estático em vez de confiar no valor devolvido.
  const finalRiskLevel =
    riskRank[riskLevel] >= riskRank[tool.baseRiskLevel] ? riskLevel : tool.baseRiskLevel;

  return { ok: true, output: outcome.output as TOutput, riskLevel: finalRiskLevel };
}
