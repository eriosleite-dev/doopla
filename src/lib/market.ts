// Configuração central de internacionalização: idioma da interface,
// região, moeda, preço localizado e Stripe Price ID por plano — a
// "estrutura central" pedida na diretriz de internacionalização da
// Doopla, pra nunca espalhar valores como "R$29,90" ou "pt-BR" direto
// nos componentes.
//
// IMPORTANTE — o que este arquivo NÃO faz (ainda, de propósito):
// - não detecta idioma/região do usuário (navegador, IP, cookie);
// - não é lido pela Home hoje (os cards de planos em home.html
//   continuam com os preços em BRL fixos no HTML);
// - não tem seletor de idioma/região em nenhuma tela;
// - não persiste escolha de idioma/região na conta;
// - não integra com a Stripe API de verdade (os Price IDs abaixo são
//   placeholders `null` até os Products/Prices existirem na conta
//   Stripe);
// - não é o sistema de traduções da interface (isso é uma biblioteca
//   de i18n à parte, com catálogo de mensagens por idioma — decisão
//   de arquitetura maior, ainda não tomada).
// Isso é só a fundação de dados: os tipos e valores que o resto dessas
// peças vai consumir quando forem construídas, pra nenhuma delas
// inventar sua própria versão de "quais mercados existem" ou "quanto
// custa cada plano em cada moeda".

export type Locale = 'pt-BR' | 'en';
export const LOCALES: Locale[] = ['pt-BR', 'en'];
// Fallback quando o idioma do navegador não é nenhum dos suportados.
export const DEFAULT_LOCALE: Locale = 'en';

export type Region = 'BR' | 'US' | 'EU' | 'GB' | 'INTL';
// Fallback internacional pra região não detectada / não configurada.
export const DEFAULT_REGION: Region = 'INTL';

export type Currency = 'BRL' | 'USD' | 'EUR' | 'GBP';

export type PlanId = 'doopla' | 'pro';

export const TRIAL_DAYS = 7;

export type MarketConfig = {
  region: Region;
  currency: Currency;
  currencySymbol: string;
  // Preço mensal de cada plano, na unidade principal da moeda (ex.:
  // 29.9 = R$29,90). A conversão pra menor unidade (centavos), que é
  // o que a API da Stripe espera, acontece na borda da integração,
  // não aqui.
  pricing: Record<PlanId, number>;
  // Os IDs reais entram quando os Products/Prices forem criados na
  // conta Stripe (plano × mercado, ver diretriz de i18n). `null` é o
  // estado esperado até lá — não é um bug nem um dado faltando.
  stripePriceIds: Record<PlanId, string | null>;
};

export const MARKETS: Record<Region, MarketConfig> = {
  BR: {
    region: 'BR',
    currency: 'BRL',
    currencySymbol: 'R$',
    pricing: { doopla: 29.9, pro: 59.9 },
    stripePriceIds: { doopla: null, pro: null },
  },
  US: {
    region: 'US',
    currency: 'USD',
    currencySymbol: 'US$',
    pricing: { doopla: 9.99, pro: 19.99 },
    stripePriceIds: { doopla: null, pro: null },
  },
  EU: {
    region: 'EU',
    currency: 'EUR',
    currencySymbol: '€',
    pricing: { doopla: 8.99, pro: 17.99 },
    stripePriceIds: { doopla: null, pro: null },
  },
  GB: {
    region: 'GB',
    currency: 'GBP',
    currencySymbol: '£',
    pricing: { doopla: 7.99, pro: 15.99 },
    stripePriceIds: { doopla: null, pro: null },
  },
  // Qualquer país sem preço próprio ainda cai aqui — mesmo valor do
  // mercado US, em USD.
  INTL: {
    region: 'INTL',
    currency: 'USD',
    currencySymbol: 'US$',
    pricing: { doopla: 9.99, pro: 19.99 },
    stripePriceIds: { doopla: null, pro: null },
  },
};

export function getMarket(region: Region): MarketConfig {
  return MARKETS[region] ?? MARKETS[DEFAULT_REGION];
}

// Preço formatado pro idioma/região (ex.: "R$29,90", "US$9.99"). Usa
// Intl.NumberFormat em vez de montar a string na mão, pra já sair
// certo quando outros idiomas/moedas forem adicionados.
export function formatPrice(region: Region, plan: PlanId, locale: Locale = DEFAULT_LOCALE): string {
  const market = getMarket(region);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: market.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(market.pricing[plan]);
}
