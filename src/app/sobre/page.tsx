import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Sobre a Doopla',
  description: 'A Doopla é uma nova forma de agenciamento para profissionais independentes.',
};

export default function SobrePage() {
  return (
    <PageShell>
      <section className="page-hero">
        <span className="eyebrow">Sobre a Doopla</span>
        <h1>Toda carreira merece sua Doopla.</h1>
        <p>A Doopla é uma nova forma de agenciamento para profissionais independentes.</p>
        <div className="hero-eyes" aria-hidden="true">
          <span className="eye-slot">
            <span className="mascot-pupil" />
          </span>
          <span className="eye-slot">
            <span className="mascot-pupil" />
          </span>
        </div>
      </section>

      <section className="page-content">
        <div className="inner">
          <h2>Uma Doopla para cuidar do que fica em volta do seu trabalho.</h2>
          <div className="concepts">
            <div className="concept">
              <h3>Atende e negocia</h3>
              <p>Entende cada pedido, conversa com o cliente e conduz o booking.</p>
            </div>
            <div className="concept">
              <h3>Acompanha cada booking</h3>
              <p>Organiza condições, próximos passos, contratos e pagamentos.</p>
            </div>
            <div className="concept">
              <h3>Você continua no controle</h3>
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
