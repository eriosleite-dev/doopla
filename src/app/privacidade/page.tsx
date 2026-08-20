import type { Metadata } from 'next';

import { PageShell } from '../_home/PageShell';

export const metadata: Metadata = {
  title: 'Política de Privacidade — Doopla',
  description: 'Como a Doopla coleta, utiliza e protege informações pessoais.',
};

const UPDATED = '20 de agosto de 2026';

export default function PrivacidadePage() {
  return (
    <PageShell>
      <section className="legal-content">
        <div className="inner">
          <span className="eyebrow">Legal</span>
          <h1>Política de Privacidade</h1>
          <div className="updated">Última atualização: {UPDATED}</div>

          <p>
            Esta Política explica como a Doopla coleta, utiliza e protege
            informações pessoais durante o uso da plataforma e de seus
            serviços.
          </p>

          <h2>1. Informações que podemos coletar</h2>
          <p>
            Podemos tratar informações fornecidas pelo usuário durante o
            cadastro e uso da plataforma, informações profissionais
            necessárias para a prestação do serviço, preferências
            configuradas pelo usuário e dados relacionados às interações
            realizadas por meio da Doopla.
          </p>

          <h2>2. Como utilizamos essas informações</h2>
          <p>As informações podem ser utilizadas para:</p>
          <ul>
            <li>criar e manter sua conta;</li>
            <li>prestar os serviços contratados;</li>
            <li>personalizar o funcionamento da sua Doopla;</li>
            <li>conduzir e organizar interações relacionadas a bookings;</li>
            <li>gerar documentos e comunicações solicitadas;</li>
            <li>prestar suporte;</li>
            <li>melhorar segurança e funcionamento da plataforma;</li>
            <li>cumprir obrigações legais.</li>
          </ul>

          <h2>3. Inteligência artificial</h2>
          <p>
            Determinadas informações podem ser processadas por sistemas de
            inteligência artificial para permitir funcionalidades da Doopla,
            como interpretação de solicitações, assistência em negociações,
            organização de informações e geração de comunicações.
          </p>

          <h2>4. Serviços de terceiros</h2>
          <p>
            A operação da Doopla pode utilizar fornecedores de tecnologia
            necessários para hospedagem, comunicação, autenticação,
            armazenamento, inteligência artificial e outros componentes da
            plataforma.
          </p>
          <p>
            Esses fornecedores recebem apenas os dados necessários à
            prestação dos respectivos serviços, conforme aplicável.
          </p>

          <h2>5. Compartilhamento</h2>
          <p>A Doopla não vende dados pessoais.</p>
          <p>
            Informações poderão ser compartilhadas quando necessário para
            prestar o serviço, cumprir obrigação legal, proteger a
            plataforma ou mediante autorização do usuário, conforme
            aplicável.
          </p>

          <h2>6. Segurança</h2>
          <p>
            Adotamos medidas técnicas e organizacionais destinadas a proteger
            as informações tratadas pela plataforma.
          </p>
          <p>
            Nenhum sistema digital é completamente imune a riscos, mas
            buscamos reduzir acessos, usos e divulgações não autorizados.
          </p>

          <h2>7. Retenção</h2>
          <p>
            As informações são mantidas pelo período necessário para prestar
            os serviços, cumprir obrigações legais e atender às finalidades
            descritas nesta Política.
          </p>

          <h2>8. Direitos do titular</h2>
          <p>
            O usuário poderá solicitar informações e exercer os direitos
            previstos na legislação de proteção de dados aplicável,
            incluindo a LGPD.
          </p>

          <h2>9. Alterações desta Política</h2>
          <p>
            Esta Política poderá ser atualizada conforme o produto, nossa
            operação ou requisitos legais evoluam.
          </p>

          <h2>10. Contato sobre privacidade</h2>
          <p>
            Solicitações relacionadas a dados pessoais e privacidade poderão
            ser enviadas para{' '}
            <a href="mailto:contato@doopla.pro">contato@doopla.pro</a>.
          </p>
        </div>
      </section>
    </PageShell>
  );
}
