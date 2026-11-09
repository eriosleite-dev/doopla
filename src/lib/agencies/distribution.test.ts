import { describe, expect, it } from 'vitest';

import { bucketByArtistsRepresented, bucketByTeamSize, computeConversionRates, groupByInterest, groupByLocation } from './distribution';

describe('bucketByTeamSize', () => {
  it('coloca cada agência no balde certo, inclusive bordas', () => {
    const apps = [{ teamSize: 1 }, { teamSize: 2 }, { teamSize: 5 }, { teamSize: 6 }, { teamSize: 15 }, { teamSize: 16 }, { teamSize: 100 }];
    const result = bucketByTeamSize(apps);
    expect(result.find((b) => b.label === '1 pessoa')?.count).toBe(1);
    expect(result.find((b) => b.label === '2 a 5')?.count).toBe(2);
    expect(result.find((b) => b.label === '6 a 15')?.count).toBe(2);
    expect(result.find((b) => b.label === '16+')?.count).toBe(2);
  });
});

describe('bucketByArtistsRepresented', () => {
  it('coloca cada agência no balde certo, inclusive bordas', () => {
    const apps = [{ artistsRepresented: 0 }, { artistsRepresented: 10 }, { artistsRepresented: 11 }, { artistsRepresented: 30 }, { artistsRepresented: 31 }, { artistsRepresented: 101 }];
    const result = bucketByArtistsRepresented(apps);
    expect(result.find((b) => b.label === '0 a 10')?.count).toBe(2);
    expect(result.find((b) => b.label === '11 a 30')?.count).toBe(2);
    expect(result.find((b) => b.label === '31 a 100')?.count).toBe(1);
    expect(result.find((b) => b.label === '100+')?.count).toBe(1);
  });
});

describe('groupByLocation', () => {
  it('agrupa por cidade+país e ordena do maior pro menor', () => {
    const apps = [
      { city: 'São Paulo', country: 'Brasil' },
      { city: 'São Paulo', country: 'Brasil' },
      { city: 'Lisboa', country: 'Portugal' },
    ];
    const result = groupByLocation(apps);
    expect(result[0]).toEqual({ label: 'São Paulo, Brasil', count: 2 });
    expect(result[1]).toEqual({ label: 'Lisboa, Portugal', count: 1 });
  });

  it('respeita o limite', () => {
    const apps = Array.from({ length: 15 }, (_, i) => ({ city: `Cidade ${i}`, country: 'Brasil' }));
    expect(groupByLocation(apps, 5)).toHaveLength(5);
  });
});

describe('groupByInterest', () => {
  it('conta cada valor de interesse', () => {
    const apps = [{ interest: 'both' }, { interest: 'both' }, { interest: 'recurring_revenue' }];
    const result = groupByInterest(apps);
    expect(result.find((b) => b.label === 'both')?.count).toBe(2);
    expect(result.find((b) => b.label === 'recurring_revenue')?.count).toBe(1);
  });
});

describe('computeConversionRates', () => {
  it('calcula cada taxa sobre a etapa anterior correta', () => {
    const rates = computeConversionRates({ section_view: 100, cta_click: 50, form_start: 40, form_submit: 20, form_abandon: 10 });
    expect(rates.find((r) => r.label.includes('clique no CTA'))?.percent).toBe(50);
    expect(rates.find((r) => r.label.includes('formulário iniciado'))?.percent).toBe(80);
    expect(rates.find((r) => r.label.includes('Iniciado → enviado'))?.percent).toBe(50);
    expect(rates.find((r) => r.label.includes('abandono'))?.percent).toBe(25);
  });

  it('nunca mostra 0% quando o denominador é zero — devolve null', () => {
    const rates = computeConversionRates({});
    for (const rate of rates) expect(rate.percent).toBeNull();
  });
});
