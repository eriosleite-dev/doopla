import type { Metadata } from 'next';

import { PageShell } from '../_home/PageShell';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Fale com a Doopla',
  description: 'Dúvida, problema, parceria ou qualquer outra coisa: chama a gente.',
};

export default function ContatoPage() {
  return (
    <PageShell>
      <section className="page-hero">
        <span className="eyebrow">Contato</span>
        <h1>Quer falar com a Doopla?</h1>
        <p>Dúvida, problema, parceria ou qualquer outra coisa: chama a gente.</p>
      </section>

      <section className="page-content">
        <div className="inner contact-layout">
          <ContactForm />
          <p className="email-alt">
            Prefere falar por e-mail?{' '}
            <a href="mailto:contato@doopla.pro">contato@doopla.pro</a>
          </p>
        </div>
      </section>
    </PageShell>
  );
}
