'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { recordAgencyFunnelEventAction, submitAgencyApplicationAction } from './agency-application-actions';
import type { AgencyClassification, AgencyInterest } from '@/lib/agencies/types';

// Doopla — formulário de qualificação de agências (Home, seção
// "Doopla para Agências"). Mesma ilha React-do-lado-do-HTML-cru já
// usada em HomeLoginModal/HomeMenuOverlay (home.html não é React) —
// intercepta o clique em #agency-qualification-trigger via listener
// nativo, renderiza o card via portal (mesmo motivo de LoginModal:
// nunca refém do reset de CSS de #home-marketing).
//
// Etapa 1 (Perfil da agência — qualificação) + Etapa 2 (Identificação,
// com consentimento) são as únicas telas de ENTRADA. Ordem invertida
// de propósito (pedido da fundadora, redução de fricção): nunca pede
// identificação antes de mostrar valor — "Etapa 3: Classificação
// automática" do briefing original não é uma tela de formulário, é o
// resultado automático mostrado depois do envio (3 mensagens
// possíveis, por classification). Cargo (contactRole) é opcional.
// sessionToken é um valor aleatório persistido em localStorage, nunca
// dado pessoal — só agrupa os eventos de funil de uma mesma sessão de
// navegador.

const SESSION_TOKEN_KEY = 'doopla_agency_session_token';

function getSessionToken(): string {
  if (typeof window === 'undefined') return '';
  try {
    let token = window.localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
      token = crypto.randomUUID();
      window.localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    return token;
  } catch {
    // localStorage pode falhar (modo privado, bloqueio) — um token
    // só-desta-renderização ainda cobre os eventos desta sessão de
    // modal, só não persiste entre visitas.
    return crypto.randomUUID();
  }
}

type Step = 1 | 2;
type ViewState = { kind: 'form'; step: Step } | { kind: 'submitting' } | { kind: 'result'; classification: AgencyClassification } | { kind: 'error'; message: string };

type FormData = {
  agencyName: string;
  websiteOrInstagram: string;
  city: string;
  country: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  teamSize: string;
  artistsRepresented: string;
  monthlyRequestsVolume: string;
  interest: AgencyInterest | '';
  consent: boolean;
  honeypot: string;
};

const EMPTY_FORM: FormData = {
  agencyName: '',
  websiteOrInstagram: '',
  city: '',
  country: '',
  contactName: '',
  contactRole: '',
  contactEmail: '',
  teamSize: '',
  artistsRepresented: '',
  monthlyRequestsVolume: '',
  interest: '',
  consent: false,
  honeypot: '',
};

const RESULT_COPY: Record<AgencyClassification, { title: string; body: string }> = {
  priority: {
    title: 'Inscrição recebida.',
    body: 'Nosso time vai avaliar sua solicitação com atenção e pode entrar em contato em breve para os próximos passos.',
  },
  future_potential: {
    title: 'Obrigado pelo interesse!',
    body: 'O programa para agências está sendo disponibilizado gradualmente. Guardamos sua inscrição e avisamos assim que houver novidade.',
  },
  out_of_profile: {
    title: 'Obrigado pelo interesse em fazer parte da Doopla!',
    body: 'Neste momento, nosso programa de parcerias está direcionado a agências com operações mais estruturadas. Estamos sempre evoluindo e esperamos abrir novas possibilidades de colaboração no futuro.',
  },
};

