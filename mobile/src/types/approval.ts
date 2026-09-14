// Espelha approval_records (migration 0045). Isto é HISTÓRICO —
// decisões já efetivamente aprovadas/committed pelo Approval Engine
// (via commit_approval_resolution, chamado pelo pipeline do
// Runtime a partir da conversa real, nunca por um botão solto). Não
// é uma fila de pendências aguardando toque do profissional — não
// tratar como tal em nenhuma tela.
export type ApprovalOperationType =
  | 'contextual_decision'
  | 'explicit_decision'
  | 'counterproposal'
  | 'revocation'
  | 'professional_initiated';

export type ApprovalRecord = {
  id: string;
  professional_id: string;
  commercial_root_id: string;
  decision_category: string;
  subject_key: string;
  version: number;
  operation_type: ApprovalOperationType;
  approved_value: unknown;
  professional_statement_message_id: string;
  communicated_proposal_message_ids: string[];
  referred_value: unknown;
  created_at: string;
};
