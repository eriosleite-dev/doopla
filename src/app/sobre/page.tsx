import type { Metadata } from 'next';

import { StubPage } from '../_home/stub-page';

export const metadata: Metadata = { title: 'Sobre | Doopla' };

export default function SobrePage() {
  return <StubPage title="Sobre a doopla" />;
}
