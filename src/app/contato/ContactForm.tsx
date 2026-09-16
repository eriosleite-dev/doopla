'use client';

import { useActionState, useEffect, useRef } from 'react';

import { sendContactMessageAction, type ContactFormState } from './actions';

const initialState: ContactFormState = {};

export function ContactForm() {
  const [state, formAction, pending] = useActionState(sendContactMessageAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  // Só limpa o formulário quando o envio deu certo — em erro, os campos
  // continuam preenchidos do jeito que a pessoa deixou (inputs não
  // controlados: o React não reseta o DOM sozinho num re-render).
  useEffect(() => {
    if (state.status === 'success') {
      formRef.current?.reset();
    }
  }, [state.status]);

  return (
    <form ref={formRef} className="contact-form" action={formAction}>
      {/* Honeypot: invisível pra pessoas (CSS + fora da ordem de tab),
          mas bots de preenchimento automático tendem a preenchê-lo. */}
      <div className="hp-field" aria-hidden="true">
        <label htmlFor="company">Empresa</label>
        <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div>
        <label htmlFor="name">Nome</label>
        <input
          id="name"
          name="name"
          required
          defaultValue={state.values?.name}
          disabled={pending}
          autoComplete="name"
        />
      </div>
      <div>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={state.values?.email}
          disabled={pending}
          autoComplete="email"
        />
      </div>
      <div>
        <label htmlFor="subject">Assunto</label>
        <input
          id="subject"
          name="subject"
          required
          defaultValue={state.values?.subject}
          disabled={pending}
        />
      </div>
      <div>
        <label htmlFor="message">Mensagem</label>
        <textarea
          id="message"
          name="message"
          required
          defaultValue={state.values?.message}
          disabled={pending}
        />
      </div>

      <div aria-live="polite">
        {state.status === 'error' && (
          <p role="alert" className="form-message form-message-error">
            {state.message}
          </p>
        )}
        {state.status === 'success' && (
          <p role="status" className="form-message form-message-success">
            Mensagem enviada. A Doopla vai te responder em breve.
          </p>
        )}
      </div>

      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? 'Enviando…' : 'Enviar mensagem'}
      </button>
    </form>
  );
}
