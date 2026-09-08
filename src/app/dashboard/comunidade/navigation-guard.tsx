'use client';

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef } from 'react';

// Proteção de rascunho (07/09/2026, item 1 da correção de navegação da
// Comunidade) — quem decide SE pode voltar/fechar é o layout do
// slide-over (@modal/(.)comunidade/layout.tsx), mas quem sabe se
// existe conteúdo não publicado é o formulário (ProComunidadeNovoForm),
// renderizado como `children` opaco dois níveis abaixo. Context evita
// prop-drilling através do Server Component da rota (novo/page.tsx) —
// o formulário só registra uma função "tenho conteúdo não salvo?"
// quando monta, e cancela quando desmonta. Vive aqui (não dentro de
// @modal/(.)comunidade) porque quem consome é comunidade/novo/
// pro-comunidade-novo-form.tsx, usado tanto pelo slide-over quanto
// pela rota cheia de fallback — nunca importar de dentro de uma pasta
// de rota especial pra um componente que não é exclusivo dela.
type GuardFn = () => boolean;

// Correção do Item 5 (08/09/2026) — canal irmão do guard de rascunho,
// pro mesmo problema estrutural: quem decide ONDE pousar o scroll ao
// entrar numa rota da Comunidade é @modal/(.)comunidade/layout.tsx
// (dono do <aside> com scroll e do cache por pathname), mas só o
// tópico (dois níveis abaixo) sabe que sua UX de chat quer pousar no
// fim, não no topo — e só ele sabe se o que está carregado agora é
// exatamente o que um mount novo reproduziria (ver isContentPristine).
// 'start' | 'end' cobre só o que o Item 5 precisa; o formato nasce
// pensado pra crescer pra um terceiro caso (`{ messageId: string }`,
// Item 12 — pousar na posição de leitura) sem quebrar quem já usa
// 'start'/'end'.
export type ComunidadeScrollAnchor = 'start' | 'end';
export type ComunidadeScrollBehavior = {
  getAnchor: () => ComunidadeScrollAnchor;
  // true quando o conteúdo atualmente carregado é exatamente o que um
  // mount novo desta rota reproduziria sozinho (ex.: só a página mais
  // recente, nenhum "carregar anteriores" usado ainda nesta
  // montagem). layout.tsx usa isso pra decidir se um pixel de scroll
  // em cache ainda faz sentido pro conteúdo que está prestes a
  // remontar, ou se restaurá-lo cegamente pousaria num lugar sem
  // relação com o que o usuário via antes.
  isContentPristine: () => boolean;
};

type ComunidadeGuardContextValue = {
  registerGuard: (fn: GuardFn | null) => void;
  registerScrollBehavior: (behavior: ComunidadeScrollBehavior | null) => void;
};

const ComunidadeGuardContext = createContext<ComunidadeGuardContextValue | null>(null);

export function ComunidadeGuardProvider({
  children,
  guardFnRef,
  scrollBehaviorRef,
}: {
  children: React.ReactNode;
  guardFnRef: React.MutableRefObject<GuardFn | null>;
  scrollBehaviorRef: React.MutableRefObject<ComunidadeScrollBehavior | null>;
}) {
  // Refs nunca mudam de identidade — o value do context fica estável
  // entre renders do layout, então os hooks abaixo não re-registram a
  // cada render do slide-over, só quando o consumidor de fato
  // monta/desmonta.
  const value = useMemo<ComunidadeGuardContextValue>(
    () => ({
      registerGuard: (fn) => {
        guardFnRef.current = fn;
      },
      registerScrollBehavior: (behavior) => {
        scrollBehaviorRef.current = behavior;
      },
    }),
    [guardFnRef, scrollBehaviorRef]
  );
  return <ComunidadeGuardContext.Provider value={value}>{children}</ComunidadeGuardContext.Provider>;
}

// Chamado por qualquer subview que precise proteger conteúdo digitado
// (hoje só "Criar tópico"). `hasUnsavedContent` é reavaliado a cada
// tentativa de sair — nunca precisa re-registrar a cada tecla, por
// isso vive num ref interno em vez de recriar o registro a cada
// render. Fora do slide-over (rota cheia, sem Provider) isso não faz
// nada — nunca quebra a página completa de fallback.
export function useComunidadeDraftGuard(hasUnsavedContent: GuardFn) {
  const ctx = useContext(ComunidadeGuardContext);
  const hasContentRef = useRef(hasUnsavedContent);
  useLayoutEffect(() => {
    hasContentRef.current = hasUnsavedContent;
  });

  useEffect(() => {
    if (!ctx) return;
    ctx.registerGuard(() => hasContentRef.current());
    return () => ctx.registerGuard(null);
  }, [ctx]);
}

// Chamado pelo tópico (única rota da Comunidade com scroll-anchor
// próprio hoje). Diferente do guard de rascunho, o registro aqui
// precisa acontecer em useLayoutEffect (nunca useEffect): o efeito de
// restauração de scroll em layout.tsx TAMBÉM é um useLayoutEffect, e
// roda no mesmo commit da montagem — React dispara layout effects de
// baixo pra cima (filho antes do pai) dentro do mesmo commit, então só
// registrando em layout effect aqui é que o valor já está disponível
// quando o efeito do ancestral (layout.tsx) executa. Um useEffect
// (fase passiva, roda depois de TODOS os layout effects da árvore)
// chegaria tarde demais pro primeiro mount.
export function useComunidadeScrollAnchor(behavior: ComunidadeScrollBehavior) {
  const ctx = useContext(ComunidadeGuardContext);
  const behaviorRef = useRef(behavior);
  useLayoutEffect(() => {
    behaviorRef.current = behavior;
  });

  useLayoutEffect(() => {
    if (!ctx) return;
    ctx.registerScrollBehavior({
      getAnchor: () => behaviorRef.current.getAnchor(),
      isContentPristine: () => behaviorRef.current.isContentPristine(),
    });
    return () => ctx.registerScrollBehavior(null);
  }, [ctx]);
}
