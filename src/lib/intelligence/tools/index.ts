// Importa cada tool só pelo efeito colateral de registro
// (registerTool() dentro de cada arquivo). Quem quiser executar uma
// tool importa este módulo — nunca os arquivos individuais direto,
// pra garantir que o registry esteja sempre completo antes de usar.
import './get-professional-profile';
import './get-opportunity';
import './get-booking';

export { getProfessionalProfileTool } from './get-professional-profile';
export { getOpportunityTool } from './get-opportunity';
export { getBookingTool } from './get-booking';
