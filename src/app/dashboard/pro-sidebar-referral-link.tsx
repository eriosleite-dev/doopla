'use client';

import { useReferralModal } from './referral-modal-context';

// "Indique e ganhe" na sidebar nova não tem rota própria (o conteúdo
// real mora no ReferralModal, já montado uma vez no layout) — em vez
// de linkar pra uma página que não existe, abre o mesmo modal real que
// o chip do header já abre. Só renderizado quando o layout já validou
// que o profissional é elegível (referralUrl existe).
export function ProSidebarReferralLink() {
  const { openModal } = useReferralModal();
  return (
    <button
      type="button"
      onClick={openModal}
      className="font-pro-sub flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13.5px] font-semibold text-[var(--pro-tx-50)] transition-colors hover:bg-white/[0.05] hover:text-[var(--pro-off)]"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[17px] w-[17px]">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 1 0 0 7H14a3.5 3.5 0 1 1 0 7H6" />
      </svg>
      Indique e ganhe
    </button>
  );
}
