'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type ProModalContextValue = {
  open: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const ProModalContext = createContext<ProModalContextValue | null>(null);

// Um único modal, montado uma vez no layout — sidebar, card do
// dashboard e qualquer upsell contextual futuro só chamam openModal().
export function ProModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <ProModalContext.Provider
      value={{ open, openModal: () => setOpen(true), closeModal: () => setOpen(false) }}
    >
      {children}
    </ProModalContext.Provider>
  );
}

export function useProModal(): ProModalContextValue {
  const ctx = useContext(ProModalContext);
  if (!ctx) throw new Error('useProModal precisa estar dentro de <ProModalProvider>.');
  return ctx;
}
