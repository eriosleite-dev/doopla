# Doopla — decisões de arquitetura/produto

Registro datado das decisões que não são óbvias só de ler o código —
o "porquê" por trás de uma trava ou de um design escolhido. Complementa
o `PROGRESS.md` (que é sobre status) e o `AUDITORIA_BLOCO_4_5.md` (que
é sobre segurança). Aqui é sobre decisões que, se esquecidas, levariam
a desfazer ou recodificar algo que já foi decidido de propósito.

---

## Nova Home V2: o logo é a implementação real do produto, o mockup só posiciona — "o logo olha, os mascotes piscam" — 09/09/2026

Depois de duas idas e vindas (primeiro pedido um PNG oficial que nunca
chegou ao ambiente, depois confirmação explícita de que não haveria
PNG nenhum), a decisão final do usuário foi clara: a fonte de verdade
do logo Doopla é `EyeLogo.tsx`, já usado em `SiteHeader`/`SiteFooter`/
`SiteMenuOverlay`/`LoginModal`/`CreateAccountModal`/`/login` — nunca o
desenho aproximado dentro do `doopla-home-mockup.html` (que só serve
de referência de posição/tamanho/proporção). Reproduzi o MESMO
desenho (mesma marcação — "d" + dois olhos + "pla", mesma fonte
`Familjen Grotesk`) em HTML cru dentro de `home.html` (não dá pra
montar um componente React inline no meio do fluxo do header/footer
de uma Home que é injetada via `dangerouslySetInnerHTML`) — nunca
recriei a fonte, nunca inventei um SVG novo. `EyeLogo.tsx` em si não
foi tocado — zero risco pras outras 6+ superfícies que já o usam.

Tracking de cursor nas pupilas do logo (só header/footer da Home,
escopo explícito) reaproveita `initMascotEyes()` de `home.js` sem
nenhuma mudança de código — a função já escaneava `.nav-logo`/
`.foot-logo`/`.mascot-pupil` desde a Home V1 (08/09/2026); só precisei
usar essas classes na marcação nova do logo.

Grade de animação explícita do usuário, repetida em várias mensagens:
**"o logo olha, os mascotes piscam"** — nunca o contrário. Os 3
mascotes do mockup (corpo redondo + olhos + sorriso) ganharam piscada
(`initMascotBlink()`, timers independentes por instância, nunca
sincronizados), nunca tracking de cursor. O logo ganhou tracking,
nunca piscada.

## Nova Home V2: olhos grandes da seção WhatsApp são o MESMO elemento da Home anterior, só sem o corpo — 09/09/2026

Instrução explícita e repetida: o card/mascote do mockup na seção
"Sempre com você" (a que fala de WhatsApp) deveria ser substituído
pelos "dois olhos grandes" já existentes e aprovados na Home anterior
— preservando exatamente desenho, pupilas, tracking, "pulinhos",
timing, easing, amplitude. Proibição explícita: não recriar os olhos,
não transformá-los em mascote.

Implementação: reaproveitado o `.mascot`/`.mascot-eye`/`.mascot-pupil`
já existente (mesmo elemento que também vira os mascotes com
piscada), com um modificador CSS novo (`.mascot-eyes-only`) que só
zera o `background`/`box-shadow`/`::before`/`::after` (corpo vermelho
e pernas) — nunca um componente separado, nunca um recorte visual
novo. `initMascotEyes()` (tracking) continua pegando esses olhos
automaticamente, sem mudança de código; `initMascotBlink()` (piscada)
não pega, porque só escaneia `.mascot .eyes-row .mascot-eye`, e esses
olhos não têm `.eyes-row` — por construção, nunca por exceção
hardcoded. Fundo da seção virou vermelho Doopla sólido (`--red`,
mesmo token de sempre); legenda "Mais que automação. Representação."
(única onde existia) virou "Sua Doopla sempre com você." (única
ocorrência agora).

## Nova Home V2: Menu vira overlay próprio da Home, nunca reskin do SiteMenuOverlay compartilhado — 09/09/2026

O usuário aprovou explicitamente, na rodada anterior (auditoria
pré-implementação), a decisão de não re-skinar `SiteHeader`/
`SiteFooter`/`PageShell`/páginas institucionais compartilhadas nesta
rodada. O novo mockup, porém, especifica um "Menu" que abre uma
navegação em overlay de tela cheia — o mesmo padrão de interação que
`SiteMenuOverlay.tsx` já implementa, mas com tema claro (institucional)
incompatível com o novo visual dark da Home.

Decisão: `HomeMenuOverlay.tsx` deixou de delegar pro `SiteMenuOverlay`
compartilhado e passou a renderizar seu próprio overlay escuro,
exclusivo da Home — reaproveitando o PADRÃO de interação (trigger
nativo, Escape fecha, scroll trava, foco volta pro trigger ao fechar),
nunca o componente/CSS compartilhado em si. `SiteMenuOverlay.tsx` e
`site-chrome.css` continuam 100% intocados — as páginas institucionais
não sofrem nenhum efeito colateral desta rodada.

## Nova Home V2: conflitos entre o mockup estático e a especificação escrita, resolvidos e registrados — 09/09/2026

Regra geral combinada: em conflito, mockup vale pra visual/composição,
especificação escrita vale pra rotas/dados/lógica/comportamento, e
nenhum conflito relevante deveria ser resolvido em silêncio. Dois
conflitos reais apareceram durante a implementação:

- **Header do mockup vs. especificação do Menu**: o arquivo
  `doopla-home-mockup.html` mostra 5 links soltos no header (nunca um
  botão "Menu"), e o nav simplesmente desaparece no mobile sem
  nenhuma navegação substituta. A especificação escrita pede,
  explicitamente e com checklist de QA próprio, um botão "Menu"
  persistente (desktop e mobile) abrindo overlay de tela cheia.
  Resolvido a favor da especificação escrita — o mockup aqui era
  claramente uma composição estática incompleta pro estado interativo
  mobile, não uma instrução deliberada de remover navegação.
- **FAQ ausente do mockup vs. item "FAQ" pedido no Menu**: o novo
  mockup não tem seção de perguntas nenhuma, mas a especificação do
  Menu lista "FAQ" como um dos 6 destinos. Resolvido mantendo a seção
  FAQ da Home anterior (8 perguntas, cópia idêntica, só restilizada) —
  sem ela, o item do menu não teria pra onde apontar.

Nenhum dos dois foi decidido soterrando a instrução original: ambos
favorecem a leitura mais explícita/detalhada quando as duas fontes
divergem, nunca uma reinterpretação de gosto próprio.

## Bloco 85/P1 fechado: item (i) "outros itens menores" nunca teve conteúdo recuperável — não é dívida pendente — 09/09/2026

O bloco 85 (auditoria de fechamento do Professional Product UI, 5
agentes em paralelo) resumiu tudo que não virou P0 nem os 8 itens P1
nomeados (a)-(h) na frase solta "e outros itens menores", sem
enumerar nada. Com (a)-(h) todos entregues (blocos 86-92), investiguei
se essa frase escondia algum item real esquecido antes de declarar o
bloco fechado.

**Não escondia.** O próprio texto do bloco 85 já avisa que é um
resumo ("auditoria completa, não repetida aqui") — o output bruto dos
5 agentes nunca foi persistido em nenhum arquivo, commit ou contexto
de sessão acessível hoje (`git log -S"outros itens menores"` só
retorna o commit que criou a frase; nenhum arquivo de auditoria foi
deletado do histórico; a sessão que rodou os 5 agentes já tinha
terminado antes desta janela de trabalho começar). Toda "achado
fora de escopo"/"pendência" registrada nos próprios blocos 86-92 (o
trabalho de entregar a-h, que naturalmente tropeçou em detalhes
adjacentes) já corresponde a itens que o usuário identificou
explicitamente como *outros* achados conhecidos, não parte do (i):
`available_for_referrals`, Contract/PaymentDue/Dispute no App,
`MonthCalendar.tsx`, Home pública congelada. O único resíduo fora
dessa lista (botão "X" do `ProfileModal` fora do tema `--pro-*`,
bloco 86) já é uma decisão de escopo deliberada e documentada — não
um item esquecido.

**Decisão**: (i) não é uma tarefa adiada, é uma frase de resumo cujo
conteúdo original se perdeu com o fim daquela sessão. Não inventei
itens novos pra "preencher" o rótulo — isso seria criar um roadmap
não pedido. Bloco 85/P1 declarado `[CLOSED]`. Qualquer achado pequeno
real que aparecer depois disso entra como achado novo, com contexto
próprio — o rótulo "(i)" deixa de ter qualquer significado
operacional daqui pra frente.

