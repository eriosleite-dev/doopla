import { redirect } from 'next/navigation';

// Rota legada (15/09/2026) — "Excluir minha conta" já vive inline em
// Configurações via DeleteAccountModal (decisão de 14/09/2026, ver
// delete-account-modal.tsx), que reusa o MESMO DeleteAccountForm desta
// pasta e já mostra o mesmo texto detalhado (assinatura/bookings/
// booker/Comunidade/canais) no passo 'form' do modal — o comentário
// original deste arquivo ("única tela que fala sobre isso") ficou
// desatualizado quando o modal foi criado. Sem conteúdo próprio que
// ainda faça sentido, essa rota vira redirect. DeleteAccountForm
// preservado (arquivo intocado, DeleteAccountModal continua
// importando direto dele) — nada de infraestrutura foi apagado.
export default function ExcluirContaRedirectPage() {
  redirect('/dashboard/perfil');
}
