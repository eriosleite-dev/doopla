# Doopla — decisões de arquitetura/produto

Registro datado das decisões que não são óbvias só de ler o código —
o "porquê" por trás de uma trava ou de um design escolhido. Complementa
o `PROGRESS.md` (que é sobre status) e o `AUDITORIA_BLOCO_4_5.md` (que
é sobre segurança). Aqui é sobre decisões que, se esquecidas, levariam
a desfazer ou recodificar algo que já foi decidido de propósito.

---

## Professional Product UI — Shell + Home, QA autenticado (Part A): 3 bugs reais, Shell continua exclusivamente CSS de conteúdo — 04/09/2026 (mesmo dia, segunda review)

Primeira vez que o Shell foi testado num Preview autenticado de
verdade — 3 bugs reais que só apareciam com sessão real, invisíveis
pra `tsc`/`eslint`/`build`. Duas correções de código + uma investigação
que concluiu não ser bug de aplicação:

1. **Nav ativo**: link com `#hash` (Decisões → `/dashboard#precisa-de-voce`)
   comparava só a parte do path depois do split, colidindo com Início
   (mesmo path `/dashboard`). Corrigido pra nunca marcar link-âncora
   como rota ativa — princípio geral pra qualquer item futuro da
   sidebar que aponte pra uma âncora em vez de rota própria.
2. **Flash branco**: `loading.tsx` só substitui `{children}` — o Shell
   (layout.tsx) fica fora da fronteira de Suspense e nunca desmonta.
   O bug era cosmético mas na área errada: um retângulo bege
   `min-h-screen` sólido pintado dentro do slot de conteúdo, que domina
   a maior parte da tela (sidebar é só 250px). Fix: fundo transparente
   + `currentColor`, deixando o fundo do Shell (dark ou legado) já
   pintado por trás aparecer. **Regra geral daqui pra frente**: nenhum
   boundary de loading/erro dentro de `/dashboard` pode pintar um fundo
   próprio — sempre transparente, herdando o tema de quem já está
   montado.
3. **Home com erro pra todo mundo**: não é bug de `professional-home-view.tsx`
   nem de `get_professional_home_facts()` em si — é ausência de
   aplicação da migration no ambiente real. Este sandbox nunca teve
   Supabase real linkado; toda migration desde a Foundation só foi
   validada contra Postgres de teste local. Não existe hoje nenhuma
   automação (CI/config) que aplique migrations num projeto hospedado
   — cada `supabase/migrations/*.sql` precisa ser aplicado manualmente
   antes de qualquer Preview poder funcionar de verdade. Corrigido só
   o sintoma colateral (erro real agora vai pro log do servidor em vez
   de sumir em silêncio); a causa real é uma ação de infra, não código.

**Achado adicional relevante pro audit de Part B**: `pro-shell.tsx`
(`ProfessionalShell`) já estava correto quanto a só trocar o CHROME —
o conteúdo de Bookings/Agenda/Financeiro/Minha equipe/Configurações
continua sendo os componentes/páginas legados de sempre, renderizados
`{children}` dentro do Shell novo, sem nenhuma tentativa de reescrevê-los.
Isso é esperado (nunca foi escopo deste bloco redesenhar telas
internas) mas expôs visualmente, pela primeira vez, o quão grande é a
divergência entre o tema `--pro-*` (dark, só 9 arquivos) e o tema
`--paper`/`--accent`/`--ink` legado (78+ arquivos) que ainda cobre
praticamente todo o resto do painel — ver auditoria Part B completa no
relatório desta revisão.

---

## Professional Product UI — Shell + Home, correções de fechamento: Materiais/Analytics voltam à sidebar, wordmark do logo revertido — 04/09/2026 (mesmo dia, review)

Review pós-entrega pediu duas correções antes de aceitar o bloco como
tecnicamente pronto (CURRENT seguia OPEN até essas duas):

