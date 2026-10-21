import { describe, expect, it } from 'vitest';

import {
  DOOPLA_ORCAMENTO_LINK_BASE,
  evaluateWhatsappRouting,
  extractBareCodeCandidates,
  extractDooplaSlugToken,
  isWholeMessageExactWord,
  parseDisambiguationReply,
} from './intake-routing';

// Doopla — suíte de regressão do WhatsApp (13/10/2026). Cobre só o
// núcleo 100% puro do roteamento (nenhuma chamada a banco/rede) — ver
// intake-orchestration.test.ts pro caminho impuro (silêncio, "doopla"
// de verdade contra o catálogo).

describe('evaluateWhatsappRouting', () => {
  it('identidade verificada sem token: sempre resolve pra si mesma', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: 'eduarda',
      token: null,
      nameMentionCandidates: [],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'verified_professional', professionalId: 'eduarda' });
  });

  it('identidade verificada + token pra OUTRO profissional: token vence (override determinístico)', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: 'eduarda',
      token: { professionalId: 'milky', slug: 'milky' },
      nameMentionCandidates: [],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'token', professionalId: 'milky' });
  });

  it('identidade verificada + token pra SI MESMA: nunca vira "token", continua verified_professional', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: 'eduarda',
      token: { professionalId: 'eduarda', slug: 'doopla' },
      nameMentionCandidates: [],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'verified_professional', professionalId: 'eduarda' });
  });

  it('sem identidade, com token e sem conflito de nome: resolve por token', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: { professionalId: 'milky', slug: 'milky' },
      nameMentionCandidates: [],
      historyMatches: [{ professionalId: 'outro', label: 'Outro Artista' }],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'token', professionalId: 'milky' });
  });

  it('token conflitando com nome mencionado: pede confirmação, nunca decide sozinho', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: { professionalId: 'milky', slug: 'milky' },
      nameMentionCandidates: [{ professionalId: 'outro', label: 'Outro Artista' }],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision.outcome).toBe('needs_confirmation');
  });

  it('nome mencionado único + histórico único concordando: resolve sem perguntar', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: null,
      nameMentionCandidates: [{ professionalId: 'milky', label: 'Milky' }],
      historyMatches: [{ professionalId: 'milky', label: 'Milky' }],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'unique_history', professionalId: 'milky' });
  });

  it('nome mencionado único, sem histórico: pede confirmação leve (nunca decide sozinho)', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: null,
      nameMentionCandidates: [{ professionalId: 'milky', label: 'Milky' }],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision.outcome).toBe('needs_confirmation');
  });

  it('nome artístico repetido (2+ candidatos com o mesmo nome): nunca escolhe arbitrariamente', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: null,
      nameMentionCandidates: [
        { professionalId: 'dj-marina-1', label: 'DJ Marina' },
        { professionalId: 'dj-marina-2', label: 'DJ Marina' },
      ],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision.outcome).toBe('needs_confirmation');
    if (decision.outcome === 'needs_confirmation') {
      expect(decision.candidates).toHaveLength(2);
    }
  });

  it('sem nenhum sinal e sem histórico: no_signal (nunca inventa candidato)', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: null,
      nameMentionCandidates: [],
      historyMatches: [],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'no_signal' });
  });

  it('só histórico único, sem sinal atual: resolve por histórico', () => {
    const decision = evaluateWhatsappRouting({
      verifiedProfessionalId: null,
      token: null,
      nameMentionCandidates: [],
      historyMatches: [{ professionalId: 'milky', label: 'Milky' }],
      recentActivityProfessionalId: null,
    });
    expect(decision).toEqual({ outcome: 'resolved', method: 'unique_history', professionalId: 'milky' });
  });
});

describe('extractDooplaSlugToken — Cenário A (link completo)', () => {
  it('reconhece o link real de produção (doopla.pro/orcamento/<slug>)', () => {
    expect(extractDooplaSlugToken('https://doopla.pro/orcamento/doopla')).toBe('doopla');
  });

  it('reconhece o link dentro de uma frase', () => {
    expect(extractDooplaSlugToken('oi, vi no link doopla.pro/orcamento/milky, queria saber mais')).toBe('milky');
  });

  it('nunca reconhece o domínio antigo (.com) nem link raiz sem /orcamento/', () => {
    expect(extractDooplaSlugToken('doopla.com/doopla')).toBeNull();
    expect(extractDooplaSlugToken('doopla.pro/doopla')).toBeNull();
  });

  it('código inexistente dentro de um link válido ainda é extraído (validade real é responsabilidade de quem chama)', () => {
    expect(extractDooplaSlugToken('doopla.pro/orcamento/nao-existe-123')).toBe('nao-existe-123');
  });

  // Regressão real (15/10/2026, auditoria pedida pela fundadora):
  // orcamento/[slug]/page.tsx (o CTA de WhatsApp da própria página de
  // orçamento) gerava "doopla.com/<slug>" — domínio errado, sem o
  // segmento /orcamento/ — e NENHUM link real dessa página era
  // reconhecido por este parser. Corrigido fazendo o gerador importar
  // DOOPLA_ORCAMENTO_LINK_BASE em vez de manter um literal próprio;
  // este teste prova o acoplamento (constante -> regex), nunca deixa
  // os dois lados divergirem de novo silenciosamente.
  it('qualquer texto construído com DOOPLA_ORCAMENTO_LINK_BASE é sempre reconhecido (gerador e parser nunca divergem)', () => {
    const text = `Oi! Vim pelo link de Milky (${DOOPLA_ORCAMENTO_LINK_BASE}/milky) e queria falar sobre um trabalho.`;
    expect(extractDooplaSlugToken(text)).toBe('milky');
  });
});

