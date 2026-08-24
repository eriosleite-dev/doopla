import type { ContextFact, ContextPackage, ContextSection } from './types';

// Doopla Intelligence Core v1 — Context Builder v1: renderização.
//
// Só transforma um ContextPackage JÁ AUTORIZADO em texto pro model.
// Nunca decide autorização, tenant, elegibilidade de tool, provenance
// ou risco — só lê o que o pacote já contém. O ContextPackage
// continua sendo a fonte de verdade; isto aqui é uma projeção
// descartável dele.
//
// Regra central pro estado 'unavailable' (achado da auditoria
// adversarial do Bloco 2): NUNCA vira silêncio (que pareceria "não
// existe", igual a not_allowed/no_link/not_found) e NUNCA carrega a
// mensagem técnica do erro — só um aviso neutro de que aquela fonte
// não pôde ser consultada nesta rodada, pra nunca virar uma alegação
// factual (positiva ou negativa) na resposta do model.

function fact(section: ContextSection<ContextFact>, field: string): string | number | boolean | undefined {
  if (section.status !== 'loaded') return undefined;
  return section.facts.find((f) => f.field === field)?.value;
}

// Usado por quem monta a instrução do model (ex.: "você representa
// X") — não é um ContextFact armazenado no pacote, porque não é um
// fato que a IA poderia alegar errado, é só uma preferência de
// exibição resolvida no momento do uso.
export function resolveProfessionalDisplayName(pkg: ContextPackage): string {
  const stageName = fact(pkg.professional, 'stageName');
  const fullName = fact(pkg.professional, 'fullName');
  return (stageName as string) || (fullName as string) || 'profissional';
}

function authorLabel(authorType: string): string {
  if (authorType === 'professional') return 'profissional';
  if (authorType === 'external_participant') return 'cliente';
  return authorType;
}

export function renderContextForPrompt(pkg: ContextPackage): string {
  const lines: string[] = [];

  if (pkg.professional.status === 'loaded') {
    lines.push(`Profissional representado: ${fact(pkg.professional, 'stageName') ?? fact(pkg.professional, 'fullName') ?? 'não informado'}`);
    lines.push(`Profissão/categoria: ${fact(pkg.professional, 'category') ?? 'não informado'}`);
    lines.push(`Sobre o trabalho: ${fact(pkg.professional, 'bio') ?? 'não informado'}`);
  } else if (pkg.professional.status === 'unavailable') {
    lines.push('Dados do profissional: não foi possível consultar nesta rodada — não presuma nada sobre eles.');
  }

  if (pkg.externalParticipant.status === 'loaded') {
    lines.push(`Cliente/contato desta conversa: ${fact(pkg.externalParticipant, 'name') ?? 'não informado'}`);
  } else if (pkg.externalParticipant.status === 'unavailable') {
    lines.push('Identidade do cliente/contato: não foi possível consultar nesta rodada — não presuma nada sobre ela.');
  }

  if (pkg.opportunity.status === 'loaded') {
    lines.push('', 'Oportunidade relacionada a esta conversa:');
    lines.push(`- descrição: ${fact(pkg.opportunity, 'description') ?? 'não informado'}`);
    lines.push(`- status: ${fact(pkg.opportunity, 'status') ?? 'não informado'}`);
  } else if (pkg.opportunity.status === 'unavailable') {
    lines.push(
      '',
      'Oportunidade relacionada a esta conversa: não foi possível consultar nesta rodada — NÃO presuma que ela não existe.'
    );
  }

  if (pkg.booking.status === 'loaded') {
    lines.push('', 'Booking relacionado a esta conversa:');
    lines.push(`- status: ${fact(pkg.booking, 'status') ?? 'não informado'}`);
    lines.push(`- descrição: ${fact(pkg.booking, 'description') ?? 'não informado'}`);
  } else if (pkg.booking.status === 'unavailable') {
    lines.push('', 'Booking relacionado a esta conversa: não foi possível consultar nesta rodada — NÃO presuma que ele não existe.');
  }

  lines.push('', 'Mensagens recentes desta conversa (mais antiga primeiro):');
  if (pkg.messages.status === 'loaded') {
    if (pkg.messages.items.length === 0) {
      lines.push('(nenhuma mensagem ainda)');
    } else {
      for (const item of pkg.messages.items) {
        lines.push(`[${authorLabel(item.authorType)}] ${item.text ?? '(sem conteúdo textual disponível)'}`);
      }
    }
  } else if (pkg.messages.status === 'unavailable') {
    lines.push('(não foi possível consultar as mensagens recentes nesta rodada — NÃO presuma que não há mensagens)');
  } else {
    lines.push('(mensagens não permitidas neste contexto)');
  }

  lines.push(
    '',
    'Com base só nisso, escreva uma resposta breve confirmando que você entendeu esse contexto e, se fizer sentido, uma pergunta que você faria em seguida.'
  );

  return lines.join('\n');
}
