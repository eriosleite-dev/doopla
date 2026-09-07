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
type ComunidadeGuardContextValue = { registerGuard: (fn: GuardFn | null) => void };

const ComunidadeGuardContext = createContext<ComunidadeGuardContextValue | null>(null);

export function ComunidadeGuardProvider({
  children,
  guardFnRef,
}: {
  children: React.ReactNode;
  guardFnRef: React.MutableRefObject<GuardFn | null>;
}) {
  // guardFnRef nunca muda de identidade (é um ref) — o value do context
  // fica estável entre renders do layout, então useComunidadeDraftGuard
  // não re-registra o guard a cada render do slide-over, só quando o
  // formulário de fato monta/desmonta.
  const value = useMemo<ComunidadeGuardContextValue>(
    () => ({
      registerGuard: (fn) => {
        guardFnRef.current = fn;
      },
    }),
    [guardFnRef]
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
