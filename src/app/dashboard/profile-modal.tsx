'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function ProfileModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') router.back();
    }
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--ink)]/60 p-4 sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) router.back();
      }}
    >
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-y-auto rounded-[24px] bg-[var(--paper)] shadow-2xl">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Fechar"
          className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[var(--ink)] shadow-sm hover:opacity-80"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  );
}
