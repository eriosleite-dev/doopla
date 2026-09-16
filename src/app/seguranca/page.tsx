import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Segurança na Doopla',
  description:
    'A Doopla conduz o operacional. Você continua no controle das decisões comerciais importantes.',
};

export default function SegurancaPage() {
  return (
    <PageShell>
      <section className="inst-hero">
        <div className="two-col">
          <div>
            <span className="eyebrow">Segurança</span>
            <h1>Seu booking. Suas decisões.</h1>
            <p className="lead">
              A Doopla conduz o operacional. Você continua no controle das
              decisões comerciais importantes.
            </p>
          </div>
          <div className="stack-list">
            <div className="stack-item">
              <h3>Você aprova</h3>
              <p>
                Valores, condições importantes e decisões comerciais não são
                tomadas sem você.
              </p>
            </div>
            <div className="stack-item">
              <h3>Você acompanha</h3>
              <p>
                As informações importantes de cada booking ficam organizadas
                e acessíveis.
              </p>
            </div>
            <div className="stack-item">
              <h3>Seus dados são protegidos</h3>
              <p>A Doopla utiliza apenas os dados necessários para prestar o serviço.</p>
              <Link href="/privacidade" className="discreet-link">
                Ver Política de Privacidade
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="inst-cta">
        <div className="bar">
          <h2>Ainda ficou com alguma dúvida sobre segurança?</h2>
          <Link href="/contato" className="btn btn-primary">
            Falar com a Doopla
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
