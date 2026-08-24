'use client';

import { useState, type FormEvent } from 'react';

const CONTACT_EMAIL = 'contato@doopla.pro';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = `${message}\n\n---\nNome: ${name}\nE-mail: ${email}`;
    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject || 'Contato pelo site')}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="name">Nome</label>
        <input id="name" name="name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label htmlFor="email">E-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="subject">Assunto</label>
        <input id="subject" name="subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div>
        <label htmlFor="message">Mensagem</label>
        <textarea id="message" name="message" required value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <button type="submit">Enviar mensagem</button>
    </form>
  );
}
