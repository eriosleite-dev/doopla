'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { proGhostButtonClass, proPrimaryButtonClass } from '../../pro-format';
import { ComunidadeGuardProvider } from '../../comunidade/navigation-guard';

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
// INTEIRA, não só um nível — como a profundidade real varia (1 na
// lista, 2+ num subview alcançado direto ou via Salvos), rastreamos
// quantos passos reais de history aconteceram desde que este layout
// montou (nunca uma pilha de URLs própria — só contamos push/pop
// reais via popstate, inclusive os disparados pelo botão nativo Voltar
// do navegador) e usamos window.history.go(-n) pra fechar de qualquer
// profundidade de uma vez. Escape e clique fora usam a MESMA ação de
// Fechar (convenção padrão de modal — "me tire daqui", não "um passo
// atrás").
export default function ComunidadeModalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [entered, setEntered] = useState(false);
  const [pendingNav, setPendingNav] = useState<'back' | 'close' | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const scrollPositionsRef = useRef<Map<string, number>>(new Map());
  const guardFnRef = useRef<(() => boolean) | null>(null);

  const isTopicDetail = /^\/dashboard\/comunidade\/(?!novo$|salvos$)[^/]+$/.test(pathname);
  const isList = pathname === '/dashboard/comunidade';

  const depthRef = useRef(1);
  const prevPathnameRef = useRef(pathname);
  const poppedRef = useRef(false);

  useEffect(() => {
    function handlePopState() {
      poppedRef.current = true;
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    if (prevPathnameRef.current === pathname) return;
    prevPathnameRef.current = pathname;
    if (poppedRef.current) {
      depthRef.current = Math.max(1, depthRef.current - 1);
      poppedRef.current = false;
    } else {
      depthRef.current += 1;
    }
  }, [pathname]);

  // Preserva a posição de scroll do painel por rota interna (ex.: lista
  // de resultados rolada, depois abre um tópico, depois volta — reabre
  // exatamente onde estava). O `<aside>` é o único elemento com
  // scroll — nunca a window.
  useLayoutEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    el.scrollTop = scrollPositionsRef.current.get(pathname) ?? 0;
  }, [pathname]);

  function handleScroll() {
    const el = asideRef.current;
    if (!el) return;
    scrollPositionsRef.current.set(pathname, el.scrollTop);
  }

  function performNav(kind: 'back' | 'close') {
    if (kind === 'back') router.back();
    else window.history.go(-depthRef.current);
  }

  function attemptNav(kind: 'back' | 'close') {
    if (guardFnRef.current?.()) {
      setPendingNav(kind);
      return;
    }
    performNav(kind);
  }

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
        <div
          className={`absolute inset-0 bg-black/60 transition-opacity duration-200 ${entered ? 'opacity-100' : 'opacity-0'}`}
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
          {!isList && (
            <button
              type="button"
              onClick={() => attemptNav('back')}
              aria-label="Voltar"
              className="absolute top-4 left-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
            >
              ←
            </button>
          )}
          <button
            type="button"
            onClick={() => attemptNav('close')}
            aria-label="Fechar"
            className="absolute top-4 right-4 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[var(--pro-line)] bg-[var(--pro-panel)] text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>
          <div className="p-6">
            <ComunidadeGuardProvider guardFnRef={guardFnRef}>{children}</ComunidadeGuardProvider>
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
