import type { Metadata } from 'next';

import { StubPage } from '../_home/stub-page';

export const metadata: Metadata = { title: 'Privacidade | Doopla' };

export default function PrivacidadePage() {
  return <StubPage title="Política de privacidade" />;
}
