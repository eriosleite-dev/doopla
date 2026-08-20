import fs from 'node:fs';
import path from 'node:path';
import type { ReactNode } from 'react';

import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

const SITE_CHROME_CSS = fs.readFileSync(
  path.join(process.cwd(), 'src/app/_home/site-chrome.css'),
  'utf8'
);

/**
 * Layout compartilhado das páginas institucionais (Sobre, Segurança,
 * Contato, Termos, Privacidade): mesmo Header (com overlay de MENU) e
 * Footer em todas, pra não duplicar/reinventar em cada página.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div id="site-chrome">
      <style>{SITE_CHROME_CSS}</style>
      <SiteHeader />
      {children}
      <SiteFooter />
    </div>
  );
}
