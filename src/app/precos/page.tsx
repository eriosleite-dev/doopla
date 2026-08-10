import type { Metadata } from 'next';

import { StubPage } from '../_home/stub-page';

export const metadata: Metadata = { title: 'Preços | Doopla' };

export default function PrecosPage() {
  return <StubPage title="Como funcionam os preços" />;
}
