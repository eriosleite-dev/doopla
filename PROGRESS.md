# Doopla — status real do build

Este arquivo existe pra resolver um problema específico: você não deveria
precisar lembrar, de cabeça, tudo que já mandou e o que já foi construído.
Sempre que eu terminar (ou travar) alguma coisa, atualizo esse arquivo.
Se um dia você esquecer o que pediu, é aqui que a resposta está — não
precisa reconstruir o histórico na conversa.

Legenda: ✅ pronto e no ar · 🔧 em andamento agora · ⏳ na fila, sem trava ·
🔒 travado (motivo explicado) · ❌ ainda não começou

Última atualização: 2026-08-15.

---

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
- ⏳ Faltam: reorganização de Bookers/Artistas em sub-abas (Meus/
  Favoritos/Descobrir — "Favoritos" é conceito novo, precisa de
  schema), reordenação do dashboard + "Precisa da sua atenção"
  redesenhado, agenda (conflitos/alterações), booker's "+ Tenho um
  trabalho" com busca/favorito/convite de artista (hoje o CTA só
  linka pra tela existente de propor trabalho).

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

- ✅ Home, Sobre, Termos, Privacidade, Preços — conteúdo real, não stub.
- ❌ Seção "Segurança" da home (a que está em
  `doopla-seguranca-home-faq-validacao.html`: os 3 cards de segurança,
  o card grande "Pagamento seguro" com checklist, FAQ de 10 perguntas).
  Hoje `/seguranca` é só um stub ("em breve"). **Isso é trabalho novo,
  ainda não comecei.**
- ❌ Página de validação do cliente (o link que o cliente recebe pra
  confirmar o booking — `/validar/[algumId]`, sem precisar de conta).
  Não existe nenhuma rota pra isso ainda. Depende de abrir leitura
  pública de um booking específico (hoje só os dois lados logados
  conseguem ver), que é justamente o que segura o selo Doopla Verified
  no perfil público (ver item 4). Faz parte do "Bloco E" que você mesma
  identificou como pendente.

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
