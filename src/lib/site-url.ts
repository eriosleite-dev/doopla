import { headers } from 'next/headers';

export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${protocol}://${host}`;
}
