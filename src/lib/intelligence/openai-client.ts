import OpenAI from 'openai';

// Abstração mínima do provider — todo o resto do projeto chama
// getOpenAIClient(), nunca importa `openai` direto. É o que evita
// espalhar chamadas cruas à API pelo código, e o único lugar que lê a
// chave. Só deve ser importado por código server-only (Server
// Actions/Route Handlers) — nunca por um Client Component.
//
// A chave sempre vem de process.env.OPENAI_API_KEY, nunca
// NEXT_PUBLIC_OPENAI_API_KEY. O Next.js só injeta no bundle do
// browser as env vars com prefixo NEXT_PUBLIC_ — mesmo que este
// módulo fosse importado por engano num componente client, a env var
// chegaria como undefined lá, nunca o valor real.
let cachedClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (cachedClient) return cachedClient;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY não configurada neste ambiente.');
  }

  cachedClient = new OpenAI({ apiKey });
  return cachedClient;
}
