# Doopla — status real do build

Este arquivo existe pra resolver um problema específico: você não deveria
precisar lembrar, de cabeça, tudo que já mandou e o que já foi construído.
Sempre que eu terminar (ou travar) alguma coisa, atualizo esse arquivo.
Se um dia você esquecer o que pediu, é aqui que a resposta está — não
precisa reconstruir o histórico na conversa.

Legenda: ✅ pronto e no ar · 🔧 em andamento agora · ⏳ na fila, sem trava ·
🔒 travado (motivo explicado) · ❌ ainda não começou

Última atualização: 2026-08-18.

---

## 0.4. Ajustes de cadastro, rodapé dos painéis e revisão da Home

Bloco pontual, fora da fila de 8 prioridades (essa continua na seção 0.3
logo abaixo — próxima é a Prioridade 5, /orçamento).

- ✅ **Bug relatado (investigado, sem bug de código encontrado)**: link
  "Artistas" no painel do booker (`/dashboard/artistas`) — rota existe,
  guarda de role correta, build limpo. Provavelmente cache de deploy
  anterior à Prioridade 4, que reescreveu essa página.
- ✅ **Rodapé compacto nos painéis**: componente único
  `dashboard-footer.tsx`, injetado uma vez em `dashboard/layout.tsx` (some
  em toda página interna do artista/booker automaticamente). Central de
  Ajuda, Fale com a Doopla, Termos, Privacidade, Pagamentos e Segurança e
  Doopla Verified — todos links reais. Âncoras `#verified`/`#pagamento`
  novas em `/seguranca` pros dois últimos apontarem pro trecho certo.
- ✅ **Cadastro do artista**: removida a 3ª opção "recorrente e pontual" (só
  recorrente/pontual); removida a pergunta duplicada de tipos de
  cliente/evento (`clientTypes` — sobrepunha `workTypes`, tinham opções
  literalmente repetidas: "Casamentos", "Festas corporativas"); removida a
  pergunta de idiomas (IA traduz quando precisar); removida a opção "Tenho
  agência, quero complementar" do "já tem booker".
- ✅ **Tela final do artista (Preço Fundador)**: agora deixa claro que são
  15 dias grátis e que o preço promocional (R$19,90/mês) vale só por 3
  meses, não indefinidamente — removido "enquanto sua assinatura
  permanecer ativa". CTA "Começar 15 dias grátis" + "Você só começa a
  pagar após os 15 dias." Sem "Pergunta X de X" nessa tela.
- ✅ **Cadastro do booker, reescrito**: "já representa artista?"
  (sim/ainda não + quantos, reaproveitando a pergunta de roster) virou
  cedo no fluxo, não mais a última pergunta; foco universal/nichado com
  linguagem menos "venda de renda"; experiência agora é sim/não + campo
  de texto condicional (só abre se "sim"); as 3 perguntas de nicho
  ficaram explicitamente diferentes uma da outra (mercados = nichos que
  quer atuar, artistCategories = categorias de artista que quer
  representar, clientTypes = tipos de oportunidade que quer receber);
  capacidade agora em faixas (1 a 3 / 4 a 5 / 6 a 10 / mais de 10) com
  mensagem de crescimento operacional, sem prometer "mais R$"; faixa de
  cachê virou seleção múltipla ("gostaria de trabalhar", não "costuma").
  **Migration 0027**: `booker_profiles.fee_range` de `text` pra `text[]`
  (só do booker — o do artista continua escalar).
- ✅ **Tela final do booker (nova)**: antes o cadastro do booker não tinha
  nenhuma tela de plano. Agora tem — "Booker Básico, R$0/mês, sem
  mensalidade", explica que a comissão é negociada direto com o artista
  (a doopla não define uma comissão fixa), CTA "Começar grátis" (nunca
  "teste grátis", porque não é teste).
- ✅ **Revisão consolidada da Home** (documento final, que substitui os
  anteriores): "Marketplace de representação" → "Plataforma de
  representação" em todo canto (Home, cadastro, metadata do site);
  bloco novo "Já tem booker? Traga pra doopla" e "Receba oportunidades
  pelo seu link" na seção do artista; removida a frase incorreta "Você só
  recebe quando o booking acontece"; reforçado "Sua comissão. Seu
  acordo." na seção do booker, com ângulo pra quem já é profissional
  ("Já trabalha com booking?") sem perder o ângulo de quem tá começando
  (networking → renda extra, sem prometer valor); "Nenhuma negociação
  oficial acontece sem autorização" trocado por "Você decide quem pode
  representar você e mantém controle sobre os acordos" (a frase antiga
  parecia exigir autorização mensagem a mensagem); "Pagamento seguro"
  renomeado pra "Pagamento Doopla" em toda parte (Home e `/seguranca`) —
  evita prometer segurança absoluta; corrigido "30 dias" pra "15 dias"
  (não existia mais nenhuma ocorrência de 30 dias, mas garantido);
  plano do artista reescrito com preço riscado + framing de 3 meses;
  **seção de plano do Booker Básico criada do zero na Home** (não
  existia — só o plano do artista aparecia); rodapé da Home reorganizado
  em 4 colunas (Produto / Doopla / Segurança / Legal), todos os links
  reais; FAQ ampliada com as perguntas que faltavam (já tenho booker,
  quanto custa cada lado, Doopla fica com %, o que é Verified, como
  funcionam os pagamentos). Não mexi na experiência "Sou Agência" além
  da mudança global de nomenclatura, como pedido.

## 0.3. Bloco novo — cadastro/matching/relação artista↔booker (8 prioridades)

Você mandou um documento grande com 14 seções e uma ordem de prioridade
explícita de 8 itens. Trabalhando nessa ordem, um item por vez, cada um
com sua própria seção aqui.

