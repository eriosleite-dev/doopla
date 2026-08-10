# Doopla

Marketplace de representação para artistas independentes, conectando
**artistas**, **bookers** e **agências**.

Stack: [Next.js](https://nextjs.org) (App Router) + [Supabase](https://supabase.com)
(Postgres + Auth) + Tailwind CSS. Preparado para deploy na [Vercel](https://vercel.com).

## Bloco 1 — Backend: login e banco de dados

O que já está implementado:

- Cadastro e login por e-mail/senha (Supabase Auth), com confirmação por e-mail.
- Escolha do tipo de conta no cadastro: **artista**, **booker** ou **agência**.
- Banco de dados (`supabase/migrations/0001_init_auth_profiles.sql`):
  - `profiles`: dados comuns aos três perfis, criada automaticamente no
    cadastro via trigger em `auth.users`.
  - `artist_profiles`, `booker_profiles`, `agency_profiles`: dados
    específicos de cada tipo de conta.
  - Row Level Security: cada usuário só lê/edita o próprio perfil.
- `/dashboard` protegido (via `src/proxy.ts`), mostrando os dados conforme o
  tipo de conta logada.

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor** do projeto, rode o conteúdo de
   `supabase/migrations/0001_init_auth_profiles.sql`.
3. Em **Authentication > Settings**, confirme que "Confirm email" está
   ativado (padrão) — o fluxo de cadastro depende do link de confirmação.
4. Em **Project Settings > API**, copie a `Project URL` e a `anon public key`.
5. Copie `.env.local.example` para `.env.local` e preencha essas duas
   variáveis:

   ```bash
   cp .env.local.example .env.local
   ```

## Rodando localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000). Fluxo de teste:

1. Vá em **Criar conta**, escolha o tipo de perfil e cadastre-se.
2. Confirme o e-mail (verifique também a aba de spam / o painel
   **Authentication > Users** do Supabase durante o desenvolvimento).
3. Faça login em `/login` e veja os dados do perfil em `/dashboard`.

## Estrutura relevante

```
src/
  proxy.ts                 # renova sessão e protege /dashboard (Next 16: proxy substitui middleware)
  lib/supabase/
    client.ts               # cliente Supabase para Client Components
    server.ts                # cliente Supabase para Server Components/Actions
    proxy.ts                 # lógica de sessão usada pelo proxy.ts
    types.ts                 # tipos das tabelas (trocar por tipos gerados quando o projeto existir)
  app/
    auth/actions.ts          # server actions: login, cadastro, logout
    auth/confirm/route.ts    # confirmação do link de e-mail do Supabase
    login/, cadastro/        # páginas de autenticação
    dashboard/                # área logada, protegida
supabase/migrations/0001_init_auth_profiles.sql
```

## Próximos blocos (sugestão)

- Onboarding específico por perfil (completar dados de `artist_profiles` /
  `booker_profiles` / `agency_profiles` após o primeiro login).
- Listagem pública de artistas (policy de leitura pública com campos
  limitados em `profiles`/`artist_profiles`).
- Recuperação de senha (`resetPasswordForEmail`).

## Deploy

Import o repositório na [Vercel](https://vercel.com/new) e configure as
mesmas variáveis de `.env.local.example` no painel do projeto.
