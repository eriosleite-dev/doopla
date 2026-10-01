'use client';

import { useFormStatus } from 'react-dom';

// Achado de QA manual (01/10/2026, fundadora): os botões de moderação
// não davam nenhum feedback visual durante o envio — pareciam quebrados
// mesmo funcionando (Server Action rodava, só a UI ficava parada até o
// reload). useFormStatus só funciona dentro de um Client Component
// filho do <form>, nunca no Server Component da page em si.
export function SubmitButton({ pendingLabel, children }: { pendingLabel: string; children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded bg-zinc-100 px-3 py-1 text-[12px] font-semibold text-zinc-900 disabled:opacity-50"
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
