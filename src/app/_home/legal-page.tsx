import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import type { ReactNode } from 'react';

const LEGAL_CSS = fs.readFileSync(
  path.join(process.cwd(), 'src/app/_home/legal.css'),
  'utf8'
);

export function LegalPage({
  eyebrow,
  title,
  updated,
  notice,
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  notice?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div id="legal-doc">
      <style>{LEGAL_CSS}</style>
      <div className="wrap">
        <Link className="logo" href="/">
          doopla
        </Link>
        <span className="eyebrow" style={{ display: 'block', marginTop: 36 }}>
          {eyebrow}
        </span>
        <h1>{title}</h1>
        {updated && <div className="updated">{updated}</div>}
        {notice && <div className="notice">{notice}</div>}
        {children}
        <Link className="back" href="/">
          ← Voltar pra doopla
        </Link>
      </div>
    </div>
  );
}
