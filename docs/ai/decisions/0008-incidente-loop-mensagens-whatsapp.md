# ADR 0008 — Incidente P0: loop de mensagens no WhatsApp + não respeita "pare de me escrever"

- **Data:** 2026-10-20
- **Status:** Diagnóstico entregue. **Nenhuma mudança em produção feita.** Procedimento de contenção proposto, aguardando aprovação explícita antes de qualquer ação.
- **Autor:** Claude Code (Principal AI Engineer), em resposta ao incidente relatado pela fundadora/Head de IA (10h05–10h16, 20/10/2026)
- **Relacionado:** ADR 0007 (auditoria de inteligência conversacional) — este é um incidente de **segurança operacional** (a Doopla envia quando não deveria), diferente e mais urgente que a qualidade das respostas em si.

## Limite honesto

Não tenho acesso a logs/banco de produção neste sandbox — não consigo confirmar com uma consulta real quantas linhas estavam pendentes, nem se o incidente ainda está ativo agora. O diagnóstico abaixo é por **leitura do código real** (mecanismo confirmado, comportamento determinístico do sistema), não uma suposição — mas a extensão exata do que aconteceu nesse horário específico só se confirma com uma consulta em produção (query pronta na seção 4, é só rodar).

## 1. Causa raiz identificada — CONFIRMADA por código, mecanismo determinístico

A Doopla tem uma fila persistida e exclusiva pra mensagens `professional_self` (`professional_self_pending_messages`, migration 0108, `src/lib/runtime/professional-self-pending-messages.ts`). Cada mensagem sua vira uma linha nessa fila. Um cron roda **a cada 1 minuto** (`vercel.json` → `/api/runtime/drain-professional-self-messages`) e também uma tentativa "inline" acontece a cada nova mensagem sua.

Três propriedades deste mecanismo, lidas direto do código (`drainProfessionalSelfPendingMessages`), explicam o incidente inteiro:

1. **A fila é estritamente FIFO e nunca pula uma linha travada** (comentário do próprio código: "qualquer desfecho que não seja sucesso real ou falha terminal INTERROMPE o laço, nunca pula uma linha bloqueada pra tentar uma mais nova"). Se UMA mensagem sua ficar presa (ex.: perdeu a corrida pelo lease da conversa — `conversation_busy`, ou uma chamada à OpenAI demorou mais que o lease de 120s), **todas as mensagens seguintes ficam na fila atrás dela**, sem exceção.
2. **Quando a fila finalmente destrava, ela drena em lote** (até 20 linhas numa única chamada, `MAX_ROWS_PER_DRAIN_CALL`). Cada linha, independente das outras, roda o ciclo inteiro (Classifier → Planner → persistir resposta → `sendProfessionalSelfReplyViaWhatsapp`) e **manda uma mensagem de WhatsApp de verdade**. Isso produz exatamente o sintoma relatado: várias respostas chegando próximas, repetindo/contradizendo, porque cada uma foi gerada pra uma mensagem sua DIFERENTE e mais antiga, sem saber que a conversa já tinha avançado.
3. **`sendProfessionalSelfReplyViaWhatsapp` (`src/lib/runtime/professional-whatsapp-reply.ts`) não tem nenhuma verificação de "isso ainda faz sentido mandar agora"** — ela sempre manda, incondicionalmente, o texto que o Planner gerou pra aquela linha específica da fila, não importa há quanto tempo essa linha está presa nem o que você disse depois.

**Isso explica "Pare de me escrever" não ter sido respeitado de duas formas, não uma só**:
- (a) **Não existe, em lugar nenhum do código, um mecanismo que reconheça "pare de me escrever"/equivalente como uma instrução de silenciar envios.** Procurei por qualquer coisa parecida com mute/opt-out/pausar conversa pro canal `professional_self` — o único mecanismo de bloqueio que existe (`whatsapp_outreach_blocklist`) é exclusivo da função "Doopla chama o cliente" (contato com um terceiro), nunca se aplica a você mesma falando com sua própria Doopla.
- (b) Mesmo que o model tivesse entendido a instrução perfeitamente, sua mensagem "Pare de me escrever" só vira mais uma linha na MESMA fila FIFO — se havia qualquer coisa presa antes dela, ela espera atrás, e depois que ela mesma é processada, nada no sistema impede que o PRÓXIMO drain do cron (1 minuto depois) processe outra linha qualquer e mande mais uma mensagem.

## 2. Nível de confiança