## Professional Product UI — Shell + Home, QA closure pass: mascote "sumido" é o mesmo incidente do erro de dados — 04/09/2026 (mesmo dia, terceira review)

Achado que vale registrar pra nunca mais investigar do zero: o
founder reportou dois sintomas separados (Home com erro de dados;
mascote não aparece no hero) que na verdade são **o mesmo incidente**.
`ProMascot` só existe dentro de `ProHero`, que só é alcançado depois
do `if (!homeFacts) return (fallback de erro)` em
`professional-home-view.tsx` — enquanto `get_professional_home_facts()`
falhar no ambiente (migration não aplicada no Supabase real da
Preview, ver seção 69 do PROGRESS.md), a Home inteira cai no fallback
e nada abaixo dele — incluindo o mascote — chega a montar no DOM.
`ProMascot` em si foi relido linha por linha e está correto (olho
preto, pupila branca, tracking, `prefers-reduced-motion`) — não foi
tocado nesta rodada porque não há nada pra corrigir nele. **Lição**:
antes de investigar um elemento visual "sumido" como bug de CSS/render,
checar se ele está atrás do mesmo early-return de um fetch que já
está com erro conhecido.

Também nesta rodada: contraste dos itens "Em breve" da sidebar
melhorado (`--pro-tx-45` novo token, era `--pro-tx-30`) e 6
travessões removidos de copy voltada ao usuário no Shell/Home novo
(Web+App) — nenhum deles alterava fato/contrato, só pontuação/cor.
Nenhum token `--accent` legado foi tocado (a regra explícita foi não
fazer replace global — isso redesenharia telas legadas sem querer).

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

## Professional Web Dashboard — revisão completa de produto/UX — 06/09/2026

- **Bug real descoberto ao desbloquear a Home** (não fazia parte do
  pedido original, mas bloqueava tudo): `formatRelativeTime`/
  `proStatusPillClass` viviam em `pro-ui.tsx` (`'use client'`) e eram
  chamadas diretamente por `professional-home-view.tsx` (Server
  Component) — Next.js proíbe isso (só permite renderizar como
  componente). Nunca disparava porque `homeFacts` era sempre `null`
  antes das migrations serem aplicadas; a Home sempre saía cedo. Só
  apareceu no primeiro carregamento real, com dado de verdade. Movidas
  pra `pro-format.ts` (sem `'use client'`) — decisão: nunca misturar
  função pura server-safe com componente client-only no mesmo arquivo,
  daqui pra frente.
- **Fonte única de métricas de conversa, decidida ANTES de
  implementar** (usuário pediu confirmação explícita, não uma escolha
  livre do agente): `getCachedConversationStateSummary`
  (`pro-home-cache.ts`) é a ÚNICA função que agrega estado de conversa
  — sidebar, Home e `/dashboard/decisoes` chamam ela, nunca uma
  reimplementação de `deriveConversationState`. Causa raiz do 17≠20
  documentada: `decisions.length` contava LINHAS (uma conversa podia
  gerar `pending_reply` + `prepared_draft` ao mesmo tempo = 2 linhas),
  o badge contava CONVERSAS. Resolvido agrupando por `conversationId`
  antes de exibir (`groupDecisionsByConversation`), nunca mudando o
  banco.
- **`/dashboard/decisoes` nasce sem aba "Resolvidas"** — decisão
  explícita do usuário depois de eu confirmar que não existe hoje
  nenhuma leitura real de decisões já resolvidas (só
  `runtime_pending_replies.status='pending'`/
  `outbound_intents.delivery_state='policy_allowed'` são lidos por
  `listActionableDecisions`; o resto do enum existe na tabela mas
  nunca foi exposto por nenhuma UI). Não inventei a query. Se um dia
  isso for pedido, é um recurso novo, não uma extensão trivial.
- **`payout_requests`/`getPayoutBalance`/`PayoutForm`/
  `requestPayoutAction` deletados do produto** (não só escondidos da
  UI) — confirmado por grep, sem nenhum consumidor real antes da
  remoção (o botão de saque já era `disabled`, sem `formAction`, nunca
  funcionou pra ninguém). A migration que criou a tabela
  (`0014_payout_requests.sql`) NUNCA foi tocada/reescrita — a tabela
  continua existindo fisicamente no schema, só não é mais lida/escrita
  por nenhum código vigente. Regra geral adotada: "zero referência"
  significa runtime/UI/actions/data layer atual, nunca migrations
  históricas.
  **Correção (08/09/2026)**: esta afirmação era verdadeira só pro Web
  na época. Uma auditoria de fechamento do Professional Product UI
  encontrou o fluxo de saque ainda 100% vivo no App
  (`mobile/app/(tabs)/mais/financeiro.tsx`, gravando direto em
  `payout_requests` via `mobile/src/lib/data/payments.ts`, nunca
  removido quando o Web foi limpo). Corrigido — App agora também não
  tem nenhum caminho de código que leia/escreva `payout_requests`,
  igualando ao Web. A tabela em si continua intocada, mesma regra de
  sempre.
- **Escopo do redesign é só o profissional (artista)** — Booker/Agência
  seguem vendo exatamente as telas antigas nas mesmas rotas
  compartilhadas (`/dashboard/trabalhos`, `/dashboard/agenda`,
  `/dashboard/dinheiro`, `/dashboard/perfil`), via branch por
  `profile.role`, mesmo padrão já usado em `layout.tsx`/
  `dashboard/page.tsx` desde o bloco Shell + Home. Nenhuma regressão
  visual/funcional intencional pro Booker — única mudança que afeta os
  dois papéis é a remoção do saque morto (que já não funcionava pra
  nenhum dos dois).
- **Perfil profissional não foi re-skinado** — só movido de
  `/dashboard/perfil` pra `/dashboard/perfil/editar`, mantendo os
  componentes reais (`ArtistProfileForm`/`AvatarUploader`/
  `PublicProfileCard`/`LinkRoutingCard`) intocados visualmente.
  Decisão: um formulário grande, multi-seção e já funcional não vale o
  risco de re-skin não pedido explicitamente — registrado como
  pendência aberta, não escondida.

## Professional Web Dashboard — rodada de correção e consistência — 06/09/2026

- **"Resolvida por você" é um rótulo estático, não uma coluna nova** —
  confirmação explícita do usuário: NÃO adicionar
  `resolved_by_profile_id`/qualquer migration de autoria agora. Hoje só
  o profissional tem capability de resolver decisão (Booker não tem
  `authorized_collaborator` de reply), então a resposta é sempre
  trivialmente verdadeira. Quando o Booker ganhar essa capability,
  autoria/auditoria real entra como parte DAQUELE bloco de trabalho,
  nunca antecipada aqui sem uso real.
- **Canais de booking não vira porta de volta pro Perfil profissional**
  — o usuário rejeitou explicitamente mover "Editar informações
  públicas" pra lá. Canais de booking é só superfície de
  entrada/roteamento externo (link de orçamento, WhatsApp da Doopla,
  código/slug) — nunca um lugar de edição de dados.
- **"Perfil profissional" descontinuado como NAVEGAÇÃO, nunca como
  dado/rota** — o card sai de Configurações, mas `artist_profiles`,
  `/dashboard/perfil/editar` e todo consumidor existente (onboarding,
  Intelligence Context, página pública de orçamento, Community)
  continuam intocados. Por instrução explícita, NENHUMA entrada
  genérica nova foi criada agora só pra "resolver a navegação" — a
  superfície futura de edição é decisão separada do usuário, tratada
  fora deste patch.
- **"Seu código" usa `profile.slug`, nunca `referral_code` nem campo
  novo** — aprovado explicitamente por ser o único token real que o
  algoritmo de roteamento de WhatsApp Inbound
  (`extractDooplaSlugToken`/`evaluateWhatsappRouting`,
  `src/lib/channels/whatsapp/intake-routing.ts`) de fato reconhece.
  `referral_code` (migration 0020) é um hex aleatório pra outro
  propósito (indicação/referral), confirmado por leitura da migration
  antes de descartá-lo como candidato.
- **Bug de `revalidatePath` era resíduo do redesign anterior (§72), não
  algo novo** — quando `ArtistProfileForm`/`AvatarUploader`/
  `PublicProfileCard`/`LinkRoutingCard` migraram pra
  `/dashboard/perfil/editar`, os `revalidatePath('/dashboard/perfil')`
  dentro das Server Actions correspondentes (`actions.ts`) ficaram
  apontando pra rota errada — o formulário real passou a mostrar dado
  desatualizado até um refresh manual. Corrigido só nas 5 ações
  artista-only cujo formulário de fato migrou; a ação booker-only
  (`updateBookerProfileAction`) foi conferida e mantida como estava,
  por seu formulário nunca ter saído de `/dashboard/perfil`.
