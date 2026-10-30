import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Conversation } from '@/lib/supabase/types';
import { SmokeTestPanel } from './SmokeTestPanel';

export const metadata: Metadata = {
  title: 'Smoke test — Beta Runtime Integration',
  robots: { index: false, follow: false },
};

// Passo 3 do roadmap de Beta Runtime Integration (credenciais ->
// entrypoint -> smoke test -> painel -> reconciler/cron -> outbound
// sender). Ferramenta de desenvolvimento/teste, não é parte do
// produto — mesma checagem de sessão de qualquer página autenticada
// do projeto (getUser() + redirect pra /login), igual
// /dev/intelligence-test. Fora de /dashboard de propósito.
export default async function RuntimeSmokeTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/runtime-smoke-test');

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .eq('represented_professional_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<Conversation[]>();

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '32px 20px', fontFamily: 'monospace' }}>
      <div
        style={{
          background: '#fff3cd',
          border: '1px solid #d4a72c',
          borderRadius: 6,
          padding: '10px 14px',
          marginBottom: 24,
          fontSize: 13,
        }}
      >
        🧪 <strong>Ferramenta interna de teste</strong> — não é parte do produto. Roda o
        Intelligence Runtime de verdade (<code>processInboundEvent</code>), contra OpenAI e
        Postgres reais via <code>service_role</code>. Grava dado real em{' '}
        <code>conversation_messages</code>/<code>runtime_pending_replies</code>/
        <code>outbound_intents</code> — nada aqui é visível a nenhum cliente real.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Smoke test — Beta Runtime Integration</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Fluxo mínimo: 1) crie (ou selecione) uma conversa de teste; 2) mande uma mensagem como
        cliente; 3) mande uma mensagem sua (profissional) na MESMA conversa, aprovando o que o
        cliente pediu. Cada passo mostra o <code>RuntimeCycleOutcome</code> bruto retornado pelo
        Runtime — é esse resultado que deve ser auditado.
      </p>

      <SmokeTestPanel conversations={conversations ?? []} />
    </main>
  );
}
