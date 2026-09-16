import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Sobre a Doopla',
  description:
    'A Doopla é uma nova forma de agenciamento para profissionais independentes. Encontra trabalhos, atende clientes, negocia e cuida de tudo até o trabalho acontecer.',
};

export default function SobrePage() {
  return (
    <PageShell>
      <section className="page-hero">
        <span className="eyebrow">Sobre a Doopla</span>
        <h1>Toda carreira merece sua Doopla.</h1>
        <p>
          A Doopla é uma nova forma de agenciamento para profissionais
          independentes. Encontra trabalhos, atende clientes, negocia e cuida
          de tudo até o trabalho acontecer.
        </p>
        <div className="hero-eyes" aria-hidden="true">
          <span className="dot">
            <span className="pupil" style={{ width: '34%', height: '34%', borderRadius: '50%', background: 'var(--off)' }} />
          </span>
          <span className="dot">
            <span className="pupil" style={{ width: '34%', height: '34%', borderRadius: '50%', background: 'var(--off)' }} />
          </span>
        </div>
      </section>

      <section className="page-content">
        <div className="inner">
          <h2>Você faz seu trabalho. Sua Doopla trabalha por você.</h2>
          <div className="concepts">
            <div className="concept">
              <h3>Encontra trabalhos</h3>
              <p>Sua Doopla identifica trabalhos que fazem sentido para você.</p>
            </div>
            <div className="concept">
              <h3>Cuida de tudo</h3>
              <p>Atende clientes, entende o trabalho, negocia e acompanha cada etapa.</p>
            </div>
            <div className="concept">
              <h3>Você decide</h3>
              <p>Quando uma decisão precisa ser sua, sua Doopla te chama.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="page-cta">
        <div className="inner">
          <h2>Tenha uma Doopla trabalhando por você.</h2>
          <Link href="/cadastro" className="btn btn-primary">
            Criar conta
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
