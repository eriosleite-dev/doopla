'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { proGhostButtonClass, proPrimaryButtonClass } from '../../pro-format';
import { ComunidadeGuardProvider, type ComunidadeScrollBehavior } from '../../comunidade/navigation-guard';

// Comunidade volta a ser painel lateral no Web (07/09/2026) — a UX
// original aprovada (protótipo do bloco Shell+Home, "slide da direita,
// backdrop") tinha sido substituída por página inteira na Fase 1 por
// escolha técnica minha, nunca uma decisão de produto revisitada (ver
// PROGRESS.md/DECISOES.md). Esta é a correção: mesmas rotas
// (`/dashboard/comunidade/*`), mesmos dados/Server Actions da Fase 1,
// zero lógica duplicada — só o container muda de `<main>` full-bleed
// pra este painel deslizante, via intercepting route (mesmo mecanismo
// já usado em @modal/(.)bookings, (.)artistas, (.)bookers, (.)conversas).
//
// Largura variável (item 4, opção (a) aprovada): compacto pra
// busca/Recentes/Salvos/Criar tópico, mais largo só ao entrar num
// tópico — o MESMO painel (nunca um segundo modal por cima). Como este
// layout.tsx é compartilhado por todas as rotas internas da Comunidade
// (`page`, `[topicId]`, `novo`, `salvos`), ele nunca desmonta entre
// essas navegações — só a largura (`transition-[width]`) anima, sem
// pulo de layout. A decisão de largura é por pathname (não por prop
// dedicada) porque um único layout.tsx compartilhado não recebe o
// parâmetro dinâmico das rotas irmãs.
//
// Navegação (07/09/2026, correção item 1) — ← Voltar e X Fechar deixam
// de compartilhar a mesma ação. Voltar sempre usa router.back() (um
// passo real do history — list->topico, list->novo, list->salvos ou
// salvos->topico são sempre exatamente um push, então back() já
// devolve pro lugar certo de onde a navegação realmente veio, sem
// precisarmos reconstruir isso). Fechar precisa sair da Comunidade
// INTEIRA, não só um nível, de qualquer profundidade.
//
// Correção 08/09/2026 (achado da auditoria do item 1) — a primeira
// versão inferia profundidade por um boolean "houve popstate desde a
// última checagem" (decrementa) vs "não houve" (incrementa). Isso
// quebra com o botão/gesto nativo Avançar (Forward): Forward também
// dispara popstate, e o código não distinguia direção — um Back
// seguido de Forward fazia o contador decrementar DUAS vezes,
// undershoot no Fechar (fecha só até um nível intermediário).
//
// Modelo atual: cada entrada de history da Comunidade carrega sua
// própria profundidade carimbada em history.state.__comunidadeDepth
// (nunca uma pilha de URLs paralela — é o próprio history do
// navegador, só com um campo extra). Back/Forward nativos NUNCA
// precisam ser distinguidos: cada entrada já sabe sua profundidade
// correta desde que foi criada, então back/forward só LEEM o valor já
// carimbado — nunca inferem incrementando/decrementando. Só um push
// genuíno (entrada nova, sem carimbo ainda) soma +1 ao valor em
// memória (depthRef) e carimba.
//
// Cuidado verificado contra o próprio código-fonte do Next instalado
// (node_modules/next/dist/client/components/app-router.js): o
// HistoryUpdater interno do Next reconstrói history.state a cada
// navegação e só preserva campos customizados quando
// pushRef.preserveCustomHistoryState é true — e isso É true pra
// back/forward (completeTraverseNavigation), mas é FALSE tanto pra
// push quanto pra replace (completeSoftNavigation) — ou seja, um
// router.replace (nosso caso: busca ?q=) apaga nosso carimbo da
// entrada atual mesmo sem mudar de pathname. Por isso existe um
// segundo efeito, reagindo a useSearchParams(), que reafirma o
// carimbo (a partir do valor em memória, nunca relido de
// history.state) depois de qualquer replace — sem isso a busca
// corromperia a profundidade na próxima navegação real.
//
// Correção do Item 5 (08/09/2026) — scroll anchor. O restore de
// scroll abaixo sempre pousava numa rota nunca visitada em `0`
// (topo), o que é certo pra lista/busca/salvos mas errado pro chat de
// um tópico (quer pousar no fim, na conversa recente). Em vez de
// hardcodar isso aqui (o que faria este arquivo compartilhado saber
// de UX específica de uma rota filha), a rota do tópico REGISTRA seu
// próprio comportamento via useComunidadeScrollAnchor
// (navigation-guard.tsx) — mesma ideia já usada pelo guard de
// rascunho (guardFnRef), só que agora também cobrindo "qual o pixel
// de fallback" e "esse cache em Map ainda é confiável pro que vai
// remontar". Nenhuma rota que não registrar nada (lista/busca/novo/
// salvos) muda de comportamento: os `?? true`/`?? 0` abaixo reproduzem
// exatamente o que já existia.
//
// scrollPositionsRef ganhou um `pristine` ao lado do pixel: como cada
// mount desta rota SEMPRE busca de novo só a página mais recente
// (client nunca herda páginas adicionais entre remounts — ver
// pro-comunidade-topic-view.tsx), um pixel salvo enquanto o usuário
// tinha carregado "mensagens anteriores" descreve um documento mais
// alto do que o remount vai produzir; restaurá-lo cegamente pousaria
// num lugar sem relação com o que ele via. `pristine` é a resposta
// determinística: só confiamos no pixel em cache se ele foi
// registrado enquanto o conteúdo carregado ainda era exatamente o que
// um mount novo reproduz sozinho.
function stampComunidadeDepth(depth: number) {
  const current = (window.history.state ?? {}) as Record<string, unknown>;
  if (current.__comunidadeDepth === depth) return;
  // Spread do estado atual — nunca um objeto novo do zero — preserva
  // __NA/__PRIVATE_NEXTJS_INTERNALS_TREE (campos internos do Next) sem
  // precisar conhecer seus nomes. Sem passar `url`: só enriquecemos o
  // state da entrada atual, nunca navegamos.
  window.history.replaceState({ ...current, __comunidadeDepth: depth }, '');
}

