import { describe, expect, it } from 'vitest';

import { buildPlannerInstructions } from './prompt';

// P1 UX conversacional (14/10/2026) — a instrução de estilo (item 7)
// é a única mudança autorizada neste módulo; estes testes cobrem só
// isso, nunca a lógica de responsePlan/commitmentNature/etc (fora de
// escopo, intocada).

describe('buildPlannerInstructions — estilo e formatação (P1, 14/10/2026)', () => {
  const instructions = buildPlannerInstructions();

  it('instrui a nunca usar travessão', () => {
    expect(instructions).toMatch(/[Nn]unca.*travessão/);
  });

  it('instrui parágrafos curtos só quando há mais de um assunto, nunca quebra artificial por frase', () => {
    expect(instructions).toMatch(/par[aá]grafo/);
    expect(instructions).toMatch(/mais de um assunto/);
  });

  it('instrui moderação de emoji e nunca coração roxo recorrente', () => {
    expect(instructions).toMatch(/emoji/);
    expect(instructions).toMatch(/coração roxo/);
  });

  it('o próprio texto da instrução de estilo não contém nenhum travessão fora do exemplo do caractere proibido', () => {
    const start = instructions.indexOf('Estilo e formatação');
    const end = instructions.indexOf('Regra crítica:');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const styleParagraph = instructions.slice(start, end);
    const dashCount = (styleParagraph.match(/—/g) ?? []).length;
    // Exatamente 1: o travessão citado dentro de "(—)" pra nomear o
    // caractere proibido — nunca um travessão de verdade na nossa
    // própria prosa, o que contradiria a regra sendo ensinada.
    expect(dashCount).toBe(1);
  });
});

describe('buildPlannerInstructions — Playbook DJ/Música condicional (ADR 0006, 16/10/2026)', () => {
  it('nunca aparece sem competencies (comportamento padrão, nenhuma mudança pro resto do prompt)', () => {
    expect(buildPlannerInstructions()).not.toMatch(/Playbook v1/);
  });

  it('nunca aparece quando a competência roteada não inclui comercial_negociacao nem producao', () => {
    const instructions = buildPlannerInstructions({ competencies: ['suporte', 'financeiro'] });
    expect(instructions).not.toMatch(/Playbook v1/);
  });

  it('aparece quando comercial_negociacao é roteada', () => {
    const instructions = buildPlannerInstructions({ competencies: ['comercial_negociacao'] });
    expect(instructions).toMatch(/Playbook v1/);
    expect(instructions).toMatch(/TRAVA ABSOLUTA/);
  });

  it('aparece quando producao é roteada (ex.: rider)', () => {
    const instructions = buildPlannerInstructions({ competencies: ['producao'] });
    expect(instructions).toMatch(/RIDER NÃO É REGRA BINÁRIA/);
  });

  it('reafirma explicitamente que o conhecimento de mercado nunca autoriza nada sozinho', () => {
    const instructions = buildPlannerInstructions({ competencies: ['comercial_negociacao'] });
    expect(instructions).toMatch(/nunca autoriza nada por si só/);
  });
});

// Achado da fundadora (19/10/2026) — o texto institucional anterior
// nunca refletia a identidade aprovada por ela; substituído pelo texto
// definitivo. Estes testes cobrem só o CONTEÚDO da instrução (nunca a
// qualidade real da resposta do model — isso só a leitura humana da
// golden-suite comprova).
describe('buildPlannerInstructions — identidade e apresentação pessoal (achado da fundadora, 19/10/2026)', () => {
  const instructions = buildPlannerInstructions();

  it('contém o texto de referência aprovado pela fundadora, verbatim', () => {
    expect(instructions).toMatch(
      /Sou sua representante com IA! Converso com clientes, acompanho negociações, organizo seus bookings e cuido de todo o operacional, como um booker, mas sem a comissão :\) Você cuida da sua carreira e eu te ajudo com o resto\./
    );
  });

  it('instrui a tratar o texto como referência de tom, nunca como resposta fixa decorada', () => {
    expect(instructions).toMatch(/REFERÊNCIA/);
    expect(instructions).toMatch(/nunca uma resposta fixa pra decorar/);
    expect(instructions).toMatch(/não existe um catálogo de respostas por pergunta/);
  });

  it('cobre explicitamente as variações de pergunta de identidade pedidas', () => {
    for (const variação of ['Quem é você?', 'o que você faz?', 'como funciona?', 'como pode me ajudar?', 'você é uma agência?', 'você é um booker?', 'o que é a Doopla?']) {
      expect(instructions).toContain(variação);
    }
  });

  it('instrui a nunca repetir a apresentação inteira ao reformular/esclarecer (continuidade, não reinício)', () => {
    expect(instructions).toMatch(/Regra crítica de continuidade/);
    expect(instructions).toMatch(/NUNCA reescreva a apresentação com frases parecidas às de antes/);
  });

  it('dá um exemplo concreto do erro (achado real, 19\\/10\\/2026) pra reforçar a regra além da instrução abstrata', () => {
    expect(instructions).toMatch(/Errado:/);
    expect(instructions).toMatch(/Certo:/);
  });

  it('instrui respostas curtas (1 a 3 frases) pra essas perguntas, sem listar toda funcionalidade', () => {
    expect(instructions).toMatch(/1 a 3 frases/);
  });

  it('esclarece que "sem comissão" é sobre o cachê, nunca insinua serviço gratuito/sem assinatura', () => {
    expect(instructions).toMatch(/comissão sobre o cachê/);
    expect(instructions).toMatch(/nunca insinue que o serviço da Doopla em si é de graça ou sem assinatura/);
  });

  it('não proíbe terceira pessoa de forma absoluta (permite ao representar o profissional perante cliente externo, ou descrição formal pedida)', () => {
    expect(instructions).toMatch(/não é uma proibição absoluta de terceira pessoa/);
  });

  it('reforça não prometer funcionalidade inexistente nem afirmar execução sem confirmação', () => {
    expect(instructions).toMatch(/Nunca prometa uma funcionalidade que ainda não existe/);
    expect(instructions).toMatch(/nem afirme ter executado algo sem confirmação real/);
  });
});