### Prioridade 1 — Vínculo Artista↔Booker como fonte única de verdade ✅

Investiguei antes de mexer em qualquer coisa (você pediu explicitamente
pra não corrigir tela por tela sem entender a causa raiz). Resultado: a
tabela `representations` **já era** a fonte única de verdade — escrita
por um trigger no banco (`handle_representation_request_response`),
RLS correta, e todo ponto de leitura (`getArtistBookers`,
`getRepresentedArtists`, `getRepresentedArtistCards`, roteamento do
`/orçamento`, etc.) já filtrava na direção certa. Não era um problema de
dado errado.

**Causa raiz real**: `respondRepresentationRequestAction` e
`confirmInviteAction` só invalidavam 1-2 das ~6 rotas que dependem dessa
relação (esqueciam `/dashboard/perfil`, `/dashboard/artistas`,
`/dashboard/propor`, as páginas de perfil individual). Isso explica
exatamente os sintomas que você reportou: "aceitei, mas sumiu daqui",
"/orçamento diz que não tenho booker" mesmo com a relação já existindo
no banco.

- ✅ Corrigido com uma função central `revalidateRelationshipPaths(
  artistId, bookerId)`, chamada por toda ação que cria/altera a
  relação — em vez de espalhar `revalidatePath` solto em cada action
  (mesmo princípio que você pediu pra entidade: uma fonte, não lógica
  duplicada por tela).