export function AgencyQualificationModal() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<ViewState>({ kind: 'form', step: 1 });
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const submittedRef = useRef(false);
  const sessionTokenRef = useRef('');
  const triggerRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const sectionObservedRef = useRef(false);

  useEffect(() => {
    sessionTokenRef.current = getSessionToken();
  }, []);

  // Evento de funil "visualização da seção" — dispara uma única vez,
  // quando a própria seção #agencias entra na viewport, independente
  // de o formulário chegar a abrir.
  useEffect(() => {
    const section = document.getElementById('agencias');
    if (!section) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (sectionObservedRef.current) return;
        for (const entry of entries) {
          if (entry.isIntersecting) {
            sectionObservedRef.current = true;
            void recordAgencyFunnelEventAction({ eventType: 'section_view', sessionToken: sessionTokenRef.current || getSessionToken() });
            observer.disconnect();
          }
        }
      },
      { threshold: 0.4 }
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const trigger = document.getElementById('agency-qualification-trigger');
    if (!trigger) return;
    function handleClick(event: MouseEvent) {
      event.preventDefault();
      triggerRef.current = trigger;
      const token = sessionTokenRef.current || getSessionToken();
      void recordAgencyFunnelEventAction({ eventType: 'cta_click', sessionToken: token });
      void recordAgencyFunnelEventAction({ eventType: 'form_start', sessionToken: token });
      submittedRef.current = false;
      setForm(EMPTY_FORM);
      setView({ kind: 'form', step: 1 });
      setOpen(true);
    }
    trigger.addEventListener('click', handleClick);
    return () => trigger.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') handleClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function handleClose() {
    if (!submittedRef.current && view.kind === 'form') {
      void recordAgencyFunnelEventAction({ eventType: 'form_abandon', sessionToken: sessionTokenRef.current, step: view.step });
    }
    setOpen(false);
    triggerRef.current?.focus();
  }

  function update<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Etapa 1 = perfil/qualificação (reordenado — reduz fricção, nunca
  // pede identificação antes de mostrar valor). Cargo (contactRole)
  // nunca entra em nenhuma validação — é opcional.
  function step1Valid() {
    return form.teamSize.trim() && form.artistsRepresented.trim() && form.monthlyRequestsVolume.trim() && form.interest;
  }

  function step2Valid() {
    return (
      form.agencyName.trim() &&
      form.websiteOrInstagram.trim() &&
      form.city.trim() &&
      form.country.trim() &&
      form.contactName.trim() &&
      /.+@.+\..+/.test(form.contactEmail.trim()) &&
      form.consent
    );
  }

  function handleNext() {
    if (view.kind !== 'form') return;
    if (view.step === 1 && !step1Valid()) return;
    void recordAgencyFunnelEventAction({ eventType: 'form_step_completed', sessionToken: sessionTokenRef.current, step: view.step });
    setView({ kind: 'form', step: 2 });
  }

  function handleBack() {
    if (view.kind !== 'form') return;
    setView({ kind: 'form', step: 1 });
  }

  async function handleSubmit() {
    if (!step2Valid()) return;
    submittedRef.current = true;
    setView({ kind: 'submitting' });

    const result = await submitAgencyApplicationAction({
      agencyName: form.agencyName.trim(),
      websiteOrInstagram: form.websiteOrInstagram.trim(),
      city: form.city.trim(),
      country: form.country.trim(),
      contactName: form.contactName.trim(),
      contactRole: form.contactRole.trim(),
      contactEmail: form.contactEmail.trim(),
      teamSize: Number(form.teamSize),
      artistsRepresented: Number(form.artistsRepresented),
      monthlyRequestsVolume: Number(form.monthlyRequestsVolume),
      interest: form.interest as AgencyInterest,
      consent: true,
      sessionToken: sessionTokenRef.current,
      honeypot: form.honeypot,
    });

    if (result.status === 'success') {
      setView({ kind: 'result', classification: result.classification });
    } else {
      submittedRef.current = false;
      setView({ kind: 'error', message: result.message });
    }
  }

  if (!open) return null;

  return createPortal(
    <div id="site-chrome" className="pro-shell contents">
      <div className="fixed inset-0 z-[100] flex items-center justify-center px-4 py-6" role="presentation">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} aria-hidden="true" />

        <div
          ref={cardRef}
          role="dialog"
          aria-modal="true"
          aria-label="Programa Doopla para Agências"
          className="relative max-h-[92vh] w-full max-w-[520px] overflow-y-auto rounded-[24px] border border-[rgba(226,41,28,.3)] bg-[var(--pro-panel-solid)] p-7 shadow-[0_0_70px_rgba(226,41,28,.25)] sm:p-10"
        >
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full text-[var(--pro-tx-30)] hover:text-[var(--pro-off)]"
          >
            ✕
          </button>

          <span className="font-doopla-mono text-[11px] font-semibold uppercase tracking-[.16em] text-[var(--pro-red)]">
            Doopla para agências
          </span>

          {view.kind === 'form' && view.step === 1 && (
            <>
              <h2 className="mt-2 font-pro-display text-[26px] uppercase leading-[1.08] text-[var(--pro-off)] sm:text-[30px]">
                Vamos conhecer sua agência?
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--pro-tx-50)]">
                Responda algumas perguntas rápidas para descobrirmos as possibilidades de parceria com a Doopla.
              </p>

              <div className="mt-6 flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Pessoas na operação">
                    <input type="number" min={1} className={inputClass} value={form.teamSize} onChange={(e) => update('teamSize', e.target.value)} />
                  </Field>
                  <Field label="Artistas representados hoje">
                    <input type="number" min={0} className={inputClass} value={form.artistsRepresented} onChange={(e) => update('artistsRepresented', e.target.value)} />
                  </Field>
                </div>
                <Field label="Novas solicitações de representação por mês (aproximado)">
                  <input type="number" min={0} className={inputClass} value={form.monthlyRequestsVolume} onChange={(e) => update('monthlyRequestsVolume', e.target.value)} />
                </Field>
                <Field label="Principal interesse na parceria">
                  <div className="mt-1 flex flex-col gap-2">
                    {(
                      [
                        ['discovery_metrics', 'Descoberta de talentos e métricas'],
                        ['recurring_revenue', 'Receita recorrente'],
                        ['both', 'Ambos'],
                      ] as [AgencyInterest, string][]
                    ).map(([value, label]) => (
                      <label key={value} className="flex items-center gap-2.5 text-[13.5px] text-[var(--pro-off)]">
                        <input type="radio" name="interest" checked={form.interest === value} onChange={() => update('interest', value)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </Field>
              </div>

              <button
                type="button"
                onClick={handleNext}
                disabled={!step1Valid()}
                className="mt-7 w-full rounded-full bg-[var(--pro-red)] py-3 text-[13.5px] font-semibold text-white disabled:opacity-40"
              >
                Continuar
              </button>
            </>
          )}

          {view.kind === 'form' && view.step === 2 && (
            <>
              <h2 className="mt-2 font-pro-display text-[26px] uppercase leading-[1.08] text-[var(--pro-off)] sm:text-[30px]">
                Identificação
              </h2>
              <p className="mt-2 text-[13px] text-[var(--pro-tx-50)]">Etapa 2 de 2</p>

              <div className="mt-6 flex flex-col gap-4">
                <Field label="Nome da agência">
                  <input className={inputClass} value={form.agencyName} onChange={(e) => update('agencyName', e.target.value)} />
                </Field>
                <Field label="Site ou Instagram profissional">
                  <input className={inputClass} value={form.websiteOrInstagram} onChange={(e) => update('websiteOrInstagram', e.target.value)} placeholder="instagram.com/suaagencia" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Cidade">
                    <input className={inputClass} value={form.city} onChange={(e) => update('city', e.target.value)} />
                  </Field>
                  <Field label="País">
                    <input className={inputClass} value={form.country} onChange={(e) => update('country', e.target.value)} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nome do responsável">
                    <input className={inputClass} value={form.contactName} onChange={(e) => update('contactName', e.target.value)} />
                  </Field>
                  <Field label="Cargo (opcional)">
                    <input className={inputClass} value={form.contactRole} onChange={(e) => update('contactRole', e.target.value)} />
                  </Field>
                </div>
                <Field label="E-mail profissional">
                  <input type="email" className={inputClass} value={form.contactEmail} onChange={(e) => update('contactEmail', e.target.value)} />
                </Field>

                {/* Honeypot — invisível pra usuário real, bots de preenchimento tendem a preencher */}
                <div className="absolute -left-[9999px]" aria-hidden="true">
                  <input tabIndex={-1} autoComplete="off" value={form.honeypot} onChange={(e) => update('honeypot', e.target.value)} />
                </div>

                <label className="mt-1 flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[var(--pro-tx-50)]">
                  <input type="checkbox" className="mt-0.5" checked={form.consent} onChange={(e) => update('consent', e.target.checked)} />
                  Li e concordo com a{' '}
                  <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline text-[var(--pro-off)]">
                    Política de Privacidade
                  </a>{' '}
                  e autorizo a Doopla a entrar em contato sobre esta inscrição.
                </label>
              </div>

              <div className="mt-7 flex gap-3">
                <button type="button" onClick={handleBack} className="flex-1 rounded-full border border-[var(--pro-line)] py-3 text-[13.5px] font-semibold text-[var(--pro-off)]">
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!step2Valid()}
                  className="flex-[2] rounded-full bg-[var(--pro-red)] py-3 text-[13.5px] font-semibold text-white disabled:opacity-40"
                >
                  Enviar inscrição
                </button>
              </div>
            </>
          )}

          {view.kind === 'submitting' && (
            <p className="mt-10 text-center text-[13.5px] text-[var(--pro-tx-50)]">Enviando sua inscrição…</p>
          )}

          {view.kind === 'result' && (
            <>
              <h2 className="mt-2 font-pro-display text-[24px] uppercase leading-[1.1] text-[var(--pro-off)] sm:text-[28px]">
                {RESULT_COPY[view.classification].title}
              </h2>
              <p className="mt-4 text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">{RESULT_COPY[view.classification].body}</p>
              <button type="button" onClick={handleClose} className="mt-7 w-full rounded-full border border-[var(--pro-line)] py-3 text-[13.5px] font-semibold text-[var(--pro-off)]">
                Fechar
              </button>
            </>
          )}

          {view.kind === 'error' && (
            <>
              <h2 className="mt-2 font-pro-display text-[22px] uppercase leading-[1.1] text-[var(--pro-off)]">Algo deu errado</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--pro-tx-50)]">{view.message}</p>
              <button
                type="button"
                onClick={() => setView({ kind: 'form', step: 2 })}
                className="mt-7 w-full rounded-full bg-[var(--pro-red)] py-3 text-[13.5px] font-semibold text-white"
              >
                Tentar de novo
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

const inputClass =
  'w-full rounded-[12px] border border-[var(--pro-line)] bg-black/20 px-3.5 py-2.5 text-[13.5px] text-[var(--pro-off)] outline-none focus:border-[var(--pro-red)]';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[11.5px] font-semibold uppercase tracking-[.04em] text-[var(--pro-tx-50)]">
      {label}
      {children}
    </label>
  );
}
