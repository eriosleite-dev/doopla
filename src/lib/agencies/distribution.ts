// Doopla — Admin > Agências Parceiras. Funções puras de agregação
// (distribuição por tamanho/artistas/localização/interesse, taxas de
// conversão do funil) — zero I/O, testáveis isoladamente, reaproveitam
// os dados já lidos pela página (nenhuma query nova por gráfico).

export type DistributionBucket = { label: string; count: number };

export function bucketByTeamSize(apps: { teamSize: number }[]): DistributionBucket[] {
  const buckets: { label: string; test: (n: number) => boolean }[] = [
    { label: '1 pessoa', test: (n) => n === 1 },
    { label: '2 a 5', test: (n) => n >= 2 && n <= 5 },
    { label: '6 a 15', test: (n) => n >= 6 && n <= 15 },
    { label: '16+', test: (n) => n >= 16 },
  ];
  return buckets.map((b) => ({ label: b.label, count: apps.filter((a) => b.test(a.teamSize)).length }));
}

export function bucketByArtistsRepresented(apps: { artistsRepresented: number }[]): DistributionBucket[] {
  const buckets: { label: string; test: (n: number) => boolean }[] = [
    { label: '0 a 10', test: (n) => n <= 10 },
    { label: '11 a 30', test: (n) => n >= 11 && n <= 30 },
    { label: '31 a 100', test: (n) => n >= 31 && n <= 100 },
    { label: '100+', test: (n) => n > 100 },
  ];
  return buckets.map((b) => ({ label: b.label, count: apps.filter((a) => b.test(a.artistsRepresented)).length }));
}

export function groupByLocation(apps: { city: string; country: string }[], limit = 10): DistributionBucket[] {
  const counts = new Map<string, number>();
  for (const a of apps) {
    const key = `${a.city}, ${a.country}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function groupByInterest(apps: { interest: string }[]): DistributionBucket[] {
  const counts = new Map<string, number>();
  for (const a of apps) {
    counts.set(a.interest, (counts.get(a.interest) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export type ConversionRate = { label: string; percent: number | null };

// null = sem base suficiente pra calcular (nunca mostra 0% enganoso
// quando o denominador é zero).
function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function computeConversionRates(funnel: Record<string, number>): ConversionRate[] {
  const views = funnel.section_view ?? 0;
  const clicks = funnel.cta_click ?? 0;
  const starts = funnel.form_start ?? 0;
  const submits = funnel.form_submit ?? 0;
  const abandons = funnel.form_abandon ?? 0;

  return [
    { label: 'Visualização → clique no CTA', percent: percent(clicks, views) },
    { label: 'Clique → formulário iniciado', percent: percent(starts, clicks) },
    { label: 'Iniciado → enviado', percent: percent(submits, starts) },
    { label: 'Taxa de abandono (sobre iniciados)', percent: percent(abandons, starts) },
  ];
}
