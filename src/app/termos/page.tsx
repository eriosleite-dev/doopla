import type { Metadata } from 'next';
import Link from 'next/link';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Termos de Uso — Doopla',
  description: 'Regras para utilização da plataforma Doopla.',
};

const UPDATED = '15 de setembro de 2026';

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
            A Doopla é uma plataforma digital de agenciamento para
            profissionais independentes que utiliza tecnologia e
            inteligência artificial para encontrar oportunidades de trabalho
            e conduzir atividades comerciais e operacionais, incluindo
            atendimento a clientes, negociação, acompanhamento de conversas,
            organização de trabalhos e geração de documentos.
          </p>

          <h2>2. Conta do usuário</h2>
          <p>
            O usuário é responsável por fornecer informações verdadeiras e
            manter seus dados de acesso protegidos e atualizados.
          </p>

          <h2>3. Uso da inteligência artificial</h2>
          <p>
            A Doopla utiliza sistemas de inteligência artificial para
            executar determinadas atividades em nome do usuário, de acordo
            com as informações, preferências, condições e autorizações
            fornecidas por ele.
          </p>
          <p>
            A Doopla pode conduzir atendimentos, negociações e outras etapas
            relacionadas aos trabalhos do usuário dentro dos limites
            aplicáveis. Decisões que exijam autorização do usuário devem ser
            submetidas à sua aprovação antes de serem confirmadas.
          </p>

          <h2>4. Informações fornecidas pelo usuário</h2>
          <p>
            O usuário é responsável pela veracidade das informações
            fornecidas à plataforma, incluindo valores, disponibilidade,
            dados profissionais, condições comerciais, preferências e demais
            orientações utilizadas pela Doopla na condução dos trabalhos.
          </p>

          <h2>5. Negociações e trabalhos</h2>
          <p>
            A Doopla utiliza tecnologia e inteligência artificial para
            conduzir e organizar etapas relacionadas a oportunidades,
            negociações e trabalhos do usuário.
          </p>
          <p>
            As condições finais que dependam de autorização do profissional
            devem ser aprovadas conforme o fluxo aplicável antes de serem
            confirmadas.
          </p>

          <h2>6. Pagamentos</h2>
          <p>
            Quando o pagamento de um trabalho ocorrer diretamente entre
            contratante e profissional, a Doopla não atua como instituição
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