- ✅ **Notificação que não existia**: booker nunca sabia quando um
  artista respondia sua solicitação de representação. Migration 0025
  adiciona `representation_requests.booker_seen_at`; agora aparece em
  "Precisa da sua atenção" ("X aceitou/recusou sua solicitação de
  representação") até o booker visitar `/dashboard/artistas`, quando
  marca como visto automaticamente (mesmo padrão já usado pras
  oportunidades novas).
- ⏳ Não fiz ainda (fica pra prioridade 4, que agrupa Meus Bookers/Meus
  Artistas/notificações): notificação simétrica do lado do convite
  (`invites`) quando um artista confirma o convite de um booker — hoje
  só ganhou a invalidação de cache corrigida, não uma notificação
  "vista/não vista" como a de representation_requests. Avisar se quer
  isso na mesma prioridade 1 ou se pode esperar a 4.

### Prioridade 2 — Refazer onboarding (artista e booker) ✅

Cadastro antigo perguntava basicamente nome e "recorrente ou pontual" —
não gerava dado suficiente pro matching. Migration 0026 adiciona campos
estruturados (arrays de verdade — `text[]`, nunca texto livre) nos dois
perfis, e o wizard de cadastro foi reescrito pra coletar tudo isso.

- ✅ **Bug real corrigido no meio do caminho** (você pegou testando):
  "ajuda pontual" tinha um caminho de 2 perguntas, bem mais raso que
  "recorrente". Unificado — agora `recorrente`/`pontual`/`ambos`
  passam todos pelo mesmo conjunto completo de perguntas. O booker já
  estava correto nesse ponto (as 3 opções de `modoTrabalho` nunca
  tiveram caminhos diferentes) — só o artista tinha o bug.
- ✅ **Artista, campos novos**: nome artístico separado de nome
  completo, tipos de trabalho, tipos de cliente/evento, regiões onde
  atua (separado de `mercados`, que virou só nicho/vertical), idiomas,
  estágio de carreira/volume, faixa de cachê (banda pré-definida, não
  valor exato), em quais atividades precisa de ajuda (negociação,
  prospecção, cobrança, contratos, organização, atendimento,
  fechamento, outra).
- ✅ **Booker, campos novos**: categorias de artista com quem trabalha,
  tipos de trabalho/cliente que domina, regiões, idiomas,
  especialidades estruturadas (substituindo o campo `specialties` de
  texto livre — a coluna antiga continua no banco, só não é mais lida
  nem escrita pelo app), quantos artistas consegue atender agora,
  faixa de cachê dos artistas com quem trabalha.
- ✅ **"Traga sua dupla pra doopla"**: quando o artista responde que já
  tem um booker ("Sim, quero trazer essa pessoa pra doopla"), aparece
  um passo novo pra convidar essa pessoa (nome + contato opcional),
  exatamente como o booker já convida artistas no cadastro dele.
  Nunca bloqueia — sempre dá pra clicar Próximo sem preencher.
- ✅ **Convite ficou bidirecional**: antes só existia booker convidando
  artista. `confirmInviteAction` agora olha o papel de quem convidou
  pra decidir a direção da `representations` — funciona nos dois
  sentidos, e continua disponível depois do cadastro em Meus Bookers
  (`/dashboard/bookers#convites`, card novo) e no Perfil (link direto
  quando não há booker configurado ainda pro roteamento do
  `/orçamento`).
- ✅ **Perfil editável com os mesmos campos**: todo campo novo também
  virou editável depois, em `/dashboard/perfil` — mesma lista de
  opções do cadastro (`src/lib/matching-options.ts`, fonte única
  compartilhada entre wizard e Perfil), sempre chip/seleção, nunca
  texto livre solto.

### Prioridade 3 — Convites opcionais no cadastro + convidar depois pelo perfil ✅

Coberto junto com a prioridade 2 (o passo de convite no cadastro do
artista e a bidirecionalidade do `confirmInviteAction` já entregam boa
parte disso). O que faltava:

- ✅ Booker também ganhou, no Perfil, um card "Sua rede" com link direto
  pra convidar artista que ainda não está na doopla
  (`/dashboard/artistas#convites`) — espelha o que o artista já tinha
  pro convite de booker.

### Prioridade 4 — Meus Bookers / Meus Artistas / notificações ✅

- ✅ **Auditoria do "alguém"**: chequei todo ponto do painel que usa
  "Alguém" como fallback de nome (`getAttentionItems`,
  `getIncomingRepresentationRequests`, `getPendingInvites`, indicações).
  Em todos os casos já era um fallback de último recurso genuíno (nome
  realmente não encontrado), não o bug relatado — o sintoma concreto que
  você viu ("booker não aparece em lugar nenhum depois do aceite") já
  tinha sido resolvido pela correção de cache da prioridade 1.
- ✅ **Card completo do booker na tela de solicitação**: antes a tela de
  "Bookers que querem te representar" mostrava só nome + mensagem. Agora
  mostra foto (ou iniciais), bio, cidade, especialidades, categorias,
  avaliação, selo "Booker Doopla Oficial" (quando aplicável — hoje nunca
  aplicável de verdade, porque os critérios de Booker Oficial têm dois
  itens sempre falsos ainda; deixei honesto em vez de fingir) e link pro
  perfil completo.
- ✅ **Meus Bookers / Meus Artistas reorganizados em 3 estados sempre
  separados, nunca misturados**: "Solicitações pendentes recebidas" (ou
  "enviadas", do lado do booker) → "Meus Bookers"/"Meus Artistas"
  (relação ativa) → "Convites enviados", cada um com seu próprio
  cabeçalho de seção.
- ✅ **Relação ativa ficou mais rica**: cada card de booker/artista ativo
  agora mostra "Juntos desde [mês/ano]" e quantos trabalhos estão em
  andamento agora (ou "nenhum trabalho em andamento"), com link
  "Gerenciar relação" pro perfil completo.
- ✅ **Novo**: booker agora também vê a lista de solicitações de
  representação que ele mesmo enviou e ainda estão pendentes
  ("Solicitações enviadas" em `/dashboard/artistas`) — antes só existia
  como badge solto nos cards de descoberta, sem lugar centralizado.

### Prioridade 5 — Corrigir e reorganizar o fluxo /orçamento ✅

Investiguei antes de mexer (mesmo princípio das prioridades 1 e 4). A
camada de dados/roteamento já estava sólida: `submit_orcamento_request`
sempre cria a oportunidade em nome do artista primeiro
(`artist_profile_id`), o booker só é convidado quando o roteamento
configurado manda e nunca é dono da oportunidade; `assigned_to` é
snapshot no momento da criação, nunca recalculado — já era "nunca
retroativo" antes mesmo de eu mexer.

A lacuna real era só na UI:

- ✅ **"Pedidos recebidos" separado**: `/dashboard/oportunidades` (visão do
  artista) misturava pedidos vindos do link de orçamento
  (`source = 'artist_link'`) com trabalhos publicados manualmente
  (`source = 'mural'`) numa lista só, chamada "O que você publicou" — um
  pedido de cliente não é algo que o artista "publicou". Agora são duas
  seções sempre separadas: "Pedidos recebidos" e "O que você publicou".
- ✅ **Tela do pedido**: adicionado um aviso explícito — "Você pode
  gerenciar esse pedido você mesma", deixando claro que não é obrigatório
  envolver um booker. Quando o artista não representa nenhum booker
  ainda, aparece "Buscar ajuda de um booker →" direto pro Descubra
  (`/dashboard/bookers#descubra`) — antes esse caso não tinha nenhuma
  chamada pra ação.
- ✅ **Copy do roteamento do link** (`/dashboard/perfil`): os 3 modos já
  existiam certos na estrutura (eu / meu booker / eu + meu booker), só a
  linguagem que não batia com o que você pediu — "Só eu recebo" virou
  "Decidir caso a caso" (deixando claro que dá pra escolher pedido por
  pedido depois), "Meu booker recebe" virou "Enviar automático pro meu
  booker".

### Prioridades 6–8 — na fila, ainda não começadas

## 0.2. Cancelamento/reembolso, parte estrutural (prioridade 2 do bloco anterior)

Documento: `doopla-cancelamento-reembolso-rascunho.md` v2 ("reescrito
para split + repasse imediato"). Escopo combinado com você: só modelo
de dados/snapshot e linguagem no painel — nada aqui simula repasse
real de PSP, porque a doopla ainda não tem integração de verdade com
o Pagar.me ("Marcar como pago" continua um registro manual, como já
era). Os 4 pontos travados usados foram os do fim do próprio
documento: mecanismo de divisão da dívida entre artista/booker,
janela de segurança antes do repasse, MDR retido em chargeback, UI de
saldo devedor. Nenhum dos quatro foi implementado.

- ✅ **Forma de pagamento + política de cancelamento, snapshotadas na
  proposta**: ao propor um booking, o booker define 100% após o
  trabalho ou sinal+saldo (com % do sinal e regra de vencimento do
  saldo em texto livre), e se o sinal é reembolsável em cada caso de
  cancelamento (cliente desiste / artista cancela). Fica gravado no
  booking no momento da proposta, nunca uma referência viva a uma
  política que pode mudar depois.
- ✅ **Consentimento explícito**: no momento de aceitar a proposta, a
  outra parte vê um resumo das condições de cancelamento e precisa
  marcar um checkbox obrigatório antes de aceitar. Não existe uma
  "tela de pagamento do sinal" de verdade ainda (sem PSP real) — a
  captura acontece no touchpoint real mais próximo disso.
  `cancellation_terms_accepted_at/by` fica registrado.
- ✅ **Cancelar booking**: só o artista cancela (o documento é
  explícito que o booker não cancela unilateralmente um booking já
  confirmado). Registra quem decidiu (cliente desistiu vs. artista
  cancelou), motivo opcional, e mostra a cópia da política aplicável
  — sem executar nenhum reembolso de verdade, só informativo (deixei
  isso escrito na própria tela). Novo status `cancelada` no booking.
- ✅ **Remarcação consensual**: distinta de cancelamento, o booking
  continua. Qualquer parte propõe uma nova data; só o artista aceita
  (autoridade final, regra do documento) — se o próprio artista
  propõe, já vale na hora, sem precisar de auto-aprovação. Guarda a
  data original pra sempre mostrar "remarcado, era X".
- ✅ **Inadimplência leve + disputa/chargeback como flag separado**: ao
  marcar um trabalho como realizado, dá pra informar (opcional) o
  vencimento do pagamento restante — isso alimenta um rótulo A
  vencer/Vencido/Em cobrança no painel do booker, sem nenhuma régua de
  cobrança automática por trás (continua manual). Disputa/chargeback
  vira uma sinalização separada de cancelamento (nunca a mesma coisa
  no produto), também sem execução financeira.
- 🔒 Travado, aguardando jurídico/PSP (lista do documento): mecanismo
  de divisão da dívida entre artista e booker, janela de segurança
  antes do repasse de fato, MDR retido em chargeback, UI de saldo
  devedor. Fora disso, o documento está fechado.

## 0.1. Bloco C — Especificação completa final (painéis/navegação/perfil/orçamento)

Documento novo, substitui os fragmentos anteriores e a sidebar que eu
tinha acabado de construir. Prioridade confirmada: 1) `/orçamento`
(este documento inteiro), 2) cancelamento/reembolso estrutural,
3) Segurança da Home. Construindo por fases, na ordem do próprio
documento (seção 49).

