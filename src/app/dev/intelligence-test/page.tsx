import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Conversation } from '@/lib/supabase/types';
import { TestPanel } from './TestPanel';

export const metadata: Metadata = {
  title: 'Teste interno — Intelligence OS',
  robots: { index: false, follow: false },
};

// Ferramenta de desenvolvimento/teste, não é parte do produto — prova
// de infraestrutura da integração OpenAI (ver src/lib/intelligence/).
// Fora de /dashboard de propósito (não herda o chrome do painel), mas
// com a MESMA checagem de sessão que qualquer página autenticada do
// projeto já usa (getUser() + redirect pra /login).
export default async function IntelligenceTestPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/intelligence-test');

  const { data: conversations } = await supabase
    .from('conversations')
    .select('*')
    .eq('represented_professional_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)
    .returns<Conversation[]>();

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 20px', fontFamily: 'monospace' }}>
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
        🧪 <strong>Ferramenta interna de teste</strong> — não é parte do produto. Testa só a
        infraestrutura de chamada à OpenAI (src/lib/intelligence/). Nada aqui é gravado em
        conversation_messages nem visível a nenhum cliente.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Teste de integração — Intelligence OS</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Logado como: {user.email} ({user.id})
      </p>

      <TestPanel conversations={conversations ?? []} />
    </main>
  );
}
