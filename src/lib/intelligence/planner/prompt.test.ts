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

  it('contém o texto de referência aprovado pela fundadora, verbatim (refinado 20/10/2026, universal, sem booker/cachê)', () => {
    expect(instructions).toMatch(
      /Oi! Sou sua representante com IA! Converso com seus clientes, ajudo nas negociações e organizo seus trabalhos, cuidando da parte operacional para você focar na sua carreira\. Tudo isso sem cobrar comissão :\)/
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

  it('instrui respostas curtas (2 a 4 frases, mais estrito que a versão anterior) pra essas perguntas, sem listar toda funcionalidade', () => {
    expect(instructions).toMatch(/2 a 4 frases/);
  });

  it('instrui vocabulário universal por padrão, nunca nichado de DJ/música (achado real de WhatsApp, 20/10/2026)', () => {
    expect(instructions).toMatch(/Vocabulário SEMPRE universal por padrão/);
    expect(instructions).toMatch(/Não comece a apresentação usando termos como "cachê", "booker", "show" ou "bookings" por padrão/);
  });

  it('permite vocabulário de booker/DJ quando a PRÓPRIA pessoa o usa primeiro, nunca proíbe adaptação ao interlocutor', () => {
    expect(instructions).toMatch(/Se a PRÓPRIA pessoa usar esse vocabulário.*pode responder na mesma língua dela/);
  });

  it('proíbe oferecer demonstração/exemplo não pedido ao final de uma resposta de identidade (achado real de WhatsApp, 20/10/2026)', () => {
    expect(instructions).toMatch(/NUNCA ofereça demonstração, exemplo ou explicação adicional que ninguém pediu/);
    expect(instructions).toMatch(/quer que eu mostre um exemplo\?/);
    expect(instructions).toMatch(/Só faça uma pergunta de volta quando ela for genuinamente necessária pra avançar uma tarefa real/);
  });

  it('não proíbe terceira pessoa de forma absoluta (permite ao representar o profissional perante cliente externo, ou descrição formal pedida)', () => {
    expect(instructions).toMatch(/não é uma proibição absoluta de terceira pessoa/);
  });

  it('reforça não prometer funcionalidade inexistente nem afirmar execução sem confirmação', () => {
    expect(instructions).toMatch(/Nunca prometa uma funcionalidade que ainda não existe/);
    expect(instructions).toMatch(/nem afirme ter executado algo sem confirmação real/);
  });
});
