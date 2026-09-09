import { proLabelClass } from '../pro-format';
import type { MatchingSummaryLine } from './matching-summary';

// Pro re-skin (Bloco 7, P1) de MatchingSummary — mesma regra ("campo
// vazio não aparece"), só o tema --pro-*. `summarizeChips` continua
// vindo de matching-summary.tsx (função pura, sem tema, reaproveitada
// sem cópia).
export function ProMatchingSummary({ lines }: { lines: MatchingSummaryLine[] }) {
  if (lines.length === 0) {
    return (
      <p className="text-[13px] text-[var(--pro-tx-50)]">
        Nenhuma preferência preenchida ainda — usamos essas respostas pra te encontrar em buscas e
        recomendações.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
      {lines.map((line) => (
        <div key={line.label} className="flex flex-col gap-0.5">
          <span className={proLabelClass}>{line.label}</span>
          <span className="text-[13px] text-[var(--pro-off)]">{line.value}</span>
        </div>
      ))}
    </div>
  );
}
