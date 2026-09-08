'use client';

import { useEffect, useState } from 'react';

// INSTRUMENTAÇÃO TEMPORÁRIA (08/09/2026) — evidência já coletada nesta
// investigação (2 prints reais em produção): (1) suprimir a rajada de
// prefetch da sidebar (commit f08cee2) não mudou o sintoma — refuta a
// teoria de rede como causa raiz; (2) o log de fetch abaixo capturou,
// no clique real em Comunidade, DUAS requisições SIMULTÂNEAS com o
// MESMO token `_rsc` — uma pra /dashboard/comunidade (destino) e outra
// pra /dashboard (origem, ou seja, o segmento `children` sendo
// re-buscado da rede porque o Client Router Cache não tinha ele
// disponível — TTL "off por padrão" pra rota dinâmica, doc do Next) —
// e AMBAS retornaram status=200. Isso prova que o servidor não falhou
// em nenhuma das duas: a pergunta que falta responder é se o payload
// da resposta de /dashboard (a que deveria repor `children`) contém
// conteúdo real que está sendo descartado no cliente, ou se já chega
// vazio do servidor. Por isso este componente agora também lê (via
// res.clone(), nunca consumindo o stream que o próprio router do Next
// precisa) um trecho do corpo de cada resposta RSC (`rsc=1`) — prova
// direta do payload, sem depender de teoria sobre o que "deveria"
// acontecer. Remover assim que a causa for confirmada.

type FetchLogEntry = {
  id: number;
  t: number;
  method: string;
  url: string;
  headers: { rsc: string; nextUrl: string; routerStateTree: string; routerPrefetch: string };
  status?: number;
  durationMs?: number;
  error?: string;
  bodyLength?: number;
  bodySnippet?: string;
  modalExcerpt?: string | null;
  childrenExcerpt?: string | null;
};

// Print real (08/09/2026) mostrou que os primeiros 260 caracteres do
// corpo são só a lista de referências de módulo (OutletBoundary,
// ViewportBoundary, Suspense...) — a definição real da árvore de rota
// (o que populate `children` vs `modal`) fica MAIS ADIANTE no payload,
// fora dessa janela. Em vez de aumentar cegamente o corte (o corpo tem
// milhares de bytes), procura direto pelos marcadores decisivos e
// mostra só o trecho ao redor deles — prova direta do conteúdo, não
// mais um chute de quantos caracteres bastam.
function excerptAround(text: string, marker: string, radius = 260): string | null {
  const idx = text.indexOf(marker);
  if (idx === -1) return null;
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

declare global {
  interface Window {
    __dooplaFetchLog?: FetchLogEntry[];
    __dooplaFetchPatched?: boolean;
    __dooplaPageLoadT?: number;
  }
}

if (typeof window !== 'undefined' && !window.__dooplaFetchPatched) {
  window.__dooplaFetchPatched = true;
  window.__dooplaFetchLog = [];
  window.__dooplaPageLoadT = performance.now();
  const originalFetch = window.fetch.bind(window);
  let nextId = 1;

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const isDashboard = url.includes('/dashboard');
    const startedAt = performance.now();

    let headerBag: FetchLogEntry['headers'] = { rsc: '', nextUrl: '', routerStateTree: '', routerPrefetch: '' };
    let entry: FetchLogEntry | null = null;

    if (isDashboard) {
      const requestHeaders = input instanceof Request ? input.headers : undefined;
      const h = new Headers(init?.headers ?? requestHeaders);
      headerBag = {
        rsc: h.get('rsc') ?? '',
        nextUrl: h.get('next-url') ?? '',
        routerStateTree: (h.get('next-router-state-tree') ?? '').slice(0, 320),
        routerPrefetch: h.get('next-router-prefetch') ?? '',
      };
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      entry = { id: nextId++, t: startedAt, method: method || 'GET', url, headers: headerBag };
      window.__dooplaFetchLog!.push(entry);
      // Capacidade alta (não só as últimas 8) — o painel navegando dentro
      // da Comunidade já aberta gera muito prefetch de hover (tópicos,
      // novo, salvos); sem isso, a MESMA navegação real que dispara a
      // tela preta (a que importa) seria expulsa do buffer antes de dar
      // tempo de tirar print.
      if (window.__dooplaFetchLog!.length > 120) window.__dooplaFetchLog!.shift();
    }

    try {
      const res = await originalFetch(input, init);
      if (entry) {
        entry.status = res.status;
        entry.durationMs = Math.round(performance.now() - startedAt);
        // Só lê corpo de respostas RSC reais (payload é o que decide se
        // `children` chega vazio do servidor ou é descartado no
        // cliente) — clone() é obrigatório: o router do Next ainda vai
        // consumir `res` normalmente, nunca podemos roubar o stream
        // original dele.
        if (entry.headers.rsc === '1') {
          const capturedEntry = entry;
          res
            .clone()
            .text()
            .then((text) => {
              capturedEntry.bodyLength = text.length;
              capturedEntry.bodySnippet = text.slice(0, 200);
              // "modal":[ mostra o que populate o slot @modal (deveria
              // ser real quando a resposta é pro clique em Comunidade).
              // "children":["dashboard" é a definição RAIZ do segmento
              // children (não uma ocorrência aninhada mais profunda —
              // essa string específica só aparece nesse nível) — é o
              // que decide se o servidor mandou `children` vazio ou se
              // o cliente está descartando conteúdo real.
              capturedEntry.modalExcerpt = excerptAround(text, '"modal":[');
              capturedEntry.childrenExcerpt = excerptAround(text, '"children":["dashboard"');
            })
            .catch((bodyErr) => {
              capturedEntry.bodySnippet = `(erro lendo corpo: ${bodyErr instanceof Error ? bodyErr.message : String(bodyErr)})`;
            });
        }
      }
      return res;
    } catch (err) {
      if (entry) {
        entry.error = err instanceof Error ? err.message : String(err);
        entry.durationMs = Math.round(performance.now() - startedAt);
      }
      throw err;
    }
  }) as typeof window.fetch;
}

