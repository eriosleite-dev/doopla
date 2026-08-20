'use client';

import { useReferralModal } from './referral-modal-context';

// Chip permanente do header — nunca um card/banner no meio do
// conteúdo. Só é renderizado pelo layout quando o perfil é elegível
// (hoje: artista com referral_code).
export function ReferralChip() {
  const { openModal } = useReferralModal();

  return (
    <button
      type="button"
      onClick={openModal}
      aria-label="Indique e ganhe R$5"
      className="font-doopla-mono flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[.04em] text-[var(--ink)] transition-opacity hover:opacity-90"
    >
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="3" y="8" width="18" height="4" />
        <path d="M12 8v13" />
        <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
        <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8" />
        <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8" />
      </svg>
      <span className="hidden sm:inline">Indique e ganhe R$5</span>
      <span className="sm:hidden">R$5</span>
    </button>
  );
}