**Alto, mas não 100% sem log real.** A cadência observada no incidente (repetições a cada 1-3 minutos) bate com dois números reais do sistema: o cron de 1 minuto e o lease de conversa de 120 segundos (`conversation-lease.ts`) — ambos existem de propósito, documentados no código, não inventados agora. O que falta pra confirmar 100%: uma consulta real em `professional_self_pending_messages` (fundadora tem acesso, eu não) mostrando quantas linhas estavam `pending`/`failed` nesse profissional_id entre 10:05 e 10:16, e quantas foram processadas de fato pelo cron nesse intervalo.

## 3. Plano de contenção imediata — PROPOSTO, aguardando sua aprovação

**Preserva inbound e logs, como pedido — nenhuma mensagem sua se perde, nenhuma captura é desligada.** Só suspende o ENVIO automático:

1. **Pausar o cron `/api/runtime/drain-professional-self-messages`** — no painel da Vercel (Project Settings → Cron Jobs → desabilitar esse endpoint específico, ou remover a entrada de `vercel.json` e fazer deploy só dessa mudança, que exigiria sua autorização de deploy separadamente). Isso para a recuperação automática da fila, nunca a captura das suas mensagens (que continua intacta).
2. **A tentativa "inline"** (dispara a cada mensagem nova sua, dentro do próprio webhook) continuaria rodando — se quiser suspender 100% os envios automáticos, a opção mais segura é uma variável de ambiente/feature flag que faça `drainProfessionalSelfPendingMessages` devolver imediatamente sem processar nada, sem remover nenhum código nem mudar nenhuma regra de negócio. Prefiro essa opção à de comentar código, porque é reversível com um clique, sem novo deploy pra reverter.
3. **Não tocar na fila em si** (não apagar/marcar linhas manualmente) até você confirmar — preservar exatamente o estado atual pra investigação.

**Minha recomendação**: opção 2 (feature flag), porque é a mais rápida de reverter e não precisa de um deploy de código pra desligar OU religar — só a variável de ambiente. Mas a decisão de pausar algo em produção é sua; não vou fazer nenhuma das duas sem você confirmar especificamente qual.

## 4. Query pra você confirmar o estado real (read-only, sem risco)

Se quiser confirmar antes de decidir, esta consulta no SQL Editor do Supabase (produção) mostra exatamente o que aconteceu, sem alterar nada:

```sql
select id, status, attempt_count, created_at, updated_at, error
from professional_self_pending_messages
where represented_professional_id = '<seu professional_id>'
  and created_at between '2026-10-20 09:49:00' and '2026-10-20 10:20:00'
order by created_at asc;
```

## 5. Mecanismos de proteção propostos pra correção estrutural (NÃO implementados)

- **A. Verificação de atualidade antes de enviar**: antes de `sendProfessionalSelfReplyViaWhatsapp` disparar, checar se a mensagem-gatilho daquela linha ainda é a mais recente da conversa — se o profissional já mandou algo depois, descartar o envio (nunca mandar uma resposta pra uma pergunta que já foi substituída por uma mais nova), e reprocessar o ciclo a partir da mensagem mais recente em vez de simplesmente pular.
- **B. Mecanismo real de pausa/mute**: reconhecer "pare de me escrever"/equivalente como um sinal estrutural (recognizer isolado, mesmo padrão do resto do projeto — nunca só uma instrução de prompt torcendo os dedos pro model obedecer) que marca a conversa como pausada, com um jeito claro de reativar (ex.: qualquer mensagem nova sua reabre automaticamente, ou um comando explícito "voltar"/"pode continuar"). Nunca depender só do Planner entender a instrução — a trava precisa existir no código de envio em si (mesmo princípio do blocklist já existente pra contato com terceiros, só que pra conversa própria).
- **C. Detecção de loop**: se as últimas N respostas da Doopla pra mesma pergunta forem muito parecidas entre si, interromper e escalar (ex.: "não consegui resolver isso ainda, só um instante") em vez de tentar de novo com as mesmas palavras.
- **D. Idempotência própria em `sendProfessionalSelfReplyViaWhatsapp`**: já documentada como risco residual conhecido desde a revisão de segurança da Fase 2 (ADR 0002) — nunca corrigida até agora. Adicionar uma chave de idempotência (ex.: `aiMessage.id`) antes de qualquer envio real.

## 6. O que NÃO foi tocado

Nenhum enum, tool, regra comercial ou fluxo de aprovação alterado. Nenhum deploy. Nenhuma linha da fila apagada/alterada manualmente. Este documento é só diagnóstico + plano de contenção proposto — qualquer ação em produção (pausar cron, aplicar feature flag, ou a correção estrutural da seção 5) espera sua aprovação explícita, item por item.