describe('extractBareCodeCandidates — Cenário B/E (código sozinho + colisão "doopla")', () => {
  const reserved = new Set(['doopla', 'ajuda', 'cadastro']);

  it('extrai um código sozinho', () => {
    expect(extractBareCodeCandidates('milky', reserved)).toEqual(['milky']);
  });

  it('extrai o código mencionado dentro de uma frase', () => {
    expect(extractBareCodeCandidates('quero falar com milky por favor', reserved)).toContain('milky');
  });

  it('NUNCA inclui "doopla" como candidato (menção casual à plataforma)', () => {
    const candidates = extractBareCodeCandidates('Oi, quero saber sobre a Doopla, pode me ajudar?', reserved);
    expect(candidates).not.toContain('doopla');
  });

  it('NUNCA inclui nenhuma palavra reservada', () => {
    const candidates = extractBareCodeCandidates('preciso de ajuda com meu cadastro na doopla', reserved);
    expect(candidates).not.toContain('ajuda');
    expect(candidates).not.toContain('cadastro');
    expect(candidates).not.toContain('doopla');
  });

  it('ignora palavras curtas (<3 chars), nunca gera falso candidato de "25/11", "DJ" etc.', () => {
    const candidates = extractBareCodeCandidates('Tenho um evento dia 25/11 das 19h as 22h, quero um DJ', reserved);
    expect(candidates).not.toContain('25');
    expect(candidates).not.toContain('11');
    expect(candidates).not.toContain('dj');
  });

  it('nunca duplica o mesmo candidato', () => {
    const candidates = extractBareCodeCandidates('milky, falei com milky ontem, é a milky mesmo', reserved);
    expect(candidates.filter((c) => c === 'milky')).toHaveLength(1);
  });
});

describe('isWholeMessageExactWord — intenção explícita (Cenário E)', () => {
  it('mensagem que é SÓ o código: intenção explícita', () => {
    expect(isWholeMessageExactWord('doopla', 'doopla')).toBe(true);
    expect(isWholeMessageExactWord('  Doopla  ', 'doopla')).toBe(true);
    expect(isWholeMessageExactWord('doopla!', 'doopla')).toBe(true);
    expect(isWholeMessageExactWord('doopla?', 'doopla')).toBe(true);
  });

  it('código dentro de uma frase: NUNCA conta como intenção explícita (menção casual)', () => {
    expect(isWholeMessageExactWord('oi doopla, tudo bem?', 'doopla')).toBe(false);
    expect(isWholeMessageExactWord('sou da doopla', 'doopla')).toBe(false);
    expect(isWholeMessageExactWord('Oi! Sou a Doopla 👋 como posso ajudar?', 'doopla')).toBe(false);
  });
});

describe('parseDisambiguationReply', () => {
  const options = [
    { index: 1, professionalId: 'milky', label: 'Milky' },
    { index: 2, professionalId: 'dj-marina', label: 'DJ Marina' },
  ];

  it('resolve por número', () => {
    expect(parseDisambiguationReply('2', options)?.professionalId).toBe('dj-marina');
  });

  it('resolve por ordinal por extenso', () => {
    expect(parseDisambiguationReply('a primeira', options)?.professionalId).toBe('milky');
  });

  it('resolve por nome de uma das opções', () => {
    expect(parseDisambiguationReply('quero a DJ Marina', options)?.professionalId).toBe('dj-marina');
  });

  it('resposta ambígua ou sem relação: nunca escolhe arbitrariamente', () => {
    expect(parseDisambiguationReply('não sei', options)).toBeNull();
  });

  it('afirmação simples só é aceita quando havia 1 única opção', () => {
    expect(parseDisambiguationReply('sim', [options[0]])?.professionalId).toBe('milky');
    expect(parseDisambiguationReply('sim', options)).toBeNull();
  });

  it('sem opções nenhuma (array vazio): nunca resolve (mesmo array que causava o bug do silêncio)', () => {
    expect(parseDisambiguationReply('qualquer coisa', [])).toBeNull();
  });
});