- **Logo oficial da doopla: mobile NÃO tem asset reaproveitável —
  verificado antes de pedir qualquer arquivo novo** — o usuário
  levantou a hipótese de que o app mobile já usava o logo correto e
  pediu pra eu localizar e reaproveitar essa fonte antes de pedir um
  PNG novo. Investigação (agente de exploração, 06/09/2026, grep
  exaustivo em `mobile/` por "logo"/"wordmark"/"doopla" + inspeção de
  `mobile/app.json` + leitura de todos os PNGs em `mobile/assets/`)
  confirmou que a hipótese não se sustenta: `mobile/src/components/
  home/HomeTopbar.tsx` renderiza só `<Text>doopla</Text>` em
  tipografia de corpo — mesmo tipo de placeholder de texto puro que o
  painel web tinha, com um comentário no próprio código do mobile
  registrando que uma tentativa anterior de estilizar o "o" como os
  olhos do logo real foi removida por review explícita, por ser um
  wordmark inventado. `mobile/assets/*.png` (`icon.png`,
  `splash-icon.png`, `android-icon-*.png`, `favicon.png`) são ícones
  padrão de scaffold do Expo, nunca customizados pra marca. O único
  componente que visualmente parece o logo real é `EyeLogo.tsx` (site
  de marketing) — um `<span>` de texto com CSS escopado
  (`home.css`/`.eye-logo`/`.dot`/`.pupil`), não uma imagem, e não usado
  pelo mobile. Conclusão: web e mobile compartilham o MESMO gap (nenhum
  asset de imagem real da marca existe em lugar nenhum do repo hoje) —
  não havia nada pra reaproveitar, então nada foi duplicado. Isso não é
  tratado como pendência bloqueante deste patch (instrução explícita do
  usuário) — é um gap de asset de marca real, cross-platform, que
  precisa ser resolvido com um arquivo novo quando o usuário quiser,
  fora do escopo deste bloco.
