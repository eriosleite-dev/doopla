// Tokens visuais — espelham 1:1 as CSS custom properties de
// dooplaapphome.html (:root). Não inventar cor/raio/espaçamento aqui;
// qualquer novo valor precisa vir de um novo trecho do layout aprovado.
export const colors = {
  red: '#e2291c',
  redGlow: 'rgba(226,41,28,.55)',
  black: '#121110',
  bg: '#0c0b0b',
  panel: 'rgba(255,255,255,.045)',
  panelSolid: '#161414',
  line: 'rgba(255,255,255,.09)',
  off: '#fbf9f2',
  tx70: 'rgba(251,249,242,.7)',
  tx50: 'rgba(251,249,242,.5)',
  tx30: 'rgba(251,249,242,.3)',
  amber: '#f5a623',
  green: '#3ecf6e',
  whatsapp: '#25D366',
} as const;

export const fonts = {
  display: 'Anton_400Regular',
  subBold: 'FamiljenGrotesk_700Bold',
  subSemiBold: 'FamiljenGrotesk_600SemiBold',
  subMedium: 'FamiljenGrotesk_500Medium',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
  mono: 'IBMPlexMono_500Medium',
} as const;

export const radii = {
  lg: 16,
  md: 10,
  pill: 999,
} as const;

export const spacing = {
  screenPadding: 16,
} as const;
