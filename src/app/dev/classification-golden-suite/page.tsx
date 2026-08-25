import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { GoldenSuitePanel } from './GoldenSuitePanel';

export const metadata: Metadata = {
  title: 'Teste interno — Golden Suite de Classificação',
  robots: { index: false, follow: false },
};

// Ferramenta de desenvolvimento/teste, não é parte do produto — valida
// o julgamento SEMÂNTICO real do Intent Classifier (Bloco 3) contra
// gpt-5-mini, algo que os testes de engenharia (client simulado) não
// conseguem cobrir. Fora de /dashboard de propósito, mesma checagem
// de sessão que qualquer página autenticada do projeto já usa.
//
// Cada caso roda contra um ContextPackage sintético, em memória —
// nunca cria/lê uma conversa real, nunca grava nada em
// conversation_messages/orchestrator_runs. A única chamada externa é
// ao model de classificação, pela mesma abstração já auditada.
export default async function ClassificationGoldenSuitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/classification-golden-suite');

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 20px', fontFamily: 'monospace' }}>
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
        🧪 <strong>Ferramenta interna de teste</strong> — não é parte do produto. Valida o
        julgamento semântico real do Intent Classifier (src/lib/intelligence/classification/)
        contra casos representativos. Cada caso é um ContextPackage sintético em memória — nada é
        gravado em conversation_messages/orchestrator_runs, nenhuma conversa real é tocada.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Golden suite — Intent Classifier</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Logado como: {user.email} ({user.id})
      </p>

      <GoldenSuitePanel />
    </main>
  );
}
