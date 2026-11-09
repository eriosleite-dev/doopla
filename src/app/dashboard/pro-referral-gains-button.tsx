'use client';

import { useReferralModal } from './referral-modal-context';

export function ProReferralGainsButton() {
  const { openModal } = useReferralModal();
  return (
    <button
      type="button"
      onClick={openModal}
      className="font-pro-sub w-full rounded-full bg-[var(--pro-green)] py-2.5 text-[12.5px] font-bold text-[var(--pro-black)]"
    >
      Ver meus ganhos →
    </button>
  );
}
