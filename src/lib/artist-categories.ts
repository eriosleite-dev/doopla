// Categorias profissionais do artista + tipos de trabalho por categoria,
// usado em "Prepare sua Doopla" (onboarding). Estrutura pensada pra dar
// contexto de verdade pra IA que representa o artista (não só preencher
// um perfil público) — quando expandir pra novas profissões, só
// adicionar uma entrada aqui, sem mexer no formulário.

export type ArtistCategoryId =
  | 'dj'
  | 'banda'
  | 'cantor'
  | 'fotografo'
  | 'videomaker'
  | 'influenciador'
  | 'outro';

export const ARTIST_CATEGORIES: { id: ArtistCategoryId; label: string }[] = [
  { id: 'dj', label: 'DJ' },
  { id: 'banda', label: 'Banda' },
  { id: 'cantor', label: 'Cantor(a)' },
  { id: 'fotografo', label: 'Fotógrafo(a)' },
  { id: 'videomaker', label: 'Videomaker' },
  { id: 'influenciador', label: 'Influenciador(a) / creator' },
  { id: 'outro', label: 'Outro' },
];

const GENERIC_WORK_TYPES = [
  'Eventos corporativos',
  'Marcas e ativações',
  'Eventos privados',
  'Outros',
];

// Fallback pra qualquer categoria sem lista própria ainda — nunca uma
// pergunta "universal ruim pra tudo", só o mínimo genérico até alguém
// escrever a lista específica dessa profissão.
export const WORK_TYPES_BY_CATEGORY: Record<ArtistCategoryId, string[]> = {
  dj: [
    'Clubes e festas',
    'Festivais',
    'Eventos corporativos',
    'Marcas e ativações',
    'Casamentos',
    'Eventos privados',
    'Restaurantes/hotéis',
    'Outros',
  ],
  banda: [
    'Casamentos',
    'Eventos corporativos',
    'Festivais',
    'Bares e casas de show',
    'Eventos privados',
    'Outros',
  ],
  cantor: [
    'Casamentos',
    'Eventos corporativos',
    'Festivais',
    'Bares e casas de show',
    'Eventos privados',
    'Outros',
  ],
  fotografo: [
    'Casamentos',
    'Ensaios',
    'Eventos corporativos',
    'Moda e campanhas',
    'Produtos',
    'Outros',
  ],
  videomaker: [
    'Casamentos',
    'Eventos corporativos',
    'Campanhas e publicidade',
    'Conteúdo para redes sociais',
    'Outros',
  ],
  influenciador: ['Publis e parcerias com marcas', 'Eventos', 'Campanhas', 'Outros'],
  outro: GENERIC_WORK_TYPES,
};

export function workTypesFor(category: string | null | undefined): string[] {
  if (category && category in WORK_TYPES_BY_CATEGORY) {
    return WORK_TYPES_BY_CATEGORY[category as ArtistCategoryId];
  }
  return GENERIC_WORK_TYPES;
}

export const WORK_REGIONS = [
  'Minha cidade/região',
  'Outros estados',
  'Brasil inteiro',
  'Internacional',
  'Remoto',
];
