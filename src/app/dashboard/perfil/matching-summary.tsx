import { eyebrowClass } from '../ui';

// "Campo vazio não aparece" — cada linha do resumo só existe se a
// pergunta correspondente já foi respondida.
export function summarizeChips(values: string[], max = 3): string {
  if (values.length === 0) return '';
  const shown = values.slice(0, max).join(' · ');
  const rest = values.length - max;
  return rest > 0 ? `${shown} · +${rest}` : shown;
}

export type MatchingSummaryLine = { label: string; value: string };

export function MatchingSummary({ lines }: { lines: MatchingSummaryLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="text-sm text-[var(--ink)]/55">
        Nenhuma preferência preenchida ainda — usamos essas respostas pra te encontrar em
        buscas e recomendações.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {lines.map((line) => (
        <div key={line.label} className="flex flex-col gap-0.5">
          <span className={eyebrowClass}>{line.label}</span>
          <span className="text-[13px] text-[var(--ink)]">{line.value}</span>
        </div>
      ))}
    </div>
  );
}
