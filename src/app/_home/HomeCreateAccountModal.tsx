'use client';

import { useEffect, useRef, useState } from 'react';

import { CreateAccountModal } from './CreateAccountModal';

// Ilha React que intercepta TODOS os CTAs de cadastro do home.html (nav
// "Criar conta", hero, os 2 "Começar grátis" da tabela de preços — que
// levam `?plano=doopla`/`?plano=pro` — e o CTA final da página), abrindo
// o CreateAccountModal em vez de navegar — mesmo princípio de
// HomeLoginModal/HomeMenuOverlay, generalizado pra múltiplos triggers
// (querySelectorAll em vez de getElementById único, já que existem 5
// CTAs distintos apontando pra /cadastro na Home).
//
// Cada link recebe seu PRÓPRIO listener (em vez de um delegado em
// #home-marketing, como HomeSoftNav) de propósito: o listener no
// elemento mais profundo dispara antes do delegado do ancestral na fase
// de bubble, então preventDefault() aqui já evita que HomeSoftNav tente
// fazer router.push('/cadastro') logo em seguida — sem depender da
// ordem de montagem dos componentes irmãos em page.tsx.
//
// `plano` (doopla/pro) é lido do href de cada CTA e repassado como
// artistPlan pro createAccountAction, preservando a intenção de plano
// escolhida na Home. Links de indicação (`/cadastro?ref=`) nunca passam
// por aqui — apontam direto pra /cadastro de verdade (ver
// dashboard/layout.tsx), rota que continua existindo e funcionando sem
// nenhuma mudança.
export function HomeCreateAccountModal() {
  const [open, setOpen] = useState(false);
  const [artistPlan, setArtistPlan] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const triggers = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('#home-marketing a[href^="/cadastro"]')
    );
    if (triggers.length === 0) return;

    function handleClick(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const anchor = event.currentTarget as HTMLAnchorElement;
      const plano = new URL(anchor.href).searchParams.get('plano');
      setArtistPlan(plano ?? undefined);
      triggerRef.current = anchor;
      setOpen(true);
    }

    triggers.forEach((anchor) => anchor.addEventListener('click', handleClick));
    return () => triggers.forEach((anchor) => anchor.removeEventListener('click', handleClick));
  }, []);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div id="site-chrome">
      <CreateAccountModal open={open} onClose={handleClose} artistPlan={artistPlan} />
    </div>
  );
}
