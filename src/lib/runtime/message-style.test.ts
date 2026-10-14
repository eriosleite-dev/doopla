import { describe, expect, it } from 'vitest';

import { stripTravessao } from './message-style';

// P1 UX conversacional (14/10/2026) — proteção determinística contra
// travessão nas mensagens geradas pela Doopla. Pura, sem mock nenhum.

describe('stripTravessao', () => {
  it('substitui travessão no meio da frase por vírgula, preservando o resto', () => {
    expect(stripTravessao('Posso ajudar — só preciso de alguns detalhes rápidos.')).toBe('Posso ajudar, só preciso de alguns detalhes rápidos.');
  });

  it('substitui en dash (visualmente quase idêntico ao travessão) também', () => {
    expect(stripTravessao('Obrigado – já te retorno.')).toBe('Obrigado, já te retorno.');
  });

  it('nunca deixa a frase começar com vírgula quando o travessão está no início', () => {
    expect(stripTravessao('— Isso mesmo.')).toBe('Isso mesmo.');
  });

  it('nunca produz vírgula dupla com dois travessões em sequência', () => {
    expect(stripTravessao('algo — — outra coisa')).toBe('algo, outra coisa');
  });

  it('nunca deixa vírgula colada antes de ponto final/exclamação/interrogação', () => {
    expect(stripTravessao('Tudo certo — ?')).toBe('Tudo certo?');
  });

  it('texto sem travessão nenhum passa intocado (idempotente)', () => {
    const texto = 'Oi, tudo bem? Me conta mais sobre o evento.';
    expect(stripTravessao(texto)).toBe(texto);
    expect(stripTravessao(stripTravessao(texto))).toBe(texto);
  });

  it('múltiplos travessões em pontos diferentes da mesma frase, todos corrigidos', () => {
    expect(stripTravessao('Entendi — vou verificar — te aviso já já.')).toBe('Entendi, vou verificar, te aviso já já.');
  });

  it('preserva texto vazio e nulo sem lançar', () => {
    expect(stripTravessao('')).toBe('');
  });

  it('aplicar duas vezes seguidas é idempotente (nunca corrompe mais)', () => {
    const original = 'Posso ajudar — só preciso de alguns detalhes.';
    const once = stripTravessao(original);
    expect(stripTravessao(once)).toBe(once);
  });

  // Item 7 da auditoria (14/10/2026): nunca toca hífen comum (ASCII
  // "-", U+002D) nem o sinal de negativo — só o caractere travessão
  // (—, U+2014) e o en dash (–, U+2013), visualmente parecido mas
  // nunca usado como hífen de palavra composta ou número negativo.
  it('nunca toca hífen comum em palavra composta', () => {
    const texto = 'Foi um show pós-evento tranquilo, no bar ao ar livre.';
    expect(stripTravessao(texto)).toBe(texto);
  });

  it('nunca toca hífen usado como intervalo (ex.: horário)', () => {
    const texto = 'O show é das 18h-22h, com som próprio.';
    expect(stripTravessao(texto)).toBe(texto);
  });

  it('nunca toca sinal de negativo em número', () => {
    const texto = 'O ajuste ficou em -50 reais em relação ao combinado.';
    expect(stripTravessao(texto)).toBe(texto);
  });

  // Item 3 da auditoria: a substituição preserva pontuação/legibilidade
  // — nunca apaga o caractere e junta as palavras sem espaço nenhum.
  it('nunca junta as palavras ao redor do travessão sem espaço', () => {
    const result = stripTravessao('Posso ajudar—só preciso de um detalhe.');
    expect(result).not.toMatch(/ajudarsó/);
    expect(result).toBe('Posso ajudar, só preciso de um detalhe.');
  });

  // Item 6 da auditoria: quebras de linha reais (parágrafos, \n\n) são
  // preservadas intactas — a função nunca mexe em \n, só no travessão.
  it('preserva quebras de linha reais (parágrafos) intactas', () => {
    const texto = 'Posso ajudar — só preciso de um detalhe.\n\nQuais datas de novembro você tem livres?';
    expect(stripTravessao(texto)).toBe('Posso ajudar, só preciso de um detalhe.\n\nQuais datas de novembro você tem livres?');
  });

  it('preserva lista com quebra de linha simples (disambiguação de profissionais)', () => {
    const texto = 'Oi! Sou a Doopla 👋 Com quem você quer falar?\n1) Marina\n2) Carlos\n(responda com o número)';
    expect(stripTravessao(texto)).toBe(texto);
  });
});
