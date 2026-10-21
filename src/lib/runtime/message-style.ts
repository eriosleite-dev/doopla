// Doopla — proteção determinística e isolada de estilo (P1 UX
// conversacional, 14/10/2026). Regra absoluta aprovada: a Doopla NUNCA
// usa travessão (—) em texto que ela própria escreve. A instrução de
// estilo em buildPlannerInstructions() (Planner, prompt.ts) já pede
// isso ao model, mas prompt é probabilístico — esta função é a rede de
// segurança determinística, aplicada nos pontos de SAÍDA (nunca dentro
// do Planner/Classifier/Approval Engine, por decisão do usuário).
//
// Nunca aplicada a: texto escrito pelo profissional/cliente (nunca
// passa por aqui — só os call sites que lidam com conteúdo GERADO pela
// Doopla chamam isto), nem a conteúdo de template Meta pré-aprovado
// (alterar um caractere de um template quebraria a aprovação da Meta —
// ver createOutboundIntent abaixo, condicionado a sendAs !== 'template').
//
// Substitui por vírgula (nunca por ponto): decidir entre vírgula e
// ponto final exigiria saber se o texto depois do travessão começa uma
// frase nova (e recapitalizar a primeira letra) — risco de produzir uma
// frase gramaticalmente errada. Vírgula é sempre uma substituição segura
// pro uso típico observado (travessão como pausa/conector), nunca quebra
// a frase.
const EM_OR_EN_DASH = /\s*[—–]\s*/g;

export function stripTravessao(text: string): string {
  if (!text) return text;
  return text
    .replace(EM_OR_EN_DASH, ', ') // travessão (e en dash, visualmente quase idêntico) vira vírgula
    .replace(/^,\s*/, '') // travessão no INÍCIO da frase nunca vira uma vírgula solta na frente
    .replace(/,\s*,/g, ',') // dois travessões em sequência nunca viram vírgula dupla
    .replace(/,\s*([.!?])/g, '$1') // vírgula nunca fica colada antes de um ponto/exclamação/interrogação
    .trim();
}