1. **Materiais e Analytics tinham sido removidos da sidebar por eu
   julgar "sem rota real" — errado.** A arquitetura de informação
   aprovada os inclui explicitamente, e removê-los silenciosamente
   contraria a regra "nunca apagar item da IA aprovada só porque a
   tela ainda não existe". Corrigido: os dois voltaram como itens
   `comingSoon: true` em `ProNavLink` (`pro-sidebar-nav.tsx`) —
   visíveis, ícone apagado, badge "Em breve" em vez de contador,
   renderizados como `<div>` não-clicável (nunca um `<Link>`, nunca uma
   rota `/dashboard/materiais`/`/dashboard/analytics` fabricada). Mesmo
   padrão que `PlaceholderScreen` já usa no App.
2. **O wordmark "doopla" em Anton que o Shell (e, antes disso, o
   `LogoPlaceholder` do App) desenhava era, ele mesmo, um logo
   inventado** — exatamente o que a regra "nunca redesenhar/reinterpretar
   o logo" proíbe, mesmo sem eu ter percebido isso na primeira entrega.
   Auditoria completa confirmou de novo (agora incluindo
   `mobile/assets/`, favicons): nenhum asset de logo oficial existe no
   repositório — os PNGs em `mobile/assets/` são o template padrão do
   Expo, nunca customizados pra marca Doopla. Corrigido nos dois lados
   (Web `pro-shell.tsx`, App `HomeTopbar.tsx`): texto puro "doopla",
   sem tipografia/cor de marca, só um link funcional — nunca uma
   tentativa de reproduzir a identidade visual. Pendência de asset real
   permanece registrada, agora sem nenhum wordmark inventado no lugar.

Nenhuma outra correção foi necessária — Foundation, separação de
papéis, ausência de Conversas na sidebar, CTA WhatsApp, Decisions
boundary, dados reais, 4 tabs Mobile e acessibilidade permaneceram
intactos, confirmado por `tsc`/`eslint`/`build` limpos de novo.

---

## Professional Product UI — Shell + Home fechado: novo dark é só pra role não-booker, `getRecentActivity` é vazio pra artista, logo virou pendência — 04/09/2026

Primeiro bloco visual (Web Shell + Home, App Home) sobre a Foundation.
Quatro decisões valem registrar:

1. **O novo Shell/Home dark nunca é visto pelo Booker** — condição
   exata é `profile.role !== 'booker'` (mesmo critério que o código
   antigo já usava pra tratar o legado `role='agencia'` como
   "não-booker"). Booker segue no shell/Home bege de sempre,
   comportamento bit-a-bit idêntico ao de antes — o código legado foi
   só EXTRAÍDO pra `legacy-shell.tsx`/`booker-home-view.tsx` (não
   reescrito), porque o narrowing de tipos do TypeScript depois de um
   `if (role !== 'booker') return ...` early-return torna qualquer
   `role === 'booker'` subsequente NA MESMA função um erro de tipo
   ("no overlap", já que `Profile['role']` é só `'booker' | 'artista'`)
   — extrair pra uma função separada com parâmetro próprio evita isso
   sem tocar em nenhuma linha de lógica do Booker.
2. **Achado real, não fabricado**: `getRecentActivity()`
   (`src/app/dashboard/data.ts`) só popula itens dentro de
   `if (role === 'booker')` — pra artista, SEMPRE retorna array vazio.
   O accordion "Atividade da Doopla" da nova Home (Web e App) portanto
   está sempre honesto ("Nenhuma atividade registrada ainda.") pro
   público real desta Home, porque a fonte de fato simplesmente não
   existe pro lado artista hoje. Não inventei uma versão nova dessa
   função pra "preencher" o accordion — isso seria construir lógica de
   negócio nova fora do que a Foundation preparou, então ficou
   registrado como gap real, não como bug corrigido.
3. **`EyeLogo` não é um asset portável** — seu CSS
   (`.eye-logo`/`.dot`/`.pupil`) só existe escopado a
   `#home-marketing`/`#site-chrome` (as duas stylesheets da área de
   marketing). Usado fora desses ids, renderiza sem nenhum estilo
   (texto solto). O novo Shell usa wordmark textual em Anton — mesma
   estratégia que o shell legado já usava ("doopla" em texto) — em vez
   de forçar um componente que quebraria visualmente. Fica registrado
   como pendência de asset real (regra do pedido: nunca improvisar um
   logo novo).
