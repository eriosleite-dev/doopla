'use client';

import { useState, useTransition } from 'react';

import {
  inviteArtistAction,
  inviteBookerAction,
  lookupContactAction,
  requestRepresentationAction,
  type ContactLookupResult,
} from './actions';
import { accentButtonClass, cardClass, ghostButtonClass } from './ui';

type Role = 'artista' | 'booker';

const TARGET_LABEL: Record<Role, string> = { artista: 'Booker', booker: 'Artista' };

export function AddConnectionModal({ myRole }: { myRole: Role }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [result, setResult] = useState<ContactLookupResult | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const targetLabel = TARGET_LABEL[myRole];

  function reset() {
    setOpen(false);
    setName('');
    setContact('');
    setResult(null);
    setSent(null);
    setInviteLink(null);
    setLinkCopied(false);
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
      <button type="button" onClick={() => setOpen(true)} className={accentButtonClass}>
        Adicionar um {targetLabel}
      </button>
    );
  }

  return (
    <div className={`${cardClass} flex flex-col gap-3`}>
      <p className="font-doopla-display text-lg font-semibold">Adicionar um {targetLabel}</p>

      {sent ? (
        <>
          <p className="text-sm text-[var(--ink)]/70">
            {sent === 'request'
              ? 'Solicitação enviada. Você vê o status em Solicitações e Convites.'
              : 'Convite enviado. Assim que a pessoa se cadastrar, vocês podem conectar.'}
          </p>
          {inviteLink && (
            <div className="flex flex-col gap-2 rounded-[12px] bg-[var(--paper-dim)] p-3">
              <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/50">
                Link do convite
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-doopla-mono truncate text-[12px] text-[var(--accent-ink)]">
                  {inviteLink}
                </span>
                <button type="button" onClick={copyInviteLink} className={ghostButtonClass}>
                  {linkCopied ? 'Copiado!' : 'Copiar link'}
                </button>
              </div>
              <p className="text-[12px] text-[var(--ink)]/55">
                Manda esse link direto — quem clicar já entra sabendo que foi você quem convidou.
              </p>
            </div>
          )}
          <button type="button" onClick={reset} className={`${ghostButtonClass} self-start`}>
            Fechar
          </button>
        </>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/55">
              Nome do {targetLabel.toLowerCase()}
            </span>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setResult(null);
              }}
              className="rounded-[12px] border border-[var(--line-light)] bg-white px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="Nome completo"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-doopla-mono text-[11px] uppercase tracking-[.05em] text-[var(--ink)]/55">
              Contato
            </span>
            <input
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
                setResult(null);
              }}
              className="rounded-[12px] border border-[var(--line-light)] bg-white px-3 py-2 outline-none focus:border-[var(--accent)]"
              placeholder="E-mail ou telefone"
            />
          </label>

          {result === null && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!name.trim() || !contact.trim() || pending}
                onClick={handleLookup}
                className={accentButtonClass}
              >
                {pending ? 'Verificando…' : 'Continuar'}
              </button>
              <button type="button" onClick={reset} className={ghostButtonClass}>
                Cancelar
              </button>
            </div>
          )}

          {result?.kind === 'error' && (
            <>
              <p className="text-sm text-red-700">{result.error}</p>
              <button type="button" onClick={() => setResult(null)} className={`${ghostButtonClass} self-start`}>
                Tentar de novo
              </button>
            </>
          )}

          {result?.kind === 'existing_connection' && (
            <p className="text-sm text-[var(--ink)]/70">
              {result.name} já está conectado com você.
            </p>
          )}

          {result?.kind === 'pending_request' && (
            <p className="text-sm text-[var(--ink)]/70">
              Já existe uma solicitação pendente com {result.name} · aguardando resposta.
            </p>
          )}

          {result?.kind === 'pending_invite' && (
            <p className="text-sm text-[var(--ink)]/70">
              Convite já enviado pra {result.name} · aguardando cadastro.
            </p>
          )}

          {result?.kind === 'match' && (
            <div className="rounded-[14px] bg-[var(--paper-dim)] p-4">
              <p className="text-sm">
                Encontramos {result.name} na Doopla como {targetLabel.toLowerCase()}.
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleSendRequest(result.profileId)}
                className={`${accentButtonClass} mt-3`}
              >
                {pending ? 'Enviando…' : 'Enviar solicitação'}
              </button>
            </div>
          )}

          {result?.kind === 'no_match' && (
            <div className="rounded-[14px] bg-[var(--paper-dim)] p-4">
              <p className="text-sm">{name} ainda não está na Doopla.</p>
              <button type="button" disabled={pending} onClick={handleSendInvite} className={`${accentButtonClass} mt-3`}>
                {pending ? 'Enviando…' : 'Enviar convite'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
