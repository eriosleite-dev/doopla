# Doopla — decisões de arquitetura/produto

Registro datado das decisões que não são óbvias só de ler o código —
o "porquê" por trás de uma trava ou de um design escolhido. Complementa
o `PROGRESS.md` (que é sobre status) e o `AUDITORIA_BLOCO_4_5.md` (que
é sobre segurança). Aqui é sobre decisões que, se esquecidas, levariam
a desfazer ou recodificar algo que já foi decidido de propósito.

---

## Booker Básico ganha tela de plano própria na Home e no cadastro — 18/08/2026

Até aqui só o artista tinha uma tela de "plano" no cadastro e uma seção
de planos na Home — o booker entrava direto pra criação de conta depois
das perguntas, sem nenhuma tela dedicada a R$0/mês. Isso deixava o
"grátis de verdade" do Booker Básico implícito, nunca afirmado com
destaque. Adicionado `BOOKER_PLANO_STEP`/`BookerPlanStep` no wizard
(`kind: 'plan-booker'`, distinto de `'plan'` do artista pra não misturar
CTA/copy) e uma seção `#planos-booker` na Home, gated por `view-booker`,
espelhando a estrutura da seção do artista.

## `booker_profiles.fee_range` virou array (migration 0027) — 18/08/2026

Pedido explícito: faixa de cachê do booker devia aceitar mais de uma
opção, porque "com qual faixa você costuma trabalhar" excluía quem tá
começando. Isso mudou o TIPO da coluna (`text` → `text[]`), diferente do
artista, que continua escalar (pergunta dele não mudou). Migração usa
`USING case when ... else array[fee_range] end` pra não perder dado
histórico na conversão.

## Referral (#49) — 14/08/2026

Referral hoje é só rastreamento, não é crédito financeiro liberado.

- Estrutura completa desde já: quem indicou, quem foi indicado,
  código/link usado, data, origem, status, valor potencial da
  recompensa. (Implementado: tabela `referrals`, migration `0020`. A
  própria tabela é o registro de origem — só existe pra crédito de
  indicação; não há coluna `origem` separada ainda, adicionável depois
  se for preciso diferenciar canais.)
- Toda indicação nasce com `status: pendente`. (Implementado.)
- Não iniciar contagem de 45/60 dias. Não considerar cadastro como
  assinatura. Não creditar R$5 no saldo disponível. Não simular
  pagamento. (Implementado: nenhuma transição automática pra
  `qualificada` existe em lugar nenhum do schema.)
- Card "Indique. Ganhe R$5." pode existir na interface como
  comunicação do programa — mas o backend sempre trata o valor como
  pendente, nunca como dinheiro disponível. (Implementado: card no
  painel + histórico no Dinheiro, sempre mostrando R$0,00 de crédito
  qualificado até existir um evento real de qualificação.)
- Trava explícita de schema: não codificar `45_days` / `60_days` (ou
  qualquer gatilho de tempo) na tabela agora. O gatilho real de
  qualificação (primeiro pagamento confirmado, X dias de assinatura
  ativa, segunda mensalidade, etc.) ainda não foi decidido e só será
  definido quando existir PSP + sistema de assinatura reais no banco.
  (Implementado: zero menção a dias/prazos no schema.)
- Quando esse sistema existir: referral se conecta ao evento real de
  pagamento. Regra pretendida (sujeita à política definitiva de
  referral que será fechada nessa hora): o indicado precisa
  efetivamente virar cliente pagante antes de qualquer
  qualificação/liberação de recompensa.

**Motivo**: evitar dívida técnica de um gatilho provisório e evitar
criar "dinheiro fictício" no sistema antes de existir o evento
financeiro real por trás.

---

## Bloco 4.5 — itens adiados, não descartados — 14/08/2026

Curadoria administrativa manual, distribuição automática de
oportunidade por regra de categoria, e worker de tags por IA (com
gravação real em `ai_usage_events`) ficam fora do escopo do beta.
A estrutura de banco pra todos os três já existe (migration `0018`:
`profiles.is_admin`, `opportunity_events.source`, `ai_usage_events`),
só não tem interface/lógica em cima ainda. Mesmo critério já usado pro
Matching V2: volta pra fila quando a base de usuários justificar,
não é decisão de "nunca construir".

---

## Bloco C — /orçamento e Perfil completo — 15/08/2026

- Documento consolidado (`doopla-especificacaocompletafinal.md`)
  substitui todos os fragmentos anteriores de painel/perfil/orçamento
  mandados antes, exceto o trecho de reorganização de "Bookers"
  (favoritos/já trabalhou/descoberta), que segue valendo. Prioridade
  confirmada: 1) `/orçamento`, 2) cancelamento/reembolso estrutural
  (exceto os 4 pontos travados até Pagar.me/jurídico), 3) Segurança
  da Home + FAQ.
- Escrita pública do formulário de orçamento usa uma função
  `SECURITY DEFINER` (`submit_orcamento_request`), mesmo padrão já
  usado pro trigger de referral — o cliente que pede orçamento nunca
  tem `auth.uid()`, então não dá pra depender de RLS de usuário
  autenticado nem abrir INSERT público direto em `opportunities`.