4. **"Sua Doopla em ação" perdeu o gráfico de linha do protótipo** —
   não existe série temporal real hoje pra sustentar aquele SVG
   animado (bookings conduzidos ao longo do tempo, decisões poupadas
   etc. eram todos números mock no HTML de referência). Virou um
   resumo de 2 métricas honestas (`bookingsConfirmedCount +
   bookingsCompletedCount`, `referralQualifiedCount`) com um empty
   state quando ambos são zero — gap registrado (falta um evento/
   agregação real de "eficiência"/"tempo poupado" pra essa seção fazer
   sentido de novo), nunca simulado.

Nenhuma dessas decisões alterou Runtime/Approval/Policy Gate/Conversas
— o bloco inteiro é consumo de leitura sobre a Foundation já validada.

---

## Professional Product UI — Foundation fechada: contratos preparados, nenhuma UI nova, um achado de segurança corrigido — 04/09/2026

Bloco de fundação técnica pro futuro Professional Product UI (Web+App)
— explicitamente NUNCA a interface final, só contratos/read
models/boundaries. Três decisões valem registrar:

1. **`request_whatsapp_verification` nunca pode ser chamada direto do
   Mobile** — achado real durante o bloco, corrigido antes de qualquer
   código de produto usar o desenho errado. A RPC devolve o código OTP
   em texto puro (única vez que ele existe fora do hash) pro CALLER
   mandar via WhatsApp — no Web isso sempre foi um Server Action
   (segredo `WHATSAPP_ACCESS_TOKEN` nunca sai do servidor). Uma
   primeira versão do boundary Mobile chamaria a RPC direto, o que
   vazaria o código em texto puro pro dispositivo sem nunca mandar
   pelo WhatsApp de verdade. Corrigido extraindo a lógica pra
   `src/lib/whatsapp-identity/request-verification.ts`, compartilhada
   por Web (Server Action) e Mobile (rota de API nova, Bearer→
   `resolveUserFromToken`, mesmo padrão já usado em Conversas Bloco 2).
   `confirm`/`revoke` não têm esse problema (nunca expõem segredo) —
   Mobile chama essas duas RPCs direto.
2. **`get_professional_home_facts()` (migration 0067) é o único read
   model canônico dos fatos da Home** — decisão explícita de ter UMA
   fonte server-side (não duas implementações client divergindo aos
   poucos), justificada especificamente porque Web e Mobile não
   compartilham grafo de import nesta base de código (mesma razão que
   já justificava duplicar funções puras como `deriveConversationState()`
   — aqui a resposta é centralizar no servidor em vez de duplicar,
   porque é agregação, não lógica pura barata). Escopo deliberadamente
   estreito: nunca reimplementa `getAttentionItems()` (representation_requests/
   opportunities/invites) — só fatos objetivamente contáveis. Gap
   registrado, não resolvido silenciosamente.
3. **Resíduo do fluxo REMOVED "Doopla Verified" removido do código**
   (`isDooplaVerified()`, `verifyBadgeClass`, o badge e o botão
   desabilitado "Reenviar link de validação" no detalhe do booking) —
   `validated_at` comprovadamente nunca é escrito em nenhum código,
   então eram sempre-falsos. O item "Validado" dentro de
   `getBookingCheckpoints()` (fileira de 5 checkpoints) foi
   DELIBERADAMENTE preservado — mesma coluna morta, mas removê-lo
   mexeria no layout de um componente de 5 itens, fora do escopo desta
   Foundation ("não redesenhar telas"); registrado como gap, não
   resolvido.

## Conversas Bloco 2 fechado: boundary único, proveniência imutável, `Encerrada` não lê `mandate` — 04/09/2026

Revisão adversarial pós-entrega (commit `9d22034`) confirmou dois
pontos que valem registrar porque não são óbvios só lendo o código:

1. **Retry não pode alterar o fato histórico persistido** — não bastava
   provar que uma segunda chamada não acontece (dedupe de
   `claim_inbound_event`); era preciso provar o ESTADO FINAL. Teste
   reforçado com o caso `edited` de propósito (o mais importante, já
   que é o que não pode virar `sent` depois): grava o fato, tenta o
   retry com a mesma identidade idempotente, releitura confirma UMA
   única mensagem com `replied_to_outbound_intent_id`/
   `prepared_response_outcome` idênticos aos da primeira gravação.
