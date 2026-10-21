import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { WhatsappOutreachCard } from './whatsapp-outreach-card';

export const metadata: Metadata = { title: 'WhatsApp — Doopla' };

// Doopla Intelligence Core v1 — passo 6A: primeira UI real (não
// dev-only) do canal WhatsApp. Página dedicada mínima, mesmo padrão de
// /dashboard/dinheiro — nunca um redesign do painel existente.
export default async function WhatsappPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/whatsapp');

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <WhatsappOutreachCard />
    </main>
  );
}
