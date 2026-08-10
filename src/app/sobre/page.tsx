import type { Metadata } from 'next';

import { LegalPage } from '../_home/legal-page';

export const metadata: Metadata = {
  title: 'doopla, quem somos',
  description:
    'Por que a doopla existe: uma nova forma de representação para profissionais independentes.',
};

export default function SobrePage() {
  return (
    <LegalPage eyebrow="quem somos" title="Sobre a doopla">
      <h2>Por que a doopla existe</h2>
      <p>
        A Doopla nasceu de uma cena que se repete no mercado: profissionais
        independentes criando um &quot;empresário&quot; fictício para
        negociar cachê, responder propostas e cobrar clientes sem precisar
        fazer isso em nome próprio.
      </p>
      <p>Não é coincidência. É um sintoma.</p>
      <p>
        O modelo tradicional de representação tem um limite: depende de
        tempo e estrutura humana. Por isso, agências precisam concentrar
        seus esforços em quem já movimenta dinheiro suficiente para
        justificar essa operação.
      </p>
      <p>
        Como consequência, milhares de profissionais ficam sem
        representação, não por falta de talento ou trabalho, mas porque
        ainda não fazem sentido para a estrutura tradicional.
      </p>
      <p>
        Do outro lado, existem pessoas com contatos, experiência e
        capacidade comercial que poderiam representar esses profissionais e
        ganhar por isso, mas não existe uma forma simples e estruturada de
        conectar essas duas pontas.
      </p>
      <p>A Doopla nasceu para criar essa conexão.</p>
      <p>
        Um marketplace onde profissionais independentes encontram quem
        possa representá-los, e representantes transformam sua rede e
        capacidade comercial em renda.
      </p>
      <p>Sem precisar pertencer a uma agência.</p>
      <p>Sem precisar entregar a carreira inteira para uma única pessoa.</p>
      <p>Sem precisar fingir que existe um empresário quando ele não existe.</p>
      <p style={{ fontWeight: 600 }}>Uma nova forma de representação.</p>

      <h2>O que guia a doopla</h2>
      <p>
        <strong>Representação exige consentimento.</strong> Ninguém
        representa ninguém sem que os dois lados concordem.
      </p>
      <p>
        <strong>Independência vem primeiro.</strong> Cada profissional
        decide com quem trabalha, em quais oportunidades e por quanto
        tempo.
      </p>
      <p>
        <strong>Quem trabalha, ganha.</strong> Representantes são
        remunerados pelo trabalho que efetivamente assumem e realizam.
      </p>
      <p>
        <strong>Tecnologia por trás. Simplicidade na frente.</strong>{' '}
        Propostas, contratos, pagamentos, histórico e organização existem
        para tornar a relação mais simples, não mais burocrática.
      </p>
      <p style={{ fontWeight: 600 }}>Toda carreira merece representação.</p>

      <h2>Onde estamos</h2>
      <p>A Doopla está começando.</p>
      <p>
        Não prometemos trabalho garantido e não fingimos ser maiores do
        que somos.
      </p>
      <p>
        Estamos construindo uma nova infraestrutura para conectar duas
        pontas que sempre existiram, mas que ainda não tinham uma forma
        eficiente de trabalhar juntas: quem precisa de representação e
        quem sabe representar.
      </p>
      <p>Se você está de um desses lados, sua dupla pode estar aqui.</p>
    </LegalPage>
  );
}