2. **`deriveConversationState()` (estado `closed`/"Encerrada") lê
   exclusivamente `conversations.status IN ('closed','archived')`** —
   `conversations.mandate` nunca entra nessa função, hoje nem é
   passado como parâmetro pra ela. Auditoria confirmou que isso não é
   um bug: `mandate` não tem CHECK constraint no banco, mas nenhum
   código de aplicação jamais chama `set_conversation_mandate` com
   outro valor além do default `'active'` — não existe hoje nenhuma
   semântica real de pausa/suspensão/transferência que a função
   estivesse ignorando por engano. **Gap registrado pra quando
   `mandate` ganhar semântica operacional real**: `deriveConversationState()`
   vai continuar ignorando mudanças de `mandate` até uma revisão
   explícita acontecer nesse momento — nunca inventar semântica pra um
   mecanismo que hoje não é usado por ninguém.

Nenhuma das duas verificações mudou código de produto — só o teste
adversarial (reforçado) e esta documentação.

## Quatro superfícies distintas do profissional/booker — Professional Web final ≠ painel atual — 04/09/2026

`src/app/dashboard/` (o painel web já em uso em todo bloco de backend
até aqui — bookings/agenda/dinheiro/conversas etc., real, não mock)
**não é** o "Professional Web Dashboard final". São 4 superfícies
distintas, nenhuma superpondo a outra: Professional Web Dashboard final
(design produzido externamente, ainda não fornecido — não inventar
antes dele chegar), Professional App (`/mobile`, evolutivo, parcialmente
real), Booker Web Dashboard (não existe — o booker hoje só vê fatias
dentro do MESMO painel do profissional) e Booker App (não existe).
Motivo de registrar: o painel atual é funcional e será continuamente
usado pra validar backend, mas isso não deve ser lido como "o painel
final já está pronto" em nenhuma leitura futura deste repositório.

## Fluxos históricos REMOVED/SUPERSEDED: Doopla Verified/link de confirmação, modelo antigo de Booker/marketplace — 04/09/2026

