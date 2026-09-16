import type { Metadata } from 'next';

import { SUPPORT_EMAIL } from '@/lib/support';
import { PageShell } from '../_home/PageShell';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Fale com a Doopla',
  description: 'Dúvida, problema, parceria ou qualquer outra coisa: chama a gente.',
};

export default function ContatoPage() {
  return (
    <PageShell>
      <section className="contact-compact">
        <div className="inner">
          <span className="eyebrow">Contato</span>
          <h1>Quer falar com a Doopla?</h1>
          <p className="lead">Dúvida, problema, parceria ou qualquer outra coisa: chama a gente.</p>
          <ContactForm />
          <p className="email-alt">
            Prefere falar por e-mail?{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
          </p>
        </div>
      </section>
    </PageShell>
  );
}
