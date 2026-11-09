import type { ReactNode } from 'react';

import './home.css';
import './site-chrome.css';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Layout compartilhado das páginas institucionais (Sobre, Segurança,
 * Contato, Termos, Privacidade): mesmo Header/Footer/menu da Home V2
 * (home.css, escopado em #home-marketing — mesmo arquivo que a Home
 * real usa, reaproveitado aqui de verdade, não duplicado) + o conteúdo
 * específico de cada página institucional (site-chrome.css, seção
 * "conteúdo institucional", também já escopada em #home-marketing).
 *
 * home.js (GSAP, animações do hero, tracking dos mascotes) NUNCA é
 * carregado aqui — só existe via <Script> dentro de src/app/page.tsx,
 * exclusivo da rota "/". Classes cuja interatividade dependeria dele
 * (.mascot, .hero-*, .steps etc.) simplesmente não são usadas nestas
 * páginas; o que É usado (header, footer, botões, tipografia, tokens)
 * é 100% CSS, sem dependência de JS nenhum da Home.
 *
 * O CSS é importado normalmente (não lido via fs e injetado num <style>
 * inline) de propósito: um <style> reconstruído a cada mount de página
 * some e reaparece durante navegação client-side entre essas páginas,
 * causando um flash sem estilo — era a causa original do overlay do
 * menu "abrindo e fechando sozinho" antes desta correção.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div id="home-marketing">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
