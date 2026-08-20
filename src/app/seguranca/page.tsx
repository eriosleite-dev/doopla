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
      <section className="page-hero">
        <span className="eyebrow">Segurança</span>
        <h1>Seu booking. Suas decisões.</h1>
        <p>
          A Doopla conduz o operacional. Você continua no controle das
          decisões comerciais importantes.
        </p>
      </section>

      <section className="page-content">
        <div className="inner">
          <div className="principles">
            <div className="principle">
              <h3>Você aprova</h3>
              <p>
                Valores, condições importantes e decisões comerciais não
                precisam ser tomadas sem você.
              </p>
            </div>
            <div className="principle">
              <h3>Você acompanha</h3>
              <p>
                As informações importantes do booking ficam organizadas e
                acessíveis para você.
              </p>
            </div>
            <div className="principle">
              <h3>Seus dados são protegidos</h3>
              <p>
                A Doopla utiliza os dados necessários para prestar o serviço
                e segue sua Política de Privacidade.
              </p>
              <Link href="/privacidade" className="discreet-link">
                Ver Política de Privacidade
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="page-cta">
        <h2>Ficou com alguma dúvida sobre segurança?</h2>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/contato" className="btn-cta">
            Falar com a Doopla
          </Link>
          <Link
            href="/privacidade"
            style={{ color: 'var(--off)', textDecoration: 'underline', alignSelf: 'center', fontSize: '.88rem' }}
          >
            Política de Privacidade
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
