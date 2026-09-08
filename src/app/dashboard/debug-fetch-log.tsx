'use client';

import { useEffect, useState } from 'react';

// INSTRUMENTAÇÃO TEMPORÁRIA (08/09/2026) — 2ª tentativa de correção
// (suprimir prefetch de todo link não-ativo da sidebar até hover/toque,
// commit f08cee2) foi testada pelo usuário em produção e confirmada
// como NÃO tendo resolvido o fundo preto ("continua ficando preto nos
// mesmos cenários"). Isso é evidência direta contra a teoria de que a
// rajada de prefetch automático do <Link> é a causa raiz — se fosse,
// eliminar quase toda a rajada deveria ao menos mudar o sintoma
// observado. Antes de formular qualquer outra teoria (ex.: corrida de
// refresh-token do Supabase), é preciso PROVAR, com evidência da
// aplicação real, se ainda existe uma rajada de requisições concorrentes
// depois da correção de prefetch — e não assumir.
//
// Este componente intercepta window.fetch a partir do carregamento do
// módulo (antes de qualquer clique do usuário) e registra cada
// requisição feita para rotas /dashboard*, com os headers reais de
// roteamento do Next (rsc, next-url, next-router-state-tree,
// next-router-prefetch) e o resultado (status/duração/erro). Isso
// responde, direto da aplicação real, sem depender de Vercel Runtime
// Logs nem de teoria: (1) quantas requisições concorrentes ainda
// ocorrem no clique em Comunidade depois da correção de prefetch, (2)
// se alguma delas falha ou carrega um router-state-tree inesperado, (3)
// se a causa está mesmo em rede (nesse caso o log mostraria pouca ou
// nenhuma atividade concorrente, refutando de vez a teoria de rede e
// apontando pra outro lugar). Remover assim que a causa for confirmada.

type FetchLogEntry = {
  id: number;
  t: number;
  method: string;
  url: string;
  headers: { rsc: string; nextUrl: string; routerStateTree: string; routerPrefetch: string };
  status?: number;
  durationMs?: number;
  error?: string;
};

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
      if (window.__dooplaFetchLog!.length > 40) window.__dooplaFetchLog!.shift();
    }

    try {
      const res = await originalFetch(input, init);
      if (entry) {
        entry.status = res.status;
        entry.durationMs = Math.round(performance.now() - startedAt);
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

function formatLog(): { count: number; lines: string } {
  const log = window.__dooplaFetchLog ?? [];
  const loadT = window.__dooplaPageLoadT ?? 0;
  const now = performance.now();

  const lines = log
    .slice(-15)
    .map((e) => {
      const relSec = ((e.t - loadT) / 1000).toFixed(2);
      const ageSec = ((now - e.t) / 1000).toFixed(1);
      const status = e.error ? `ERRO:${e.error}` : e.status !== undefined ? `${e.status}` : '(pendente)';
      const dur = e.durationMs !== undefined ? `${e.durationMs}ms` : '…';
      return (
        `[+${relSec}s, há ${ageSec}s] ${e.method} ${e.url}\n` +
        `    rsc=${e.headers.rsc || '-'} nextUrl=${e.headers.nextUrl || '-'} prefetch=${e.headers.routerPrefetch || '-'} status=${status} dur=${dur}\n` +
        `    tree=${e.headers.routerStateTree || '-'}`
      );
    })
    .join('\n');

  return { count: log.length, lines };
}

export function DebugFetchLog() {
  const [{ count, lines }, setState] = useState<{ count: number; lines: string }>({ count: 0, lines: '' });

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
      {count} requisições /dashboard* capturadas desde o carregamento{'\n'}
      {lines || '(nenhuma ainda)'}
    </div>
  );
}
