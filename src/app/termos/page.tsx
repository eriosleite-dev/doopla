import type { Metadata } from 'next';

import { LegalPage } from '../_home/legal-page';

export const metadata: Metadata = {
  title: 'doopla, termos de uso',
};

export default function TermosPage() {
  return (
    <LegalPage
      eyebrow="documento legal"
      title="Termos de uso"
      updated="Última atualização: agosto de 2026"
      notice={
        <>
          <strong>Este é um texto preliminar de validação.</strong> Ainda não
          passou por revisão jurídica formal e não deve ser tratado como
          versão final antes do lançamento público da doopla.
        </>
      }
    >
      <h2>1. Sobre a doopla</h2>
      <p>
        A doopla é uma plataforma que conecta artistas e profissionais
        independentes (&quot;artistas&quot;) a representantes
        (&quot;bookers&quot;), fornecendo infraestrutura para negociação,
        propostas, contratos, pagamentos e histórico dessas relações. A
        doopla não é uma agência e não representa artistas diretamente.
      </p>

      <h2>2. Cadastro e elegibilidade</h2>
      <p>
        Para usar a doopla, você precisa criar uma conta como artista,
        booker ou agência, fornecendo informações verdadeiras e
        atualizadas. Você é responsável por manter a segurança da sua
        conta e por tudo que acontece através dela.
      </p>

      <h2>3. Como funciona a representação</h2>
      <p>
        Toda relação de representação na doopla exige consentimento mútuo.
        Nenhum booker pode representar um artista sem que essa relação seja
        confirmada por ambas as partes. A comissão de cada booking é
        negociada individualmente entre artista e booker, e fica
        registrada antes do fechamento do trabalho.
      </p>

      <h2>4. Pagamentos e comissões</h2>
      <p>
        Os pagamentos processados através da doopla passam pela conta
        centralizada da plataforma. A distribuição entre artista, booker e
        taxas da doopla segue o modelo vigente descrito na página de
        planos. A doopla pode alterar esse modelo mediante aviso prévio.
      </p>

      <h2>5. Responsabilidades do usuário</h2>
      <ul>
        <li>
          Não usar a plataforma para atividades fraudulentas, spam ou
          abordagens indiscriminadas.
        </li>
        <li>
          Não tentar contornar o pagamento ou a estrutura de comissões da
          doopla.
        </li>
        <li>
          Manter comportamento profissional nas negociações realizadas
          pela plataforma.
        </li>
      </ul>

      <h2>6. Suspensão e encerramento de conta</h2>
      <p>
        A doopla pode suspender ou encerrar contas que violem estes
        termos, incluindo casos de fraude, spam confirmado ou
        comportamento abusivo, podendo reter comissões pendentes
        vinculadas à violação.
      </p>

      <h2>7. Propriedade intelectual</h2>
      <p>
        A marca doopla, seu logotipo e sua identidade visual pertencem à
        doopla. O conteúdo enviado por artistas e bookers (perfis,
        propostas, materiais) permanece de propriedade de quem o enviou.
      </p>

      <h2>8. Limitação de responsabilidade</h2>
      <p>
        A doopla fornece a infraestrutura para a relação entre artista e
        booker, mas não garante a realização de trabalhos, nem se
        responsabiliza pela qualidade da representação prestada por
        terceiros na plataforma.
      </p>

      <h2>9. Alterações nestes termos</h2>
      <p>
        Estes termos podem ser atualizados conforme a doopla evolui.
        Mudanças relevantes serão comunicadas aos usuários com
        antecedência razoável.
      </p>

      <h2>10. Contato</h2>
      <p>
        Dúvidas sobre estes termos podem ser enviadas pelos canais de
        contato disponíveis no site.
      </p>
    </LegalPage>
  );
}
