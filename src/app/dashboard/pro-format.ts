// Funções puras de formatação usadas pelo novo Shell/Home — sem nada
// de navegador, de propósito: precisam ser chamáveis direto de Server
// Components (professional-home-view.tsx). Nunca colocar aqui algo que
// dependa de 'use client' (useState/useEffect/window/etc.) — é
// exatamente essa mistura que causava "Attempted to call X() from the
// server" quando essas duas viviam em pro-ui.tsx.

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'agora há pouco';
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Há ${days}d`;
}

export function proStatusPillClass(tone: 'red' | 'amber' | 'green'): string {
  const base = 'font-pro-sub inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-bold';
  if (tone === 'red') return `${base} bg-[rgba(226,41,28,.18)] text-[#ff8b80]`;
  if (tone === 'amber') return `${base} bg-[rgba(245,166,35,.18)] text-[var(--pro-amber)]`;
  return `${base} bg-[rgba(62,207,110,.18)] text-[var(--pro-green)]`;
}
