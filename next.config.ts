import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Correção do fundo preto da Comunidade (08/09/2026) — causa raiz
    // encontrada lendo o código-fonte do Next 16.3.0 instalado aqui
    // (mandatório pelo AGENTS.md), não por teoria: o novo roteador
    // client-side (Segment Cache) mantém um "BFCache" do conteúdo já
    // renderizado de cada rota dinâmica, mas só reaproveita essa
    // entrada se ela ainda estiver "fresca" (readFromBFCacheDuringRegularNavigation
    // em node_modules/next/dist/client/components/router-reducer/ppr-navigations.js,
    // ~linha 561, chamada quando freshness===0 — o caso normal de
    // navegação). O prazo de validade vem de DYNAMIC_STALETIME_MS
    // (node_modules/next/dist/client/components/segment-cache/bfcache.js,
    // computeDynamicStaleAt), calculado a partir de
    // experimental.staleTimes.dynamic — que default é 0 segundos
    // (node_modules/next/dist/client/components/router-reducer/reducers/navigate-reducer.js).
    // Com 0s, a página atual (ex.: /dashboard) já nasce "stale" no
    // instante em que termina de renderizar. Isso não afeta só o clique
    // em Comunidade: QUALQUER navegação client-side subsequente força
    // um cache-miss no segmento `children`, mesmo quando esse segmento
    // não muda (caso de rota interceptada/paralela, como a Comunidade,
    // que só deveria trocar o slot @modal). Confirmado ao vivo via
    // DebugFetchLog: no clique real em Comunidade, o navegador dispara
    // DUAS requisições simultâneas com o mesmo token `_rsc` — uma pro
    // destino (/dashboard/comunidade) e outra pra re-buscar `children`
    // (/dashboard) do zero — ambas retornam status=200, mas `children`
    // termina renderizando vazio (0 nós reais em <main>, confirmado via
    // DebugMainProbe), evidência de uma corrida entre essas duas
    // respostas concorrentes na hora de aplicar o resultado no cliente.
    // Configurar staleTimes.dynamic > 0 é o mecanismo OFICIAL e
    // documentado do próprio Next pra esse caso (não uma tentativa
    // especulativa de opacidade/CSS): com uma janela de frescor real, o
    // segmento `children` já renderizado é reaproveitado direto do
    // BFCache (sem nenhuma requisição de rede), eliminando a corrida
    // pela raiz em vez de mitigar o sintoma. 30s é conservador — só
    // afeta reaproveitamento client-side dentro da mesma sessão já
    // carregada; qualquer navegação nova (reload, primeira visita)
    // sempre busca dados frescos do servidor normalmente.
    staleTimes: {
      dynamic: 30,
    },
  },
};

export default nextConfig;