- `assigned_to` da oportunidade é decidido e gravado no momento da
  criação, a partir do `artist_link_routing` vigente naquele
  instante — nunca recalculado depois. Isso segue a regra geral de
  snapshot já usada em outras decisões de roteamento/comissão nesta
  sessão: mudar a configuração no Perfil só afeta pedidos novos.
- `opportunities.commission_percent` virou opcional: pedidos que
  chegam pelo link de orçamento ainda não têm uma comissão combinada
  entre artista e booker (isso é negociado depois, separado do cachê
  do cliente). O booker informa a comissão só na hora de aceitar a
  oportunidade, se ainda não houver uma definida.
- Card de oportunidade no painel do booker mostra sempre a origem
  ("Recebida pelo seu link de orçamento" vs mural) e trata cachê do
  artista como um dado diferente da comissão do booker — nunca o
  mesmo número, mesmo quando um dos dois ainda não foi definido.

---

## Cancelamento/reembolso — escopo reduzido — 17/08/2026

O documento `doopla-cancelamento-reembolso-rascunho.md` chegou numa
versão v2 ("reescrita para split + repasse imediato") que contradizia
a instrução original dada por texto no chat. A instrução original
dizia "implemente tudo, exceto 4 pontos travados". O próprio
documento, na seção final ("Faseamento"), diz algo mais restritivo:
que o módulo inteiro "fica como rascunho de produto até fechar os
pontos em aberto com jurídico/PSP" — e a lista dos 4 pontos travados
também mudou de conteúdo entre o que foi dito no chat e o que está no
fim do documento.

Perguntei e ela decidiu (via pergunta estruturada):
- Escopo: só estrutura de dados/snapshot + linguagem no painel — sem
  simular repasse real de PSP. Justificativa de fundo: o produto
  ainda não tem integração real com Pagar.me (pagamento continua
  "marcar como pago" manual), então fingir que existe split/repasse
  automático seria o mesmo tipo de funcionalidade falsa que já foi
  evitada em outras partes do produto (ex.: botão de Sacar
  desabilitado até o Bloco 2 existir).
- Os 4 pontos travados usados são os do fim do documento (não os do
  chat original): mecanismo de divisão da dívida entre artista e
  booker, janela de segurança antes do repasse, MDR retido em
  chargeback, UI de saldo devedor.

**Implementado dentro desse escopo**: forma de pagamento + política
de cancelamento snapshotadas na proposta; consentimento explícito no
aceite; cancelar booking (só o artista, nunca o booker unilateralmente
— regra explícita do documento); remarcação consensual (só o artista
aceita, autoridade final); inadimplência leve (rótulo A vencer/
Vencido/Em cobrança, sem cobrança automática); disputa/chargeback como
sinalização sempre separada de cancelamento, sem execução financeira.

**Não implementado, de propósito**: qualquer coisa que dependa de um
evento real de pagamento confirmado pelo PSP (split, repasse, saldo
devedor de verdade). Fica para quando a integração com Pagar.me
existir.

---

## Checagem real da Fase 1 (painéis) — 17/08/2026

A usuária mandou um print real do painel do booker mostrando que a
Fase 1, que eu tinha marcado como fechada no PROGRESS.md, não batia
com a especificação em vários pontos: métricas financeiras erradas
(cards trocados), "Precisa da sua atenção" aparentemente ausente,
sino de notificações nunca construído, empty states genéricos
(exatamente o padrão que a seção 36 do documento pede pra nunca
fazer), e o card Booker Oficial acima da seção de Trabalhos (a seção
8 é explícita que ele nunca pode ficar acima de dinheiro/pendências/
bookings).

Pedido dela: não seguir pra Fase 2 sem fechar isso, com confirmação
item por item, sem assumir nada como pronto. Auditei o código real
(não a memória da conversa) contra cada item, corrigi os 5 gaps reais
encontrados, e documentei o resultado granular no PROGRESS.md (seção
"Checagem real da Fase 1"), em vez de só marcar "feito" genérico.

**Lição registrada**: marcar um bloco como "fechado" no PROGRESS.md
só deveria acontecer depois de validar contra a tela real (print ou
preview), não só contra a lista de tarefas internas. A partir de
agora, ao fechar uma fase inteira (não um item isolado), vale reler o
resultado renderizado antes de declarar pronto — nem que seja só
descrevendo a árvore de componentes renderizada, já que não há acesso
a navegador neste ambiente de execução.

---

## Regra de indicadores visuais de atenção — 17/08/2026 (vale pra toda a interface)

Regra permanente, não só pra "Precisa da sua atenção":
- Bolinha vermelha = existe ação pendente/urgente de verdade.
- Bolinha amarela = item requer atenção, mas não é urgente.
- Sem bolinha = só informação, nada exigido do usuário.
- Vermelho nunca é decoração. Se não representa uma ação real
  pendente, não é vermelho.

