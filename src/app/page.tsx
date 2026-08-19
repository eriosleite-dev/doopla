import fs from 'node:fs';
import path from 'node:path';
import type { Metadata } from 'next';
import Script from 'next/script';

const homeDir = path.join(process.cwd(), 'src/app/_home');
const HOME_CSS = fs.readFileSync(path.join(homeDir, 'home.css'), 'utf8');
const HOME_HTML = fs.readFileSync(path.join(homeDir, 'home.html'), 'utf8');
const HOME_JS = fs.readFileSync(path.join(homeDir, 'home.js'), 'utf8');

export const metadata: Metadata = {
  title: 'doopla · toda carreira merece sua doopla',
  description:
    'Você faz seu trabalho. A Doopla cuida do booking: responde, negocia e organiza com você.',
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
    </>
  );
}
