import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Script from 'next/script';

import { MARKETS } from '@/lib/market';
import { HomeCreateAccountModal } from './_home/HomeCreateAccountModal';
import { HomeLoginModal } from './_home/HomeLoginModal';
import { HomeMarketingBoot } from './_home/HomeMarketingBoot';
import { HomeMenuOverlay } from './_home/HomeMenuOverlay';
import { HomeSoftNav } from './_home/HomeSoftNav';

const homeDir = path.join(process.cwd(), 'src/app/_home');
const HOME_CSS = fs.readFileSync(path.join(homeDir, 'home.css'), 'utf8');
const HOME_HTML_RAW = fs.readFileSync(path.join(homeDir, 'home.html'), 'utf8');
const HOME_JS = fs.readFileSync(path.join(homeDir, 'home.js'), 'utf8');

// Preço é a ÚNICA coisa dinâmica dentro do HTML estático da Home — os
// dois `__PRICE_*__` em home.html (seção Planos) são substituídos aqui
// pelo valor de src/lib/market.ts, a mesma fonte que PlanPicker.tsx (o
// onboarding/checkout) já lê — antes disso cada lugar tinha seu próprio
// "R$29,90"/"R$59,90" hardcoded, podendo divergir silenciosamente (foi
// exatamente o que gerou o preço Pro desatualizado em home.html). Só
// formatação de preço aqui, de propósito — nada de plan IDs/feature
// catalog ainda (isso é trabalho futuro, quando o catálogo comercial
// for fechado). MARKETS.BR direto (não formatPrice/Intl) pra manter
// IDÊNTICO o formato "R$29,90" sem espaço que o HTML já usava — mesmo
// padrão usado em PlanPicker.tsx.
const market = MARKETS.BR;
const HOME_HTML = HOME_HTML_RAW.replace(
  '__PRICE_DOOPLA__',
  `${market.currencySymbol}${market.pricing.doopla.toFixed(2).replace('.', ',')}`
).replace('__PRICE_PRO__', `${market.currencySymbol}${market.pricing.pro.toFixed(2).replace('.', ',')}`);

export const metadata: Metadata = {
  title: 'doopla · toda carreira merece sua doopla',
  description:
    'Toda carreira merece sua Doopla. Um novo jeito de cuidar dos seus bookings, sem precisar cuidar de tudo sozinho.',
};

export default function Home() {
  return (
    <>
      <style>{HOME_CSS}</style>
      <div dangerouslySetInnerHTML={{ __html: HOME_HTML }} />
      {/* Scripts com src injetados via dangerouslySetInnerHTML não executam
          (regra do DOM), por isso o GSAP entra via next/script. A ordem de
          carregamento entre scripts afterInteractive não é garantida, então
          home.js espera window.gsap/ScrollTrigger existirem antes de rodar
          (ver home.js). Servido de /public (ver public/vendor/gsap) em vez
          de CDN externo, pra não depender de terceiro fora do controle da
          doopla. */}
      <Script id="gsap-core" src="/vendor/gsap/gsap.min.js" strategy="afterInteractive" />
      <Script
        id="gsap-scrolltrigger"
        src="/vendor/gsap/ScrollTrigger.min.js"
        strategy="afterInteractive"
      />
      <Script id="home-marketing-anim" strategy="afterInteractive">
        {HOME_JS}
      </Script>
      <HomeLoginModal />
      <HomeMenuOverlay />
      <HomeCreateAccountModal />
      <HomeSoftNav />
      <HomeMarketingBoot />
    </>
  );
}
