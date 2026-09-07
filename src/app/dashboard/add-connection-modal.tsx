'use client';

import { useState, useTransition } from 'react';

import {
  inviteArtistAction,
  inviteBookerAction,
  lookupContactAction,
  lookupPublicIdAction,
  requestRepresentationAction,
  type ContactLookupResult,
} from './actions';
import { proGhostButtonClass, proInputClass, proLabelClass, proPrimaryButtonClass } from './pro-format';
import { accentButtonClass, cardClass, ghostButtonClass } from './ui';

type Role = 'artista' | 'booker';

const TARGET_LABEL: Record<Role, string> = { artista: 'Booker', booker: 'Artista' };

// Correção 06/09/2026 — este componente é compartilhado por Booker
// (`/dashboard/artistas`, legado, `myRole="booker"`) e Artista
// (`/dashboard/bookers` "Minha equipe", já no novo painel escuro,
// `myRole="artista"`). Antes só existia na pele legada (accentButtonClass
// dourado, cardClass branco, font-doopla-display serifado) — daí o
// "botão dourado"/"composição administrativa antiga" vazando pro
// painel novo mesmo com a página em volta já em --pro-*. `variant`
// troca só a PELE (nunca a lógica: mesmos handlers, mesmas Server
// Actions, mesmo fluxo lookup -> match/no_match -> request/invite).
// Nenhum novo componente paralelo — Booker continua exatamente como
// estava (variant default = 'legacy').
type Variant = 'legacy' | 'pro';

type LookupMode = 'contact' | 'id';

