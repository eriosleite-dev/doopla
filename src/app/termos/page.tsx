import type { Metadata } from 'next';

import { StubPage } from '../_home/stub-page';

export const metadata: Metadata = { title: 'Termos | Doopla' };

export default function TermosPage() {
  return <StubPage title="Termos de uso" />;
}
