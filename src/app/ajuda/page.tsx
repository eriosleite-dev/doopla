import type { Metadata } from 'next';

import { StubPage } from '../_home/stub-page';

export const metadata: Metadata = { title: 'Central de ajuda | Doopla' };

export default function AjudaPage() {
  return <StubPage title="Central de ajuda" />;
}