Auditados e confirmados inertes/substituídos, não devem orientar
implementação nova: **Doopla Verified** (selo calculado por
`validated_at`, que nenhum código escreve hoje — auditado, zero
INSERT/UPDATE em `src/`) e o **fluxo de confirmação de booking por
link do cliente** que o alimentaria (nunca chegou a ser construído,
incluindo o copy "Você recebeu uma mensagem da Doopla? Precisa
confirmar o link..." e qualquer reenvio automático desse link) —
`[REMOVED]`. O modelo de identidade/confirmação vigente é outro
(WhatsApp verificado por OTP + Runtime/Conversas). O **modelo antigo de
Booker/marketplace** (bookers/matching/comissão como eixo central) é
`[SUPERSEDED]` sempre que conflitar com o modelo Booker atual (carteira
multi-profissional, permissões por `professional_id`, cobertura de
assinatura, já registrado abaixo em "Booker: não classificado como
definitivamente pós-beta") — só continua vivo nas páginas públicas de
marketing ainda não revisadas, gap já conhecido e fora de escopo desta
reconciliação.

## Lista PENDING/FUTURE do roadmap não é ordem de implementação — 04/09/2026

Checkpoint de documentação (PROGRESS.md, "Checkpoint de documentação —
reconciliação de roadmap e superfícies") registrou 14 grandes frentes
pendentes (Professional Web/App final, Booker Web/App, WhatsApp
Identity UX, Lifecycle Messaging V1, Intervention Moments/Feedback
wiring, Conversas Bloco 3, Booker capabilities, onboarding/Representation
Profile, planos/billing/NF Booker, Pro representation email, materiais
Pro, Community/Fórum, notifications, referral, QA/E2E, legal/LGPD,
Career Intelligence). Decisão explícita: essa lista é um REGISTRO, não
uma fila — a ordem dos próximos blocos será decidida depois de uma
auditoria de dependências e das superfícies finais, nunca inferida da
posição de um item na lista.

---

## Conversas: aba primária foi descartada, acesso é secundário via Booking — 03/09/2026

A primeira versão do produto tratava "Conversas" como área própria de
navegação (aba primária do painel). Revisão de produto (registrada em
`PROGRESS.md`, seção "Revisão de produto Home/Bookings/Conversas/
Precisa-de-você/WhatsApp") decidiu o contrário: a Doopla **representa**
o profissional — o objetivo nunca foi transformar o profissional em
operador de chat. Conversas virou um ponto de acesso **secundário**
("Ver conversa"), alcançado a partir do Booking/oportunidade a que ela
pertence, nunca uma aba própria. Isso é `[SUPERSEDED]`, não uma opção
em aberto — qualquer trabalho futuro em Conversas (Bloco 2) parte dessa
spec, nunca da versão de aba primária.

## Camada A/B/C de evidência: conhecer nunca é autorizar, mesmo citado e real — 03/09/2026

Estabelecida no bloco Professional Intelligence Context, preservada
sem alteração em Beta Instrumentation. Três camadas, nunca misturadas:
(A) context/reasoning evidence — toda citação validada contra o
`ContextPackage` real, usada só pra o Planner se preparar/redigir
melhor; (B) commitment-authorizing evidence — subconjunto restrito
(`professional_profile`/`opportunity`/`booking`/`external_participant`/
`conversation_message`) que sozinho pode sustentar
`report_existing_fact`/`answer_with_known_information`; (C) autorização
real — Mandate/Approval/Policy Gate, que nem leem `ContextPackage`.
Preferência declarada (`professional_business_context`) e histórico
comercial (`professional_commercial_history`) **nunca** entram na
camada B, mesmo grounded e citados — cachê de um booking passado nunca
é o cachê deste booking. Se algum bloco futuro precisar que uma fonte
nova influencie autorização, isso é uma mudança deliberada em
`COMMITMENT_AUTHORIZING_SOURCE_TYPES` (`planner/invariants.ts`), nunca
um acidente de fonte nova "vazando" pra camada B.

## Intervention Moments: `approval` nunca é um tipo válido, ausência de intervenção não é sinal positivo — 03/09/2026

Rascunho inicial do Beta Instrumentation incluía `approval` como um
`intervention_type` e cogitava tratar "nenhuma correção detectada" como
aprovação implícita. As duas premissas foram corrigidas antes de
implementar: aprovação/aceitação positiva é **behavioral feedback**,
sempre derivado de estruturas que já provam um sinal positivo real
(`approval_records`/`approval_resolutions`), nunca uma linha nova em
`intervention_moments` nem a ausência de uma. Motivo: ausência de
intervenção pode significar tanto "o profissional aprovou" quanto
"o profissional nunca viu/nunca teve chance de reagir" — são coisas
diferentes, e só a primeira é sinal positivo real. Uma futura métrica
`action_without_intervention` pode existir, mas precisa de janela/estado
terminal definidos e nunca deve ser lida como aprovação.

## Lifecycle + Transactional + Operational Messaging: V1 é pré-beta, não pós-beta — 03/09/2026

Decisão revisada nesta data (contradiz uma leitura anterior, do mesmo
dia, que tinha classificado o bloco inteiro como pós-beta). Motivo: a
Doopla é WhatsApp-first — o profissional não pode depender de abrir o
painel pra descobrir que uma decisão está pendente. A versão completa
(todo o vocabulário `scheduled/due/suppressed/sent/delivered/responded/
resolved/cancelled/escalated` e todos os `signal_type`) continua podendo
evoluir depois do beta; um V1 cobrindo pelo menos `DECISION`/`RISK`/
`RESOLVED` e compromissos temporais, com `why_now`/revalidação de
estado/dedup/suppression/smart silence, é pré-beta.

## Booker: não classificado como definitivamente pós-beta — 03/09/2026

Booker/`authorized_collaborator` não bloqueia o primeiro fluxo
mono-profissional (o beta funciona sem ele). Mas sua entrada no beta
comercial continua sendo uma decisão de produto em aberto, não uma
conclusão técnica — não presumir "fica pra depois" como definitivo.
Enquanto a decisão não vier: preservar todo o modelo já desenhado
(carteira multi-profissional, permissões por `professional_id`,
cobertura de assinatura) sem implementar nada novo — `resolveCapabilities`/
`resolveActorContext` (`src/lib/intelligence/actor-context.ts`)
continuam com `authorized_collaborator` em capabilities vazias até essa
decisão vir, e o mecanismo de extensão (capability-gating, nunca
actor-type hardcoded) já está pronto pra receber isso sem redesign.

---

## "Precisa da sua atenção" (artista): não incluí "contrato aguardando validação" — 19/08/2026

O pedido de revisão da Visão Geral do artista dá como exemplo "Seu
contrato está aguardando validação → Revisar →". Não implementei esse
item porque ele não é honesto hoje: a validação de um booking (Doopla
Verified) depende de um link que o cliente final recebe pra confirmar,
e essa página ainda não existe (`getBookingCheckpoints`/`isDooplaVerified`
já preparam o dado, mas o botão "Reenviar link de validação" no booking
do Booker está `disabled` com "Em breve"). Pro artista especificamente,
hoje não existe nenhuma ação real que ele possa tomar sobre isso — o
texto atual já é honesto ("Fale com [Booker] pra enviar a validação ao
cliente"), mas não é uma ação DELE, é uma ação do Booker. Colocar isso
em "Precisa da sua atenção" com um "Revisar →" que não leva a nenhuma
ação real quebraria a regra que a própria revisão está reforçando (nunca
mostrar algo acionável que não é). Quando a página de validação do
cliente existir, esse item volta a fazer sentido — fica documentado
aqui pra não esquecer o motivo.

## Nota Fiscal: `requires_invoice` fixado na criação do booking, não editável depois — 18/08/2026

O pedido (LOTE 2 Parte 2, item 16) diz que "se o prazo ainda estiver 'A
confirmar', não tratar como condição financeira fechada — quando o prazo
for descoberto/alterado... ambas as partes precisam visualizar antes do
fechamento definitivo." Isso é claramente sobre o **prazo de pagamento**
(`invoice_payment_term`), que implementei como editável pelo Booker a
qualquer momento antes do booking fechar (`updateInvoiceTermAction`).

O que eu decidi (não estava explícito no pedido): se **exige NF ou não**
(`requires_invoice`) é fixado no momento em que o booking nasce — na
proposta (`proposeBookingAction`/publish-form) ou na seleção de um booker
a partir de uma oportunidade (`selectBookerForOpportunityAction`, que
carrega o valor da oportunidade) — e não é editável depois. Motivo: é
exatamente o mesmo tratamento que `payment_mode` já recebe hoje (também
fixado na criação, sem edição posterior) — mudar só o `requires_invoice`
pra ser editável quebraria a simetria sem necessidade e abriria a
pergunta de "o que acontece com `invoice_terms_accepted_at` se o booking
já foi aceito sem saber que precisava de NF" sem uma resposta óbvia no
documento. Se precisar mudar depois de criado, a via existente já
resolve: `counterBookingAction` (contraproposta) antes do aceite, ou
recriar a proposta.

Efeito colateral aceito: uma oportunidade publicada como "ainda não sei"
carrega esse valor pro booking e fica visível como "Nota fiscal: a
definir" (`/dashboard/oportunidades/[id]`) sem nenhum fluxo dedicado de
resolução forçada — quem descobre que precisa de NF depois de já ter um
booking em andamento não tem como marcar isso no sistema nessa v1. Não é
o cenário mais comum (a oportunidade normalmente já resolve isso antes
da negociação virar booking) e documentar aqui é melhor do que inventar
uma tela de "editar retroativamente" sem o pedido pedir isso.

## Nota Fiscal: só o artista marca as etapas de faturamento, nunca automatiza a comissão — 18/08/2026

Item 24 do pedido é explícito: "não simular integrações que ainda não
existem... não inventar sucesso de pagamento, NF emitida, split
realizado, saque disponível ou comissão liquidada sem evento real que
sustente esse estado." Não existe emissor fiscal, PSP pra esse fluxo nem
cobrança automática — então as 4 etapas (`invoice_issued_at` →
`invoice_sent_to_client_at` → `invoice_client_paid_at` →
`invoice_commission_paid_at`) só avançam quando o próprio artista clica
pra confirmar que aconteceu de verdade (`advanceInvoiceStage` em
`actions.ts`), sempre em ordem, nunca pulando etapa. O Booker nunca marca
essas etapas — ele só vê o estado e o valor de "comissão pendente"
calculado (cachê × comissão), nunca uma cobrança disparada de verdade.
Isso também é por que `markPaidAction` (o "Marcar como pago" que existia
pro fluxo processado pela Doopla) foi desativado pra bookings com
`requires_invoice = 'sim'` — a Doopla nunca processou esse pagamento pra
poder confirmá-lo.

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

---

## LOTE 2 Parte 1: Artista agenciado — decisões estruturais — 18/08/2026

Antes de codificar, mapeei o que já existia (pedido explícito do
próprio LOTE 2). Achado principal: **"agência" já não é um conceito à
parte no produto — é só um Booker.** `role = 'agencia'` e
`agency_profiles` são schema legado de uma versão anterior do
cadastro; hoje `/cadastro` só aceita `artista`/`booker`, e a seção
"para agências" da Home já manda pra `/cadastro?role=booker`. Isso
significa que boa parte da Parte 1 (agência = terceiro tipo de conta,
vínculo artista↔agência, permissões por vínculo, agenda como fonte
única, plano separado do vínculo) **já estava resolvida por
construção** antes mesmo desse pedido chegar — `representations` já
modela exatamente "Booker/Agência representa Artista" sem distinção,
e `subscriptions` do artista já é 100% independente de qualquer
vínculo (confirmado relendo `terminate_representation`, que nunca
toca a assinatura do artista). Não recriei nada disso.

- **O gap real era um só, e concreto**: convite pra alguém sem conta
  tinha um `token` (desde a migration 0005) que nunca era usado de
  verdade — o vínculo só acontecia se o e-mail do convite batesse
  EXATAMENTE com o e-mail do cadastro, checado uma única vez no
  momento de criar o convite. Se a pessoa se cadastrasse depois (o
  caso normal), o convite nunca resolvia. Migration 0034 resolve isso:
  `pendingInviteToken` no cadastro liga direto pelo token, sem
  depender de contato bater.
- **Nova rota pública `/convite/[token]`**: lookup via RPC
  `get_invite_by_token` (SECURITY DEFINER, projeção mínima — nunca
  vaza o convite inteiro, nunca resolve token já confirmado). CTA leva
  pro cadastro com o token na URL.
- **Onboarding reduzido implementado como um branch curto do wizard
  existente, não um fluxo paralelo**: `getQuestionSteps` já era uma
  função que decide os passos dinamicamente a partir das respostas —
  só adicionei mais um branch (`inviteToken` presente → nome artístico
  + nome completo + plano, pula tudo de matching). Reaproveita
  literalmente os 2 primeiros itens de `ARTISTA_CARREIRA_STEPS`
  (slice), não duplica os campos.
- **Aceite explícito reaproveita a tela que já existia**
  ("Convites pendentes" no `/dashboard`, com botão Confirmar) em vez
  de construir uma tela nova só pra esse caminho — já satisfaz
  "artista precisa aceitar explicitamente", já cria o vínculo
  automaticamente ao confirmar (mesmo mecanismo de sempre,
  `confirmInviteAction`), já revalida as duas telas.
- **Link de convite exposto no fluxo "Adicionar um Artista" já
  existente** (`add-connection-modal.tsx`, do lote anterior) em vez de
  criar um formulário de convite separado — `inviteArtistAction` agora
  retorna o token, o modal mostra o link copiável na hora.
- **Simplificação assumida**: não construí um campo de "colar código
  de convite manualmente" na tela de cadastro — quem chegou sem usar o
  link só vê um texto avisando que a agência tem um link próprio. Não
  é um input funcional. Se isso for necessário de verdade (alguém
  perde o link e precisa digitar um código), é um pedido novo, não uma
  extensão trivial disso aqui.
- **Não construído (documentado como deliberadamente fora de escopo,
  não esquecido)**: modelo de permissões granular por vínculo (agenda
  × bookings × contratos × financeiro, ligar/desligar por relação). O
  próprio pedido autoriza isso: "mesmo com MVP simples, não codificar
  de forma que impeça essa separação depois" — e nada do que existe
  hoje (`representations` como tabela de vínculo simples, sem lógica
  embutida assumindo acesso total em outro lugar) bloqueia adicionar
  isso depois. Hoje o acesso continua binário (tem vínculo = acesso
  completo), do jeito que já era antes desse pedido.
