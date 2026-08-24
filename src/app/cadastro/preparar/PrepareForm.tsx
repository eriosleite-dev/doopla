'use client';

import { useActionState, useState } from 'react';

import { OnboardingShell } from '../OnboardingShell';
import { savePrepareAction, type OnboardingFormState } from '../actions';
import '../onboarding.css';

const initialState: OnboardingFormState = {};
const SUBSTEPS = 5; // Etapas 2 a 6 (globais) = índices 0 a 4 aqui

function formatCentsToInput(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Input conversacional único (textarea + microfone embutido), nunca dois
// modos separados de "escrever"/"falar por áudio". Captura de áudio de
// verdade ainda não existe — clicar no microfone só avisa isso
// honestamente, sem esconder o textarea nem simular uma gravação que
// descartaria a resposta da pessoa.
function ConversationalField({
  id,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) {
  const [showMicNote, setShowMicNote] = useState(false);
  return (
    <div className="conv-field">
      <textarea
        id={id}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="mic-btn"
        aria-label="Falar por áudio"
        onClick={() => setShowMicNote(true)}
      >
        🎙
      </button>
      {showMicNote && (
        <p className="mic-note">
          Áudio ainda não está disponível — continue escrevendo aqui por enquanto.
        </p>
      )}
    </div>
  );
}

export function PrepareForm({
  initialStageName,
  initialProfession,
  initialLocal,
  initialBio,
  initialLink,
  initialFeeCents,
  initialPricingNotes,
  initialIssuesInvoice,
  initialNegotiationNotes,
  initialChannel,
}: {
  initialStageName: string;
  initialProfession: string;
  initialLocal: string;
  initialBio: string;
  initialLink: string;
  initialFeeCents: number | null;
  initialPricingNotes: string;
  initialIssuesInvoice: boolean | null;
  initialNegotiationNotes: string;
  initialChannel: 'whatsapp' | 'painel' | 'ambos' | null;
}) {
  const [state, formAction, pending] = useActionState(savePrepareAction, initialState);
  const [sub, setSub] = useState(0);

  const [stageName, setStageName] = useState(initialStageName);
  const [profession, setProfession] = useState(initialProfession);
  const [local, setLocal] = useState(initialLocal);
  const [bio, setBio] = useState(initialBio);
  const [link, setLink] = useState(initialLink);

  const [priceChoice, setPriceChoice] = useState<'valor' | 'depende' | null>(
    initialFeeCents !== null ? 'valor' : initialPricingNotes ? 'depende' : null
  );
  const [feeValue, setFeeValue] = useState(formatCentsToInput(initialFeeCents));
  const [pricingNotes, setPricingNotes] = useState(initialPricingNotes);

  const [issuesInvoice, setIssuesInvoice] = useState<boolean | null>(initialIssuesInvoice);
  const [negotiationNotes, setNegotiationNotes] = useState(initialNegotiationNotes);

  const [channel, setChannel] = useState<'whatsapp' | 'painel' | 'ambos' | null>(initialChannel);

  function canAdvance(s: number): boolean {
    if (s === 0) {
      return Boolean(stageName.trim() && profession.trim() && local.trim() && bio.trim());
    }
    if (s === 1) {
      return priceChoice === 'depende' || (priceChoice === 'valor' && feeValue.trim().length > 0);
    }
    if (s === 3) {
      return Boolean(channel);
    }
    return true;
  }

  function next() {
    setSub((s) => Math.min(s + 1, SUBSTEPS - 1));
  }
  function back() {
    setSub((s) => Math.max(s - 1, 0));
  }

  const footerLabel = sub === SUBSTEPS - 1 ? 'Continuar para os planos' : 'Continuar';

  return (
    <form action={formAction}>
      <input type="hidden" name="stageName" value={stageName} />
      <input type="hidden" name="profession" value={profession} />
      <input type="hidden" name="local" value={local} />
      <input type="hidden" name="bio" value={bio} />
      <input type="hidden" name="link" value={link} />
      <input type="hidden" name="priceChoice" value={priceChoice ?? ''} />
      <input type="hidden" name="feeValue" value={feeValue} />
      <input type="hidden" name="pricingNotes" value={pricingNotes} />
      <input
        type="hidden"
        name="issuesInvoice"
        value={issuesInvoice === null ? '' : String(issuesInvoice)}
      />
      <input type="hidden" name="negotiationNotes" value={negotiationNotes} />
      <input type="hidden" name="channel" value={channel ?? ''} />

      <OnboardingShell
        step={sub + 2}
        onBack={sub > 0 ? back : undefined}
        footer={
          sub === SUBSTEPS - 1 ? (
            <button
              key="submit-btn"
              type="submit"
              className="btn-primary"
              disabled={pending || !canAdvance(sub)}
            >
              {pending ? 'Salvando…' : footerLabel}
            </button>
          ) : (
            <button
              key="next-btn"
              type="button"
              className="btn-primary"
              disabled={!canAdvance(sub)}
              onClick={next}
            >
              {footerLabel}
            </button>
          )
        }
      >
        <div
          className="steps-track"
          style={{ width: `${SUBSTEPS * 100}%`, transform: `translateX(-${sub * (100 / SUBSTEPS)}%)` }}
        >
          {/* Etapa 2 — Prepare sua Doopla */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 2 de 7</div>
            <h1 className="headline">
              Vamos preparar <em>sua Doopla.</em>
            </h1>
            <p className="sub">
              Vamos começar pelo essencial. Sua Doopla vai conhecer melhor seu jeito de trabalhar
              aos poucos.
            </p>

            <div className="field">
              <label htmlFor="f-nome-prof">Qual é o seu nome profissional?</label>
              <input
                type="text"
                id="f-nome-prof"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="Nome profissional"
              />
            </div>
            <div className="field">
              <label htmlFor="f-faz">O que você faz?</label>
              <input
                type="text"
                id="f-faz"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Ex.: DJ, fotógrafo, maquiador, creator..."
              />
            </div>
            <div className="field">
              <label htmlFor="f-cidade">Qual é sua cidade-base?</label>
              <input
                type="text"
                id="f-cidade"
                value={local}
                onChange={(e) => setLocal(e.target.value)}
                placeholder="Ex: São Paulo, SP"
              />
            </div>
            <div className="field">
              <label>Conte um pouco sobre o seu trabalho</label>
              <p className="hint" style={{ marginTop: '-4px', marginBottom: '10px' }}>
                Ajude sua Doopla a entender melhor como você trabalha.
              </p>
              <ConversationalField
                value={bio}
                onChange={setBio}
                placeholder="Ex.: conte o que você faz, como costuma trabalhar e o que considera importante..."
              />
            </div>
            <div className="field">
              <label htmlFor="f-link">Tem algum link profissional? (opcional)</label>
              <input
                type="text"
                id="f-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Instagram, site ou portfólio"
              />
            </div>
          </div>

          {/* Etapa 3 — Valores */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 3 de 7</div>
            <h1 className="headline">
              Seus <em>valores.</em>
            </h1>
            <p className="sub">
              O valor informado é uma referência para sua Doopla entender como você trabalha
              comercialmente — não é autorização pra fechar automaticamente nesse valor.
            </p>

            <div className="field">
              <label>Você tem um valor de referência para seu trabalho?</label>
              <div
                className={`option-card${priceChoice === 'valor' ? ' selected' : ''}`}
                onClick={() => setPriceChoice('valor')}
              >
                <div className="option-radio" />
                <div>
                  <div className="option-title">R$ [valor]</div>
                </div>
              </div>
              <div
                className={`option-card${priceChoice === 'depende' ? ' selected' : ''}`}
                onClick={() => setPriceChoice('depende')}
              >
                <div className="option-radio" />
                <div>
                  <div className="option-title">Depende do trabalho</div>
                </div>
              </div>
            </div>

            {priceChoice === 'valor' && (
              <div className="field">
                <label htmlFor="f-valor">Qual valor, aproximadamente?</label>
                <input
                  type="text"
                  id="f-valor"
                  value={feeValue}
                  onChange={(e) => setFeeValue(e.target.value)}
                  placeholder="Ex: R$ 2.500"
                />
              </div>
            )}

            {priceChoice === 'depende' && (
              <div className="field">
                <label>Como você costuma definir seus valores? (opcional)</label>
                <ConversationalField
                  value={pricingNotes}
                  onChange={setPricingNotes}
                  placeholder="Ex.: depende do cliente, duração, complexidade ou tipo de trabalho..."
                />
              </div>
            )}
          </div>

          {/* Etapa 4 — Como você trabalha */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 4 de 7</div>
            <h1 className="headline">
              Como <em>você trabalha.</em>
            </h1>
            <p className="sub">
              Contexto comercial e regras básicas que podem afetar como sua Doopla representa
              você.
            </p>

            <div className="field">
              <label>Você emite nota fiscal?</label>
              <div className="chip-group">
                <div
                  className={`chip${issuesInvoice === true ? ' selected' : ''}`}
                  onClick={() => setIssuesInvoice(true)}
                >
                  Sim
                </div>
                <div
                  className={`chip${issuesInvoice === false ? ' selected' : ''}`}
                  onClick={() => setIssuesInvoice(false)}
                >
                  Não
                </div>
              </div>
            </div>

            <div className="field">
              <label>Tem algo que sua Doopla sempre deve saber antes de negociar por você?</label>
              <p className="hint" style={{ marginTop: '-4px', marginBottom: '10px' }}>
                Pode ser uma preferência, condição ou algo que você sempre faz questão de aprovar.
              </p>
              <ConversationalField
                value={negotiationNotes}
                onChange={setNegotiationNotes}
                placeholder="Ex.: preferências, condições ou algo que você sempre faz questão de aprovar..."
              />
            </div>
          </div>

          {/* Etapa 5 — Como falar com você */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 5 de 7</div>
            <h1 className="headline">
              Como sua Doopla <em>fala com você.</em>
            </h1>
            <p className="sub">Quando sua Doopla precisar de você, como prefere ser avisado?</p>

            <div
              className={`option-card${channel === 'whatsapp' ? ' selected' : ''}`}
              onClick={() => setChannel('whatsapp')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">WhatsApp</div>
              </div>
            </div>
            <div
              className={`option-card${channel === 'painel' ? ' selected' : ''}`}
              onClick={() => setChannel('painel')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">Painel</div>
              </div>
            </div>
            <div
              className={`option-card${channel === 'ambos' ? ' selected' : ''}`}
              onClick={() => setChannel('ambos')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">WhatsApp + Painel</div>
              </div>
            </div>
          </div>

          {/* Etapa 6 — Conclusão */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 6 de 7</div>
            <div className="done-mark" />
            <h1 className="headline">
              Sua Doopla já tem o
              <br />
              necessário para <em>começar.</em>
            </h1>
            <p className="sub">
              Isso é só o começo. No painel, você pode contar mais sobre seus valores,
              preferências, contratos, materiais e seu jeito de trabalhar. Sua Doopla também vai
              perguntar quando precisar aprender algo novo.
            </p>

            {state.error && <div className="error">{state.error}</div>}

            <p
              style={{
                color: 'var(--offwhite)',
                fontWeight: 700,
                fontSize: '14.5px',
                lineHeight: 1.4,
              }}
            >
              Quanto mais vocês trabalham juntos, mais sua Doopla conhece você.
            </p>
          </div>
        </div>
      </OnboardingShell>
    </form>
  );
}
