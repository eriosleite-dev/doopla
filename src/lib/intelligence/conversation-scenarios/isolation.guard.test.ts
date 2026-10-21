import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

// Doopla Intelligence Core v1 — AI Evaluation Harness: prova em CI,
// não só em comentário, da garantia estrutural exigida pela fundadora
// (requisito 8/9): nenhum arquivo do harness pode importar algo capaz
// de enviar WhatsApp, criar/alterar outbound_intents, bookings,
// opportunities ou pending_delegated_contacts reais. Checagem por
// texto-fonte (nunca um require dinâmico escondido escapa de um
// import estático) nos 4 arquivos que compõem o harness.
//
// Se este teste falhar depois de uma mudança real no harness, é sinal
// de que a mudança violou o isolamento prometido — nunca "ajustar a
// lista proibida" sem entender por que a importação apareceu.

const HARNESS_FILES = ['types.ts', 'scenarios.ts', 'runner.ts'].map((f) => join(__dirname, f));
const ADMIN_ROUTE_FILES = ['actions.ts', 'Panel.tsx', 'page.tsx'].map((f) => join(__dirname, '..', '..', '..', 'app', 'admin', 'conversation-scenarios', f));

const FORBIDDEN_PATTERNS = [
  'sendWhatsappTemplateMessage',
  'sendWhatsappTextMessage',
  'channels/whatsapp/client',
  'create_outbound_intent',
  'createOutboundIntent',
  'runtime/outbound',
  'runtime/delegated-contact-flow',
  'runtime/pending-delegated-contacts',
  'runtime/professional-whatsapp-reply',
  'runtime/professional-message',
  'service-role',
  'createServiceRoleClient',
];

// Só linhas de import/require real — nunca o texto de comentários
// explicativos, que legitimamente CITAM os nomes proibidos pra
// documentar a garantia (achado do próprio teste: a primeira versão
// lia o arquivo inteiro e falsamente reprovava o comentário do
// próprio runner.ts, que explica a garantia citando os nomes).
function importLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith('import ') || trimmed.includes('require(');
    });
}

describe('AI Evaluation Harness — isolamento estrutural (ADR 0005, requisitos 8/9)', () => {
  it.each([...HARNESS_FILES, ...ADMIN_ROUTE_FILES])('%s nunca importa nada capaz de executar ação real', (filePath) => {
    const source = readFileSync(filePath, 'utf-8');
    const lines = importLines(source).join('\n');
    for (const pattern of FORBIDDEN_PATTERNS) {
      expect(lines, `${filePath} importa algo contendo "${pattern}" — isso quebra a garantia de isolamento do harness`).not.toContain(pattern);
    }
  });

  it('runner.ts só importa componentes de PERCEPÇÃO/PLANEJAMENTO reais, nunca de execução', () => {
    const source = readFileSync(join(__dirname, 'runner.ts'), 'utf-8');
    // Allowlist positiva — os únicos módulos de produção que o runner
    // pode tocar. Qualquer outro import de '../' ou '@/lib/' fora
    // desta lista deve ser investigado antes de ser aceito.
    const allowedImports = [
      "from '../classification'",
      "from '../context-builder'",
      "from '../delegated-contact'",
      "from '../planner'",
      "from '../types'",
      "from './types'",
      "from '@/lib/admin/ai-pricing'",
      "from '@/lib/runtime/message-style'",
      "from '@/lib/supabase/types'",
      // 21/10/2026 — captura de erro real das chamadas de model
      // (achado real: um erro real de API ficava indistinguível de
      // "o model respondeu mal" no resultado do harness). getOpenAIClient
      // é só o getter do client real (já usado internamente por
      // classify.ts/plan.ts/recognizer.ts); zodTextFormat é formatação
      // de schema, nenhum dos dois é capaz de enviar/escrever nada.
      "from '../openai-client'",
      "from 'openai/helpers/zod'",
      // 21/10/2026 — ConversationState Ledger: módulo puro
      // (advanceConversationStateSnapshot, sem I/O) só consumido aqui
      // pra montar o conversationState sintético do cenário, mesmo
      // princípio de classification/planner/delegated-contact acima.
      "from '../conversation-state'",
    ];
    const importLines = source.split('\n').filter((l) => l.trim().startsWith('import'));
    for (const line of importLines) {
      const matchesAllowlist = allowedImports.some((allowed) => line.includes(allowed)) || line.includes("from 'crypto'");
      expect(matchesAllowlist, `import não esperado em runner.ts: ${line}`).toBe(true);
    }
  });
});
