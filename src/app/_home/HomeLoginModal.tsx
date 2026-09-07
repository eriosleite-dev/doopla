'use client';

import { useEffect, useRef, useState } from 'react';

import { LoginModal } from './LoginModal';

// Login como modal na Home pública (07/09/2026) — decisão explícita do
// usuário revertendo a anterior: clicar em "Entrar" na Home não pode
// navegar pra outra página, precisa abrir por cima, mesma identidade
// visual do /login redesenhado. /login continua existindo como rota
// funcional de verdade (acesso direto, redirects de auth com `next=`,
// guards do servidor) — ver src/app/login/page.tsx.
//
// A Home real (home.html) não é uma árvore React — é HTML cru injetado
// via dangerouslySetInnerHTML (ver page.tsx), com animações vanilla-JS
// (home.js/GSAP). Por isso o link "Entrar" (id="home-login-trigger",
// adicionado só pra isso) não tem handler React nenhum: este componente
// é montado como uma ilha React separada, do lado do HTML cru, e
// intercepta o clique via listener nativo no DOM depois do mount —
// nunca reescreve a Home pra virar React.
//
// O card do modal em si (LoginModal) é compartilhado com o "Entrar" do
// SiteHeader (Sobre, Segurança etc.) — aqui só cuida de quem dispara o
// open/close. home.html não tem nenhum ancestral `#site-chrome`
// (sistema de chrome das páginas institucionais), por isso precisa
// prover o próprio wrapper pro EyeLogo dentro do modal renderizar
// certo — SiteHeader não precisa disso porque já vive dentro do
// `#site-chrome` do PageShell.
export function HomeLoginModal() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const trigger = document.getElementById('home-login-trigger');
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      event.preventDefault();
      triggerRef.current = trigger;
      setOpen(true);
    }
    trigger.addEventListener('click', handleClick);
    return () => trigger.removeEventListener('click', handleClick);
  }, []);

  function handleClose() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <div id="site-chrome">
      <LoginModal open={open} onClose={handleClose} />
    </div>
  );
}
