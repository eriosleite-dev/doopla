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
import { ProMascot } from './pro-mascot';
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

  // Título da coluna da direita (pro) — muda com o estado, mais
  // específico que o "Adicionar um X" genérico que a pele legacy usa
  // (esse título continua só na legacy; na pro ele vira o painel de
  // contexto à esquerda, ver LeftPanel abaixo).
  const rightHeading = sent
    ? sent === 'request'
      ? 'Solicitação enviada'
      : 'Convite enviado'
    : mode === 'contact'
      ? `Informe os dados do ${targetLabel.toLowerCase()}`
      : `Buscar ${targetLabel.toLowerCase()} por código ID`;

  const formContent = (
    <>
      {!isPro && <p className={titleClass}>Adicionar um {targetLabel}</p>}
      {isPro && <p className={titleClass}>{rightHeading}</p>}

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

          {/* Texto informativo (só pele pro, só antes de buscar) —
             honesto aos dois caminhos possíveis: não presume convite
             (só existe quando a conta ainda não existe) nem promete
             nada que o produto não faz. */}
          {isPro && result === null && (
            <p className={`${mutedTextClass} rounded-[12px] border border-[var(--pro-line)] bg-white/[0.02] p-3 leading-relaxed`}>
              {mode === 'contact'
                ? `Se ${targetLabel.toLowerCase() === 'booker' ? 'o' : 'a'} ${targetLabel.toLowerCase()} já tiver conta na Doopla, você manda uma solicitação de conexão. Se não tiver, a Doopla envia um convite com o link pra criar a conta.`
                : `Peça o código ID pro ${targetLabel.toLowerCase()} — ele encontra o dele em "Seu código ID", no painel dele.`}
            </p>
          )}

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
    </>
  );

  if (!isPro) {
    return <div className={containerClass}>{formContent}</div>;
  }

  // Composição em duas áreas (07/09/2026, redesign de "Minha equipe" —
  // referência visual aprovada pelo founder) — mascote/contexto à
  // esquerda, formulário/resultado à direita, dentro do card já usado
  // no resto do painel (mesmo border/radius/backdrop de ProCard). Só
  // muda a COMPOSIÇÃO da pele pro: zero mudança de lógica/estado —
  // formContent acima é o mesmo conteúdo de sempre, só realocado.
  return (
    <div className="overflow-hidden rounded-[18px] border border-[var(--pro-line)] bg-[var(--pro-panel)] backdrop-blur-xl lg:grid lg:grid-cols-[280px_1fr]">
      <LeftPanel targetLabel={targetLabel} />
      <div className="flex flex-col gap-3 border-t border-[var(--pro-line)] p-5 sm:p-6 lg:border-t-0 lg:border-l">
        {formContent}
      </div>
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="17" height="17">
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v3.5M16 3v3.5" strokeLinecap="round" />
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="17" height="17">
      <path d="M9 12h6" strokeLinecap="round" />
      <path d="M8 8H6a4 4 0 0 0 0 8h2M16 8h2a4 4 0 0 1 0 8h-2" strokeLinecap="round" />
    </svg>
  );
}

// Painel de contexto (só pele pro) — mascote como elemento de
// identidade (mesmo ProMascot usado na Home, não um desenho novo) +
// só o que é 100% real hoje: booker opera bookings do artista que
// representa (negociar/organizar/acompanhar — já é o que "Minha
// equipe"/oportunidades fazem) e o vínculo pode ser desfeito a
// qualquer momento (TerminateRelationshipButton, já existente). Nunca
// promete "nível de acesso"/permissão granular — isso não existe.
function LeftPanel({ targetLabel }: { targetLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-4 p-5 sm:p-6">
      <ProMascot size={64} />
      <div>
        <p className="font-pro-sub text-[16px] font-bold text-[var(--pro-off)]">Adicionar um {targetLabel}</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-[var(--pro-tx-50)]">
          Conecte um {targetLabel.toLowerCase()} de confiança pra ajudar a operar seus bookings na Doopla.
        </p>
      </div>

      <div className="flex flex-col gap-3 border-t border-[var(--pro-line)] pt-4">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex-none text-[var(--pro-red)]">
            <CalendarIcon />
          </span>
          <div>
            <p className="text-[12.5px] font-bold text-[var(--pro-off)]">Alguém da sua equipe</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--pro-tx-50)]">
              Pode negociar, organizar e acompanhar seus bookings na Doopla.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex-none text-[var(--pro-red)]">
            <UnlinkIcon />
          </span>
          <div>
            <p className="text-[12.5px] font-bold text-[var(--pro-off)]">Você continua no controle</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--pro-tx-50)]">
              Pode desconectar o {targetLabel.toLowerCase()} quando quiser, a qualquer momento.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