export function AddConnectionModal({ myRole, variant = 'legacy' }: { myRole: Role; variant?: Variant }) {
  const isPro = variant === 'pro';
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<LookupMode>('contact');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [publicId, setPublicId] = useState('');
  const [result, setResult] = useState<ContactLookupResult | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const targetLabel = TARGET_LABEL[myRole];

  const primaryBtn = isPro ? proPrimaryButtonClass : accentButtonClass;
  const secondaryBtn = isPro ? proGhostButtonClass : ghostButtonClass;
  const containerClass = isPro
    ? 'rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] p-5 backdrop-blur-xl sm:p-6 flex flex-col gap-3'
    : `${cardClass} flex flex-col gap-3`;
  const titleClass = isPro ? 'font-pro-sub text-[15px] font-bold' : 'font-doopla-display text-lg font-semibold';
  const bodyTextClass = isPro ? 'text-[13px] text-[var(--pro-tx-70)]' : 'text-sm text-[var(--ink)]/70';
  const mutedTextClass = isPro ? 'text-[12px] text-[var(--pro-tx-50)]' : 'text-[12px] text-[var(--ink)]/55';
  const errorTextClass = isPro ? 'text-[13px] text-[#ff8b80]' : 'text-sm text-red-700';
  const highlightBoxClass = isPro
    ? 'rounded-[14px] border border-[var(--pro-line)] bg-white/[0.03] p-4'
    : 'rounded-[14px] bg-[var(--paper-dim)] p-4';
  const inviteLinkBoxClass = isPro
    ? 'flex flex-col gap-2 rounded-[12px] border border-[var(--pro-line)] bg-white/[0.03] p-3'
    : 'flex flex-col gap-2 rounded-[12px] bg-[var(--paper-dim)] p-3';
  const labelWrapClass = isPro ? 'flex flex-col gap-1.5' : 'flex flex-col gap-1 text-sm';
  const labelTextClass = isPro ? proLabelClass : 'font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/55';
  const inputClass = isPro
    ? proInputClass
    : 'rounded-[12px] border border-[var(--line-light)] bg-white px-3 py-2 outline-none focus:border-[var(--accent)]';
  const inviteLinkValueClass = isPro ? 'font-doopla-mono truncate text-[12px] text-[var(--pro-off)]' : 'font-doopla-mono truncate text-[12px] text-[var(--accent-ink)]';
  const resultTextClass = isPro ? 'text-[13px] text-[var(--pro-tx-70)]' : 'text-sm text-[var(--ink)]/70';

  function reset() {
    setOpen(false);
    setMode('contact');
    setName('');
    setContact('');
    setPublicId('');
    setResult(null);
    setSent(null);
    setInviteLink(null);
    setLinkCopied(false);
  }

  function switchMode(next: LookupMode) {
    setMode(next);
    setResult(null);
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  function handleLookup() {
    if (!name.trim() || !contact.trim()) return;
    startTransition(async () => {
      const outcome = await lookupContactAction(contact);
      setResult(outcome);
    });
  }

  function handleLookupById() {
    if (!publicId.trim()) return;
    startTransition(async () => {
      const outcome = await lookupPublicIdAction(publicId);
      setResult(outcome);
    });
  }

  function handleSendRequest(profileId: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('targetProfileId', profileId);
      const outcome = await requestRepresentationAction({}, formData);
      if (outcome.error) {
        setResult({ kind: 'error', error: outcome.error });
      } else {
        setSent('request');
      }
    });
  }

  function handleSendInvite() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('name', name);
      formData.set('contact', contact);
      const action = myRole === 'booker' ? inviteArtistAction : inviteBookerAction;
      const outcome = await action({}, formData);
      if (outcome.error) {
        setResult({ kind: 'error', error: outcome.error });
      } else {
        if (outcome.inviteToken) {
          setInviteLink(`${window.location.origin}/convite/${outcome.inviteToken}`);
        }
        setSent('invite');
      }
    });
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={primaryBtn}>
        Adicionar um {targetLabel}
      </button>
    );
  }

  return (
    <div className={containerClass}>
      <p className={titleClass}>Adicionar um {targetLabel}</p>

      {sent ? (
        <>
          <p className={resultTextClass}>
            {sent === 'request'
              ? 'Solicitação enviada. Você vê o status em Solicitações e Convites.'
              : 'Convite enviado. Assim que a pessoa se cadastrar, vocês podem conectar.'}
          </p>
          {inviteLink && (
            <div className={inviteLinkBoxClass}>
              <span className={`font-doopla-mono text-[11px] uppercase tracking-[.05em] ${isPro ? 'text-[var(--pro-tx-30)]' : 'text-[var(--ink)]/50'}`}>
                Link do convite
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className={inviteLinkValueClass}>{inviteLink}</span>
                <button type="button" onClick={copyInviteLink} className={secondaryBtn}>
                  {linkCopied ? 'Copiado!' : 'Copiar link'}
                </button>
              </div>
              <p className={mutedTextClass}>Manda esse link direto — quem clicar já entra sabendo que foi você quem convidou.</p>
            </div>
          )}
          <button type="button" onClick={reset} className={`${secondaryBtn} self-start`}>
            Fechar
          </button>
        </>
      ) : (
        <>
          {/* Segundo caminho do fluxo (07/09/2026) — quando as duas contas já
             existem, nem sempre a pessoa quer informar e-mail/telefone de
             alguém; o código ID público (mesmo que "Seu código ID" nos
             canais de booking) resolve isso sem precisar de contato. Só
             muda a busca — resultado, e o que fazer com "match" (sempre
             solicitação, nunca convite), continua idêntico. */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => switchMode('contact')}
              className={`${mutedTextClass} ${mode === 'contact' ? `font-semibold ${isPro ? 'text-[var(--pro-off)]' : 'text-[var(--ink)]'}` : ''} underline-offset-2 hover:underline`}
            >
              Por contato
            </button>
            <span className={mutedTextClass}>·</span>
            <button
              type="button"
              onClick={() => switchMode('id')}
              className={`${mutedTextClass} ${mode === 'id' ? `font-semibold ${isPro ? 'text-[var(--pro-off)]' : 'text-[var(--ink)]'}` : ''} underline-offset-2 hover:underline`}
            >
              Tenho o código ID
            </button>
          </div>

          {mode === 'contact' ? (
            <>
              <label className={labelWrapClass}>
                <span className={labelTextClass}>Nome do {targetLabel.toLowerCase()}</span>
                <input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setResult(null);
                  }}
                  className={inputClass}
                  placeholder="Nome completo"
                />
              </label>
              <label className={labelWrapClass}>
                <span className={labelTextClass}>Contato</span>
                <input
                  value={contact}
                  onChange={(e) => {
                    setContact(e.target.value);
                    setResult(null);
                  }}
                  className={inputClass}
                  placeholder="E-mail ou telefone"
                />
              </label>

              {result === null && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!name.trim() || !contact.trim() || pending}
                    onClick={handleLookup}
                    className={primaryBtn}
                  >
                    {pending ? 'Verificando…' : 'Continuar'}
                  </button>
                  <button type="button" onClick={reset} className={secondaryBtn}>
                    Cancelar
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <label className={labelWrapClass}>
                <span className={labelTextClass}>Código ID do {targetLabel.toLowerCase()}</span>
                <input
                  value={publicId}
                  onChange={(e) => {
                    setPublicId(e.target.value);
                    setResult(null);
                  }}
                  className={inputClass}
                  placeholder="Ex: joao-silva"
                />
              </label>

              {result === null && (
                <div className="flex gap-2">
                  <button type="button" disabled={!publicId.trim() || pending} onClick={handleLookupById} className={primaryBtn}>
                    {pending ? 'Buscando…' : 'Buscar'}
                  </button>
                  <button type="button" onClick={reset} className={secondaryBtn}>
                    Cancelar
                  </button>
                </div>
              )}

              {result?.kind === 'no_match' && (
                <>
                  <p className={bodyTextClass}>Não encontramos ninguém com esse código. Confira se está certo com quem te passou.</p>
                  <button type="button" onClick={() => setResult(null)} className={`${secondaryBtn} self-start`}>
                    Tentar de novo
                  </button>
                </>
              )}
            </>
          )}

          {result?.kind === 'error' && (
            <>
              <p className={errorTextClass}>{result.error}</p>
              <button type="button" onClick={() => setResult(null)} className={`${secondaryBtn} self-start`}>
                Tentar de novo
              </button>
            </>
          )}

          {result?.kind === 'existing_connection' && <p className={bodyTextClass}>{result.name} já está conectado com você.</p>}

          {result?.kind === 'pending_request' && (
            <p className={bodyTextClass}>Já existe uma solicitação pendente com {result.name} · aguardando resposta.</p>
          )}

          {result?.kind === 'pending_invite' && <p className={bodyTextClass}>Convite já enviado pra {result.name} · aguardando cadastro.</p>}

          {result?.kind === 'match' && (
            <div className={highlightBoxClass}>
              <p className={bodyTextClass}>
                Encontramos {result.name} na Doopla como {targetLabel.toLowerCase()}.
              </p>
              <button type="button" disabled={pending} onClick={() => handleSendRequest(result.profileId)} className={`${primaryBtn} mt-3`}>
                {pending ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            </div>
          )}

          {mode === 'contact' && result?.kind === 'no_match' && (
            <div className={highlightBoxClass}>
              <p className={bodyTextClass}>{name} ainda não está na Doopla.</p>
              <button type="button" disabled={pending} onClick={handleSendInvite} className={`${primaryBtn} mt-3`}>
                {pending ? 'Enviando…' : 'Enviar convite'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
