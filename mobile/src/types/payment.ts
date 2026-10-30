// Espelha payment_details (migration 0046). O modelo de saque/carteira
// (payout_requests, migration 0014) foi removido do produto — ver
// DECISOES.md — não existe mais tipo correspondente aqui.
export type PixKeyType = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

export type PaymentDetails = {
  id: string;
  profile_id: string;
  method: 'pix';
  pix_key_type: PixKeyType | null;
  pix_key: string | null;
  holder_name: string | null;
  status: 'active' | 'superseded';
  created_at: string;
  created_by: string;
  superseded_at: string | null;
};
