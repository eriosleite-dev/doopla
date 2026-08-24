import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Termos de Uso — Doopla',
  description: 'Regras para utilização da plataforma Doopla.',
};

const UPDATED = '20 de agosto de 2026';

export default function TermosPage() {
  return (
    <PageShell>
      <section className="legal-content">
        <div className="inner">
          <span className="eyebrow">Legal</span>
          <h1>Termos de Uso</h1>
          <div className="updated">Última atualização: {UPDATED}</div>

          <p>
            Estes Termos de Uso estabelecem as regras para utilização da
            plataforma Doopla.
          </p>
          <p>
            Ao criar uma conta ou utilizar nossos serviços, você declara que
            leu e concorda com estes Termos e com nossa{' '}
            <Link href="/privacidade">Política de Privacidade</Link>.
          </p>

          <h2>1. O que é a Doopla</h2>
          <p>
            A Doopla é uma plataforma digital que utiliza tecnologia e
            inteligência artificial para auxiliar artistas independentes na
            gestão e condução de atividades relacionadas a bookings,
            incluindo comunicação com clientes, negociação, follow-up,
            organização de informações e geração de documentos.
          </p>

          <h2>2. Conta do usuário</h2>
          <p>
            O usuário é responsável por fornecer informações verdadeiras e
            manter seus dados de acesso protegidos e atualizados.
          </p>

          <h2>3. Uso da inteligência artificial</h2>
          <p>
            A Doopla utiliza sistemas de inteligência artificial para
            executar determinadas atividades em nome do usuário e de acordo
            com as informações, preferências e autorizações fornecidas por
            ele.
          </p>
          <p>
            A tecnologia pode auxiliar na comunicação e organização das
            negociações, mas determinadas decisões comerciais podem depender
            da aprovação do usuário.
          </p>

          <h2>4. Informações fornecidas pelo usuário</h2>
          <p>
            O usuário é responsável pela veracidade das informações
            fornecidas à plataforma, incluindo valores, disponibilidade,
            dados profissionais, riders, condições comerciais e demais
            orientações utilizadas na condução dos bookings.
          </p>

          <h2>5. Negociações e bookings</h2>
          <p>
            A Doopla fornece tecnologia para auxiliar na condução e
            organização de bookings.
          </p>
          <p>
            As condições finais acordadas entre artista e contratante devem
            ser verificadas e aprovadas conforme o fluxo aplicável antes da
            conclusão do booking.
          </p>

          <h2>6. Pagamentos</h2>
          <p>
            Quando o pagamento do booking ocorrer diretamente entre
            contratante e artista, a Doopla não atua como instituição
            financeira nem recebe, mantém ou transfere esses valores.
          </p>

          <h2>7. Planos e assinatura</h2>
          <p>
            Os recursos disponíveis podem variar conforme o plano contratado.
          </p>
          <p>
            Preços, funcionalidades e condições aplicáveis são apresentados
            antes da contratação.
          </p>

          <h2>8. Uso adequado</h2>
          <p>
            A plataforma não pode ser utilizada para fraude, falsidade,
            atividades ilegais, tentativa de acesso indevido ou qualquer uso
            que prejudique outros usuários, clientes ou a própria Doopla.
          </p>

          <h2>9. Disponibilidade do serviço</h2>
          <p>
            Serviços digitais podem sofrer interrupções, falhas ou
            indisponibilidades temporárias.
          </p>
          <p>
            A Doopla trabalha para manter o serviço disponível e corrigir
            problemas quando identificados.
          </p>

          <h2>10. Privacidade</h2>
          <p>
            O tratamento de dados pessoais é explicado na{' '}
            <Link href="/privacidade">Política de Privacidade</Link> da
            Doopla.
          </p>

          <h2>11. Alterações</h2>
          <p>
            Estes Termos poderão ser atualizados para refletir mudanças no
            produto, na legislação ou na operação da Doopla.
          </p>
          <p>
            Quando necessário, alterações relevantes serão comunicadas aos
            usuários.
          </p>

          <h2>12. Contato</h2>
          <p>
            Dúvidas relacionadas a estes Termos podem ser enviadas para{' '}
            <a href="mailto:contato@doopla.pro">contato@doopla.pro</a>.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
