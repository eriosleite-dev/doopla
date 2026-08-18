# Doopla — decisões de arquitetura/produto

Registro datado das decisões que não são óbvias só de ler o código —
o "porquê" por trás de uma trava ou de um design escolhido. Complementa
o `PROGRESS.md` (que é sobre status) e o `AUDITORIA_BLOCO_4_5.md` (que
é sobre segurança). Aqui é sobre decisões que, se esquecidas, levariam
a desfazer ou recodificar algo que já foi decidido de propósito.

---

## Bloqueio de "operação nova" no downgrade: só nos pontos de entrada reais, não em todo lugar — 18/08/2026

A regra pedia bloquear "iniciar novo booking, assumir nova oportunidade,
iniciar negociação ou criar qualquer operação nova" pra artistas que
ficaram fora do limite depois de um downgrade Pro→Básico. Implementei
isso em `isArtistBlockedForBooker()` (`src/lib/subscription.ts`) e
apliquei nos pontos onde o vínculo booker↔artista de fato nasce ou uma
proposta de trabalho nova é criada:

- `requestRepresentationAction` (booker pede pra representar) — avisa
  antes de mandar a solicitação.
- `confirmInviteAction` (confirmar convite vira representação) — só
  quando quem confirma é o próprio booker.
- `respondRepresentationRequestAction` (artista aceita pedido do
  booker) — mensagem neutra pro artista, sem "faça upgrade" (não é
  decisão dele).
- `proposeBookingAction` (criar uma proposta de booking nova) — trava
  se o artista não é o `active_artist_profile_id`.
- Trigger `booker_artist_limit_check` no banco garante o limite de
  qualquer jeito, mesmo se uma Server Action esquecer de checar.

Não toquei em toda ação secundária que também "cria algo" (ex.:
propor remarcação de um booking já existente, aceitar pagamento) —
essas continuam o trabalho já em andamento, que a regra explicitamente
protege (seção 4.3 da especificação). Se aparecer um ponto de entrada
novo que precise do mesmo bloqueio, usar o mesmo helper.

## Agenda editável do booker: só marcações manuais, não o calendário inteiro do artista — 18/08/2026

Prioridade 7 pedia que o booker conseguisse "administrar o trabalho
relacionado aos artistas que representa" na Agenda. Implementei isso
como: o booker escolhe um artista que representa e pode adicionar/ver/
remover as marcações manuais desse artista (disponível, indisponível,
viagem, outro) — não os bookings confirmados do artista com terceiros.

Motivo: os bookings do artista já têm sua própria regra de visibilidade
(RLS por `booker_profile_id`/`artist_profile_id` do próprio booking) —
deixar um booker enxergar TODOS os bookings de um artista, inclusive os
que esse artista fechou com outros bookers, seria uma mudança de
privacidade que a Prioridade 7 não pediu explicitamente e que merece
decisão própria do usuário antes de construir. `agenda_entries` resolve
o pedido concreto (bloquear datas, marcar viagem) sem essa exposição.
Se no futuro fizer sentido o booker ver a agenda cheia do artista que
representa, é uma decisão separada — registrar aqui se vier.

## Tags de avaliação finalizadas + "Identidade verificada" não vira badge de perfil ainda — 18/08/2026

