import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { PlannerGoldenSuitePanel } from './PlannerGoldenSuitePanel';

export const metadata: Metadata = {
  title: 'Teste interno — Golden Suite do Response Planner',
  robots: { index: false, follow: false },
};

// Ferramenta de desenvolvimento/teste, não é parte do produto — valida
// o julgamento SEMÂNTICO real do Response Planner (Bloco 4) contra
// gpt-5-mini, algo que os testes de engenharia (client simulado) não
// conseguem cobrir. Mesmo padrão de segurança de
// /dev/classification-golden-suite: fora de /dashboard de propósito,
// mesma checagem de sessão de qualquer página autenticada.
//
// Cada caso roda contra um ContextPackage sintético, em memória —
// nunca cria/lê uma conversa real, nunca grava nada em
// conversation_messages/orchestrator_runs. classifyIntent() roda de
// verdade antes de planResponse() (o Planner sempre recebe uma
// classificação real do Bloco 3, nunca fabricada à mão).
export default async function PlannerGoldenSuitePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dev/planner-golden-suite');

  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 20px', fontFamily: 'monospace' }}>
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
        🧪 <strong>Ferramenta interna de teste</strong> — não é parte do produto. Valida o julgamento semântico
        real do Response Planner (src/lib/intelligence/planner/) contra casos representativos. Cada caso é um
        ContextPackage sintético em memória — nada é gravado em conversation_messages/orchestrator_runs, nenhuma
        conversa real é tocada. requiresProfessionalReviewBeforeSend é sempre true — nenhum draft aqui é enviado.
      </div>

      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Golden suite — Response Planner</h1>
      <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
        Logado como: {user.email} ({user.id})
      </p>

      <PlannerGoldenSuitePanel />
    </main>
  );
}
