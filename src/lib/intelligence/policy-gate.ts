import { listRegisteredTools, getRegisteredTool } from './tool-registry';
import type { ContextSource, PolicyGateContext, PolicyGateResult, RepresentationEthicsFlag } from './types';

// Doopla Intelligence Core v1 — Policy Gate (pre-model), primeira
// versão. Roda ANTES de qualquer chamada ao model. Se falhar, o model
// não é chamado — o gate decide o que o model tem permissão de ver
// (allowedContextSources) e o que tem permissão de escolher
// (eligibleTools) antes de qualquer geração, nunca depois.

// Ética de representação — já aprovada na arquitetura como checks
// reais e nomeados, mesmo sendo hoje um no-op estrutural: v1 é
// mono-profissional (uma conversa representa sempre um único
// profissional), então nenhuma das situações abaixo pode ocorrer
// ainda. Mantido como função real (não removida/adiada) pra quando o
// Discovery multi-profissional existir e estas condições passarem a
// ser avaliadas de verdade.
export function evaluateRepresentationEthics(ctx: PolicyGateContext): RepresentationEthicsFlag[] {
  void ctx;
  return [];
}

export function evaluatePreModelGate(ctx: PolicyGateContext): PolicyGateResult {
  const { actorContext, conversation } = ctx;

  // Checagem defensiva: mesmo resolveActorContext já garantindo isto,
  // o gate nunca confia que um ActorContext chegou correto por outro
  // caminho — reafirma a amarração representado/conversa aqui também.
  if (actorContext.representedProfessionalId !== conversation.represented_professional_id) {
    return { ok: false, error: 'actor_conversation_mismatch' };
  }

  if (conversation.mandate !== 'active') {
    return { ok: false, error: 'mandate_not_active' };
  }

  // professional_business_context/professional_commercial_history nunca
  // dependem de link de conversa (diferente de opportunity/booking/
  // external_participant) — são sobre o profissional representado em
  // si, sempre elegíveis pra ele, mesmo grupo de professional_profile/
  // conversation_messages.
  const allowedContextSources: ContextSource[] = [
    'professional_profile',
    'conversation_messages',
    'professional_business_context',
    'professional_commercial_history',
  ];
  if (conversation.related_opportunity_id) {
    allowedContextSources.push('opportunity');
  }
  if (conversation.related_booking_id) {
    allowedContextSources.push('booking');
  }
  if (conversation.external_participant_id) {
    allowedContextSources.push('external_participant');
  }

  // Elegibilidade = interseção entre o que está registrado no Tool
  // Registry e o que actorContext.capabilities autoriza — nunca uma
  // lista declarada pelo chamador ou pelo model.
  const eligibleTools = listRegisteredTools().filter((name) => {
    const tool = getRegisteredTool(name);
    return tool != null && actorContext.capabilities.includes(tool.requiredCapability);
  });

  return {
    ok: true,
    allowedContextSources,
    eligibleTools,
    ethicsFlags: evaluateRepresentationEthics(ctx),
  };
}
