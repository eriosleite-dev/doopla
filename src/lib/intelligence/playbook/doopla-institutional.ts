// Doopla Intelligence Core v1 — Conhecimento institucional da própria
// Doopla v1 (ADR 0007/0009, 20/10/2026).
//
// Causa raiz P0 confirmada no ADR 0007 (seção 2.1): o Planner nunca
// teve nenhum fato real sobre a própria Doopla (planos, cobrança,
// serviços) — perguntas institucionais ("quanto custa a Doopla?",
// "tem plano avulso?") faziam o model inventar, porque não existia
// nada real pra citar. Mesmo padrão do Playbook DJ/Música
// (dj-musica.ts): conteúdo versionado, revisado pela fundadora, nunca
// gerado pelo model — cada fato abaixo vem de código/migration real,
// nunca de suposição:
// - "Beta Fechado por Convite": frase literal do header da migration
//   0099 (billing_kill_switch).
// - Sem cobrança: app_settings.billing_enabled='false' (confirmado em
//   produção, 20/10/2026) — migration 0099 documenta que não existe
//   NENHUM processador de pagamento integrado ainda.
// - Sem "atendimento avulso"/"avulsos": removido explicitamente da
//   Home como feature comercial do 1.0 (achado de produto registrado
//   em PROGRESS.md item 12, "Humano/Booker não é feature comercial do
//   1.0") — exatamente o fato que a profissional corrigiu na
//   conversa real que originou o ADR 0007.
// - Categorias de artista atendidas: ARTIST_CATEGORY_OPTIONS
//   (matching-options.ts) — lista real usada no cadastro/matching.
//
// Entregue condicionalmente (ver planner/prompt.ts): só quando a
// conversa é professional_self (a própria profissional falando com a
// Doopla) — nunca em external_inquiry, nunca pro cliente dela.
export const DOOPLA_INSTITUTIONAL_V1 = `Fatos institucionais reais sobre a própria Doopla (v1, 20/10/2026) — use isto quando a profissional perguntar sobre a Doopla em si (preço, plano, como funciona comercialmente, o que está incluído), NUNCA sobre o trabalho dela própria como artista:

A Doopla está em BETA FECHADO POR CONVITE. Hoje ela NÃO COBRA NADA da profissional representada — não existem planos pagos pra ela, nem mensalidade, nem anuidade, nem qualquer cobrança em vigor.

NÃO EXISTE "atendimento avulso"/"avulsos" como serviço cobrado — isso nunca foi lançado como feature comercial. Se a profissional mencionar ou perguntar sobre isso, não existe mesmo — nunca confirme nem explique como se existisse.

A Doopla representa hoje profissionais destas categorias: DJ, Músico/Banda, Creator, Modelo, Ator, Fotógrafo, Palestrante (e outras categorias avulsas, caso a caso).

Se a profissional perguntar algo sobre o modelo comercial futuro da Doopla que NÃO está coberto acima (quando vai cobrar, quanto vai custar, se vai ter plano anual) — você genuinamente NÃO TEM essa informação. Diga isso claramente ("ainda não tenho uma data ou valor definido pra isso") — NUNCA invente um valor, prazo ou nome de plano que não esteja listado aqui, mesmo que pareça plausível.`;
