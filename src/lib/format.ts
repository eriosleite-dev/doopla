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
