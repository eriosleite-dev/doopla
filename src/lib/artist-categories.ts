// Profissão e tipos de trabalho por profissão vêm do banco agora
// (tabelas professions/profession_job_types, migration 0037) — não
// hardcoded aqui, exatamente pra permitir cadastrar profissão nova sem
// mexer em código. Este arquivo guarda só o que continua sendo uma
// lista fixa pequena e estável: o alcance geográfico de trabalho
// ("onde você trabalha"), que não varia por profissão.

export const WORK_REGIONS = [
  'Minha cidade/região',
  'Outros estados',
  'Brasil inteiro',
  'Internacional',
  'Remoto',
];
