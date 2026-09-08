import Link from 'next/link';
import type { ReactNode } from 'react';

import { ProPageHeader } from '../pro-ui';

// Settings V2 (08/09/2026) — cada seção de Configurações é uma rota
// própria (Configurações → detalhe → ação, nunca tudo numa página só).
// Este cabeçalho compartilhado é o único lugar que sabe desenhar o
// link de volta — nenhuma subpágina reimplementa isso.
export function ProSettingsDetailHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-1">
      <Link
        href="/dashboard/perfil"
        className="mb-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[var(--pro-tx-50)] hover:text-[var(--pro-off)]"
      >
        ← Configurações
      </Link>
      <ProPageHeader title={title} subtitle={subtitle} action={action} />
    </div>
  );
}

// Linha de navegação da raiz de Configurações — rótulo + resumo curto
// opcional (só quando há dado real útil, nunca um placeholder) + seta.
// Nunca um card por linha (mosaico de cards é exatamente o que a régua
// de UX desta rodada pede pra evitar) — uma lista densa dentro de um
// único ProCard por grupo.
export function ProSettingsRow({ href, label, summary }: { href: string; label: string; summary?: ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-5 py-3.5 text-[13.5px] transition-colors hover:bg-white/[0.03] first:rounded-t-[18px] last:rounded-b-[18px]"
    >
      <span className="font-medium text-[var(--pro-off)]">{label}</span>
      <span className="flex items-center gap-2 text-[12.5px] text-[var(--pro-tx-50)]">
        {summary}
        <span aria-hidden="true" className="text-[var(--pro-tx-30)]">
          ›
        </span>
      </span>
    </Link>
  );
}

export function ProSettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="px-1 text-[11.5px] font-semibold uppercase tracking-[.06em] text-[var(--pro-tx-30)]">{title}</p>
      <div className="divide-y divide-[var(--pro-line)] rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}
