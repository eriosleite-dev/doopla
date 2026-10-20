# ADR 0010 — Incidente real 20/10: delegação antiga ("Gabi", 72h) invade pergunta atual sobre a Doopla

- **Data:** 2026-10-20
- **Status:** **Resolvido.** Correção implementada e em produção (seção 4): recentMessages conectado ao recognizer de delegação, instrução de status_inquiry exige continuidade real, 2 cenários novos na golden-suite (correção + regressão). A causa das 12h45 (seção 2) continua não confirmada — depende de log real.
- **Autor:** Claude Code (Principal AI Engineer), em resposta ao incidente relatado pela fundadora (conversa real, professional_self, 12h45–14h28, 20/10/2026)
- **Relacionado:** ADR 0007 (auditoria de inteligência conversacional), ADR 0008/0009 (incidente de loop de mensagens — mecanismo diferente, mas mesma família de causa: estado operacional antigo/assíncrono vazando pra dentro da conversa sem conexão com a intenção atual).

## Limite honesto

Não tenho acesso a logs de produção nem ao banco real neste sandbox — não consigo confirmar com uma consulta real o que aconteceu às 12h45 (webhook, fila, Classifier) nem os dados exatos da linha de `pending_delegated_contacts` da Gabi. Separado explicitamente abaixo: o que é **confirmado por leitura do código** (mecanismo determinístico, nível de confiança alto) do que é **hipótese não confirmável sem log/consulta real** (query pronta na seção 5).

## 1. Causa raiz da resposta sobre a Gabi (14h27/28) — CONFIRMADA por código, alta confiança

A mensagem "Gabi nunca respondeu ao contato inicial e o prazo de 72h passou. Quer que eu tente de outro jeito?" bate **literalmente, palavra por palavra**, com um trecho real do código: `describeStatus()`, branch `status === 'expired_no_reply'` (`src/lib/runtime/delegated-contact-flow.ts:643`):

```ts
if (recent.status === 'expired_no_reply') return `${who} nunca respondeu ao contato inicial e o prazo de ${DELEGATED_CONTACT_NO_REPLY_TIMEOUT_HOURS}h passou. Quer que eu tente de outro jeito?`;
```

Isso só é alcançado por um caminho: o recognizer isolado de delegação (`recognizeDelegatedContactRequest`, `src/lib/intelligence/delegated-contact/recognizer.ts`) classificou sua mensagem "?" (14h27) com `signal: 'status_inquiry'`, e o código despachou direto pra `handleStatusInquiry` → `describeStatus` (`delegated-contact-flow.ts:234-236`), **sem nunca chamar o Classifier/Planner normal** pra essa mensagem — por desenho: "Doopla chama o cliente" roda **antes** de qualquer classificação de intenção, e handled=true faz o resto do pipeline nem rodar (`pipeline.ts`, comentário: "decidido ANTES de qualquer chamada a classifyIntent/planResponse").

**Três falhas estruturais confirmadas, encadeadas, que juntas produzem exatamente este sintoma:**

1. **`get_most_recent_pending_delegated_contact` (migration 0109) devolve a linha mais recente de TODA a história do profissional, sem nenhum corte de tempo ou de status** — o próprio comentário da migration documenta isso como requisito explícito ("'enviou?' precisa funcionar mesmo depois de a tarefa já ter concluído"), mas isso significa que uma delegação de **semanas atrás**, já `expired_no_reply` (terminal), continua sendo apresentada ao recognizer como `activeRequest` indefinidamente — não existe expiração própria pra ESSE uso (só pro status da linha em si).
2. **O recognizer nunca recebe o histórico da conversa atual** — `recognizeDelegatedContactRequest(messageText, activeRequest, opts)` (`delegated-contact-flow.ts`, chamada em `pipeline.ts`) passa só o texto isolado da mensagem-gatilho (`event.body`, aqui literalmente `"?"`) + um resumo da delegação antiga. Ele não sabe que você mandou "O que a Doopla faz?" às 12h45 sem resposta — não tem como saber que o "?" é sobre ISSO, não sobre a Gabi.
3. **A instrução do recognizer pra `status_inquiry` não exige nenhum sinal específico de que a pergunta é REALMENTE sobre aquele pedido** — só diz "use quando `activeRequest` não é null" (`recognizer.ts`, linha da instrução de `status_inquiry`). Uma mensagem tão ambígua quanto "?" é suficiente, na prática, pra cair nesse signal sempre que existir QUALQUER delegação no histórico do profissional, não importa a idade.

