// Portado 1:1 de src/lib/format.ts (Next.js) — mesmo algoritmo
// determinístico, sem lógica nova. Cópia deliberada (sem import
// cruzando pra dentro de src/), pra manter a mesma formatação
// (moeda/percentual/data relativa) que o painel web já usa.

export function formatCentsAsBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number): string {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'hoje';
  if (diffDays === 1) return 'há 1 dia';
  if (diffDays < 7) return `há ${diffDays} dias`;
  const weeks = Math.floor(diffDays / 7);
  if (weeks === 1) return 'há 1 semana';
  if (weeks < 5) return `há ${weeks} semanas`;
  const months = Math.floor(diffDays / 30);
  if (months <= 1) return 'há 1 mês';
  return `há ${months} meses`;
}

export function formatDatePt(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

const MONTH_ABBR = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// Badge de data em 2 linhas (MÊS abreviado / dia) — nunca depende de
// parsear string localizada, evita fragilidade entre engines de ICU.
export function monthDayParts(iso: string): { month: string; day: string } {
  const d = new Date(`${iso}T00:00:00`);
  return { month: MONTH_ABBR[d.getMonth()], day: String(d.getDate()) };
}

export function formatDateTimePt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
