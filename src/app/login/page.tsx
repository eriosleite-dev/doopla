import type { Metadata } from 'next';
import Link from 'next/link';

import { EyeLogo } from '@/app/_home/EyeLogo';
import '@/app/_home/site-chrome.css';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Entrar | Doopla',
};

const ERROR_MESSAGES: Record<string, string> = {
  link_invalido: 'Esse link de confirmação expirou ou já foi usado.',
};

// Redesign do login (07/09/2026) — referência visual aprovada
// explicitamente pelo usuário: card dark/vermelho centralizado, mesma
// identidade do painel novo (tokens --pro-*, `.pro-shell` já usado em
// pro-shell.tsx — nunca recriados aqui). Decisão explícita: /login
// continua uma ROTA NORMAL, nunca overlay/intercepting route — o
// "visual de modal" é só a composição do card sobre o fundo escuro,
// pra continuar funcionando sozinha em redirects de auth
// (`redirect('/login?next=...')`, usado em vários guards do servidor)
// e em acesso direto por link. Logo reaproveita EyeLogo/.eye-logo
// (site-chrome.css) — único asset de marca real no repo, nunca um
// wordmark novo. A variante exata "olhos vermelhos" da referência não
// existe codificada (só default e on-dark existem); usei on-dark (a
// variante real mais próxima) em vez de inventar uma terceira cor.
// Lógica de autenticação (loginAction, next, sessão, mensagens de
// erro) 100% preservada — só a apresentação mudou. "Esqueci minha
// senha" foi deliberadamente omitido (ver login-form.tsx) — não existe
// recuperação de senha real no produto ainda, e um link decorativo
// seria fake.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="pro-shell pro-glow-bg flex min-h-screen items-center justify-center px-4 py-10 font-pro-body">
      <div className="relative w-full max-w-[440px] rounded-[24px] border border-[rgba(226,41,28,.3)] bg-[var(--pro-panel-solid)] p-8 shadow-[0_0_70px_rgba(226,41,28,.18)] sm:p-10">
        <Link
          href="/"
          aria-label="Voltar para a página inicial"
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
        >
          ✕
        </Link>

        <div id="site-chrome">
          <EyeLogo onDark className="text-[22px] text-[var(--pro-off)]" />
        </div>

        <div className="mt-7 flex flex-col gap-2">
          <span className="font-doopla-mono text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--pro-red)]">
            Bem-vinda de volta
          </span>
          <h1 className="font-pro-display text-[28px] uppercase leading-[1.05] text-[var(--pro-off)] sm:text-[32px]">
            Entre na sua conta Doopla.
          </h1>
          <p className="text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">
            Continue de onde parou e deixe a Doopla cuidar do resto.
          </p>
        </div>

        {params.error && ERROR_MESSAGES[params.error] && (
          <p className="mt-5 rounded-[12px] border border-[rgba(226,41,28,.3)] bg-[rgba(226,41,28,.1)] px-3 py-2 text-[12.5px] text-[var(--pro-off)]">
            {ERROR_MESSAGES[params.error]}
          </p>
        )}

        <div className="mt-6">
          <LoginForm next={params.next ?? '/dashboard'} />
        </div>
      </div>
    </main>
  );
}