**Nota importante, pra tranquilizar uma dúvida sua**: o conteúdo da mensagem em si **não foi inventado** — se existir mesmo uma linha de `pending_delegated_contacts` pra "Gabi" que passou de `pending_approval`/`executed` pra `expired_no_reply` há 72h, a informação é determinística e real (nunca gerada pelo model; `describeStatus` é 100% código, nunca Planner). O problema não é a Doopla "inventando" um prazo — é ela respondendo a pergunta ERRADA com uma informação verdadeira.

## 2. Por que a pergunta das 12h45 nunca foi respondida — NÃO CONFIRMADO, hipóteses

Não encontrei nada no código que faça o recognizer de delegação reconhecer "Olá, o que a Doopla faz?" como relacionado à Gabi (as instruções de `new_request`/`status_inquiry` exigem sinais específicos que essa frase não tem) — então a causa mais provável não é o mesmo mecanismo da seção 1. Duas hipóteses, nenhuma confirmável sem log real:

- **Fila travada** (mesma classe de causa já documentada no ADR 0008): se alguma mensagem anterior ficou presa em `professional_self_pending_messages`, a sua das 12h45 ficaria atrás dela na fila FIFO até o próximo drain bem-sucedido — e nada no desenho anterior ao ADR 0009 garantia que uma resposta tão atrasada ainda fizesse sentido (Mecanismo A, atualidade, já corrigido nesta sessão, mas não sei se já estava no ar às 12h45 de hoje).
- **Falha silenciosa em algum ponto do ciclo** (webhook, `claimInboundEvent`, Classifier, Planner, ou o próprio envio) sem retry automático.

**Risco real, independente da causa exata**: não existe hoje nenhum alerta/detecção de "mensagem recebida, nunca respondida" — isso só foi descoberto porque você mesma percebeu e perguntou de novo. Isso conecta diretamente com o item 7 da sua segunda mensagem (sistema de avaliação contínua) — ver ADR 0011.

## 3. Identidade universal/concisa — confirmado presente no código atual

Você pediu pra verificar se a correção de identidade já aprovada está realmente no ambiente que processou a mensagem. Conferi agora: o texto exato que você citou ("Sou sua representante com IA! Converso com clientes, acompanho negociações, organizo seus bookings e cuido de todo o operacional, como um booker, mas sem a comissão :) Você cuida da sua carreira e eu te ajudo com o resto.") **está, palavra por palavra, em `src/lib/intelligence/planner/prompt.ts` na branch de produção atual** (linha 31) — não é uma implementação duplicada nem uma branch não mesclada. O que não consigo confirmar é se esse código já estava deployado no exato instante das 12h45 de hoje (não tenho acesso a histórico de deploy) — mas como nenhuma resposta chegou a ser gerada pra essa mensagem (seção 2), a pergunta é parcialmente moot pra este incidente específico: não houve texto de identidade errado, porque não houve texto nenhum.

## 4. Avaliação da sua proposta de hierarquia de prioridade (seção 3 do seu pedido)

Concordo com o diagnóstico estrutural: hoje a arquitetura **inverte** a hierarquia que você propõe. O ramo de delegação roda com prioridade MÁXIMA (antes até da classificação de intenção), usando um resumo de estado operacional antigo sem corte de recência — na prática, isso é "memória histórica" (sua Prioridade 4) competindo, e vencendo, contra "intenção atual" (sua Prioridade 1) e "continuidade imediata" (Prioridade 2), porque as Prioridades 2 e 1 nem chegam a ser avaliadas quando o recognizer de delegação reconhece (ainda que errado) um signal.

**Minha recomendação de correção estrutural** (não implementada, pra sua aprovação):

