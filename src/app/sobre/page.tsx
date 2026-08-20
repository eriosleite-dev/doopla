import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Sobre a Doopla',
  description:
    'A Doopla nasceu para dar ao artista independente a estrutura que existe por trás de uma carreira profissional. Representação, organização e inteligência para que você possa focar no seu trabalho e continuar no controle da sua carreira.',
};

export default function SobrePage() {
  return (
    <PageShell>
      <section className="page-hero">
        <span className="eyebrow">Sobre a Doopla</span>
        <h1>Toda carreira merece sua Doopla.</h1>
        <p>
          A Doopla nasceu para dar ao artista independente a estrutura que
          existe por trás de uma carreira profissional. Representação,
          organização e inteligência para que você possa focar no seu
          trabalho e continuar no controle da sua carreira.
        </p>
        <div className="hero-eyes" aria-hidden="true">
          <span className="dot">
            <span className="pupil" style={{ width: '34%', height: '34%', borderRadius: '50%', background: 'var(--cream)' }} />
          </span>
          <span className="dot">
            <span className="pupil" style={{ width: '34%', height: '34%', borderRadius: '50%', background: 'var(--cream)' }} />
          </span>
        </div>
      </section>

      <section className="page-content">
        <div className="inner">
          <h2>Você faz seu trabalho. Sua Doopla cuida do booking.</h2>
          <div className="concepts">
            <div className="concept">
              <h3>Representação</h3>
              <p>Negociação, propostas, follow-ups, contratos e organização.</p>
            </div>
            <div className="concept">
              <h3>Com você no controle</h3>
              <p>Sua Doopla conduz. Decisões comerciais importantes passam por você.</p>
            </div>
            <div className="concept">
              <h3>Independência</h3>
              <p>Você não precisa entrar para uma agência para ter estrutura de representação.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-cta">
        <h2>Tem booking pra resolver?</h2>
        <Link href="/cadastro" className="btn-cta">
          Começar agora
        </Link>
      </section>
    </PageShell>
  );
}
