'use client';

import { useActionState, useState } from 'react';

import { WORK_REGIONS } from '@/lib/artist-categories';
import { OnboardingShell } from '../OnboardingShell';
import { savePrepareAction, type OnboardingFormState } from '../actions';
import '../onboarding.css';

const initialState: OnboardingFormState = {};
const SUBSTEPS = 5; // Etapas 2 a 6 (globais) = índices 0 a 4 aqui

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function formatCentsToInput(cents: number | null): string {
  if (cents === null) return '';
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Toggle "Escrever / Falar por áudio" do mockup. Captura de áudio ainda
// não existe de verdade — em vez de fingir uma gravação que descartaria
// a resposta da pessoa, o texto continua sendo o único jeito real de
// responder; o botão de áudio só avisa isso, honestamente, sem esconder
// o textarea nem construir uma UI de gravação falsa.
function TextOrAudioToggle({
  mode,
  onModeChange,
}: {
  mode: 'texto' | 'audio';
  onModeChange: (mode: 'texto' | 'audio') => void;
}) {
  return (
    <>
      <div className="input-toggle">
        <button
          type="button"
          className={`toggle-btn${mode === 'texto' ? ' active' : ''}`}
          onClick={() => onModeChange('texto')}
        >
          ✎ Escrever
        </button>
        <button
          type="button"
          className={`toggle-btn${mode === 'audio' ? ' active' : ''}`}
          onClick={() => onModeChange('audio')}
        >
          ◉ Falar por áudio
        </button>
      </div>
      {mode === 'audio' && (
        <div className="audio-note">
          Resposta por áudio ainda não está disponível — por enquanto, continue escrevendo aqui
          embaixo.
        </div>
      )}
    </>
  );
}

export function PrepareForm({
  initialStageName,
  initialProfession,
  initialLocal,
  initialRegions,
  initialBio,
  initialLink,
  initialFeeCents,
  initialFeeVaries,
  initialIssuesInvoice,
  initialDuration,
  initialNegotiationNotes,
  initialChannel,
}: {
  initialStageName: string;
  initialProfession: string;
  initialLocal: string;
  initialRegions: string[];
  initialBio: string;
  initialLink: string;
  initialFeeCents: number | null;
  initialFeeVaries: boolean | null;
  initialIssuesInvoice: boolean | null;
  initialDuration: string;
  initialNegotiationNotes: string;
  initialChannel: 'whatsapp' | 'painel' | 'ambos' | null;
}) {
  const [state, formAction, pending] = useActionState(savePrepareAction, initialState);
  const [sub, setSub] = useState(0);

  const [stageName, setStageName] = useState(initialStageName);
  const [profession, setProfession] = useState(initialProfession);
  const [local, setLocal] = useState(initialLocal);
  const [regions, setRegions] = useState<string[]>(initialRegions);
  const [bio, setBio] = useState(initialBio);
  const [bioMode, setBioMode] = useState<'texto' | 'audio'>('texto');
  const [link, setLink] = useState(initialLink);

  const [hasCache, setHasCache] = useState<'sim' | 'ainda-nao' | null>(
    initialFeeCents !== null ? 'sim' : null
  );
  const [feeValue, setFeeValue] = useState(formatCentsToInput(initialFeeCents));
  const [feeVaries, setFeeVaries] = useState<boolean | null>(initialFeeVaries);

  const [issuesInvoice, setIssuesInvoice] = useState<boolean | null>(initialIssuesInvoice);
  const [duration, setDuration] = useState(initialDuration);
  const [negotiationNotes, setNegotiationNotes] = useState(initialNegotiationNotes);
  const [notesMode, setNotesMode] = useState<'texto' | 'audio'>('texto');

  const [channel, setChannel] = useState<'whatsapp' | 'painel' | 'ambos' | null>(initialChannel);

  function canAdvance(s: number): boolean {
    if (s === 0) {
      return Boolean(stageName.trim() && profession.trim() && local.trim() && bio.trim());
    }
    if (s === 1) {
      return hasCache === 'ainda-nao' || (hasCache === 'sim' && feeValue.trim().length > 0);
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
      {regions.map((r) => (
        <input key={r} type="hidden" name="regions" value={r} />
      ))}
      <input type="hidden" name="bio" value={bio} />
      <input type="hidden" name="link" value={link} />
      <input type="hidden" name="hasCache" value={hasCache ?? ''} />
      <input type="hidden" name="feeValue" value={feeValue} />
      <input type="hidden" name="feeVaries" value={feeVaries === null ? '' : String(feeVaries)} />
      <input
        type="hidden"
        name="issuesInvoice"
        value={issuesInvoice === null ? '' : String(issuesInvoice)}
      />
      <input type="hidden" name="duration" value={duration} />
      <input type="hidden" name="negotiationNotes" value={negotiationNotes} />
      <input type="hidden" name="channel" value={channel ?? ''} />

      <OnboardingShell
        step={sub + 2}
        onBack={sub > 0 ? back : undefined}
        footer={
          sub === SUBSTEPS - 1 ? (
            <button type="submit" className="btn-primary" disabled={pending || !canAdvance(sub)}>
              {pending ? 'Salvando…' : footerLabel}
            </button>
          ) : (
            <button
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
        <div className="steps-track" style={{ width: `${SUBSTEPS * 100}%`, transform: `translateX(-${sub * (100 / SUBSTEPS)}%)` }}>
          {/* Etapa 2 — Prepare sua Doopla */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 2 de 7</div>
            <h1 className="headline">
              Vamos preparar <em>sua Doopla.</em>
            </h1>
            <p className="sub">Conte um pouco sobre o seu trabalho para ela saber como representar você.</p>

            <div className="field">
              <label htmlFor="f-artistico">Qual é o seu nome artístico?</label>
              <input
                type="text"
                id="f-artistico"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="Nome artístico"
              />
            </div>
            <div className="field">
              <label htmlFor="f-faz">O que você faz?</label>
              <input
                type="text"
                id="f-faz"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="Ex.: DJ, fotógrafo, banda, creator..."
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
              <label>Onde você costuma trabalhar?</label>
              <div className="chip-group">
                {WORK_REGIONS.map((r) => (
                  <div
                    key={r}
                    className={`chip${regions.includes(r) ? ' selected' : ''}`}
                    onClick={() => setRegions((prev) => toggle(prev, r))}
                  >
                    {r}
                  </div>
                ))}
              </div>
              <p className="hint">Isso ajuda sua Doopla a entender o alcance geográfico da sua atuação.</p>
            </div>
            <div className="field">
              <label>Conte um pouco sobre o seu trabalho</label>
              <p className="hint" style={{ marginTop: '-4px', marginBottom: '10px' }}>
                O que é importante sua Doopla saber sobre o que você faz?
              </p>
              <TextOrAudioToggle mode={bioMode} onModeChange={setBioMode} />
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Ex: Sou DJ de house e disco e trabalho principalmente em clubes, eventos corporativos e marcas."
              />
            </div>
            <div className="field">
              <label htmlFor="f-link">Tem um link profissional? (opcional)</label>
              <input
                type="text"
                id="f-link"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="Instagram, site ou portfólio"
              />
            </div>
          </div>

          {/* Etapa 3 — Cachê */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 3 de 7</div>
            <h1 className="headline">
              Fale sobre <em>seu cachê.</em>
            </h1>
            <p className="sub">Isso ajuda sua Doopla a negociar dentro da realidade do seu trabalho.</p>

            <div className="field">
              <label>Você já tem um cachê de referência?</label>
              <div
                className={`option-card${hasCache === 'sim' ? ' selected' : ''}`}
                onClick={() => setHasCache('sim')}
              >
                <div className="option-radio" />
                <div>
                  <div className="option-title">Sim</div>
                </div>
              </div>
              <div
                className={`option-card${hasCache === 'ainda-nao' ? ' selected' : ''}`}
                onClick={() => setHasCache('ainda-nao')}
              >
                <div className="option-radio" />
                <div>
                  <div className="option-title">Ainda não</div>
                </div>
              </div>
            </div>

            {hasCache === 'sim' && (
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

            <div className="field">
              <label>Seu cachê varia dependendo do trabalho?</label>
              <div className="chip-group">
                <div
                  className={`chip${feeVaries === true ? ' selected' : ''}`}
                  onClick={() => setFeeVaries(true)}
                >
                  Sim
                </div>
                <div
                  className={`chip${feeVaries === false ? ' selected' : ''}`}
                  onClick={() => setFeeVaries(false)}
                >
                  Não
                </div>
              </div>
              <p className="hint">Dá pra detalhar isso depois, no painel.</p>
            </div>

            <div className="disabled-note">
              Sua Doopla começa no modo Conservador: conduz a conversa e a negociação, mas sempre
              te consulta antes de fechar qualquer valor. Dá pra dar mais autonomia a ela depois,
              dentro de Minha Doopla.
            </div>
          </div>

          {/* Etapa 4 — Como você trabalha */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 4 de 7</div>
            <h1 className="headline">
              Como <em>você trabalha.</em>
            </h1>
            <p className="sub">Só o essencial pra sua Doopla conduzir um booking sem te interromper à toa.</p>

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
              <label htmlFor="f-duracao">Qual costuma ser a duração do seu trabalho?</label>
              <input
                type="text"
                id="f-duracao"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="Ex: 2 horas"
              />
            </div>

            <div className="field">
              <label>Tem algo que sua Doopla sempre deve saber antes de negociar por você?</label>
              <TextOrAudioToggle mode={notesMode} onModeChange={setNotesMode} />
              <textarea
                value={negotiationNotes}
                onChange={(e) => setNegotiationNotes(e.target.value)}
                placeholder="Ex: Em clube posso negociar mais. Para corporativo tenho outro valor."
              />
            </div>
          </div>

          {/* Etapa 5 — Canal de atenção */}
          <div className="ob-step" style={{ width: `${100 / SUBSTEPS}%`, flex: '0 0 auto' }}>
            <div className="eyebrow">Etapa 5 de 7</div>
            <h1 className="headline">
              Como sua Doopla <em>fala com você.</em>
            </h1>
            <p className="sub">Onde você prefere receber coisas que precisam da sua atenção.</p>

            <div
              className={`option-card${channel === 'whatsapp' ? ' selected' : ''}`}
              onClick={() => setChannel('whatsapp')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">WhatsApp</div>
                <div className="option-desc">Aprovações e alertas chegam direto na conversa com sua Doopla.</div>
              </div>
            </div>
            <div
              className={`option-card${channel === 'painel' ? ' selected' : ''}`}
              onClick={() => setChannel('painel')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">Painel</div>
                <div className="option-desc">Você confere quando abrir o app.</div>
              </div>
            </div>
            <div
              className={`option-card${channel === 'ambos' ? ' selected' : ''}`}
              onClick={() => setChannel('ambos')}
            >
              <div className="option-radio" />
              <div>
                <div className="option-title">WhatsApp + Painel</div>
                <div className="option-desc">O melhor dos dois. Muda quando quiser, no painel.</div>
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
            <p className="sub">O resto você completa quando fizer sentido, direto no painel.</p>

            {state.error && <div className="error">{state.error}</div>}

            <ul className="summary-list">
              <li>
                <span className="eyedot" />
                Riders (inclusive mais de um)
              </li>
              <li>
                <span className="eyedot" />
                Materiais e press kit
              </li>
              <li>
                <span className="eyedot" />
                Links e redes sociais
              </li>
              <li>
                <span className="eyedot" />
                Informações profissionais adicionais
              </li>
              <li>
                <span className="eyedot" />
                Preferências avançadas
              </li>
              <li>
                <span className="eyedot" />
                Dados de pagamento, quando surgir um booking
              </li>
            </ul>
          </div>
        </div>
      </OnboardingShell>
    </form>
  );
}