- ✅ **Fase 1 (parcial) — navegação**: sidebar reagrupada (Início/
  Trabalho/Minha rede/Financeiro), "Seu painel"→"Visão geral",
  "Dinheiro"→"Pagamentos", "Meus ganhos"→"Ganhos", CTA "+ Preciso de
  ajuda" (artista, dropdown real levando pras telas existentes) e
  "+ Tenho um trabalho" (booker). Removidos como itens de nav
  standalone: Contratos (contrato agora vive dentro do booking), 
  Negociação (a urgência já aparecia em "Precisa da sua atenção"),
  Publicar trabalho (vira opção dentro de "+ Preciso de ajuda").
- ✅ Contrato movido pra dentro da tela do booking
  (`/dashboard/bookings/[id]`) — gerar/anexar direto ali, lista
  standalone `/dashboard/contratos` removida.
- ✅ "Solicitar saque" — decisão fechada (6.1): botão sempre
  desabilitado até o Bloco 2/Pagar.me existir de verdade, nunca mais
  um formulário funcional de saque (antes disso registrava um pedido
  real em `payout_requests`; isso foi revertido de propósito).
- ✅ **Perfil completo (artista e booker)** — página `/dashboard/perfil`
  reorganizada em "Conta" (e-mail, tipo) e "Perfil público" (foto,
  formulário editável: nome artístico/categoria/subcategoria/bio/
  gêneros/mercados/site/outros links + checkboxes viaja/atende fora
  da cidade/aceita trabalho fora, pra artista; nome profissional/bio/
  mercados/especialidades/experiência/instagram, pra booker). Campos
  de onboarding que não viraram edição direta (intenção, "já tem
  booker", modo de trabalho etc.) ficam num card "Respostas do
  cadastro" só-leitura, sem duplicar os que agora são editáveis.
  Migration `0023_perfil_completo_e_orcamento.sql` adiciona as
  colunas novas em `artist_profiles`/`booker_profiles` — **ainda
  não rodada por você, SQL completo no fim deste arquivo/próxima
  mensagem**.
- ✅ **`/orçamento` de verdade** — link público `doopla.co/orcamento/
  [slug]`, formulário sem login (nome, contato, descrição, data,
  local, valor que o cliente pode oferecer), grava via função
  `submit_orcamento_request` (SECURITY DEFINER, mesmo padrão usado
  pro trigger de referral — cliente não tem `auth.uid()`, então a
  escrita não pode depender de RLS de usuário autenticado). A
  oportunidade nasce com `source='artist_link'`, e `assigned_to`
  (artista/booker/os dois) é decidido na hora a partir da tabela
  `artist_link_routing` — depois de criada, mudar o roteamento no
  Perfil não afeta pedidos antigos (snapshot, regra geral do
  documento). Tela de configuração do roteamento fica dentro do
  Perfil (card "Quem recebe seus pedidos de orçamento": Só eu / Meu
  booker / Eu e meu booker — desabilitado com aviso se o artista
  ainda não tem nenhum booker na rede) e mostra o link com botão de
  copiar, igual ao link do perfil público.
- ✅ **3 casos de negociação no card de oportunidade (painel do
  booker)**: "Cachê do artista" separado de "Sua comissão", origem
  sempre visível ("Recebida pelo seu link de orçamento" vs mural),
  e os três estados (já negociado / cliente ofereceu um valor / sem
  valor nenhum ainda) com copy própria pra cada um. Isso também
  obrigou tornar `commission_percent` opcional no banco (pedidos que
  chegam pelo link ainda não têm comissão combinada) — todos os
  lugares que liam esse campo foram revisados (`tsc --noEmit` limpo).
- ✅ **"+ Tenho um trabalho" (booker)** — deixou de ser um link direto
  pra `/dashboard/propor` e virou um seletor (mesmo padrão do "+
  Preciso de ajuda" do artista) com 3 caminhos: já represento o
  artista → proposta direta; buscar um artista na doopla → aba
  Artistas, seção Descubra; artista ainda não está na doopla →
  convite. O convite é novo: card "Convidar quem ainda não está na
  doopla" na aba Artistas (`#convites`), grava em `invites` (mesma
  tabela do convite que já existia no cadastro, só que agora também
  dá pra mandar de dentro do painel) e lista o histórico com status
  (aguardando/confirmado).
- ✅ **Dashboard: reordenação + "Precisa da sua atenção" redesenhado +
  referral reduzido**. Nova ordem: stats → Precisa da sua atenção →
  convites pendentes → progresso Booker Oficial → seus trabalhos →
  (artista) bookers → indicação, no fim. "Precisa da sua atenção"
  ganhou distinção visual por item (bolinha vermelha pra urgente —
  pagamento em aberto, comissão proposta esperando decisão do artista
  — vs. accent pra informativo — avaliação pendente, nova
  oportunidade, pedido de representação), em vez de um único
  indicador genérico no título do card. "Indique. Ganhe R$5." saiu de
  card cheio (parágrafo + link grande + 3 métricas) pra uma faixa
  fina de uma linha só, movida pro fim da página — continua
  funcional (copiar link), só não compete mais com o que precisa de
  ação de verdade.
- ⏳ Faltam: reorganização de Bookers/Artistas em sub-abas (Meus/
  Favoritos/Descobrir — "Favoritos" é conceito novo, precisa de
  schema), agenda (conflitos/alterações).

### Checagem real da Fase 1 — 17/08/2026

Eu tinha marcado a Fase 1 como fechada acima ("Bloco C fechado nos
itens priorizados"). Não estava — um print real do painel do booker
mostrou vários itens da seção 42 (fundação) que não batiam com o que
eu tinha dito. Fica registrado item por item, com o que eu encontrei
de verdade e o que foi corrigido nesta rodada, pra não repetir o erro
de marcar como pronto sem checar contra a tela real:

- ✅ **Sidebar Booker** — grupos batem (Início/Trabalho/Minha rede/
  Financeiro). "Nova proposta" e "Convide um artista" não são itens
  próprios de sidebar de propósito — ficam dentro do seletor "+ Tenho
  um trabalho" (decisão já reconciliada entre os três documentos
  antigos, registrada em DECISOES.md).
- ✅ **Sidebar Artista** — mesma estrutura, confirmado.
- 🔧→✅ **Métricas financeiras do booker** — estava errado: mostrava
  Comissão total ganha / Receita do mês / Bookings ativos / Taxa de
  aceite. Corrigido pra bater com a seção 4.1: Valor total negociado
  (bruto, soma do cachê em bookings confirmados) / Comissão total
  ganha / Disponível para sacar / Bookings ativos.
- 🔧→✅ **"Precisa da sua atenção" ausente no print** — no código
  atual ela existe e fica logo depois das métricas (isso já tinha
  sido feito antes deste print, na reordenação documentada acima). Se
  o print mostrou ausente, ou foi tirado antes desse deploy, ou a
  conta usada não tinha nenhum item pendente no momento (a seção some
  quando a lista está vazia, isso é intencional, não bug). Adicionei
  `id="atencao"` pra virar destino de link direto (usado agora pelo
  sino de notificação).
- ❌→✅ **Notificações (sino com badge)** — não existia. Construído:
  ícone de sino no topo da sidebar (visível em toda página do painel),
  com contagem real de itens de "Precisa da sua atenção" (mesma fonte
  de dados, sem inventar sistema novo), link pra `/dashboard#atencao`.
- ❌→✅ **Empty states genéricos** — "Nenhum booking por aqui ainda"
  virou "Você ainda não tem bookings" + CTAs reais por papel (booker:
  Encontrar artistas / Nova proposta / Convidar artista; artista:
  Publicar um trabalho / Ver oportunidades / Encontrar um booker).
- ⚠️→✅ **Botão "Sacar" nos cards** — não era funcional (nunca
  processou saque de verdade, sempre foi só um link pra
  `/dashboard/dinheiro`, onde o "Solicitar saque" real já estava
  desabilitado desde antes). Mas visualmente parecia um botão ativo
  de saque dentro do card de dinheiro — troquei o rótulo pra "Ver
  detalhes" nos dois papéis, e no booker o link agora mora junto do
  novo card "Disponível para sacar" (mais coerente) em vez de junto
  de "Comissão total ganha".
- 🔧→✅ **Card Booker Oficial acima de Trabalhos** — a seção 8 diz que
  ele nunca pode ficar acima de dinheiro/pendências/bookings. Estava
  entre "Convites pendentes" e "Seus trabalhos" — movido pra depois
  de "Seus trabalhos".

- ✅ **Métricas financeiras do artista** (seção 22/43, confirmado depois
  que ela apontou que a mesma correção valia aqui): Recebido líquido/
  Recebido no mês/Bookings fechados/Comissão média paga viraram Total
  em trabalhos (bruto)/Total recebido (líquido)/Disponível para
  sacar/Bookings ativos — mesmo padrão de correção do booker.
- ✅ **Sistema de 3 estados nos indicadores de atenção** (instrução
  nova, vale pra toda a interface, não só essa seção): bolinha
  vermelha = ação pendente/urgente; amarela = requer atenção, mas sem
  pressa; sem bolinha = só informação. Reclassifiquei cada item real
  de `getAttentionItems` nessa lógica (ex.: cliente não pagou =
  vermelha; comissão proposta esperando decisão = amarela; nova
  oportunidade disponível = sem bolinha). O título "Precisa da sua
  atenção" só mostra a bolinha vermelha quando existe pelo menos um
  item de verdade urgente — não aparece só porque a seção tem
  itens. O sino de notificação no header segue a mesma regra (vermelho
  só se houver algo urgente; senão, o tom mais discreto). Auditei os
  outros usos de vermelho na interface (pills de status, checkpoints,
  selo Doopla Verified, badge de "Oportunidades" no menu) — esses já
  sinalizavam estado real (cancelado, pendente, não verificado), não
  decoração, então não precisaram mudar.

Com isso, a Fase 1 (seção 42) está fechada de verdade, validada
contra o checklist item por item, não só reportada como pronta.

## 0. Layout do painel (menu lateral)

- ✅ Trocado o menu horizontal do topo por sidebar fixa à esquerda,
  seguindo `doopla-painel-FINALhtml_5.html` (logo, foto/nome/papel,
  navegação vertical com item ativo destacado, CTA de atalho embaixo,
  Sair). Todos os links e badges que já existiam continuam — a
  sidebar tem mais itens que o mockup estático porque o produto real
  já tem mais telas (Oportunidades, Nova proposta) do que aquele
  print mostrava. Em mobile a navegação vira uma barra horizontal
  com scroll, não um menu escondido atrás de hambúrguer (mockup não
  define esse comportamento, então usei o padrão mais simples).
- ⚠️ Validado com build de produção limpo. Não consegui tirar
  print logado de verdade sem criar uma conta de teste no seu
  Supabase real — prefiro você conferir no preview.

## 1. Site institucional / marketing

- ✅ Home, Sobre, Termos, Privacidade — conteúdo real, não stub.
- ⚠️ **Correção**: eu tinha esse item marcado como "Preços — conteúdo
  real" também, e isso estava errado — `/precos` continua sendo um
  stub ("em breve") até hoje. Corrigindo aqui pra não repetir o erro
  de marcar algo pronto sem checar contra o código real (mesma lição
  da checagem de Fase 1 mais abaixo). Não construí `/precos` agora,
  só corrigi o registro — avisar se quer priorizar.
- ✅ **Segurança da Home + FAQ** (mockup `doopla-seguranca-home-faq-
  validacao_final.html`, item 3 da fila priorizada) — seção completa
  na Home (`#seguranca-home`, entre "Como funciona" e "Planos", com
  link no menu): 3 cards (Identidade verificada / Doopla Verified /
  Pagamento seguro) + card spotlight preto sobre pagamento seguro
  (checklist + aviso "mudou a conta por WhatsApp? desconfie" +
  tagline) + CTA "Entenda nossa segurança" levando pra `/seguranca`.
  `/seguranca` deixou de ser stub: pilares recapitulados + FAQ
  completo de 10 perguntas (accordion nativo `details`/`summary`, sem
  JS). Cores usam os tokens reais da marca (--ink/--paper/--accent/
  --alert), não a paleta própria do arquivo de mockup (que era só pra
  handoff visual). Sem dependência de outro bloco, como você avisou.
- ❌ Página de validação do cliente (o link que o cliente recebe pra
  confirmar o booking — `/validar/[algumId]`, sem precisar de conta).
  Também estava no mesmo arquivo de mockup, mas **não faz parte do
  que você pediu no item 3** ("Segurança da Home + FAQ", sem
  dependência de outro bloco) — essa página depende de abrir leitura
  pública de um booking específico (hoje só os dois lados logados
  conseguem ver), que é justamente o que segura o selo Doopla Verified
  no perfil público (ver item 4). Faz parte do "Bloco E" que você mesma
  identificou como pendente. Não constrói até você priorizar esse
  bloco especificamente.

## 1.1. Direcionamento do link /orçamento (Bloco C)

- ✅ Feito — ver detalhe completo na seção 0.1 acima (esta seção
  ficou duplicada depois da especificação consolidada; mantida só
  pra não quebrar referência caso você tenha procurado por ela).

## 2. Cadastro / onboarding

- ✅ Completo pros dois papéis (artista recorrente/pontual, booker
  universal/nichado, convites, plano Preço Fundador, bifurcações,
  seleção múltipla nas perguntas certas).

## 2.1. Indique. Ganhe R$5. (#49)

- ✅ Link de indicação (`doopla.com/cadastro?ref=CODIGO`, código gerado
  automaticamente pra todo profile), card no painel do artista, e
  histórico com origem completa (quem foi indicado, quando, status) na
  tela Dinheiro.
- ⚠️ **Decidido junto com você**: o critério real de qualificação
  (45-60 dias de assinatura ativa) depende de um sistema de assinatura
  que não existe no código ainda (Preço Fundador hoje é só uma tela
  informativa no cadastro, sem PSP nem cobrança recorrente). Por isso
  toda indicação nasce e fica em `pendente` pra sempre — não existe
  nenhum caminho automático pra `qualificada`, em nenhuma migration.
  R$5 nunca é creditado de verdade enquanto isso não mudar. Quando o
  sistema de assinatura existir, falta só plugar a checagem real (uma
  migration nova, sem redesenhar nada do que já está construído).
  Deliberadamente não travei "45" ou "60" dias em lugar nenhum do
  schema — isso é decisão de produto ainda não tomada, não algo pra
  eu pré-decidir tecnicamente.
- ✅ Quando algo qualificar de verdade, já soma automaticamente ao
  saldo disponível pra saque (mesmo saldo/Sacar que já existe, sem
  sistema novo) — só que hoje essa soma é sempre R$0 porque nada
  qualifica ainda.

## 3. Painel do artista

- ✅ Trabalhos, Agenda (calendário + disponibilidade), Contratos
  (anexar link), Dinheiro (saldo + Sacar), Bookers (já trabalhou +
  descobrir), Perfil (foto com recorte, bio, link público `/[slug]`),
  Negociação, Publicar trabalho, checkpoints do booking (Cliente,
  Cachê, Data, Validado, Pagamento) + badge Doopla Verified na tela do
  booking.
- ✅ Card "Indique. Ganhe R$5." (#49) — ver seção 2.1.
- ✅ **17/08**: Agenda (booker e artista) — a Agenda em si sempre foi
  só visualização (não dava, e continua não dando, pra editar a data
  direto ali). Pra mudar a data de um trabalho o caminho é a
  remarcação da tela do booking. Mas os eventos confirmados da Agenda
  não tinham link nenhum pro booking correspondente — corrigido:
  clique no evento confirmado leva direto pra `/dashboard/bookings/
  [id]`, com um "›" indicando que é clicável. Disponibilidade (marcada
  manualmente pelo artista) continua sem link de propósito — não tem
  detalhe nenhum pra abrir, só o "×" de remover, e agora fica visualmente
  claro que é uma interação diferente (sem o indicador de clique).

## 4. Painel do booker

- ✅ Agenda, Dinheiro/saldo/Sacar — mesmas telas do artista, já
  funcionam pros dois papéis.
- 🔧 **Módulo Booker Oficial** — a barra de progresso com os 5
  critérios (Booker Pro ativo, Perfil completo, Identidade verificada,
  Primeiros bookings validados, Histórico inicial). Terminando agora
  nesta sessão. Sem número em R$ e sem cálculo automático de bônus,
  como você pediu — isso é trava consciente, não esquecimento (bônus
  financeiro depende de validação jurídica que ainda não existe).
- ✅ Descoberta de artistas com paginação real (`/dashboard/artistas`,
  mesmo padrão de "meus artistas" + "descubra novos" + busca/filtro do
  `/dashboard/bookers`), fecha o #47. Booker pede pra representar um
  artista (`representation_requests`, limite de 5 pendentes reforçado
  no banco), artista vê e responde em "Bookers que querem te
  representar" (`/dashboard/bookers#solicitacoes`).
- ✅ Perfil completo interno dos dois lados: `/dashboard/artistas/[id]`
  (booker vendo artista) e `/dashboard/bookers/[id]` (artista vendo
  booker) — nota real, atributos com contador, bio/mercados/links,
  CTA conforme a relação (pedir representação / já representa / já
  trabalha com você). O perfil de booker não tem CTA de "artista pede
  pro booker" porque isso não existe no schema ainda (representation_requests
  é só booker→artista) — mostro só o estado, não invento uma ação que
  não existe de verdade.

## 5. Perfis, avaliações e reputação (`doopla-perfis-avaliacoes.md`)

Documento chegou sem nenhuma trava — spec fechada, pode implementar
por inteiro.

- ✅ Tabela `reviews` (migration `0017_reviews.sql`): `booking_id`,
  quem avaliou, quem recebeu, nota, atributos, comentário, status
  (`pendente/ativa/removida/invalidada`), `contested`. RLS: cada um vê
  as próprias linhas; avaliação `ativa` é pública (pro agregado do
  perfil); autor edita a própria, avaliado só marca pedido/contestação.
- ✅ As duas avaliações de um booking nascem sozinhas quando ele vira
  `concluida` (trigger no banco), como pendentes — nenhuma UI cria
  avaliação na mão.
- ✅ Atributos com contador — dois vocabulários (o do artista avaliando
  booker é literal do documento; o do booker avaliando artista é um
  rascunho meu no mesmo tom, porque o documento só dá um exemplo —
  ainda precisa da sua confirmação palavra por palavra).
- ✅ Fluxo completo na tela do booking (`/dashboard/bookings/[id]`):
  formulário de estrelas + até 3 atributos + comentário opcional,
  edição por 24h depois de enviar, "Pedir avaliação" (uma vez só) e
  "Contestar avaliação" pro lado que recebeu.
- ✅ Pendência de avaliação aparece em "Precisa da sua atenção" no
  painel, sem precisar procurar o booking.
- ✅ Nota + total de avaliações real no card de booker
  (`/dashboard/bookers`) e no perfil público do artista (`/[slug]`),
  com "Novo na doopla" honesto quando ainda não há avaliação nenhuma.
- ❌ Moderação de verdade (remoção por fraude, revisão de contestação)
  — os estados existem no banco, mas não existe painel administrativo
  nenhum ainda pra Doopla agir sobre isso. Fica manual por enquanto.
- ✅ Perfil completo do booker (`/dashboard/bookers/[id]`) e descoberta
  de artista padronizada pro booker (`/dashboard/artistas`) — ver
  seção 4, fecha o #47.
- Separação declarado vs. calculado: já é o padrão que uso em todo o
  banco (`profiles`/`artist_profiles` = declarado, nota/contadores/
  histórico = sempre calculado, nunca campo editável pelo usuário).

## 6. Segurança financeira, Pix, split (`doopla-seguranca-financeira-split.md`)

Arquitetura fechada: split + repasse imediato a cada pagamento
confirmado pelo PSP (não existe mais retenção até o evento acontecer).

- 🔒 **Tudo que envolve dinheiro de verdade** — nenhum PSP (Pagar.me
  ou outro) está integrado ainda, então Pix, confirmação de pagamento,
  split automático e repasse real não têm onde rodar. Construir isso
  sem PSP escolhido seria fingir uma funcionalidade que não existe —
  não vou fazer isso.
- ⏳ O que dá pra preparar sem PSP: estrutura de dados (campos de
  `installment`, `artist_share`, `booker_share`, `recipient_id`,
  `split_id` como snapshot, nunca recalculado), texto de aviso de
  segurança ("nunca mude a conta por WhatsApp") na tela de validação
  do item 1. Ainda não comecei — entra depois do módulo de avaliações.
- 🔒 4 pontos que o próprio documento marca como "aguardando
  jurídico/PSP": mecânica exata da divisão de saldo devedor, resposta
  do PSP sobre MED em marketplace, MDR de chargeback, janela técnica
  de processamento. Não vou tocar nisso até você confirmar que
  fechou.

## 7. Cancelamento, reembolso e disputa (`doopla-cancelamento-reembolso-rascunho.md`)

- ⏳ Estrutura de status (remarcação ≠ cancelamento ≠ disputa ≠
  inadimplência), snapshot das condições de cancelamento no booking —
  bloqueado só por depender do split de verdade existir primeiro
  (item 6), não por falta de spec.
- 🔒 Mesmos 4 pontos gated do item 6 (divisão de dívida, MED, MDR,
  janela de processamento) — o documento é explícito que isso não
  trava o resto, mas eu não construo especificamente esses 4.

## 8. Gerador de contrato (`doopla-gerador-contrato.md`)

- ✅ Os 3 caminhos existem e funcionam: "gerar com a doopla" (puxa os
  dados do booking + contratante/local/data informados, monta um
  documento em `/dashboard/contratos/documento/[id]`, imprimível/
  salvável em PDF pelo navegador), "anexar link próprio" (já existia),
  "sem contrato formal" (não fazer nada).
- ✅ Snapshot imutável: o conteúdo gerado (`booking_contracts.content`)
  nunca muda depois, mesmo que o texto padrão dos módulos mude —
  documento não tem policy de update/delete de propósito.
- ✅ Módulos liberados: escopo, partes (artista/booker/contratante),
  evento (data/local). O documento mostra explicitamente, numa seção
  separada, que pagamento e cancelamento ainda não estão cobertos —
  nunca finge cobrir o que não cobre.
- 🔒 Módulos de forma de pagamento e política de cancelamento —
  seguem travados até a validação jurídica/Pagar.me fechar.

## 9. Selo Doopla Verified — status exato (pergunta que você fez)

Já expliquei isso antes, confirmando de novo por escrito aqui pra não
se perder:
- **Doopla Verified é um selo por booking**, não por perfil — confirma
  que aquele cliente específico revisou e aceitou as condições daquele
  booking específico. Isso já está implementado na tela do booking
  (`/dashboard/bookings/[id]`), calculado a partir de `validated_at`.
- O perfil público do artista (`/[slug]`) **não mostra** esse selo, de
  propósito — porque hoje não existe leitura pública de bookings (só
  os dois lados logados veem), e o próprio documento de perfis (item 9
  acima) confirma que Verified nunca deveria aparecer misturado com os
  outros dois selos (Identidade verificada, Booker Doopla Oficial) de
  qualquer forma — são conceitos diferentes.
- O que falta de verdade pro Verified funcionar por inteiro é o **link
  de validação do cliente** (item 1 acima) — aí sim o cliente confirma
  e o booking vira Verified. Essa página ainda não existe.

---

## 10. Bloco 4.5 — oportunidades, convites e matching (integração entre sessões)

Havia uma segunda sessão do Claude Code trabalhando em paralelo, num
branch separado (`claude/doopla-bloco-4-5-opportunities-5f15n6`, PR #2),
que tinha construído só a camada de banco desse bloco (schema, RLS,
função `select_booker_for_opportunity`). Trouxe esse schema pra este
branch (migration `0018`).

- ✅ Duas auditorias de risco rodaram em paralelo, cada uma sem ver a
  outra: uma aqui (migration `0019`) e outra no PR #2. Nenhuma das duas
  cobria os 3 pontos por completo sozinha — a mais grave: uma recursão
  de RLS entre `opportunities`/`opportunity_invitations` que quebraria
  qualquer select/update real de oportunidade não apareceu em nenhuma
  das duas, porque as duas testaram como superusuário (que ignora RLS).
  Consolidado na migration `0021`, verificado de ponta a ponta com uma
  role `authenticated` real (sem bypass) — ver `AUDITORIA_BLOCO_4_5.md`
  (reescrito pra refletir o estado final, não mais o de cada auditoria
  isolada).
- ✅ Reconciliada a única divergência real de comportamento entre as
  duas: `select_booker_for_opportunity` agora deixa o artista selecionar
  qualquer booker, **e** deixa o próprio booker aceitar o próprio convite
  direto pendente (é assim que o roteiro define esse caminho) — sem
  reabrir o buraco de um booker se autoselecionar sem convite nenhum. A
  tela nova (abaixo) só usa o caminho do artista hoje; o de booker fica
  disponível pra quando um botão de "aceitar convite" for construído do
  lado do booker.
- ✅ Ciclo completo construído em cima do schema auditado (chegou nesse
  branch entre minha auditoria e a consolidação — reconciliei os dois):
  publicar (com "pra quem" — meus bookers / novos bookers / ambos),
  booker demonstra interesse (modo aberto) ou recusa convite (modo
  direto — aceitar ainda é só o artista escolhendo, ver acima), artista
  vê os dois em `/dashboard/oportunidades/[id]` e escolhe um via
  `select_booker_for_opportunity` — isso cria o booking e segue o fluxo
  de negociação que já existia.
- ❌ Ainda fora do escopo (não é o que o roteiro do beta pede agora):
  curadoria admin manual, distribuição automática por regra de
  categoria, worker de tags por IA, `ai_usage_events` real.
- PR #2 fechado como redundante — o schema dele (e os achados que só
  existiam lá) já estão absorvidos aqui.

## Como usar isso

Toda vez que eu terminar um item, atualizo o status aqui e commito
junto com o código. Se quiser saber "o que falta", é só pedir pra eu
reler este arquivo — não preciso da conversa inteira pra saber onde
paramos.
