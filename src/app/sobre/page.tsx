import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';
import { EyesShowcase } from '../_home/EyesShowcase';

export const metadata: Metadata = {
  title: 'Sobre a Doopla',
  description: 'A Doopla é uma nova forma de agenciamento para profissionais independentes.',
};

export default function SobrePage() {
  return (
    <PageShell>
      <section className="inst-hero">
        <div className="two-col">
          <div>
            <span className="eyebrow">Sobre a Doopla</span>
            <h1>Toda carreira merece sua Doopla.</h1>
            <p className="lead">A Doopla é uma nova forma de agenciamento para profissionais independentes.</p>
          </div>
          <EyesShowcase />
        </div>
      </section>

      <section className="inst-content">
        <div className="two-col">
          <div>
            <h2>Uma Doopla para atender, negociar e acompanhar seus bookings.</h2>
            <div className="inst-content-cta">
              <p>Tenha uma Doopla trabalhando por você.</p>
              <Link href="/cadastro" className="btn btn-primary">
                Criar conta
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
          <div className="stack-list">
            <div className="stack-item">
              <h3>Atende e negocia</h3>
              <p>Entende cada pedido, conversa com o cliente e conduz o booking.</p>
            </div>
            <div className="stack-item">
              <h3>Acompanha cada booking</h3>
              <p>Organiza condições, próximos passos, contratos e pagamentos.</p>
            </div>
            <div className="stack-item">
              <h3>Você continua no controle</h3>
              <p>Quando uma decisão precisa ser sua, sua Doopla te chama.</p>
            </div>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