Você mandou os mockups finais de perfil (booker/artista) e avaliação —
resolvi o TBD que já estava documentado no código
(`review-attributes.ts` dizia literalmente "ainda não foi confirmada
palavra por palavra"). Tags agora batem exatamente com o documento final,
dos dois lados, e o limite artificial de 3 seleções foi removido (agora é
"quantas fizerem sentido", até as 6 disponíveis).

**Não implementei ainda**: os dois selos "Identidade verificada" e
"Booker Doopla Oficial" como badge permanente de perfil, porque não
existe nenhuma coluna real de verificação de identidade no banco — seria
inventar um selo sem lastro, o mesmo motivo pelo qual o critério
"identidade" do Booker Oficial já fica sempre falso hoje (ver
`getOfficialBookerProgress`). "Doopla Verified" já era corretamente só
do booking, nunca virou badge de pessoa em nenhum lugar do código —
nada a corrigir aí.

**Também não implementei**: perfil como modal (hoje é página com rota
própria `/dashboard/bookers/[id]` e `/dashboard/artistas/[id]`) e o
formulário de avaliação como modal acionado de uma lista "Trabalhos
concluídos" (hoje é um painel dentro do detalhe do booking). São mudanças
de arquitetura reais, não só copy — ficam pra quando entrar como
prioridade explícita.

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

---

## Bookers, convites, vínculos e Link de Orçamento — reformulação estrutural — 18/08/2026

Migration 0033 + reescrita de `bookers/page.tsx`, `artistas/page.tsx`,
`publish-form.tsx`. Decisões que valem registrar:

- **`representation_requests` vira bidirecional sem trocar de tabela.**
  Em vez de criar uma tabela nova pro sentido artista→booker, adicionei
  `requested_by_profile_id` na tabela existente. O índice único
  `(booker_profile_id, artist_profile_id) where pendente` já garantia
  1 pendente por par, independente de quem inicia — só faltava
  rastrear quem foi. Mesmo princípio já aplicado ao convite
  bidirecional (ver decisão acima).
- **Colisão de solicitações vira aceite atômico via RPC, não um erro
  de índice único.** `request_representation_link()` faz
  `select ... for update` na linha pendente (se existir) antes de
  decidir entre inserir ou colapsar em aceite — mesmo padrão de lock
  já usado em `select_booker_for_opportunity`. Client-side insert
  direto foi revogado (`revoke`/sem policy de insert): esse é o único
  caminho de criação agora, porque a atomicidade não dá pra garantir
  numa policy de insert simples.
- **Encerrar vínculo não existia — criei do zero, com escopo
  deliberadamente contido.** `terminate_representation()` faz a
  cascata mínima que evita estado inconsistente: fecha convite direto
  de oportunidade *pendente* daquele par (nunca um já aceito — isso já
  virou trabalho em andamento, protegido pela regra de exceção),
  zera o Link de Orçamento se apontava pra esse booker, libera o slot
  do Básico se esse era o artista ativo. Não criei uma tabela de
  histórico de vínculos encerrados — a mensagem de fallback do Link de
  Orçamento é resolvida checando o `booker_id` antes de chamar a RPC e
  passando o nome via query param no redirect, não por auditoria
  persistida. Se algum dia precisar de histórico completo de vínculos
  (pra mostrar "vocês trabalharam juntos entre X e Y", por exemplo),
  isso é trabalho novo, não uma extensão trivial dessa RPC.
- **Detecção de conta por contato é best-effort, não uma busca
  robusta.** `find_representation_target_by_contact()` casa e-mail
  (contra `auth.users.email`, exato/case-insensitive) ou telefone
  (dígitos normalizados). Não tenta variações de formatação de nome,
  não faz fuzzy match. Suficiente pro caso de uso (evitar convite
  duplicado quando a pessoa já tem conta), não é uma ferramenta de
  busca de usuários.
- **"Publicar um trabalho" virou dois checkboxes na UI, mas o enum
  `distribution_mode` no banco não mudou.** As 4 combinações possíveis
  de 2 checkboxes colapsam exatamente nos 3 valores que já existiam
  (`ambos`/`meus_bookers`/`novos_bookers`) — trocar o enum por duas
  colunas boolean exigiria reescrever 4 policies de RLS que dependem
  dele pra nenhum ganho real. O formulário computa o valor certo antes
  de enviar; o server action recalcula do zero a partir dos ids de
  booker validados (nunca confia no enum vindo do client).
- **Selecionar bookers específicos ao publicar passou a criar
  `opportunity_invitations` na hora**, não só desbloquear o convite
  manual posterior (que antes só existia na tela de detalhe da
  oportunidade). Isso é a diferença real que fecha a lacuna do pedido
  original ("Enviando diretamente para: Ana × João") — sem isso, os
  checkboxes seriam só cosmético.
- **Duas simplificações do parágrafo acima foram fechadas em seguida,
  a pedido explícito — 18/08/2026:** (1) Publicar trabalho: com
  exatamente 1 booker ativo, mostra direto "Enviar para meu booker —
  [Nome]" sem lista pra marcar; com 2+, mantém a seleção; com 0, a
  opção nem aparece. (2) Link de Orçamento: "Alterar" agora abre o
  formulário de roteamento inline (mesmo componente do Perfil,
  extraído pra `link-routing-form.tsx` e reaproveitado nos dois
  lugares) em vez de navegar pra `/dashboard/perfil`. Mesma ação,
  mesmas regras (elegibilidade só vínculo ativo, fallback automático
  ao encerrar vínculo) — só o formulário virou compartilhado entre o
  card do Perfil e o card da Visão Geral, cada um decidindo como
  exibir (fixo vs. toggle).

---

## LOTE 1: bug "solicitação aceita continua como pendência" — causa raiz — 18/08/2026

Achado por auditoria de código (não reproduzido ao vivo criando contas
de teste no Supabase real — decisão deliberada pra não poluir o banco
do usuário; ver seção final).

- **Causa raiz real**: `getAttentionItems` misturava dois conceitos
  num só array com um campo `kind: 'info'` que nunca ganhava seção
  própria na UI — tudo renderizava dentro de "Precisa da sua atenção"
  em `dashboard/page.tsx`. Um item como "Ana aceitou sua solicitação"
  (que é só um aviso, não uma pendência) ficava visualmente idêntico a
  "Ana pediu pra te representar" (que exige decisão). Daí a sensação
  de "aceita e continua parecendo pendência".
- **Fix**: split em duas funções de verdade — `getAttentionItems`
  (só `urgente`/`atencao`, itens que exigem decisão) e
  `getRecentActivity` (itens já acontecidos, sem ação pendente),
  cada uma com sua seção própria em `dashboard/page.tsx`
  ("Precisa da sua atenção" vs "Atividade recente"). O sino/badge do
  header (`layout.tsx`) automaticamente ficou preciso também, já que
  lê do mesmo `getAttentionItems` — não precisou de mudança separada.
- **Segundo bug real encontrado no caminho, também corrigido**: o
  perfil de booker (`booker-profile-view.tsx`) filtrava
  `.eq('role', 'booker')` pra achar a conta — mas
  `representations.booker_profile_id` pode apontar pra uma conta com
  `role = 'agencia'` (papel distinto desde o cadastro, ainda presente
  no schema). Artista com uma agência na rede caía em `notFound()` ao
  abrir o perfil dela. Isso bate exatamente com "erro ao abrir o
  perfil do artista" do pedido original — trocado pra
  `.in('role', ['booker', 'agencia'])`.
- **Não reproduzi ao vivo**: criar contas de teste reais no Supabase
  de produção pra reproduzir o fluxo completo (solicitar → aceitar →
  checar as duas telas) poluiria dados reais do usuário sem
  autorização prévia — não fiz isso. A correção acima veio de rastrear
  o código até a causa mecânica exata, não de assumir. Se o
  comportamento ainda aparecer depois desse fix, preciso do passo a
  passo exato (qual tela, qual ação, o que apareceu) pra investigar
  further — não custa relatar de novo se acontecer.