Implementado como `AttentionItemKind = 'urgente' | 'atencao' | 'info'`
em `data.ts`, usado tanto no card "Precisa da sua atenção" quanto no
sino de notificação do header (mesma fonte de dados, mesma regra de
cor). Título da seção só ganha a bolinha vermelha quando existe pelo
menos um item `'urgente'` de verdade — nunca só porque a lista não
está vazia.

Outros usos de vermelho (`--alert`) na interface foram auditados e
mantidos como estavam, por sinalizarem estado real, não decoração:
pill de status "Cancelada", checkpoints não concluídos, selo "Aguardando
validação" (Doopla Verified), rótulo "Vencido"/"Em cobrança" no
booking, avisos de disputa/chargeback. Nenhum desses é clique-e-nada-
acontece: todos representam um estado que de fato precisa de atenção
ou ação em algum momento do fluxo.

---

## Vínculo artista↔booker: causa raiz era cache, não dado — 17/08/2026

A usuária mandou uma lista grande de bugs ("aceitei mas sumiu daqui",
"/orçamento diz que não tenho booker", "booker não sabe que foi
aceito") com uma instrução explícita: não corrigir tela por tela, achar
a causa raiz, tratar a relação artista↔booker como entidade central
com fonte única de verdade.

Investigação (agent read-only) confirmou que a tabela `representations`
já cumpria esse papel corretamente — trigger no banco insere na hora
certa, RLS permite os dois lados lerem, todo ponto de leitura filtra
certo. O bug real era invalidação de cache incompleta: as duas actions
que criam a relação (`respondRepresentationRequestAction`,
`confirmInviteAction`) só chamavam `revalidatePath` pra 1-2 rotas,
deixando as outras ~4 rotas que leem a mesma relação com payload
desatualizado no Router Cache do Next.

Corrigido com uma função central (`revalidateRelationshipPaths`) em vez
de espalhar `revalidatePath` solto — qualquer ação futura que crie/
altere a relação deve chamar essa função, não reinventar a lista de
rotas. Isso é o equivalente, do lado de invalidação, ao princípio que
ela pediu do lado de leitura: uma fonte, não N cópias divergentes.

Também fechado: booker nunca era notificado quando um artista
respondia sua solicitação. Resolvido com `booker_seen_at` em
`representation_requests` (migration 0025) + item real em "Precisa da
sua atenção", que some quando o booker visita `/dashboard/artistas`
(mesmo padrão do `opportunities_seen_at`).

**Deixado pra depois, de propósito**: o caminho de convite (`invites`)
não ganhou a mesma notificação "vista/não vista" — só a invalidação de
cache foi corrigida ali. Fica pra prioridade 4 (Meus Bookers/Meus
Artistas/notificações), que é onde a usuária agrupou esse tipo de
ajuste fino de notificação.

---

## Onboarding reescrito: campos estruturados + convite bidirecional — 17/08/2026

Migration 0026 + reescrita completa do wizard de cadastro (`signup-
form.tsx`). Decisões que valem registrar:

- **Nunca texto livre pra campo que alimenta matching.** Todo campo
  novo (tipos de trabalho, tipos de cliente, regiões, idiomas,
  especialidades, categorias) é `text[]` de verdade no banco, coletado
  via chip multi-seleção no cadastro e no Perfil — nunca um input de
  texto que a pessoa preenche do jeito que quiser. Onde já existia
  campo livre servindo esse papel (`booker_profiles.specialties`,
  `quem`, `cidades`), a coluna ficou no banco por compatibilidade mas
  parou de ser lida/escrita pelo app — substituída pela versão
  estruturada equivalente.
- **Faixa de cachê é rótulo, não valor exato.** `fee_range` é uma
  banda pré-definida ("R$2.000 – R$5.000"), não dois campos de
  centavos. Ninguém precisa fazer conta na hora do cadastro, e pro
  matching uma banda já basta.
- **Um pequeno helper SQL só pra parsear array com segurança**
  (`jsonb_text_array`): campo de seleção múltipla chega como JSON
  array (não string separada por vírgula) e vira `text[]` de verdade.
  Envolvido em exception handler — um campo opcional malformado nunca
  pode derrubar o cadastro inteiro.
- **Bug pego durante a implementação, não no pedido original**: a
  usuária testou o cadastro e viu que "ajuda pontual" tinha um
  caminho de perguntas mais curto que "recorrente" — o produto tinha
  ficado raso justamente na intenção que mais precisa de matching bom
  (quem pede ajuda pontual também precisa ser encontrado). Corrigido:
  todo mundo responde o mesmo conjunto completo, independente da
  intenção declarada.
- **Convite vira bidirecional**, reaproveitando a MESMA tabela
  `invites` que já existia (não criei uma tabela nova pro sentido
  artista→booker) — `confirmInviteAction` agora resolve a direção da
  `representations` pelo papel de quem convidou vs. quem confirma, em
  vez de assumir sempre "booker convida artista". Segue o mesmo
  princípio da prioridade 1 (fonte única de verdade, sem duplicar
  lógica por caminho).
