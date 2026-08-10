import type { Metadata } from 'next';

import { LegalPage } from '../_home/legal-page';

export const metadata: Metadata = {
  title: 'doopla, política de privacidade',
};

export default function PrivacidadePage() {
  return (
    <LegalPage
      eyebrow="documento legal"
      title="Política de privacidade"
      updated="Última atualização: agosto de 2026"
      notice={
        <>
          <strong>Este é um texto preliminar de validação.</strong> Ainda não
          passou por revisão jurídica formal e não deve ser tratado como
          versão final antes do lançamento público da doopla.
        </>
      }
    >
      <h2>1. Quais dados coletamos</h2>
      <p>
        Coletamos os dados que você fornece ao criar sua conta (nome,
        e-mail, tipo de perfil, informações profissionais como mercados de
        atuação e cidades), além de dados gerados pelo uso da plataforma,
        como propostas, negociações, comissões e histórico de bookings.
      </p>

      <h2>2. Como usamos seus dados</h2>
      <ul>
        <li>Para viabilizar o cadastro, o login e o funcionamento da conta.</li>
        <li>
          Para conectar artistas e bookers com base em mercado, nicho e
          território.
        </li>
        <li>
          Para processar pagamentos e comissões de forma centralizada e
          segura.
        </li>
        <li>
          Para prevenir fraude, spam e comportamento abusivo na
          plataforma.
        </li>
      </ul>

      <h2>3. Base legal (LGPD)</h2>
      <p>
        O tratamento dos seus dados se baseia principalmente na execução
        do contrato entre você e a doopla (para viabilizar o cadastro e as
        negociações) e no legítimo interesse da plataforma (para
        segurança, prevenção de fraude e melhoria do serviço).
      </p>

      <h2>4. Com quem compartilhamos dados</h2>
      <p>
        Compartilhamos dados com prestadores essenciais ao funcionamento
        da doopla, como o processador de pagamentos, e com a outra parte
        de uma negociação (artista e booker enxergam informações
        relevantes um do outro apenas após a relação ser confirmada). Não
        vendemos dados pessoais a terceiros.
      </p>

      <h2>5. Segurança dos dados</h2>
      <p>
        Pagamentos são sempre processados de forma centralizada pela
        doopla, nunca diretamente entre artista e booker. Adotamos
        medidas técnicas e organizacionais razoáveis para proteger seus
        dados contra acesso não autorizado.
      </p>

      <h2>6. Seus direitos como titular</h2>
      <p>
        Você pode solicitar a qualquer momento a confirmação, o acesso, a
        correção ou a exclusão dos seus dados pessoais, nos termos da Lei
        Geral de Proteção de Dados (LGPD), através dos canais de contato
        disponíveis no site.
      </p>

      <h2>7. Retenção de dados</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa e pelo
        período necessário para cumprir obrigações legais, fiscais ou
        contratuais, como histórico de pagamentos e comissões.
      </p>

      <h2>8. Alterações nesta política</h2>
      <p>
        Esta política pode ser atualizada conforme a doopla evolui.
        Mudanças relevantes serão comunicadas aos usuários com
        antecedência razoável.
      </p>

      <h2>9. Contato</h2>
      <p>
        Dúvidas sobre esta política ou solicitações relacionadas aos seus
        dados podem ser enviadas pelos canais de contato disponíveis no
        site.
      </p>
    </LegalPage>
  );
}