function readComunidadeDepth(): number | null {
  const stamped = (window.history.state as Record<string, unknown> | null)?.__comunidadeDepth;
  return typeof stamped === 'number' ? stamped : null;
}

export default function ComunidadeModalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [entered, setEntered] = useState(false);
  const [pendingNav, setPendingNav] = useState<'back' | 'close' | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, { top: number; pristine: boolean }>>(new Map());
  const guardFnRef = useRef<(() => boolean) | null>(null);
  const scrollBehaviorRef = useRef<ComunidadeScrollBehavior | null>(null);

  const isTopicDetail = /^\/dashboard\/comunidade\/(?!novo$|salvos$)[^/]+$/.test(pathname);
  const isList = pathname === '/dashboard/comunidade';

  const depthRef = useRef(0);
  const prevPathnameRef = useRef<string | null>(null);

  // Dispara no mount (prevPathnameRef começa null) e em toda navegação
  // real (push ou back/forward) — nunca em troca só de querystring
  // (usePathname() não inclui search params). Entrada já carimbada
  // (back/forward pra algo visitado nesta sessão) → adota o valor
  // dela, é a fonte de verdade. Sem carimbo → é push genuíno, soma 1.
  useLayoutEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    const stamped = readComunidadeDepth();
    depthRef.current = stamped ?? depthRef.current + 1;
    stampComunidadeDepth(depthRef.current);
  }, [pathname]);

  // Reafirma o carimbo depois de qualquer replace (busca ?q=) — ver
  // comentário acima: replace faz o Next reescrever history.state sem
  // preservar campos customizados, mesmo sem trocar de pathname. Nunca
  // relê de history.state aqui — sempre reaplica o valor em memória.
  useLayoutEffect(() => {
    if (depthRef.current === 0) return;
    stampComunidadeDepth(depthRef.current);
  }, [searchParams]);

  // Preserva a posição de scroll do painel por rota interna (ex.: lista
  // de resultados rolada, depois abre um tópico, depois volta — reabre
  // exatamente onde estava). O `<aside>` é o único elemento com
  // scroll — nunca a window.
  //
  // Cache válido (pristine) sempre vence — é o comportamento de
  // sempre, intocado. Sem cache válido, cai pro anchor que a rota
  // filha registrou ('end' = fim do conteúdo; { messageId } = Item 12,
  // posição de leitura — pousa numa mensagem específica, ver
  // id={`msg-${id}`} em pro-comunidade-topic-view.tsx) ou, se nada
  // registrou (toda rota que não é o tópico), pro `0` de sempre.
  //
  // getBoundingClientRect() em vez de offsetTop pra achar a mensagem —
  // não depende de nenhuma suposição sobre qual ancestral é o
  // offsetParent (o <aside> é position:fixed, mas não custa nada
  // calcular por diferença de retângulo em vez de confiar nessa
  // cadeia). Se o id não existir no DOM ainda (mensagem fora da
  // página mais recente carregada — ver pro-comunidade-topic-view.tsx),
  // cai pro mesmo fallback de sempre ('end'), nunca quebra.
  useLayoutEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const cached = scrollPositionsRef.current.get(pathname);
    if (cached && cached.pristine) {
      el.scrollTop = cached.top;
      return;
    }
    const anchor = scrollBehaviorRef.current?.getAnchor();
    if (anchor && typeof anchor === 'object') {
      const target = el.querySelector(`#msg-${CSS.escape(anchor.messageId)}`);
      if (target) {
        const containerRect = el.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        // 12px de folga — a mensagem-alvo fica logo abaixo do topo
        // visível, nunca colada na borda.
        el.scrollTop = el.scrollTop + (targetRect.top - containerRect.top) - 12;
        return;
      }
    }
    el.scrollTop = anchor === 'end' ? el.scrollHeight : 0;
  }, [pathname]);

  function handleScroll() {
    const el = asideRef.current;
    if (!el) return;
    const pristine = scrollBehaviorRef.current?.isContentPristine() ?? true;
    scrollPositionsRef.current.set(pathname, { top: el.scrollTop, pristine });
  }

  const performNav = useCallback(
    (kind: 'back' | 'close') => {
      if (kind === 'back') router.back();
      else window.history.go(-depthRef.current);
    },
    [router]
  );

  // useCallback aqui não é só estilo: attemptNav agora também viaja pro
  // context (ComunidadeGuardProvider, ver navigation-guard.tsx) pra que
  // a rota do tópico desenhe seus próprios botões ←/✕ — se fosse
  // recriada a cada render, o `value` memoizado do Provider recriaria
  // junto, quebrando a estabilidade que os outros consumidores do
  // context (registerGuard/registerScrollBehavior) dependem.
  const attemptNav = useCallback(
    (kind: 'back' | 'close') => {
      if (guardFnRef.current?.()) {
        setPendingNav(kind);
        return;
      }
      performNav(kind);
    },
    [performNav]
  );

  useEffect(() => {
    const timer = setTimeout(() => setEntered(true), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (pendingNav) {
        setPendingNav(null);
        return;
      }
      attemptNav('close');
    }
    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingNav]);

  return (
    <div className="pro-shell contents">
      <div className="fixed inset-0 z-[110]" role="presentation">
        {/* Correção de contraste (08/09/2026) — bg-black/60 foi calibrado
           pensando num host claro (--paper, ver ProfileModal). O
           Professional Shell é escuro por decisão de produto
           (--pro-bg: #0c0b0b, ver .pro-shell em globals.css): 60% de
           preto adicional sobre um fundo já quase preto esmaga o
           contraste até a página de origem ficar irreconhecível.
           Opacidade mais baixa, calibrada pro host escuro, ainda separa
           visualmente o painel da Comunidade sem apagar a página por
           trás. Isso é só contraste — não corrige (nem tenta corrigir)
           o bug real, separado, de `children` chegando genuinamente
           vazio em certas navegações; esse foi rastreado e corrigido em
           next.config.ts (staleTimes.dynamic), ver commit c4675ad. */}
        <div
          className={`absolute inset-0 bg-black/25 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => attemptNav('close')}
          aria-hidden="true"
        />
        <aside
          ref={asideRef}
          onScroll={handleScroll}
          role="dialog"
          aria-modal="true"
          aria-label="Comunidade"
          className={`fixed top-0 right-0 h-screen max-w-[92vw] overflow-y-auto border-l border-[var(--pro-line)] bg-[var(--pro-panel-solid)] text-[var(--pro-off)] shadow-[-24px_0_60px_rgba(0,0,0,.4)] transition-[width,transform] duration-300 ease-out ${
            entered ? 'translate-x-0' : 'translate-x-full'
          } ${isTopicDetail ? 'w-[760px]' : 'w-[460px]'}`}
        >
          {/* Restruturação do header do tópico (08/09/2026) — ←/✕
             flutuando em absolute sobre o conteúdo nunca compôs um
             header de verdade com breadcrumb/título/favoritar (o
             problema era de composição, não só de espaçamento — ver
             navigation-guard.tsx). Pro tópico (isTopicDetail), esses
             botões deixam de existir aqui: [topicId]/topic-header.tsx
             desenha os próprios ←/✕ dentro do seu header de 3 áreas,
             chamando attemptNav via useComunidadeChromeActions (mesmo
             guard de rascunho, mesmo diálogo de descarte, mesmo
             back()/history.go(-depth) — nada disso muda, só ONDE o
             botão é desenhado no DOM). Lista/novo/salvos continuam
             exatamente como antes. */}
          {!isList && !isTopicDetail && (
            <button
              type="button"
              onClick={() => attemptNav('back')}
              aria-label="Voltar"
              className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
            >
              ←
            </button>
          )}
          {!isTopicDetail && (
            <button
              type="button"
              onClick={() => attemptNav('close')}
              aria-label="Fechar"
              className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
            >
              ✕
            </button>
          )}
          <div className="p-6">
            <ComunidadeGuardProvider guardFnRef={guardFnRef} scrollBehaviorRef={scrollBehaviorRef} attemptNav={attemptNav}>
              {children}
            </ComunidadeGuardProvider>
          </div>

          {pendingNav && (
            <div
              role="alertdialog"
              aria-modal="true"
              aria-label="Descartar rascunho?"
              className="absolute inset-0 z-20 flex items-center justify-center bg-black/70 p-6"
            >
              <div className="w-full max-w-[320px] rounded-[16px] border border-[var(--pro-line)] bg-[var(--pro-panel-solid)] p-5 text-center shadow-[0_20px_60px_rgba(0,0,0,.5)]">
                <p className="font-pro-sub text-[14px] font-bold text-[var(--pro-off)]">Descartar rascunho?</p>
                <p className="mt-1.5 text-[12.5px] text-[var(--pro-tx-50)]">
                  O que você escreveu ainda não foi publicado e vai se perder.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button type="button" onClick={() => setPendingNav(null)} className={proGhostButtonClass} autoFocus>
                    Continuar escrevendo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const kind = pendingNav;
                      setPendingNav(null);
                      performNav(kind);
                    }}
                    className={proPrimaryButtonClass}
                  >
                    Descartar
                  </button>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
