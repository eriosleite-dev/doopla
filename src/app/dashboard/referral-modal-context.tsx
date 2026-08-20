'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type ReferralModalContextValue = {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const ReferralModalContext = createContext<ReferralModalContextValue | null>(null);

// Um único modal, montado uma vez no layout — o chip do header (e
// qualquer outro ponto de entrada futuro) só chama openModal().
export function ReferralModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ReferralModalContext.Provider
      value={{ open, openModal: () => setOpen(true), closeModal: () => setOpen(false) }}
    >
      {children}
    </ReferralModalContext.Provider>
  );
}

export function useReferralModal(): ReferralModalContextValue {
  const ctx = useContext(ReferralModalContext);
  if (!ctx) throw new Error('useReferralModal precisa estar dentro de <ReferralModalProvider>.');
  return ctx;
}
