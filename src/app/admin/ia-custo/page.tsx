import { getAdminAiCostSummary } from '@/lib/admin/data';
import { estimateAiCostCents } from '@/lib/admin/ai-pricing';

import { getAdminSession } from '../session';

export default async function AdminIaCustoPage() {
  const { supabase } = await getAdminSession();
  const rows = await getAdminAiCostSummary(supabase);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">Custo estimado das chamadas monitoradas</h1>
      <p className="text-[12px] text-zinc-500">
        Últimos 30 dias, por dia/modelo/feature/status — dados reais de <code className="text-zinc-400">ai_usage_events</code>.
      </p>
      <div className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-[12px] text-zinc-400">
        <p>
          <span className="font-semibold text-zinc-300">Chamadas instrumentadas</span> — quantas vezes um dos 7 pontos de IA do
          Runtime (Classifier, Planner, Approval Resolver, Policy Gate Extractor, Inbound Proposal, delegated-contact recognizer e
          recipient-consent-check) de fato rodou e conseguiu registrar o evento. Cada linha soma os tokens de TODAS as tentativas de
          retry daquela chamada (nunca só a última), mas uma falha na própria gravação do evento (RPC indisponível, timeout) faz essa
          chamada real não aparecer aqui — best-effort, nunca bloqueia a resposta ao cliente, mas pode subcontar silenciosamente.
        </p>
        <p>
          <span className="font-semibold text-zinc-300">Custo estimado</span> — tokens × preço por modelo (
          <code className="text-zinc-500">src/lib/admin/ai-pricing.ts</code>), sempre uma ESTIMATIVA calculada aqui em código, nunca
          lida de uma fatura real.
        </p>
        <p>
          <span className="font-semibold text-zinc-300">Gasto real faturado pela OpenAI</span> — não disponível nesta página. Não há
          integração com a API de billing/usage da OpenAI; não existe hoje nenhuma forma de comparar a estimativa acima com o valor
          que a OpenAI de fato cobra.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-[13px]">
          <thead className="bg-zinc-900 text-zinc-500">
            <tr>
              <th className="px-4 py-2 font-normal">Data</th>
              <th className="px-4 py-2 font-normal">Modelo</th>
              <th className="px-4 py-2 font-normal">Feature</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 text-right font-normal">Chamadas instrumentadas</th>
              <th className="px-4 py-2 text-right font-normal">Tokens (in/out)</th>
              <th className="px-4 py-2 text-right font-normal">Custo estimado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-zinc-500">
                  Nenhum uso de IA registrado no período.
                </td>
              </tr>
            ) : (
              rows.map((row, index) => {
                const estimate = estimateAiCostCents({
                  model: row.model,
                  usageDate: row.usage_date,
                  inputTokens: row.input_tokens,
                  outputTokens: row.output_tokens,
                });
                return (
                  <tr key={`${row.usage_date}-${row.model}-${row.feature}-${row.status}-${index}`}>
                    <td className="px-4 py-2 text-zinc-300">{row.usage_date}</td>
                    <td className="px-4 py-2 text-zinc-300">{row.model}</td>
                    <td className="px-4 py-2 text-zinc-300">{row.feature}</td>
                    <td className="px-4 py-2 text-zinc-400">{row.status}</td>
                    <td className="px-4 py-2 text-right text-zinc-300">{row.call_count}</td>
                    <td className="px-4 py-2 text-right text-zinc-400">
                      {row.input_tokens.toLocaleString('pt-BR')}/{row.output_tokens.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2 text-right text-zinc-300">
                      {estimate.configured ? `R$ ${(estimate.costCents / 100).toFixed(2)}` : 'preço não configurado'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
