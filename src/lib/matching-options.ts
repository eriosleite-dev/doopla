// Opções estruturadas usadas tanto no cadastro (wizard) quanto na edição
// de Perfil depois — mesma lista nos dois lugares, pra não divergir.
// Sempre seleção múltipla ou única entre opções fixas, nunca texto livre,
// porque isso é o que alimenta o matching.

export const ARTIST_CATEGORY_OPTIONS = [
  'DJ',
  'Músico / Banda',
  'Creator',
  'Modelo',
  'Ator',
  'Fotógrafo',
  'Palestrante',
  'Outro',
];

export const WORK_TYPE_OPTIONS = [
  'Shows/apresentações',
  'Casamentos',
  'Festas corporativas',
  'Eventos privados',
  'Gravações/estúdio',
  'Campanhas de marca',
  'Palestras/treinamentos',
  'Produção de conteúdo',
  'Outro',
];

export const CLIENT_TYPE_OPTIONS = [
  'Casamentos',
  'Festas corporativas',
  'Clubs/festivais',
  'Marcas',
  'Agências de eventos',
  'Produtoras',
  'Pessoa física',
  'Outro',
];

// Abrangência sem localidade concreta — a cidade/estado real da pessoa
// (respondida em 'local'/'cidades' no cadastro) entra como primeira opção
// via buildRegionOptions, no lugar dos antigos "Minha cidade"/"Meu estado"
// abstratos.
export const REGION_SCOPE_OPTIONS = ['Todo o Brasil', 'América Latina', 'Internacional', 'Outro'];

export function buildRegionOptions(baseLocation?: string | null): string[] {
  const trimmed = baseLocation?.trim();
  return trimmed ? [trimmed, ...REGION_SCOPE_OPTIONS] : REGION_SCOPE_OPTIONS;
}

export const LANGUAGE_OPTIONS = ['Português', 'Inglês', 'Espanhol', 'Francês', 'Outro'];

export const HELP_AREA_OPTIONS = [
  'Negociação',
  'Prospecção',
  'Cobrança',
  'Contratos',
  'Organização',
  'Atendimento ao cliente',
  'Fechamento de bookings',
  'Outra',
];

export const SPECIALTY_AREA_OPTIONS = [
  'Negociação',
  'Comercial',
  'Prospecção',
  'Contratos',
  'Cobrança',
  'Organização',
  'Atendimento',
  'Fechamento',
  'Outra',
];

export const CAREER_STAGE_OPTIONS: { value: string; description: string }[] = [
  { value: 'Começando agora', description: 'Primeiros trabalhos, ainda construindo portfólio.' },
  { value: 'Alguns trabalhos por ano', description: 'Trabalha de forma esporádica.' },
  {
    value: 'Trabalho recorrente, agenda ativa',
    description: 'Fluxo constante de trabalhos ao longo do ano.',
  },
  { value: 'Alta demanda, agenda cheia', description: 'Agenda concorrida, muitas propostas.' },
];

export const FEE_RANGE_OPTIONS = [
  'Até R$500',
  'R$500 – R$2.000',
  'R$2.000 – R$5.000',
  'R$5.000 – R$15.000',
  'Acima de R$15.000',
];

export const CAPACITY_OPTIONS: { value: string; description: string }[] = [
  { value: '1 a 3', description: 'Atendimento próximo, poucos artistas por vez.' },
  { value: '4 a 5', description: 'Rede em crescimento.' },
  { value: '6 a 10', description: 'Operação estabelecida.' },
  { value: 'Mais de 10', description: 'Operação maior, roster amplo.' },
];

// Faixa indicativa, só pra dar transparência no perfil — nunca trava a
// comissão de nenhum booking específico, que continua sempre negociada
// caso a caso entre booker e artista.
export const COMMISSION_RANGE_OPTIONS = [
  'Até 10%',
  '10% a 15%',
  '15% a 20%',
  '20% a 30%',
  'Acima de 30%',
  'Negocio caso a caso',
];