function formatEntry(e: FetchLogEntry, loadT: number, now: number): string {
  const relSec = ((e.t - loadT) / 1000).toFixed(2);
  const ageSec = ((now - e.t) / 1000).toFixed(1);
  const status = e.error ? `ERRO:${e.error}` : e.status !== undefined ? `${e.status}` : '(pendente)';
  const dur = e.durationMs !== undefined ? `${e.durationMs}ms` : '…';
  const bodyLines: string[] = [];
  if (e.headers.rsc === '1') {
    bodyLines.push(`    corpo(${e.bodyLength ?? '…'}b) início=${e.bodySnippet !== undefined ? e.bodySnippet : '(lendo…)'}`);
    if (e.bodyLength !== undefined) {
      bodyLines.push(`    "modal":[ → ${e.modalExcerpt ?? '(marcador não encontrado no corpo)'}`);
      bodyLines.push(`    "children":["dashboard" → ${e.childrenExcerpt ?? '(marcador não encontrado no corpo)'}`);
    }
  }
  return (
    `[+${relSec}s, há ${ageSec}s] ${e.method} ${e.url}\n` +
    `    rsc=${e.headers.rsc || '-'} nextUrl=${e.headers.nextUrl || '-'} prefetch=${e.headers.routerPrefetch || '-'} status=${status} dur=${dur}\n` +
    `    tree=${e.headers.routerStateTree || '-'}` +
    (bodyLines.length ? `\n${bodyLines.join('\n')}` : '')
  );
}

function formatLog(): { count: number; realCount: number; prefetchCount: number; realLines: string } {
  const log = window.__dooplaFetchLog ?? [];
  const loadT = window.__dooplaPageLoadT ?? 0;
  const now = performance.now();

  // Navegar dentro da Comunidade já aberta (hover em tópicos/novo/salvos)
  // gera muito prefetch (`prefetch=1`) — ruído pro que estamos
  // investigando. As requisições REAIS de navegação (`prefetch` != '1')
  // são as que importam pra explicar a tela preta: sempre priorizadas
  // aqui, nunca escondidas atrás de ruído de prefetch por causa de
  // capacidade limitada de tela.
  const real = log.filter((e) => e.headers.rsc === '1' && e.headers.routerPrefetch !== '1');
  const prefetchCount = log.filter((e) => e.headers.routerPrefetch === '1').length;

  const realLines = real
    .slice(-4)
    .map((e) => formatEntry(e, loadT, now))
    .join('\n');

  return { count: log.length, realCount: real.length, prefetchCount, realLines };
}

export function DebugFetchLog() {
  const [{ count, realCount, prefetchCount, realLines }, setState] = useState<{
    count: number;
    realCount: number;
    prefetchCount: number;
    realLines: string;
  }>({ count: 0, realCount: 0, prefetchCount: 0, realLines: '' });

  useEffect(() => {
    function tick() {
      setState(formatLog());
    }
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 8,
        right: 8,
        zIndex: 999999,
        background: '#111',
        color: '#39ff14',
        fontFamily: 'monospace',
        fontSize: 9.5,
        lineHeight: 1.4,
        padding: '6px 9px',
        borderRadius: 6,
        maxWidth: '620px',
        maxHeight: '45vh',
        overflowY: 'auto',
        whiteSpace: 'pre-wrap',
        boxShadow: '0 4px 16px rgba(0,0,0,.5)',
      }}
    >
      {'DEBUG FETCH (temporário) — '}
      {count} requisições /dashboard* no total ({realCount} navegações reais, {prefetchCount} prefetches omitidos)
      {'\n'}
      {'ÚLTIMAS NAVEGAÇÕES REAIS (prefetch≠1):\n'}
      {realLines || '(nenhuma ainda)'}
    </div>
  );
}
