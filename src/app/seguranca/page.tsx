import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Segurança | doopla',
  description:
    'Como a doopla protege artistas, bookers e clientes: identidade verificada, Doopla Verified e pagamento seguro.',
};

const PILLARS = [
  {
    anchor: 'identidade',
    title: 'Identidade verificada',
    desc: 'Artistas e bookers passam por etapas de verificação de identidade, incluindo dados pessoais e validação por foto.',
  },
  {
    anchor: 'verified',
    title: 'Doopla Verified',
    desc: 'Quando uma negociação é fechada, o cliente recebe um link para conferir e confirmar as condições combinadas. Depois da confirmação, o booking recebe o selo Doopla Verified.',
  },
  {
    anchor: 'pagamento-doopla',
    title: 'Pagamento Doopla',
    desc: 'Quando o Pagamento Doopla é utilizado, os dados de pagamento são disponibilizados ao cliente pelo canal oficial vinculado ao booking. Quem já tem relação de confiança também pode optar por manter o processo externo.',
  },
];

const FAQ: [string, string][] = [
  [
    'Como a doopla protege artistas, bookers e clientes?',
    'A doopla combina verificação de identidade, confirmação das condições do booking pelo cliente, registro do Doopla Verified, canal definido para informações de pagamento e mecanismos de denúncia e revisão de conta.',
  ],
  [
    'O que é Doopla Verified?',
    'É a confirmação de que o cliente recebeu as condições registradas do booking e declarou que elas correspondem ao que foi negociado. Doopla Verified não significa que o pagamento já foi realizado.',
  ],
  [
    'Precisa ter contrato para receber o Doopla Verified?',
    'Não. Quando houver contrato, ele pode fazer parte do processo. Mas o Doopla Verified confirma o booking e as condições negociadas, independentemente da existência de contrato.',
  ],
  [
    'Como sei onde devo realizar o pagamento?',
    'Os dados de pagamento válidos para o booking são disponibilizados somente pelo canal da doopla utilizado para a validação. Não realize pagamentos usando dados recebidos fora dessa conversa.',
  ],
  [
    'Sou obrigado a receber pela doopla?',
    'Não. Artistas e bookers que já possuem uma relação de confiança e um processo financeiro estabelecido podem optar pelo pagamento externo. Nesse caso, a doopla não acompanha, verifica ou se responsabiliza pelo pagamento.',
  ],
  [
    'Posso usar o Doopla Verified mesmo recebendo por fora?',
    'Sim. O Doopla Verified confirma que o cliente reconheceu o booking e as condições negociadas. Ele funciona independentemente de o pagamento ser realizado pela doopla ou fora da plataforma.',
  ],
  [
    'Já tenho um booker de confiança. Posso usar a doopla?',
    'Sim. Relações profissionais que já existem podem usar a doopla para organizar bookings, registrar negociações, obter a confirmação Doopla Verified, gerenciar contratos e, se desejarem, utilizar o fluxo de cobrança da plataforma.',
  ],
  [
    'Já tenho meus próprios artistas. Posso usar a doopla com eles?',
    'Sim. Bookers podem levar relações profissionais já existentes para a plataforma e utilizar as ferramentas de organização, validação e gestão disponíveis.',
  ],
  [
    'Qual é a diferença entre Doopla Verified e Pagamento Doopla?',
    'Doopla Verified confirma o acordo com o cliente. Pagamento Doopla é o fluxo financeiro opcional da plataforma. Um booking pode ser Doopla Verified e ter pagamento externo.',
  ],
  [
    'O que acontece se o cliente ainda não validar?',
    'O booking permanece como "Aguardando validação". O booker pode reenviar o link de validação. Artista e booker conseguem visualizar que a confirmação ainda não foi concluída.',
  ],
];

export default function SegurancaPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-14 bg-[var(--paper)] px-6 py-16 font-doopla-sans text-[var(--ink)] sm:py-24">
      <Link href="/" className="font-doopla-display text-xl font-semibold">
        doopla
      </Link>

      <header>
        <p className="font-doopla-mono text-[12px] uppercase tracking-[.16em] text-[var(--accent-ink)]">
          Segurança doopla
        </p>
        <h1 className="font-doopla-display mt-2 text-4xl font-semibold">
          Negocie. Valide. Trabalhe com mais segurança.
        </h1>
        <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--ink)]/70">
          A doopla cria etapas de proteção para artistas, bookers e clientes, da verificação dos
          profissionais à confirmação do booking.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PILLARS.map((p) => (
          <div key={p.title} id={p.anchor} className="scroll-mt-24 rounded-[16px] bg-white p-6">
            <h3 className="font-doopla-display text-[17px] font-semibold">{p.title}</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--ink)]/70">{p.desc}</p>
          </div>
        ))}
      </section>

      <section id="pagamento" className="scroll-mt-24 rounded-[20px] bg-[var(--ink)] p-10 text-center text-[var(--paper)]">
        <p className="font-doopla-mono text-[12px] uppercase tracking-[.16em] text-[var(--accent)]">
          Pagamento Doopla
        </p>
        <h2 className="font-doopla-display mx-auto mt-2 max-w-[22ch] text-[26px] font-semibold">
          Sem troca de conta no meio do caminho.
        </h2>
        <p className="mx-auto mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--paper)]/65">
          A doopla ajuda artista, booker e cliente a saberem exatamente para onde o pagamento deve
          ir. Com o Doopla Verified, os dados oficiais do booking ficam registrados em um link
          seguro da doopla.
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 border-b border-white/10 pb-6 text-[13px]">
          <span>✓ Artista contratado</span>
          <span>✓ Valor combinado</span>
          <span>✓ Dados do booking</span>
          <span>✓ Forma e destino do pagamento</span>
        </div>

        <div className="mt-6 rounded-[14px] border border-[var(--alert)]/40 bg-[var(--alert)]/15 p-5 text-left text-[13.5px] leading-relaxed text-[var(--paper)]/90">
          <strong className="font-doopla-display block text-[15px] text-[var(--paper)]">
            Mudou a conta por WhatsApp? Desconfie.
          </strong>
          A doopla e seus bookers nunca alteram dados bancários por mensagens ou links externos.
          Para sua segurança, considere válidas apenas as informações disponíveis no link oficial
          Doopla Verified.
        </div>

        <p className="font-doopla-display mt-6 text-[16px] font-semibold text-[var(--accent)]">
          Um booking. Uma fonte oficial de verdade.
        </p>
      </section>

      <section>
        <p className="font-doopla-mono text-[12px] uppercase tracking-[.16em] text-[var(--accent-ink)]">
          FAQ
        </p>
        <h2 className="font-doopla-display mt-2 text-2xl font-semibold">Segurança e pagamentos</h2>
        <div className="mt-6 flex flex-col gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-[14px] bg-white p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[14.5px] font-semibold">
                {q}
                <span className="font-doopla-mono flex-none text-[var(--accent-ink)] transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[var(--ink)]/70">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <p className="text-center text-[12px] leading-relaxed text-[var(--ink)]/50">
        Pagamentos realizados fora da doopla não são acompanhados, verificados ou de
        responsabilidade da plataforma.
      </p>

      <Link
        href="/"
        className="font-doopla-mono text-[11px] uppercase tracking-[.06em] text-[var(--ink)]/50 hover:text-[var(--ink)]"
      >
        ← Voltar pra doopla
      </Link>
    </main>
  );
}