- **`NEXT_PUBLIC_WHATSAPP_NUMBER` ausente: estado esperado
  pré-ativação, não pendência de configuração** — o número oficial da
  Doopla ainda está em análise no WhatsApp/Meta; a env var
  propositalmente não existe em nenhum ambiente até essa aprovação
  sair. Auditoria por grep em todo o repo (06/09/2026) confirmou zero
  hardcode: `whatsappPublicNumber()` (`src/lib/supabase/env.ts`)
  retorna `null` sem a env var, sem fallback nenhum; todo consumidor
  (`professional-home-view.tsx`, `orcamento/[slug]/page.tsx`) já trata
  a ausência com estado honesto ("Canal da Doopla indisponível no
  momento" / CTA some), nunca um número de exemplo, temporário ou link
  quebrado. Quando o número for aprovado, a env var é configurada
  direto na Vercel, sem exigir nenhuma mudança de código. Teste visual
  no Preview, se necessário, deve usar só um valor de
  teste/fixture claramente isolado do Preview (nunca um número real,
  nunca promovido pra Production, nunca commitado no repo). Por
  instrução explícita do usuário, este ponto NÃO é tratado como
  pendência deste patch.
- **Comunidade Web virar página inteira na Fase 1 foi desvio técnico
  meu, nunca uma decisão de UX revisitada — corrigido de volta pra
  painel lateral (07/09/2026)** — a UX original aprovada, ainda no
  bloco Shell+Home (commit `8d2a9f5`), já era um painel lateral
  deslizante da direita (`ProForumPanel`, 420px, backdrop, "slide da
  direita" citado no próprio comentário do componente como o
  "protótipo aprovado"). Na Fase 1 da Comunidade (commit `4f2aa7d`), eu
  deletei esse painel e criei rotas de página inteira
  (`/dashboard/comunidade/*`) pra hospedar a busca/lista/tópico/criar
  reais — uma escolha de implementação minha, nunca confirmada com o
  usuário como mudança de arquitetura, e documentada no PROGRESS.md só
  como fato consumado, sem justificar a troca. Revertido: um
  `layout.tsx` compartilhado em `@modal/(.)comunidade` (mesmo mecanismo
  de intercepting route já usado por `(.)artistas`, `(.)bookers`,
  `(.)bookings`, `(.)conversas`) volta a apresentar a Comunidade como
  painel lateral, com as 4 rotas reais da Fase 1
  (`page`/`[topicId]`/`novo`/`salvos`) 100% reaproveitadas via
  `export { default } from '...'` — zero duplicação de dados/Server
  Actions/regras de negócio. Largura variável (opção (a) aprovada pelo
  usuário): compacta (460px) pra busca/Recentes/Salvos/Criar tópico,
  expande (760px) só ao entrar num tópico — mesmo painel, nunca um
  segundo modal por cima, decidido por pathname no layout já que ele é
  compartilhado por todas as rotas internas e não recebe o parâmetro
  dinâmico das rotas irmãs diretamente. App mobile não foi tocado —
  continua com a navegação nativa full-screen que já tinha, por
  decisão explícita do usuário de nunca copiar o slide-over do Web pro
  App. Decisão de arquitetura correta e final: **painel lateral no Web,
  experiência nativa full-screen no App** — mesma fonte de
  dados/regras/RLS nas duas plataformas, só a apresentação diverge,
  como já era pra Comunidade desde a Fase 1.
- **Limite de bookings do Básico vive numa trigger no banco, nunca em
  check duplicado nos Server Actions** — decisão explícita do usuário:
  "não proteja apenas um entry point e deixe outro contornar" +
  "centralize a decisão numa função reutilizável". Só existem 2 pontos
  reais de INSERT em `bookings` hoje, mas em vez de replicar o mesmo
  `if` nos dois (arriscando um deles sair de sincronia depois, ou um
  terceiro caminho futuro esquecer o check), a autoridade fica numa
  trigger `BEFORE INSERT ON bookings` (migration 0073) — cobre
  qualquer insert, presente ou futuro, sem lógica duplicada em TS.
  `recusada`/`cancelada` continuam consumindo o limite de propósito:
  contar só sucesso abriria um bypass óbvio (recusar/cancelar pra
  resetar o contador).
- **`PLAN_CARDS` (Pro) prometia "Inteligência sobre cachês..." e
  "Materiais profissionais..." como disponíveis hoje — divergência
  real, corrigida em 07/09/2026, não um ajuste cosmético.** A versão
  publicada em `2b63a20` listava essas duas como `features` do Pro,
  mas nenhuma tem gate real nem implementação — a mesma classificação
  PENDING (e-mail de representação/analytics/materiais/automações) já
  tinha sido aprovada numa rodada anterior, só não tinha sido
  retroaplicada ao conteúdo já commitado. Corrigido em `src/lib/
  plans.ts` (extraído de `PlanPicker.tsx` pra virar fonte única,
  reaproveitada também pelo `ProUpgradeModal`) e no card espelhado em
  `home.html`. "Booker / Minha equipe" entrou no lugar por ser real
  nesta mesma rodada (gate + UI implementados).
- **Upgrade contextual (`ProUpgradeModal`) substitui os dois destinos
  antigos de "Conhecer o Pro"** — nem `/dashboard/perfil` (real, mas
  não é uma experiência de escolha/upgrade) nem `/precos` (stub,
  beco sem saída) viram destino definitivo. `/precos` fica registrado
  como GAP/PENDING — no futuro é a superfície pública de comparação
  Básico×Pro, mas não deve ser construída "só pra preencher" antes do
  catálogo canônico de features estar fechado. Enquanto Real Billing
  não existe, o CTA "Fazer upgrade para Pro" mostra um estado honesto
  dentro do próprio modal (nunca finge upgrade, nunca grava
  "interesse" — o usuário rejeitou explicitamente essa versão por
  prometer acompanhamento que não existe) — centralizado num único
  handler, pra trocar de implementação sem redesenhar o modal quando o
  Stripe entrar.

## Reconciliação dos dois fluxos de onboarding de artista — progressive profiling, não wizard único — 08/09/2026

Em resposta à auditoria read-only do Bloco 4 (PROGRESS.md §79), que
achou que o fluxo padrão de cadastro (Fluxo 1, "Começar grátis") nunca
coleta `regions`/`careerStage`/`helpAreas`/`workTypes`/`clientTypes`
— campos que a tool de Runtime `get_professional_business_context` já
foi construída pra ler, populados hoje só pelo wizard antigo
(`signup-form.tsx`), praticamente inalcançável por artista fora de um
caminho residual.

- **Rejeitado explicitamente**: transportar todas as perguntas do
  wizard antigo pro onboarding novo. Isso reintroduziria a fricção que
  o Fluxo 1 foi desenhado pra eliminar.
- **Direção canônica escolhida**: progressive profiling — `conta →
  contexto mínimo → produto → enriquecimento progressivo → prontidão
  operacional`. O Fluxo 1 continua curto (identidade, contexto mínimo,
  canal de atenção, plano); `regions`/`careerStage`/`helpAreas`/
  `workTypes`/`clientTypes`/contexto comercial adicional NUNCA viram
  etapa nova obrigatória do cadastro — pertencem ao enriquecimento
  progressivo do conhecimento da Doopla sobre o profissional, coletado
  depois, no produto.
- **Fonte de dados permanece única**: essas informações continuam
  vivendo em `artist_profiles` (mesmas colunas já lidas pelas 2 tools
  de Runtime, `get_professional_profile`/`get_professional_business_
  context`) — a decisão é só sobre ONDE/QUANDO a UI pede esses dados,
  nunca sobre criar uma tabela ou fonte paralela. Runtime continua
  consumindo exatamente as mesmas fontes canônicas de sempre;
  conhecimento declarado continua sendo contexto, nunca autorização —
  Mandate/Approval Gate/Policy Gate continuam prevalecendo sem nenhuma
  mudança de autoridade.
- **Superfície de UI pro enriquecimento ainda não decidida** — o
  precedente mais próximo é `ArtistProfileForm.tsx`
  (`/dashboard/perfil/editar`, já edita `regions`), hoje sem link de
  navegação no painel desde a rodada de consistência (§73: "Perfil
  profissional descontinuado como SUPERFÍCIE DE NAVEGAÇÃO... superfície
  futura de edição é um bloco separado"). "Minha Doopla/Treinar" segue
  registrada como `[FUTURE]` no roadmap (§68) — nunca construída.
  Decidir ONDE essa superfície mora é trabalho do próximo bloco de
  implementação, não desta reconciliação.
- **Wizard antigo não é removido nem reescrito agora** — convite de
  booker/agência continua existindo como está. Não se mantém como
  arquitetura CONCORRENTE de onboarding pra sempre: dados finais e
  modelo de enriquecimento devem convergir pras mesmas fontes canônicas
  quando o bloco de implementação futuro for desenhado, mas mapear
  dependências de convite/booker vem antes de qualquer remoção.

## "Emite nota fiscal?" deixa de ser write-once — vira contexto editável, nunca dado de Conta — 08/09/2026

Achado da mesma auditoria: `artist_profiles.issues_invoice` (migration
0037) é coletado só na Etapa 3 do Fluxo 1, lido de verdade pela tool de
Runtime `get_professional_business_context`, mas sem nenhuma superfície
de edição depois — grep em todo `src/app/dashboard` não achou nenhuma
ocorrência.

Decisão: continua sendo coletado no onboarding (não removido de lá),
mas precisa ganhar uma superfície de edição posterior — na mesma área
de conhecimento/contexto comercial do item acima (enriquecimento
progressivo), nunca tratado como dado de Conta (Configurações →
Conta é identidade/contato, não preferência de negócio). Reaproveita
`artist_profiles.issues_invoice` como fonte existente, salvo se a
auditoria técnica do bloco de implementação encontrar motivo concreto
pra uma fonte diferente — não decidido a priori.

## Dados de recebimento continuam fora do onboarding — nudge de ativação, não etapa obrigatória — 08/09/2026

Confirmado pela auditoria: `payment_details` (migration 0046) nunca fez
parte de nenhuma etapa do cadastro (decisão já correta, preexistente),
mas é a única informação que efetivamente bloqueia operação real hoje
— `is_operationally_ready()`, consultada pelo Post-model Policy Gate,
só retorna `true` com uma linha `active` em `payment_details`.

Decisão: Configurações continua sendo a superfície de edição — não
migra pro onboarding. Mas a experiência de ativação (bloco de
implementação futuro, ainda não desenhado) deve orientar o profissional
a completar os dados de recebimento antes do primeiro momento
operacional real em que forem necessários — um nudge contextual, nunca
uma etapa pesada obrigatória de criação de conta.

## Achados técnicos da auditoria do Bloco 4 — dívida registrada, sem ação — 08/09/2026

Campos sem consumidor de regra/Runtime/exibição encontrado
(`temBooker`, `intencao`/`pontualDetalhe` do artista, `jaRepresenta`/
`roster`/`clientTypes`/`specialtyAreas`/`feeRange` do booker) e
nomenclaturas/colunas duplicadas (`booker_profiles.specialties` já
substituída por `specialty_areas`, comentário do próprio schema
confirma que não é mais lida/escrita; `local` do artista vs. `cidades`
do booker pro mesmo conceito de cidade-base) NÃO viram decisão de
produto nem tarefa agora — instrução explícita do usuário: achado
técnico normal não é decisão de produto, e não deve criar trabalho
desnecessário. Registrado aqui só como evidência preservada; qualquer
ação fica pra quando (e se) fizer sentido dentro de um bloco de
implementação real.

## Comunidade V2 — camadas de descoberta da Home e ranking V1 (migration 0079) — 08/09/2026

Arquitetura conceitual da Home da Comunidade, cada camada com uma
função diferente, nunca misturada:

- **Busca** = mecanismo PRINCIPAL de descoberta (intenção explícita
  por consulta em linguagem natural). Nunca voltar a chips fixos de
  profissão/assunto dominando a tela — decisão já registrada na Fase 1
  search-first, reafirmada aqui.
- **Suas comunidades** = intenção explícita por save/fixação (dado já
  existente, `community_saved_topics`).
- **Para você** = relevância PESSOAL estimada — nunca popularidade.
- **Em alta agora** = momentum COLETIVO recente — nunca personalizado.
- **Recentes** = cronologia neutra, garante que descoberta nunca
  dependa só de algoritmo.

**Ranking V1 é determinístico, explicável e centralizado — nenhum
LLM/ML decide ordem.** Parâmetros (janela/decay/threshold/pesos) vivem
só dentro de cada function SQL (`get_community_trending_topics`/
`get_community_for_you_topics`, migration 0079), nunca duplicados em
outra camada.

"Em alta agora": soma decaída (half-life 24h, janela 72h) de eventos
recentes (abertura do tópico + respostas) multiplicada por um fator de
diversidade (participantes únicos / total de eventos) — protege contra
inflação artificial (poucas pessoas trocando muitas mensagens) sem
sistema anti-fraude. Threshold mínimo (score ≥ 0.6, ≥ 2 participantes
únicos) evita "Em alta" com atividade insignificante. Visualizações não
entram no score — não existe esse dado no produto hoje, não inventado.

"Para você": sinais REAIS auditados antes de codar — categoria/tag dos
tópicos que o profissional salvou ou em que participou (autor ou
respondeu). Profissão/nicho (`artist_profiles.category`) foi avaliada e
DESCARTADA como sinal — não existe mapeamento real entre profissão e
`community_categories` (taxonomias independentes, sem tabela de
relação); usá-la seria inventar uma correlação inexistente, criando uma
bolha rígida por profissão (proibido explicitamente pela rodada).
Buscas recentes e localização também descartadas — nenhum histórico de
busca é armazenado hoje. Cold start (sem nenhum salvo/participação)
devolve conjunto vazio de propósito — a Home omite a seção, nunca finge
personalização nem reaproveita Recentes disfarçado.

Deduplicação entre seções é só de APRESENTAÇÃO (nunca dos datasets
canônicos) — um tópico que já ocupou um slot em "Suas comunidades" não
repete em "Para você"/"Em alta"; um que já apareceu em qualquer um dos
dois não repete em "Recentes". Implementada no client (Web e App,
mesma regra), na ordem de prioridade da hierarquia acima.

## Bloco 4 — nudge de prontidão nunca é banner genérico; App fica sem a linha de contexto comercial por enquanto — 08/09/2026

Ressalva de UX antes da implementação: o nudge progressivo de
prontidão (dados de recebimento + contexto comercial incompleto,
decisão já registrada em "Dados de recebimento continuam fora do
onboarding") não podia virar uma faixa genérica/persistente na Home —
tinha que reaproveitar a arquitetura visual já existente. Resolvido
reaproveitando o mesmo idioma de linha (label/descrição + CTA, borda
entre linhas) já usado em `BookingChannelsCard`/`TalkToDooplaCard`
(Web) e `ChannelsCard` (App) — nenhuma linguagem visual nova.

Achado que mudou o escopo original: o App não tem NENHUMA superfície
de edição pra `regions`/`career_stage`/`help_areas`/`work_types` hoje
— zero tela, confirmado por auditoria de código. Construir essa tela
seria inventar uma arquitetura de navegação nova, fora do que foi
aprovado pra esta rodada ("reutilize a superfície já existente; a
decisão de navegação de 'Treinar sua Doopla' continua fora de
escopo"). Decisão: o App só recebe a linha de recebimento (superfície
real: `/mais/financeiro`); a linha de contexto comercial existe só no
Web nesta rodada. Assimetria deliberada, não regressão de paridade —
paridade continua sendo backend/regra compartilhados, a apresentação
é que reflete o que cada plataforma realmente tem pra oferecer hoje.
Construir a tela de edição no App fica como candidato a bloco futuro,
não decidido aqui.

## Bloco 6 — Nova Home pública: mockup é source of truth visual, codebase é source of truth funcional; GSAP removido por bug real, não por preferência — 08/09/2026

O bloqueio "aguardando mockup da Eduarda" foi removido quando o
mockup chegou. Regra explícita antes de codar: o mockup manda na
direção visual (paleta dark contínua, composição, copy exibida); o
codebase/decisões já consolidadas mandam no funcional e no conteúdo
que precisa sobreviver (preço dinâmico, Planos/FAQ, SEO, analytics,
`?plano=`/`?ref=`, modais, etc.) — nunca o inverso, e nunca inventar
elemento/copy/comportamento que não estivesse em nenhum dos dois.

Conteúdo ausente do mockup foi decidido item a item, não descartado
por padrão: "Manda" (6 situações) e "Feita com quem entende de
booking" foram removidas como seções independentes porque o mockup as
substitui conceitualmente (a primeira virou a seção "Chega de perder
tempo com o operacional"; a segunda não tem equivalente e foi
avaliada como redundante com o resto da página). "Segurança" continua
existindo — só deixou de ter uma seção in-page duplicada (o header
aponta pra `/seguranca`, página já existente e não tocada); a decisão
explícita foi não duplicar conteúdo de governança em dois lugares.
"Planos" e "FAQ" foram mantidos por decisão explícita mesmo não
aparecendo em detalhe no mockup — são funcionalidade real (preço
dinâmico, entitlements, dúvidas de conversão), não apenas estética; só
a apresentação visual foi adaptada ao novo fundo dark.

Os ícones/nomes de profissão do mockup (DJs, Fotógrafos, Beauty,
Músicos, Palestrantes, Freelancers) são copy editorial de marketing da
Home — decisão explícita de NUNCA alterar a taxonomia canônica de
`professions` (migration 0037: dj/banda/cantor/fotografo/videomaker/
influenciador/outro) pra fazê-la coincidir com essa lista. São
vocabulários independentes de propósito.

GSAP/ScrollTrigger foram removidos como decisão técnica tomada DURANTE
a implementação — não pedida pelo mockup nem pelo usuário. Motivo: o
hero pinado com timeline de scroll (única razão real pra GSAP existir
ali) não existe mais no design novo (fundo contínuo, sem seções
clara/escura alternando); o que sobrava era um reveal-on-scroll
decorativo, e o QA visual encontrou esse reveal quebrando o hero de
verdade — `ScrollTrigger` com `start:"top 85%"` nunca dispara pra um
elemento que já nasce dentro do viewport, deixando-o preso em
`opacity:0` pra sempre. Substituído por `IntersectionObserver` nativo,
sem essa classe de bug por construção. Removido junto:
`public/vendor/gsap/*.min.js` e os dois `<Script>` de GSAP em
`page.tsx` — nunca deixados órfãos.

As pupilas dos mascotes seguindo o cursor foram tratadas como
identidade dinâmica de marca OBRIGATÓRIA de sobreviver ao redesign
(adendo explícito do usuário, não uma preferência opcional) — mesmo
sem estar visível num mockup estático. Reaproveitado o mesmo algoritmo
já usado em `pro-mascot.tsx` (Professional Dashboard)/`MascotBall.tsx`
(App): clamp de distância, easing suave, `prefers-reduced-motion`
desliga tudo. Generalizado em vanilla JS pra qualquer instância de
mascote na página (nunca clonado de um "olho mestre" único como no
sistema antigo), com um único timer de ociosidade global coordenando
todas as instâncias — evita dois mecanismos escrevendo
`pupil.style.transform` ao mesmo tempo (fonte de jitter).

`SiteHeader`/páginas institucionais (Sobre, Segurança, Termos,
Privacidade, Contato) explicitamente NÃO foram redesenhadas junto —
decisão de escopo pra evitar risco de regressão em componentes
compartilhados (`SiteMenuOverlay`, `PageShell`) que essas páginas
dependem. Convivem por enquanto dois idiomas de navegação (nav inline
novo na Home vs. "Menu" hamburger nas institucionais) até que um bloco
futuro decida unificar — não decidido aqui.

## Bloco 6 — rodada de fidelidade visual: olhos do mascote são a ÚNICA exceção onde a regra canônica de identidade prevalece sobre o mockup — 08/09/2026

Na primeira entrega do Bloco 6, a auditoria visual apontou uma
divergência real entre a implementação (olho preto redondo + pupila
branca redonda, seguindo o cursor) e a leitura do mockup (formas mais
em crescente/fechadas). Decisão explícita do usuário: a regra canônica
dos olhos da Doopla — olho PRETO, pupila BRANCA menor dentro do olho,
nunca invertido, pupila sempre a única parte que se move seguindo o
cursor dentro do limite do olho — prevalece sobre a leitura literal do
mockup nesse ponto específico. Não houve mudança de olho. O mockup
continua sendo fonte de verdade visual pra tudo mais nessa correção
(corpo, patas/braços, postura apoiada, escala, posição, glow) — essa é
a única exceção documentada, e vale como precedente: se uma leitura
futura de mockup aparentar conflitar com a identidade canônica já
aprovada do mascote (olhos, proporção do corpo, ausência de um
personagem novo), o canônico vence, e isso deve ser levantado como
pergunta explícita antes de qualquer mudança, nunca resolvido por
inferência própria.

Outros achados dessa rodada (caixa alta indevida em headings,
phone-mockup do Hero pouco detalhado, ausência de patas/braços do
mascote, ícones ausentes no "Como funciona", CTA final em pilha
vertical em vez de composição horizontal) foram tratados como
divergência de fidelidade genuína — sem tensão com nenhuma decisão
prévia — e corrigidos diretamente, sem necessidade de nova aprovação
prévia por já se enquadrarem em "adaptar com fidelidade ao mockup",
não em "nova direção visual".

## Bloco 7, P1 — re-skin de Booking Detail + Conversa: separação dado/apresentação, não-fork da Conversa, e limite real de QA sem Supabase live — 09/09/2026

Booking Detail (`bookings/[id]/page.tsx`) tinha ~650 linhas
misturando busca de dados e JSX de apresentação num único Server
Component — impossível fazer o Pro conviver com o Legacy sem duplicar
a lógica de negócio (política de pagamento, vencimento, disputa,
estágios de fatura) e arriscar os dois divergirem silenciosamente,
igual ao bug 17≠20 já corrigido no bloco 85. Decisão: extrair a busca
de dados pro `page.tsx` (inalterada) e a lógica de negócio pura pra um
módulo compartilhado (`booking-detail-shared.ts`), deixando
`LegacyBookingDetailView`/`ProBookingDetailView` como componentes
puramente apresentacionais recebendo props já resolvidas. Isso também
foi o que destravou a estratégia de QA visual (abaixo).

`ConversaView`/`ReplyForm` deliberadamente NÃO seguiram o mesmo padrão
Legacy/Pro fork do Booking Detail — ficaram só re-estilizados in-place,
sem branch de role. Motivo: essa tela só é alcançável por quem a
Doopla representa (o comentário já existente no código confirma que
`represented_professional_id` é sempre o artista, nunca o booker) —
`getConversationOperationalFacts` é RLS-scoped a esse profissional e
nunca devolve dado real pra um booker (cai em `notFound()`). Criar um
`LegacyConversaView` pra um caminho que nenhum booker jamais alcança
seria complexidade morta. Fundo escuro arredondado passou a viver
dentro do próprio `ConversaView`, não nos 4 wrappers de rota que o
renderizam (2 páginas normais + 2 `@modal`), pra funcionar igual dentro
do `ProfileModal` compartilhado (fundo claro próprio, usado também por
Professional/Agency Profile, fora de escopo tocar) sem duplicar estilo
em cada `page.tsx`.

QA visual ao vivo com Supabase real foi tentada e abandonada: o
ambiente sandboxed não tem projeto Supabase live, e reproduzir o
formato de cookie de auth do `@supabase/ssr` (PKCE, `base64url`,
`storageKey` derivado, cookies chunked) só pra montar uma sessão falsa
foi julgado esforço desproporcional pra uma tarefa de re-skin visual.
Como `LegacyBookingDetailView`/`ProBookingDetailView` já eram puramente
apresentacionais (decisão acima), a alternativa virou uma rota
`/dev/booking-detail-preview` efêmera renderizando essas views direto
com props de fixture — zero rede/auth necessário, cobrindo 4 status de
booking em 3 larguras. Essa mesma saída não existia pra
`ConversaView`/`ReplyForm` (Server Components que buscam os próprios
dados via `getSessionProfile()`+Supabase, por decisão do parágrafo
acima) — verificados só por revisão de código e reuso literal dos
tokens/classes já confirmados visualmente no Booking Detail, registrado
como limite explícito de QA nesta rodada, não como verificação
equivalente.

## Bloco 7, P1 — re-skin de Agency Profile + Professional Profile: agencia ganha branch próprio (não migra pro padrão hub do artista), e um bug de containing block por `backdrop-filter` — 09/09/2026

`agencia` recebeu um branch dedicado em `perfil/page.tsx`
(`ProAgenciaPerfilView`) preservando a MESMA estrutura de página única
que ela já tinha (Conta, Foto, dados da agência, "Respostas do
cadastro") — deliberadamente NÃO migrada pro padrão hub multi-subpágina
que `artista` usa (`ProConfiguracoesView` + rotas `perfil/conta`,
`perfil/preferencias` etc.). Migrar pro hub seria reorganizar fluxo/
navegação, fora do escopo explícito desta rodada ("não reorganizar
campos", "não mudar fluxo") — mesmo sendo tecnicamente mais consistente
com o resto do Settings V2, essa é uma decisão de produto (vale a pena
dar a `agencia` o mesmo hub que `artista` tem?) que não foi pedida e
não deveria ser tomada de forma silenciosa dentro de um bloco de
re-skin. Fica registrado como candidato a decisão de produto futura,
não implementado.

A duplicação de "Respostas do cadastro" (os mesmos 4 campos da agência
aparecem duas vezes na página — uma vez dentro de "Perfil público",
outra vez numa seção própria) já existia no legado antes desta rodada
e foi preservada exatamente como estava, só reestilizada — não é um
bug introduzido aqui, e corrigi-la seria "aproveitar o re-skin pra
melhorar regra existente sem necessidade", explicitamente vetado pelo
escopo aprovado.

Achado técnico real durante o QA visual (não estava na auditoria
original, encontrado só ao efetivamente abrir o modal "Editar
preferências" depois do re-skin): envolver `ArtistProfileForm` num
`ProCard` (`backdrop-blur-xl`, o card padrão de todo o sistema Pro)
quebra o modal interno `position: fixed` do formulário — `backdrop-
filter` cria containing block pra descendentes fixed no Chromium
(mesma regra que `filter`/`transform`/`perspective` já documentada),
então o overlay de tela cheia ficava preso dentro dos limites do
próprio card. Isso é uma classe de bug que qualquer form futuro com
modal `position: fixed` vai reproduzir se for envolvido num `ProCard`
— vale como alerta geral pro sistema Pro, não só pra este componente.
Corrigido com `createPortal` pro `document.body`, o que por sua vez
exigiu associação explícita via atributo `form="id"` em todos os
campos portados (select/checkbox/botão) pra continuarem submetendo
com o formulário original, já que portais React não preservam
associação de formulário nativa via nesting DOM. Optou-se por
`useSyncExternalStore` (não `useEffect`+`setState`) pro gate de
montagem client-only do portal, porque a régua de lint deste projeto
(`react-hooks/set-state-in-effect`) proíbe setState síncrono dentro de
efeito — mesmo sendo o padrão "isMounted" mais comum em React, esse
projeto especificamente exige a variante sem state-in-effect.

## Padrão técnico — modal `position: fixed` dentro de `ProCard` precisa de portal — 09/09/2026

Alerta de arquitetura, não específico ao formulário onde foi
encontrado (`ProArtistProfileForm`, bloco 7 P1 2/N): **qualquer**
modal/overlay `position: fixed` renderizado como descendente de um
`ProCard` (ou de qualquer elemento com `backdrop-filter`, classe
`backdrop-blur-*`) fica preso ao containing block criado por esse
ancestral, em vez de cobrir a viewport inteira. Isso é comportamento
do Chromium: `backdrop-filter` cria containing block pra descendentes
`fixed`/`absolute` do mesmo jeito que `filter`/`transform`/
`perspective` já criam — não é bug do React nem do Tailwind, é regra
de CSS que qualquer novo componente Pro com um modal interno vai
reproduzir se for colocado dentro de um `ProCard`.

**Regra pra qualquer trabalho futuro no sistema Pro**: antes de
envolver um componente com modal/overlay `fixed` num `ProCard` (ou
qualquer wrapper com `backdrop-blur-*`), avaliar se o modal precisa
realmente cobrir a viewport inteira. Se precisar, renderizar via
`createPortal(..., document.body)` — com as duas consequências que
isso traz e que também precisam ser tratadas: (1) gate de montagem
client-only pra evitar mismatch de hidratação (`useSyncExternalStore`
preferido a `useEffect`+`setState`, que a régua de lint deste projeto
proíbe); (2) se o modal contém campos de formulário que devem submeter
junto com um `<form>` que ficou fora da subárvore DOM do portal,
associar cada campo/botão explicitamente via atributo HTML
`form="<id-do-form>"` — portais React não preservam associação de
formulário nativa via nesting DOM, e sem isso os campos param de ser
enviados silenciosamente (nenhum erro visível, só dado que nunca
chega no submit). O legado (`cardClass`, sem `backdrop-filter`) nunca
teve esse problema — só surge em componentes novos que adotam o
sistema Pro.

## Privacidade na Comunidade — feature nova, não re-skin: ativação escopada por ação, availableForReferrals nunca exposto — 09/09/2026

Diferente dos blocos 86/87 (re-skin puro), este foi o primeiro item do
P1 que exigiu construir algo que nunca existiu — os 7 controles de
visibilidade de `community_profiles` (migration 0059) tinham
schema/RLS/RPC/data-layer prontos nas duas plataformas, mas zero UI em
qualquer lugar. Decisão de produto explícita do usuário: construir a
superfície faltante com paridade Web+App, não só corrigir a copy que
prometia algo inexistente.

**Ativação da Comunidade escopada por ação, não por tela**: o resto do
produto já estabelece que "entrar na Comunidade"
(`activate_community_profile`) é invisível — qualquer superfície de
Comunidade ativa a participação sem passo explícito. A dúvida real
aqui era ONDE aplicar isso: no hub geral `/dashboard/perfil/privacidade`
(que qualquer profissional visita por motivos não relacionados à
Comunidade) ou só na subpágina dedicada? Decisão: só na subpágina
(Web) / só ao abrir o BottomSheet específico (App). Visitar
"Privacidade e dados" não deveria silenciosamente inscrever alguém na
Comunidade; clicar especificamente em "Privacidade na Comunidade" já é
uma ação relacionada a ela, então ativar ali é consistente com o
princípio existente, não uma exceção. Isso também resolve por
construção o estado "usuário sem `community_profile` inicial" pedido
no QA — depois de `ensureCommunityProfileActivated`, o form nunca
renderiza sem uma linha existente.

**`available_for_referrals` nunca vira toggle, mas seu valor atual
atravessa cada save**: a RPC `update_community_profile` recebe os 8
campos de `community_profiles` juntos, sem update parcial. O 8º campo
(`available_for_referrals`, "disponível pra indicações") é conceito
diferente dos 7 pedidos e também não tem UI em lugar nenhum — mas não
foi incluído nesta tela (fora do escopo explícito: "não criar novas
preferências"). Para não resetá-lo silenciosamente a cada save dos 7
toggles reais, seu valor é lido do snapshot atual e reenviado sem
alteração em toda chamada de update, nas duas plataformas — tratado
como um "hidden field" técnico (Web: `<input type="hidden">` de
verdade; App: campo do state que nunca vira `Switch`). Registrado como
achado separado, candidato a rodada futura, não implementado aqui.

**Verificação de segurança pedida explicitamente antes de qualquer
mudança de semântica**: releu a migration 0059 inteira (schema, RLS,
as duas RPCs, a view `community_profiles_public`) antes de escrever
qualquer linha de UI — cada um dos 7 campos só é exposto pela view
quando `visibility_status = 'active' AND show_x = true`, sem
divergência entre o nome da coluna e o que a view realmente faz. Nada
de schema/RPC/RLS/semântica foi alterado nesta rodada — só consumo via
UI do que já existia.

## Divergência de vocabulário/cor Web×App (D1-D6) — "Precisa de você" nunca soma o mesmo bloqueador duas vezes porque `conversations.related_booking_id` nunca é escrito hoje — 09/09/2026

Auditoria completa (Web×App) encontrou seis pontos de divergência de
cor/vocabulário/agrupamento entre o painel Web e o App para o mesmo
conceito de produto. Decisões de produto explícitas do usuário (D1-D6)
+ correções técnicas seguras (C1-C6), implementadas juntas neste
bloco.

**Modelo semântico de cor único, agora compartilhado (D1/D2)**: verde =
resultado positivo; âmbar = atenção/espera sem caráter negativo;
vermelho = evento negativo relevante ou ação urgente pendente;
neutro = estado final/informativo, sem ação. `aceita`/`concluida` =
verde; `aguardando_pagamento` = âmbar; `cancelada` = vermelho;
`recusada` = neutro (não é mais âmbar, que sugeria falsamente "ainda
em aberto"). `proposta_enviada` deixa de ter UMA cor fixa: agora
depende de quem propôs, calculado por uma única função pura por
plataforma — `bookingStatusTone(booking, viewerId)` (Web:
`src/app/dashboard/pro-format.ts`; App:
`mobile/src/lib/data/bookings.ts`) — que reusa a mesma checagem de
`wasBookingProposedByViewer`/`wasProposedByViewer` já existente pro
App: se a OUTRA parte propôs, vermelho (o profissional precisa
decidir agora); se o próprio profissional propôs, âmbar (só
aguardando resposta). Nunca duas fontes de verdade: a mesma função
alimenta o pill de booking em toda superfície de cada plataforma (Home,
Bookings, detalhe do booking) — o mesmo booking nunca muda de cor
entre telas.

**D4 — agrupamento de Bookings unificado**: Web ganhou os mesmos
grupos que o App já tinha (`Todos`/`Precisa de você`/`Em negociação`/
`Confirmados`/`Concluídos`/`Cancelados`), via novo módulo
`src/app/dashboard/booking-attention.ts` (`classifyBookingAttention`,
`BOOKING_ATTENTION_FILTERS`) espelhando
`classifyBookingForChip`/`BookingChip` do App linha a linha. Cancelada
e recusada dividem o mesmo grupo de filtro ("Cancelados") — decisão
de agrupamento já validada e presente no App — mas continuam com
cores/labels individuais distintas (D1), nunca confundidas.

**D3/D5 — "Precisa de você" unificado sem mudança de backend/RPC**:
antes de tocar em qualquer UI, foi obrigatório investigar se um
booking `proposta_enviada` aguardando resposta e sua conversa
associada podiam contar como "precisa de você" duas vezes pro mesmo
bloqueador real. Rastreamento completo de todos os caminhos de
escrita confirmou que **`conversations.related_booking_id` nunca é
escrito com valor não-nulo em nenhum caminho de código atual**:
`proposeBookingAction` e `selectBookerForOpportunityAction`
(`src/app/dashboard/actions.ts`) criam bookings sem tocar a tabela
`conversations`; `ensure_opportunity_for_conversation` (migration
0051, a única função SQL que popula esses campos a partir de uma
conversa) só grava `related_opportunity_id` — o branch que gravaria
`related_booking_id` fica de fato null (`update ... set
related_opportunity_id = v_new_id, related_booking_id = null`); e
nenhuma tool de IA (`src/lib/intelligence/tools/`) escreve na tabela
`bookings`. Ou seja: hoje, um booking aguardando resposta e uma
conversa "precisa de você" são **conjuntos estruturalmente
disjuntos** — nunca o mesmo bloqueador real contado duas vezes. Isso
respondeu ao gate do usuário ("se unificar exigir RPC/schema ou
houver ambiguidade de dedup, parar e reportar antes de alterar
schema") sem exigir parar: nenhuma mudança de schema/RPC foi
necessária.

Com isso provado, a Home (Web: `professional-home-view.tsx`; App:
`app/(tabs)/index.tsx`) passou a somar as duas fontes
(`bookingsNeedingResponse.length + conversationSummary.needsYouCount`)
num único `attentionCount` canônico, usado no hero, no card de
estatística e no header do accordion "Precisa de você" — nunca mais
três números competindo sem relação clara. O corpo do accordion agora
mostra AMBOS os tipos (cards de booking aguardando resposta + cards de
decisão/conversa), então o header nunca mostra um total maior do que
o que está listado. Se algum dia `related_booking_id` passar a ser
escrito ligando uma conversa à proposta que ela mesma gerou, essa soma
precisa ser revisada antes de continuar ingênua — comentário deixado
no código nos dois pontos de soma (Web e App).

Achado incidental corrigido junto: no App, o card de estatística
"Conversas que precisam de você" usava tom âmbar — errado pelo próprio
modelo semântico (needs_you é sempre vermelho, é ação urgente
pendente, não espera passiva). Corrigido pra vermelho, consistente com
`PRO_CONVERSATION_STATE_TONE.needs_you` (Web) e
`conversationStateColor('needs_you')` (App).

**D6 — apresentação de Conversation State continua divergente de
propósito**: Web usa pill preenchido (`conversationStatePill`), App
usa ponto colorido + texto (`conversationStateColor` +
`CONVERSATION_STATE_LABELS`, `mobile/src/lib/conversation-labels.ts`).
Isso é adaptação de plataforma intencional, não um bug — NÃO deve
convergir visualmente. O que precisa (e já) permanece idêntico entre
as duas: os 4 labels (`Precisa de você`/`Aguardando cliente`/`Em
andamento`/`Encerrada`), o peso semântico de cada estado, e agora
também a paleta de cor (vermelho/âmbar/neutro/neutro) — só o
componente visual que carrega essa informação é diferente por
design de plataforma.

**Correções técnicas C1-C6 (sem mudança de comportamento, só remoção
de duplicação)**: C1 removeu o `STATUS_LABELS` local duplicado de
`pro-booking-detail-view.tsx` (agora importa de `ui.ts`); C2 removeu o
`CONTRACT_STATUS_LABELS` local duplicado de `pro-contract-section.tsx`
(idem); C3 criou `PRO_CONVERSATION_STATE_TONE` em `pro-format.ts` e
estendeu `proStatusPillClass`/`StatusPillTone` (Web e App) com o tom
`'neutral'`, substituindo três mapas de tom locais divergentes
(`pro-booking-detail-view.tsx`, `conversa-view.tsx`) por um só; C4
exportou `pendingReplyOutcomeLabel`/`preparedDraftOutcomeLabel`/
`decisionBlockReasonLabel` de `mobile/src/lib/data/decisions.ts`,
removendo as reimplementações idênticas em
`app/(tabs)/mais/decisoes.tsx` e `DecisionCard.tsx`; C5 consolidou a
declaração duplicada do tipo `ConversationState` no App
(`mobile/src/types/conversation.ts` agora reimporta/reexporta de
`mobile/src/lib/conversation-state.ts`, fonte única); C6 corrigiu o
ternário simplificado de 2 tons da Home do App (`aceita`/
`aguardando_pagamento` → verde, resto → âmbar) pra usar o
`bookingStatusTone` completo, a mesma função usada em toda outra
superfície.

**Gaps de paridade funcional registrados, não implementados nesta
rodada** (explicitamente fora de escopo — são superfícies faltando no
App, não divergência de vocabulário/cor): status de Contrato
(`contractStatus`/`CONTRACT_STATUS_LABELS`, anexar/gerar contrato),
Payment due derivado (`paymentDueState`/`PAYMENT_DUE_LABELS` —
a_vencer/vencido/em_cobrança) e status de Disputa
(`DisputeStatus`/`DISPUTE_LABELS`) só existem hoje em
`src/app/dashboard/bookings/[id]/booking-detail-shared.ts` (Web); o
App não tem UI nenhuma pra nenhum dos três. Registrado como item de
roadmap explícito no `PROGRESS.md` (§89) — não esquecer em blocos
futuros de paridade Professional App.

**Limites respeitados**: nenhum valor real de status alterado no
banco (`bookings.status`, `disputes.status` etc. inalterados — só
leitura/apresentação); nenhuma migration, RPC ou RLS tocada; nenhuma
regra comercial alterada; a lógica já-alinhada de Conversation State
(`deriveConversationState()`) não foi tocada, só sua apresentação onde
D6 permite; Booker Legacy (`bookings-list.tsx` `BookingRow`/
`BookingsPreview`, `contract-section.tsx`, `TrabalhosList`) não
recebeu nenhuma mudança.

## App Agenda "perdendo indisponível" era cor, não dado — 09/09/2026

Item (e) da lista priorizada do bloco 85. A causa raiz não era perda
de estado em lugar nenhum do fluxo de dados (`AgendaEntryType` espelha
`entry_type` de `agenda_entries`, migration 0030, 1:1 nos dois lados,
sem filtro por tipo em nenhuma query) — era puramente visual: a lista
de eventos do dia em `mobile/app/(tabs)/agenda.tsx` só tinha 2 cores
de marcador (`confirmado` = verde, QUALQUER `agenda_entry` = âmbar),
então `disponivel` e `indisponivel` — opostos semânticos no modelo já
estabelecido no bloco 89 (âmbar = atenção sem caráter negativo,
vermelho = evento negativo/ação urgente) — ficavam visualmente
idênticos. Corrigido com `EVENT_DOT_COLOR`, mapa de 5 entradas
espelhando `AGENDA_DOT_COLOR` do Web (`src/app/dashboard/ui.ts`)
token a token — mesmo `AgendaEntryType`, mesmo backend, só a cor do
ponto passou a variar por `kind`.

Achado relacionado, registrado e explicitamente NÃO corrigido:
`MonthCalendar.tsx` (grade mensal do App) usa um único marcador
genérico "tem atividade" por dia, sem diferenciar nenhum `kind`
(nem `confirmado`) — não é a mesma classe de bug (não confunde
`disponivel` com `indisponivel` especificamente, porque não distingue
nada), é uma simplificação de densidade de calendário compacto
(células de 40×40) já existente antes deste bloco. Mudar isso seria
decisão de design, não correção de paridade — fora do escopo deste
item.

## Notificações da Comunidade: preview limitado ≠ "Ver todas" — dois tratamentos, uma causa raiz — 09/09/2026

Item (g) da lista priorizada do bloco 85. A investigação de fluxo
completo (pedida explicitamente antes de codar) revelou que a query
sem `.limit()` alimentava consumidores de naturezas diferentes — um
`.limit(N)` cego teria sido correto pros previews mas teria truncado
silenciosamente a única tela do produto (Web ou App) que promete
histórico completo (`mobile/app/forum/notificacoes.tsx`). A decisão
de tratar os dois casos separadamente, em vez de um limite único pra
tudo, é o cerne deste item — registrado aqui pra nunca ser revertido
sem essa distinção em mente.

**"Preview" nunca == "histórico completo"**: `NotificationBell`/
`CommunityNotificationsBell` (Web) e o `NotificationsSheet` da Home
(App) são popovers/bottom sheets com scroll interno, sem "carregar
mais", sem link "ver todas" — nunca prometeram ser exaustivos. Um
`.limit(20)` neles é invisível pro usuário (ninguém rola um popover de
320px até o item 21). Já `forum/notificacoes.tsx` é alcançado por um
botão dedicado do header do Fórum especificamente pra ver o histórico
— cortar em 20 ali seria perder notificações antigas de verdade, sem
nenhuma indicação de que existe mais. Web não tem superfície
equivalente (nenhuma "/dashboard/notificacoes" existe) — criar uma
agora seria funcionalidade nova, fora de escopo; a ausência dela no
Web não é uma divergência a corrigir aqui.

**Badge de não lidas nunca mais derivado da lista limitada**: assim
que a lista virou preview, contar "não lidas" a partir dela ficaria
sujeito a subcontagem (uma notificação não lida mais antiga que as 20
mais recentes existe e é um cenário real — usuário ignora uma antiga
enquanto notificações mais novas chegam e são lidas). Toda contagem de
badge (5 superfícies: 2 sinos Web, sino da Home do App, badge do
header do Fórum, e a lista interna que os alimenta) passou a vir de
`countUnreadCommunityNotifications` — `select('id', {count:'exact',
head:true}).is('read_at', null)`, mesmo padrão de contador de badge já
usado em `layout.tsx`/`data.ts`/`pipeline.ts` no resto do produto, sem
RPC nova, coberto pelo índice `community_notifications_recipient_unread_idx`
que já existe desde a migration 0059.

**Paginação real sem RPC nova**: `forum/notificacoes.tsx` ganhou
`.range(offset, offset+limit-1)` (recurso puro do query builder do
Supabase sobre a mesma tabela/RLS já existentes) + "Carregar mais" com
heurística padrão de "acabou" (página menor que o tamanho da página) —
nunca precisou de contagem total nem de RPC dedicada, porque essa tela
nunca mostrou um "N total" pro usuário (diferente de Decisões, que
mostra `list_actionable_decisions_page` com `total_count` explícito —
esse nível de sofisticação não existia antes aqui e não foi
adicionado, só corrigido o corte silencioso).

**Achado confirmado, não resolvido aqui**: os "2 sinos" do Web
(`NotificationBell` no `pro-shell.tsx`, global; `CommunityNotificationsBell`
só em `/dashboard/comunidade`) são dois componentes totalmente
independentes — cada um busca a mesma tabela por conta própria, sem
nenhum cache/estado compartilhado. Isso é exatamente o item (h) já
registrado como pendente no checkpoint anterior; permanece pendente,
agora com a causa raiz mapeada em código pra quando chegar a vez dele.

## "2 sinos" do Web: mesma fonte, apresentação própria — Context, não redesign — 09/09/2026

Item (h) da lista priorizada do bloco 85. A pergunta central da
investigação era se `NotificationBell` e `CommunityNotificationsBell`
tinham alguma diferença semântica real que justificasse continuarem
independentes — a resposta foi não: mesma tabela
(`community_notifications`), mesma RLS, mesmo limite de preview e
mesma contagem exata (bloco 91), mesma RPC de mark-as-read. A única
diferença real (mensagem com/sem título do tópico, link com/sem âncora
de post) é apresentação, não dado — exatamente o tipo de divergência
que o usuário disse explicitamente que podia continuar existindo
("Web pode manter superfícies/apresentações diferentes quando houver
motivo"). Isso descartou o hard gate ("se os dois sinos tiverem
semânticas realmente diferentes... pare") logo na investigação — a
correção podia prosseguir.

**Por que Context, e não um redesign visual**: o pedido era eliminar
fetch/cache/estado concorrente, nunca fundir os dois sinos numa única
UI — eles continuam dois componentes visualmente distintos, em dois
lugares diferentes da tela, com textos diferentes. O que mudou foi
onde vive o DADO: antes, cada componente possuía seu próprio
`useState`/fetch; agora os dois são consumidores puros de um estado
React Context compartilhado (`NotificationsProvider`). Reaproveitado o
padrão arquitetural já estabelecido neste código — `ProModalProvider`/
`ReferralModalProvider` em `layout.tsx` já resolvem exatamente este
tipo de problema (estado compartilhado entre componentes client
espalhados pela árvore da Pro Shell) com Context puro, sem biblioteca
externa (confirmado por `package.json`: sem SWR/React Query no
projeto) — criar uma infraestrutura de cache nova/paralela teria sido
o oposto do pedido explícito de "reutilizar a arquitetura já
existente antes de criar um sistema paralelo".

**Por que a garantia de sincronização não é "por convenção"**: os dois
componentes chamam `useContext` no MESMO objeto `NotificationsContext`
— um único `setState` dentro do provider (via `markRead`) dispara
re-render de todo consumidor que lê aquele contexto, na mesma
atualização. Isso é uma garantia da API do React, não uma disciplina
de código que poderia ser esquecida de novo no futuro (a causa raiz
original — "cada sino tinha seu próprio estado" — deixou de ser
estruturalmente possível, porque não existem mais dois estados).

**Freshness da Comunidade preservada com uma escolha deliberada**:
antes, `CommunityNotificationsBell` recebia dado fresco via SSR toda
vez que `/dashboard/comunidade` era visitado (page.tsx buscava de
novo a cada render). Migrar pra Context puro faria esse componente
herdar a cadência do `NotificationBell` (busca só uma vez, quando o
provider monta) — perdendo esse "sempre fresco ao entrar na
Comunidade" que fazia sentido pra essa tela específica. Resolvido com
`CommunityNotificationsBell` chamando `refresh()` no próprio mount
(ele remonta a cada visita à rota, diferente do provider/layout, que
persiste) — preserva a UX de sempre SEM reabrir a divergência: como é
a mesma fonte compartilhada, esse `refresh()` também deixa o
`NotificationBell` (em qualquer outra página aberta ao mesmo tempo, ou
depois de navegar) com o dado atualizado, sem ele precisar buscar
nada.

**Formatação continua por sino, dado é compartilhado**: `listNotificationsAction`
passou a devolver `NotificationEntry[]` cru (actorName/topicTitle/postId
já resolvidos do lado do servidor, mas sem mensagem/link prontos) —
cada componente (`notification-bell.tsx`/`community-notifications-bell.tsx`)
monta sua própria string de mensagem e seu próprio href com uma função
pura local, preservando exatamente o texto/link que cada um já tinha.
Isso é o contrato explícito do pedido: fonte/estado compartilhados,
apresentação livre por superfície.
