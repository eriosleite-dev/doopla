-- Doopla — "Indique. Ganhe R$5." (item #49, Bloco G).
--
-- Regra de qualificação combinada com a usuária: crédito só vale depois de
-- 45-60 dias de assinatura ativa do indicado, nunca no clique do link ou no
-- cadastro. Não existe sistema de assinatura/cobrança nenhum na doopla
-- ainda (Preço Fundador hoje é só uma tela informativa no cadastro, sem
-- PSP nem cobrança recorrente) — por isso esta migration só cria o
-- rastreamento. Toda indicação nasce e permanece 'pendente' pra sempre,
-- sem nenhum caminho automático pra 'qualificada', até o dia em que a
-- assinatura existir de verdade e uma migration futura plugar a checagem
-- real (job/trigger rodando com service role). Nenhum valor é creditado
-- ao saldo visível enquanto isso não acontecer — não existe policy de
-- update pra ninguém autenticado nesta tabela, de propósito.

alter table public.profiles
  add column referral_code text unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);

comment on column public.profiles.referral_code is 'Código do link de indicação da própria pessoa (doopla.com/cadastro?ref=CODE). Gerado automaticamente pra todo profile.';

update public.profiles set referral_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
where referral_code is null;

alter table public.profiles alter column referral_code set not null;

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_profile_id uuid not null references public.profiles (id) on delete cascade,
  referred_profile_id uuid not null unique references public.profiles (id) on delete cascade,
  code text not null,
  status text not null default 'pendente' check (status in ('pendente', 'qualificada', 'invalida')),
  bonus_cents integer not null default 500,
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referrals_different_parties check (referrer_profile_id <> referred_profile_id)
);

comment on table public.referrals is 'Uma linha por pessoa indicada. status fica em pendente até o sistema de assinatura existir e conseguir checar 45-60 dias de assinatura ativa — hoje não existe transição automática pra qualificada.';
comment on column public.referrals.bonus_cents is 'Snapshot do valor do bônus no momento da indicação (R$5 = 500), nunca recalculado se o valor padrão mudar depois — mesma regra-mãe de snapshot do resto do produto.';

create index referrals_referrer_idx on public.referrals (referrer_profile_id);

alter table public.referrals enable row level security;

create policy "referrals: select own" on public.referrals
  for select using (auth.uid() = referrer_profile_id);

-- Sem policy de insert/update pra usuários autenticados: a linha nasce só
-- via trigger (handle_new_user, security definer) no momento do cadastro
-- do indicado, e o status só muda quando existir um job/trigger real de
-- verificação de assinatura (nenhum ainda) — nunca por ação do usuário.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_role public.user_role;
  meta jsonb;
  invite jsonb;
  matched_profile_id uuid;
  referrer_id uuid;
begin
  meta := new.raw_user_meta_data;
  new_role := coalesce(meta ->> 'role', 'artista')::public.user_role;

  insert into public.profiles (id, role, full_name)
  values (new.id, new_role, coalesce(meta ->> 'full_name', ''));

  if coalesce(meta ->> 'referralCode', '') <> '' then
    select id into referrer_id
    from public.profiles
    where referral_code = meta ->> 'referralCode';

    if referrer_id is not null and referrer_id <> new.id then
      insert into public.referrals (referrer_profile_id, referred_profile_id, code)
      values (referrer_id, new.id, meta ->> 'referralCode');
    end if;
  end if;

  if new_role = 'artista' then
    insert into public.artist_profiles (
      profile_id, stage_name, category, bio,
      intencao, pontual_detalhe, funcao, local, mercados, tem_booker
    ) values (
      new.id,
      meta ->> 'full_name',
      meta ->> 'categoria',
      meta ->> 'bio',
      meta ->> 'intencao',
      meta ->> 'pontualDetalhe',
      meta ->> 'categoria',
      meta ->> 'local',
      meta ->> 'mercados',
      meta ->> 'temBooker'
    );
  elsif new_role = 'booker' then
    insert into public.booker_profiles (
      profile_id, modo_trabalho, perfil, foco, mercados, quem, cidades, ja_representa, roster
    ) values (
      new.id,
      meta ->> 'modoTrabalho',
      meta ->> 'perfil',
      meta ->> 'foco',
      meta ->> 'mercados',
      meta ->> 'quem',
      meta ->> 'cidades',
      meta ->> 'jaRepresenta',
      meta ->> 'roster'
    );

    if coalesce(meta ->> 'pendingInvites', '') <> '' then
      for invite in select * from jsonb_array_elements((meta ->> 'pendingInvites')::jsonb)
      loop
        matched_profile_id := null;

        if (invite ->> 'contact') ilike '%@%' then
          select p.id into matched_profile_id
          from auth.users u
          join public.profiles p on p.id = u.id
          where lower(u.email) = lower(invite ->> 'contact')
            and p.role = 'artista'
          limit 1;
        end if;

        insert into public.invites (
          inviter_profile_id, invitee_name, invitee_contact, invitee_profile_id
        ) values (
          new.id,
          invite ->> 'name',
          invite ->> 'contact',
          matched_profile_id
        );
      end loop;
    end if;
  elsif new_role = 'agencia' then
    insert into public.agency_profiles (
      profile_id, agency_name, roster, agentes, mercado
    ) values (
      new.id,
      coalesce(meta ->> 'agencia', meta ->> 'full_name', ''),
      meta ->> 'roster',
      meta ->> 'agentes',
      meta ->> 'mercado'
    );
  end if;

  return new;
end;
$$;
