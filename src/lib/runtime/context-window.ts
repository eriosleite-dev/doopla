import type { ContextPackage } from '../intelligence/context-builder';

// Doopla Intelligence Core v1 — Runtime: truncamento de ContextPackage
// pra retomada. Achado desta rodada: classification-context.ts e
// planner-context.ts derivam a "mensagem-gatilho" implicitamente como
// messages[messages.length-1] (o item MAIS NOVO da janela) — nunca um
// parâmetro explícito. buildMessagesSection (Bloco 2, congelado) não
// tem limite superior de data, só windowSince — sempre busca até o
// instante real da consulta.
//
// Numa retomada, o gatilho de verdade é uma mensagem ANTIGA (a que
// ficou bloqueada), mas podem existir mensagens mais novas na
// conversation desde então. Sem truncar, o Classifier/Planner
// pegariam o item errado como gatilho. Em vez de tocar nos dois
// arquivos congelados do Bloco 2/3/4, este helper poda
// contextPackage.messages.items DEPOIS de buildContextPackage já ter
// rodado sem alteração nenhuma — a derivação "último item" das duas
// projeções continua correta, porque agora o último item É o gatilho
// da retomada.
//
// Fail-closed: quando a mensagem-gatilho não aparece na janela
// carregada (fora do teto de contagem/dias, ou seção messages
// indisponível/nula), retorna ok:false — o chamador nunca prossegue
// com um contexto que poderia estar mostrando o gatilho errado.
export function truncateContextAtMessage(
  contextPackage: ContextPackage,
  messageId: string
): { ok: true; contextPackage: ContextPackage } | { ok: false } {
  if (contextPackage.messages.status !== 'loaded') return { ok: false };

  const idx = contextPackage.messages.items.findIndex((m) => m.messageId === messageId);
  if (idx === -1) return { ok: false };

  const items = contextPackage.messages.items.slice(0, idx + 1);
  return {
    ok: true,
    contextPackage: {
      ...contextPackage,
      messages: {
        status: 'loaded',
        items,
        windowMessageCount: items.length,
        windowSince: contextPackage.messages.windowSince,
      },
    },
  };
}
