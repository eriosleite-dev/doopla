'use client';

import { useActionState, useEffect, useRef, useState } from 'react';

import { OnboardingShell } from '../OnboardingShell';
import { savePrepareAction, type OnboardingFormState } from '../actions';
import '../onboarding.css';

const initialState: OnboardingFormState = {};
const SUBSTEPS = 4; // Etapas 2 a 5 (globais) = índices 0 a 3 aqui

// Rola o ancestral rolável mais próximo de volta pro topo — usado ao
// trocar de sub-etapa (carrossel horizontal por transform, que não mexe
// no scroll vertical sozinho). Genérico de propósito: em /cadastro/
// preparar standalone quem rola é a PÁGINA (window); dentro do modal da
// Home (boxed=true) quem rola é o miolo interno do card
// (CreateAccountModal.tsx) — sem acoplar este componente a nenhum dos
// dois contextos, só sobe a árvore até achar quem realmente tem scroll.
function scrollNearestScrollableToTop(el: HTMLElement | null) {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      node.scrollTo({ top: 0 });
      return;
    }
    node = node.parentElement;
  }
  window.scrollTo({ top: 0 });
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
  initialNegotiationNotes,
  initialChannel,
  modalMode = false,
  onStepComplete,
  boxed = false,
}: {
  initialStageName: string;
  initialProfession: string;
  initialLocal: string;
  initialBio: string;
  initialLink: string;
  initialNegotiationNotes: string;
  initialChannel: 'whatsapp' | 'painel' | 'ambos' | null;
  // Funil iniciado no modal da Home (ver CreateAccountModal.tsx) — quando
  // true, savePrepareAction não faz redirect() (ver cadastro/actions.ts);
  // este componente detecta o sucesso via state.success e chama
  // onStepComplete() em vez de deixar o framework navegar. Sem isso
  // (uso normal em /cadastro/preparar), o comportamento é 100% o de
  // sempre — mesmo componente, mesma etapa, dois contextos de disparo.
  modalMode?: boolean;
  onStepComplete?: () => void;
  // Repassado direto pro OnboardingShell — ver onboarding.css.
  boxed?: boolean;
}) {
  const [state, formAction, pending] = useActionState(savePrepareAction, initialState);
  const [sub, setSub] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (modalMode && state.success) onStepComplete?.();
  }, [modalMode, state.success, onStepComplete]);

  useEffect(() => {
    scrollNearestScrollableToTop(formRef.current);
  }, [sub]);

  const [stageName, setStageName] = useState(initialStageName);
  const [profession, setProfession] = useState(initialProfession);
  const [local, setLocal] = useState(initialLocal);
  const [bio, setBio] = useState(initialBio);
  const [link, setLink] = useState(initialLink);

  const [negotiationNotes, setNegotiationNotes] = useState(initialNegotiationNotes);

  const [channel, setChannel] = useState<'whatsapp' | 'painel' | 'ambos' | null>(initialChannel);

  function canAdvance(s: number): boolean {
    if (s === 0) {
      return Boolean(stageName.trim() && profession.trim() && local.trim() && bio.trim());
    }
    if (s === 2) {
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
    <form ref={formRef} action={formAction}>
      {modalMode && <input type="hidden" name="modalMode" value="1" />}
      <input type="hidden" name="stageName" value={stageName} />
      <input type="hidden" name="profession" value={profession} />
      <input type="hidden" name="local" value={local} />
      <input type="hidden" name="bio" value={bio} />
      <input type="hidden" name="link" value={link} />
      <input type="hidden" name="negotiationNotes" value={negotiationNotes} />
      <input type="hidden" name="channel" value={channel ?? ''} />

      <OnboardingShell
        step={sub + 2}
        boxed={boxed}
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
            <div className="eyebrow">Etapa 2 de 6</div>
            <h1 className="headline">Vamos preparar sua Doopla.</h1>
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

          {/* Etapa 3 — Como você trabalha */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 3 de 6</div>
            <h1 className="headline">Como você trabalha.</h1>
            <p className="sub">
              Contexto comercial e regras básicas que podem afetar como sua Doopla representa
              você.
            </p>

            <div className="field">
              <label>Tem algo que sua Doopla sempre deve saber antes de negociar por você? (opcional)</label>
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

          {/* Etapa 4 — Como falar com você */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 4 de 6</div>
            <h1 className="headline">Como sua Doopla fala com você.</h1>
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

          {/* Etapa 5 — Conclusão */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 5 de 6</div>
            <div className="done-mark" />
            <h1 className="headline">
              Sua Doopla já tem o
              <br />
              necessário para começar.
            </h1>
            <p className="sub">
              Isso é só o começo. No painel, você pode contar mais sobre seus valores,
              preferências, contratos, materiais e seu jeito de trabalhar. Sua Doopla também vai
              perguntar quando precisar aprender algo novo.
            </p>

            {state.error && <div className="error">{state.error}</div>}

            <p
              style={{
                color: 'var(--off)',
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
