import type { Competency } from '../classification/competencies';
import { buildPlannerInstructions } from './prompt';

// Doopla Intelligence Core v1 — Planner: variante EXPERIMENTAL de
// prompt, task "CODE | Otimização do Planner para gpt-5.6-terra"
// (20/10/2026). NUNCA usada em produção — só pelo painel
// /dev/planner-golden-suite, pra comparar gpt-5-mini (prompt.ts
// original, intocado) contra gpt-5.6-terra com este reforço.
//
// Desenho: SEMPRE base + addendum, nunca reescreve/remove nada do
// prompt original — "alterar só o necessário", requisito explícito da
// fundadora. O addendum reforça três princípios que já EXISTEM no
// prompt base (ver prompt.ts: "report_existing_fact" vs
// "new_or_changed_commitment", professionalDecisionSignal,
// "CONHECER ≠ APROVAR ≠ COMPROMETER") — os 3 casos que motivaram esta
// variante (8, 14, 25 da golden suite) não revelaram uma regra
// AUSENTE: o prompt base já cobre os três com instrução explícita, e
// gpt-5-mini seguiu certinho nos três. O que a comparação revelou foi
// que gpt-5.6-terra, mesmo recebendo exatamente a mesma instrução, não
// seguiu com a mesma confiabilidade — achado honesto, registrado no
// ADR correspondente: isto é um reforço de ÊNFASE/CLAREZA pra um model
// específico, nunca a descoberta de uma lacuna estrutural no prompt
// em si. Nenhum dos 3 casos exigia um fato que não estivesse já
// disponível no PlannerContext (booking/histórico da conversa) — por
// isso os três são corrigíveis por prompt, nunca um limite de
// contexto/schema/arquitetura (ver ADR de otimização pra detalhe
// caso a caso).
//
// Nunca menciona as frases literais dos casos de teste (requisito
// explícito da fundadora: "não quero adicionar exceções para frases
// específicas") — só os PRINCÍPIOS gerais por trás de cada falha.

export const PLANNER_PROMPT_VARIANT_TERRA_V1 = 'terra-v1';

export const TERRA_VARIANT_ADDENDUM_V1 = `

VARIANTE EXPERIMENTAL — reforço de raciocínio (gpt-5.6-terra, task de otimização, 20/10/2026). Tudo abaixo já está implícito nas regras acima; isto é ênfase, nunca uma regra nova ou conflitante. Use como checklist de raciocínio antes de decidir, nunca como lista de frases pra decorar.

1. Antes de tudo, identifique a NATUREZA da mensagem: ela está PEDINDO PRA RECORDAR algo já decidido, PROPONDO algo novo, ou CONFIRMANDO algo que estava pendente? As três são fundamentalmente diferentes, mesmo quando o assunto de fundo (valor, horário, condição) é o mesmo em todas.

2. Antes de consultar o profissional ou pedir mais informação, verifique primeiro se o fato já está disponível e confiável no seu contexto (booking, opportunity, ou o histórico desta própria conversa). Se já estiver, responda direto — nunca peça pra alguém confirmar o que você já sabe com certeza, e nunca trate recuperar um fato como se fosse abrir uma decisão nova. Isso vale mesmo quando o assunto normalmente seria sensível (preço, horário, condição de pagamento): perguntar sobre algo já combinado nunca é o mesmo que pedir pra mudar.

3. Quando o fato genuinamente não estiver disponível (nenhuma seção de contexto cobre isso, ou está marcada indisponível), explique objetivamente o que falta — nunca invente o dado, e nunca transforme a ausência de informação numa decisão comercial nova que ninguém propôs. Faltar dado não é o mesmo que decidir algo.

4. Mensagens curtas do profissional (um "sim", "isso", "certo", "pode ser", "é esse mesmo", ou equivalente) quase sempre respondem a algo específico dito antes na conversa — procure ativamente esse referente no histórico recente antes de tratar a mensagem como isolada ou sem contexto nenhum. Ao mesmo tempo, isso nunca autoriza presumir aprovação de algo sensível quando o referente for genuinamente ambíguo — a régua pra reconhecer uma confirmação continua exigindo um compromisso específico e completo pra apontar, exatamente como já descrito acima.`;

export function applyTerraVariantAddendum(baseInstructions: string): string {
  return `${baseInstructions}${TERRA_VARIANT_ADDENDUM_V1}`;
}

// Build completo, espelhando a assinatura de buildPlannerInstructions —
// existe pra documentação/teste/diff direto (mostrar o prompt inteiro
// já montado), nunca chamado pelo caminho de produção (plan.ts importa
// só buildPlannerInstructions, nunca este arquivo).
export function buildPlannerInstructionsTerraVariant(opts: { competencies?: readonly Competency[]; conversationType?: string } = {}): string {
  return applyTerraVariantAddendum(buildPlannerInstructions(opts));
}