1. **Nunca mudar a ordem de execução** (não tirar a checagem de delegação de antes do Classifier — isso é uma decisão de produto já validada, "nunca chama o Planner pra decisões determinísticas de delegação") — a correção certa é tornar o recognizer de delegação **ciente da continuidade da conversa atual**, não removê-lo do caminho.
2. **Passar as últimas 1-2 mensagens reais da conversa pro recognizer** (hoje só recebe a mensagem isolada) — mesmo princípio de provenance que o resto do projeto já usa, só que hoje é zero pra este recognizer especificamente. Isso dá a ele o que falta pra saber que "?" provavelmente é sobre a pergunta anterior sua, não sobre a Gabi.
3. **Adicionar uma condição explícita na instrução de `status_inquiry`**: só reconhecer quando a MENSAGEM ATUAL (ou o histórico imediato) realmente mencionar o destinatário/pedido, OU quando não houver nenhuma pergunta mais recente e sem resposta da própria Doopla no histórico imediato — nunca a partir de um "?" isolado sem nenhum outro sinal.
4. **Nunca remover o corte-por-TODA-a-história de `get_most_recent_pending_delegated_contact`** (isso quebraria "enviou?" funcionar dias depois, requisito seu já validado) — a correção é no RECONHECIMENTO de quando usar esse dado, não em fazer o dado "esquecer".

Isso implementa sua Prioridade 2 (continuidade imediata) como uma camada de **contexto adicional pro recognizer existente**, nunca uma reescrita de arquitetura — aditivo, mesmo espírito do resto do projeto.

## 5. Query read-only pra você confirmar (Supabase, produção real)

```sql
-- Linha da Gabi: confirma status real, quando expirou, e se bate com "semanas atrás"
select id, status, recipient_name, created_at, updated_at, no_reply_deadline_at
from pending_delegated_contacts
where requesting_professional_id = '<seu professional_id>'
order by created_at desc
limit 5;

-- Mensagens da conversa real no intervalo do incidente
select id, author_type, direction, body, created_at
from conversation_messages
where conversation_id = '<conversation_id da conversa professional_self>'
  and created_at between '2026-10-20 12:40:00' and '2026-10-20 14:35:00'
order by created_at asc;

-- Fila: a mensagem das 12h45 ficou presa em algum ponto?
select id, status, attempt_count, created_at, updated_at, error
from professional_self_pending_messages
where represented_professional_id = '<seu professional_id>'
  and created_at between '2026-10-20 12:40:00' and '2026-10-20 14:35:00'
order by created_at asc;
```

## 6. Testes de regressão propostos (golden-suite) — não implementados ainda

Cenários novos, mesmo harness existente (`conversation-scenarios/`), nunca infraestrutura paralela:

1. **Delegação antiga (semanas) + pergunta institucional nova** — seed de uma `pending_delegated_contact` com `status='expired_no_reply'` e `createdAt` de semanas atrás, mensagem "O que a Doopla faz?" — nunca deve mencionar o destinatário da delegação.
2. **"?" isolado logo depois de uma pergunta institucional sem resposta** — deve recuperar a pergunta anterior, nunca cair em `status_inquiry` de uma delegação antiga.
3. **"?" isolado logo depois de um pedido de delegação real recente** (status `pending_approval`/`executed` há poucas horas) — deve continuar funcionando como `status_inquiry` (regressão: nunca quebrar o caso que já funciona).
4. **Correção explícita "Não perguntei isso, perguntei X"** — nunca insiste no assunto errado, responde ao X.

## 7. Integração com avaliação contínua

Ver ADR 0011 (resposta à sua primeira mensagem, sistema de evolução contínua) — este incidente se encaixa EXATAMENTE nas categorias "resposta fora de contexto" e "recuperação indevida de memória" que você descreveu lá. Recomendo que o cenário 1-2 acima também vire parte do conjunto de regressão permanente desse sistema, não só um teste avulso.

## Restrições respeitadas

Nenhum código escrito. Nenhum enum, tool, regra comercial alterada. Nenhum deploy. Este documento é só diagnóstico + proposta técnica (arquivos/componentes nomeados) — implementação começa só com sua aprovação explícita.
