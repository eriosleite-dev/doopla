import type { Metadata } from 'next';

import { SUPPORT_EMAIL } from '@/lib/support';
import { Mascot } from '../_home/Mascot';
import { PageShell } from '../_home/PageShell';
import { ContactForm } from './ContactForm';

export const metadata: Metadata = {
  title: 'Fale com a Doopla',
  description: 'Dúvidas, suporte ou parcerias. Fale com a Doopla.',
};

export default function ContatoPage() {
  return (
    <PageShell>
      <section className="contact-section">
        <div className="two-col">
          <div>
            <span className="eyebrow">Contato</span>
            <h1>Vamos conversar?</h1>
            <p className="lead">Dúvidas, suporte ou parcerias. Fale com a Doopla.</p>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="contact-email">
              {SUPPORT_EMAIL}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
            <div className="contact-mascot">
              <Mascot size="cta" tracking />
            </div>
          </div>
          <ContactForm />
        </div>
      </section>
    </PageShell>
  );
}
