// Espelha payment_details (migration 0046) e payout_requests
// (migration 0014).
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

export type PayoutRequestStatus = 'solicitado';

export type PayoutRequest = {
  id: string;
  profile_id: string;
  amount_cents: number;
  status: PayoutRequestStatus;
  created_at: string;
};
