// Configuração central do Doopla Intelligence OS — nome de
// modelo/feature nunca deve aparecer como string solta espalhada pelo
// código. Trocar de modelo é mudar este arquivo, nunca um grep.

// gpt-5-mini: bem mais barato que o gpt-5.5 "flagship" (~$0,25/1M
// tokens de entrada, ~$2/1M de saída, vs. ~$5/~$30 do 5.5), contexto
// de 400K tokens, segue instrução o suficiente pra provar que a
// integração respeita "use só o contexto dado", "não invente",
// "diga quando precisa perguntar ao profissional". Não é o modelo
// definitivo do Orchestrator — só o adequado pra este teste de
// infraestrutura, onde custo/latência importam mais que capacidade
// máxima. Preço não conferido direto na página oficial da OpenAI
// (bloqueada neste ambiente de execução) — vale checar antes de
// decidir o modelo definitivo do Orchestrator.
export const AI_MODEL = 'gpt-5-mini';

// Nome de feature gravado em ai_usage_events — identifica que chamada
// gerou aquele evento de uso.
export const AI_FEATURE_INTELLIGENCE_TEST = 'intelligence_test_ping';
