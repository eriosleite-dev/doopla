import type { ReactNode } from 'react';

import './site-chrome.css';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Layout compartilhado das páginas institucionais (Sobre, Segurança,
 * Contato, Termos, Privacidade): mesmo Header (com overlay de MENU) e
 * Footer em todas, pra não duplicar/reinventar em cada página.
 *
 * O CSS é importado normalmente (não lido via fs e injetado num <style>
 * inline) de propósito: um <style> reconstruído a cada mount de página
 * some e reaparece durante navegação client-side entre essas páginas,
 * causando um flash sem estilo — provavelmente a causa do overlay do
 * menu "abrindo e fechando sozinho" que foi reportado.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div id="site-chrome">
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
