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

## Revisão UX — Visão Geral do Artista (nomenclatura + hierarquia)

Mesma lógica aplicada ao painel do Booker, agora no do Artista.

- ✅ "Seus trabalhos" → "Bookings em andamento"; empty state perdeu os
  3 CTAs (Publicar um trabalho/Ver oportunidades/Encontrar um booker),
  agora é texto + 1 CTA contextual ("Publicar um trabalho").
- ✅ "Precisa da sua atenção" (artista) ganhou dois itens novos, mesma
  lógica do que foi feito pro booker: distinção entre "propôs X% de
  comissão" (primeira proposta) e "enviou uma contraproposta" (olhando
  o evento mais recente do booking); e pedidos recebidos pelo link de
  orçamento ainda sem encaminhamento (`status='aberta'`, nomeando o
  cliente). Não implementei "contrato aguardando validação" — não é
  acionável de verdade hoje (ver DECISOES.md).
- ✅ "Bookers que você já trabalhou" → "Seus Bookers" (só corrigiu a
  nomenclatura — o dado já era só vínculo ativo, `representations`,
  nunca histórico). "Descubra novos bookers" → "Bookers para você",
  com motivo real de compatibilidade (categoria/região do cadastro),
  mesma lógica já usada em Descobrir trabalhos — não é mais só "os mais
  recentes" sem contexto.
- ✅ Link de orçamento: "Oportunidades direcionadas para" → "Novos
  pedidos vão para", com "Você · Alterar" na mesma linha.
- ✅ "Complete suas preferências" virou uma faixa compacta (progresso +
  "Completar perfil →") em vez de um card branco grande — some ao
  chegar em 4/4, sem mudar a fonte de dado. Componente compartilhado
  com o painel do booker, ganhou o mesmo tratamento lá também.
- ✅ Card "Disponível para sacar" (artista) recebeu o mesmo tratamento
  honesto do booker — "—" + aviso, sem "Ver detalhes", enquanto não
  existe PSP.
- ✅ Referral "Indique. Ganhe R$5." já era honesto (`qualifiedTotalCents`
  só soma indicação com status 'qualificada', que hoje é sempre 0 —
  comentário no código já documentava isso desde antes) — conferido,
  sem mudança necessária.
- ✅ Sidebar reorganizada: Início (Visão geral, Agenda) / Bookings
  (Meus trabalhos, Pedidos recebidos) / Minha rede (Bookers, Favoritos)
  / Financeiro (Pagamentos) / Conta (Meu perfil) — mesma estrutura do
  booker. O botão fixo "+ Publicar um trabalho" já existia
  (`help-picker.tsx`), não precisou de mudança.
- ✅ Hierarquia final: Métricas → Atenção → Bookings em andamento →
  Link de orçamento → Complete seu perfil → Seus Bookers → Bookers
  para você → Indique e ganhe — já era essa ordem por construção
  (só os títulos e o conteúdo das seções mudaram, não a posição).

---

## Revisão UX — Visão Geral do Booker (nomenclatura + hierarquia)

- ✅ "Trabalhos para você" → "Oportunidades para você" (empty state:
  "Nenhuma oportunidade nova para você agora."); "Seus trabalhos" →
  "Bookings em andamento" só pro booker (artista mantém "Seus
  trabalhos" — não fazia parte do pedido).
- ✅ Ordem corrigida: Métricas → Precisa da sua atenção → Bookings em
  andamento → Oportunidades para você → Seus artistas → Agenda.
- ✅ Empty state de "Bookings em andamento" perdeu os 3 CTAs (Encontrar
  artistas/Nova proposta/Convidar artista) — agora é só o texto + um
  CTA contextual único ("Descobrir oportunidades"). O empty state do
  artista continua com os 3 CTAs dele, sem mudança.
- ✅ Nomenclatura consistente com a sidebar: "Descobrir trabalhos" e
  "Meus trabalhos" já eram os nomes usados lá — a Home passou a usar
  os mesmos dois conceitos, sem inventar um terceiro nome.
- ✅ "Precisa da sua atenção" (booker) ganhou dois itens que já
  existiam pro artista mas faltavam pro booker: solicitação de
  representação recebida de um artista (nomeando a pessoa, nunca texto
  genérico) e proposta de booking aguardando resposta do booker.
- ✅ Card "Disponível para sacar" não mostra mais um valor formatado
  nem botão "Ver detalhes" — mostra "—" e o texto "Disponível quando os
  pagamentos pela Doopla forem ativados", porque não existe saque real
  ainda (sem PSP). "Comissão ganha" renomeada (era "Comissão total
  ganha") pra não ficar parecendo a mesma coisa que "Disponível pra
  sacar". Só no card do booker — o do artista não fazia parte do pedido.
- ✅ Preview de "Oportunidades para você" ganhou uma linha de estado da
  negociação (comissão negociada/ainda não negociada + cachê do
  artista ou oferta do cliente) — mesma copy já usada no card completo
  de Descobrir trabalhos, nunca um número solto.
- ✅ "Seus artistas" já era só vínculo ativo (`representations`), sem
  mudança de dados — confirmado que não mistura com histórico/
  favoritos, que já viviam separados desde antes.

---

## LOTE 2 Parte 2 — Trabalhos com Nota Fiscal

- ✅ Migration 0035: `requires_invoice` (sim/não/ainda não sei) em
  `opportunities` e `bookings`; em `bookings` também `invoice_payment_term`
  (texto livre, NULL = "A confirmar"), `invoice_terms_accepted_at/_by`
  (mesmo aceite da proposta), e 4 timestamps de etapa — `invoice_issued_at`
  → `invoice_sent_to_client_at` → `invoice_client_paid_at` →
  `invoice_commission_paid_at`. Nenhum status global novo — mesmo padrão de
  checkpoints por timestamp da migration 0024 (cancelamento).
- ✅ Publicar trabalho: "Como este trabalho será pago?" (Pagamento pela
  Doopla / Este trabalho exige Nota Fiscal / Ainda não sei), com aviso
  específico quando escolhe NF. Nunca bloqueia a publicação — se não tem
  booker, mostra "publique pra Bookers da doopla ou convide o seu".
- ✅ Nova proposta (booker → artista): checkbox "Este trabalho exige Nota
  Fiscal", esconde a seção de forma de pagamento/sinal da Doopla quando
  marcado (não faz sentido coexistir).
- ✅ Oportunidade selecionada por um booker carrega `requires_invoice` pro
  booking criado — sem duplicar o campo, sem re-perguntar.
- ✅ Marcador "NOTA FISCAL NECESSÁRIA · Pagamento direto ao artista · Prazo:
  a confirmar" no card de Descobrir trabalhos, sempre antes do booker
  demonstrar interesse — nunca descoberto depois.
- ✅ Aceite da proposta: quando é NF, soma um segundo checkbox obrigatório
  com o texto exato do pedido ("Estou ciente de que este trabalho exige
  Nota Fiscal..."), registrado em `invoice_terms_accepted_at/_by` junto do
  aceite normal.
- ✅ Booking com NF ganha seção própria: prazo de pagamento (editável pelo
  Booker a qualquer momento — "à vista/15/30/45/60/90 dias/outro"), aviso
  fixo de que a proteção de pagamento da Doopla não cobre esse valor, e
  acompanhamento de 5 etapas (mesmo desenho visual dos Checkpoints já
  existentes). Só o artista marca as etapas (é ele quem emite a NF e
  recebe do cliente) — "Comissão pendente: R$X" aparece assim que ele
  confirma o recebimento, some quando marca a comissão como paga (o que
  também fecha o booking).
- ✅ Fluxo "Marcar como pago" do booker (que assume que a Doopla processou
  o pagamento) desativado pra bookings com NF — substituído por um aviso
  apontando pro acompanhamento de faturamento acima. Doopla nunca simula
  um evento financeiro que não aconteceu de verdade.
- ⏳ Fora de escopo deliberado (documentado em DECISOES.md):
  `requires_invoice` é fixado na criação do booking (proposta ou seleção
  de booker), igual `payment_mode` já era — não editável depois de criado
  nessa v1. "Ainda não sei" fica visível como está, sem fluxo de resolução
  forçada.
- ❌ Não implementado (fora do MVP por definição do próprio pedido):
  emissão de NF, cálculo tributário, cobrança automática da comissão.

---

## LOTE 2 Parte 1 — Artista já agenciado

- ✅ Achado central: "agência" já é só um Booker no produto (schema
  legado `role='agencia'`/`agency_profiles` não é mais usado pelo
  cadastro real) — a maior parte do pedido já estava resolvida por
  construção. Ver DECISOES.md pro detalhe completo.
- ✅ Gap real corrigido: convite pra quem ainda não tinha conta nunca
  virava vínculo se a pessoa se cadastrasse depois de criado o convite
  (só funcionava se o e-mail já existisse no momento do convite).
  Migration 0034 + rota pública `/convite/[token]` + token passado no
  cadastro resolvem isso de vez.
- ✅ Onboarding reduzido pra quem chega via link de convite: só nome
  artístico, nome completo e plano — pula todas as perguntas de
  matching (dá pra completar depois no Perfil).
- ✅ Aceite explícito continua sendo a tela "Convites pendentes" que
  já existia no painel — vínculo nasce automático ao confirmar.
- ✅ Link de convite copiável exposto direto no fluxo "Adicionar um
  Artista" já existente no painel do booker.
- ⏳ Não construído (fora de escopo deliberado): permissões granulares
  por vínculo. Acesso continua binário — tem vínculo, tem acesso
  completo — do jeito que já era antes.

---

## LOTE 1 — Painel do Booker: bugs + revisão de UX

- ✅ Causa raiz do bug "solicitação aceita continua como pendência"
  encontrada e corrigida (ver DECISOES.md) — split real de "Precisa
  da sua atenção" × "Atividade recente".
- ✅ Segundo bug real encontrado no caminho: perfil de agência
  quebrava ao abrir (filtro de role incompleto).
- ✅ "Oportunidades" (booker) renomeado pra "Descobrir trabalhos" no
  menu, título "Trabalhos para você".
- ✅ Descobrir trabalhos virou experiência sequencial: 1 card grande
  por vez, busca discreta, favoritar direto no card, "combina com seu
  perfil" com critério real (categoria/região do cadastro, nunca
  percentual inventado), contador, estado vazio com próximo caminho.
- ✅ "+ Tenho um trabalho" saiu do CTA fixo da sidebar (sem perder a
  função) — agora é "+ Adicionar trabalho" no topo de Meus trabalhos.
- ✅ Sidebar do Booker reestruturada: Início / Bookings (Descobrir
  trabalhos, Meus trabalhos) / Minha rede (Artistas, Favoritos) /
  Financeiro / Conta.
- ✅ Visão Geral do Booker: hierarquia corrigida — Atenção → Trabalhos
  pra você → Seus trabalhos → Seus artistas → Agenda → Atividade
  recente. Booker Oficial nunca mais antes das funções operacionais.
- ✅ Artistas (booker) já tinha as 3 seções pedidas (Meus artistas /
  Descobrir / Favoritos), confirmado sem mudança.
- ✅ Perfil do artista abrindo em modal, erro de abertura corrigido
  junto com o bug de role.

---

## LOTE 3 — Copy e posicionamento do Booker Pro

- ✅ Modal reescrito com "Disponível agora" (gerenciar artistas
  ilimitados — o único recurso Pro que existe de verdade hoje) x "Em
  breve no Pro" (IA, WhatsApp profissional, e-mail @doopla, CRM,
  automações, análises, financeiro avançado) claramente separados —
  nunca apresentando recurso inexistente como disponível.
  Mesmo tratamento no modal público da Home.
- ✅ Card "Faça mais com a doopla" (dashboard) e sidebar já refletiam
  o benefício real; ajustado o texto do card pra citar o limite de 1
  artista explicitamente em vez de linguagem vaga ("automatizar sua
  rotina").
- Sem mudança técnica — só copy/posicionamento, sem risco de dado ou
  financeiro, como o próprio pedido especificou.

---

## Bookers, convites, vínculos e Link de Orçamento — reformulação estrutural

Pedido: separar 4 conceitos que estavam misturados (encontrar, convidar/
solicitar, vínculo criado, roteamento do Link de Orçamento) e nunca deixar
um implicar o outro sozinho.

- ✅ **Solicitação vira bidirecional e atômica.** Artista agora pode
  solicitar um booker já cadastrado (antes só o booker solicitava
  artista). `request_representation_link()` (RPC) decide sozinha, com
  lock, entre criar uma solicitação nova ou colapsar numa pendente que
  a outra parte já tinha aberto — nunca duplica, nunca deixa duas
  pendentes divergentes pro mesmo par.
- ✅ **Detecção automática de conta por contato.** Fluxo único
  "Adicionar um Booker/Artista" (nome + contato): o sistema descobre
  sozinho se já existe conta (decide solicitação × convite) e se já
  existe vínculo/solicitação/convite em aberto (nunca duplica).
- ✅ **Página Bookers/Artistas reorganizada**: Meus Bookers/Artistas ·
  Solicitações e Convites (unificado — recebidas, enviadas, convites
  externos, tudo num lugar só) · Meus Favoritos · Encontrar. O botão
  "Adicionar" substitui o antigo "Convidar" isolado.
- ✅ **Encerrar vínculo — não existia antes, criado do zero.** Botão
  "Encerrar vínculo" em cada card de Meus Bookers/Artistas. Cascata:
  cancela convite direto de oportunidade *pendente* daquele par
  (preserva o que já virou trabalho em andamento), zera o Link de
  Orçamento se apontava pra esse booker (com aviso explícito pro
  artista), libera o slot do Básico se era o artista ativo.
- ✅ **Link de Orçamento: decisão sempre separada.** Aceitar um vínculo
  nunca muda o roteamento sozinho — só oferece um atalho pra configurar
  ("X agora está conectado. Quer que ela receba seus pedidos?").
  Copy vaga que sugeria o contrário foi removida.
- ✅ **Publicar um trabalho: dois checkboxes independentes**
  ("Abrir pra novos bookers" / "Enviar pra meus bookers", pode marcar
  os dois) substituindo o rádio de 3 vias. Selecionar bookers
  específicos agora cria os convites diretos na hora de publicar, não
  só desbloqueia o convite manual depois.
- ⏳ Simplificações assumidas (ver DECISOES.md pra detalhe e motivo):
  não pula o modal de seleção quando só existe 1 booker ativo; "Alterar"
  do Link de Orçamento continua sendo um link pra `/dashboard/perfil`,
  não um modal direto.

---

## Booker Básico/Pro — infraestrutura de plano real

Nada de recurso Pro fake vendido — só o mecanismo, pronto pra plugar
o primeiro recurso de verdade quando existir.

- ✅ **Plano real** (`subscriptions.booker_plan`), gate central
  `hasProAccess()` em `src/lib/subscription.ts` — qualquer recurso
  futuro consulta esse helper, nunca reimplementa a checagem.
- ✅ **Modal único do Pro** (info → confirmar assinatura com
  itemização → sucesso), aberto de qualquer entrada via
  `ProModalProvider`. Copy honesta: "em breve mais recursos", sem
  comparação Básico×Pro fake (não há diferença real ainda pra
  comparar).
- ✅ **3 pontos de upsell**: sidebar ("Booker Básico + Conheça o Pro"
  vira só "BOOKER PRO" com badge quando já é Pro), card no dashboard
  (abaixo de Booker Oficial e Complete suas preferências — nunca acima
  de pendência/booking), e o próprio Perfil (card "Seu plano" com
  cancelar/conhecer o Pro).
- ✅ **1ª diferenciação real: 1 artista ativo no Básico, ilimitado no
  Pro**. Checado antes de criar a representação em 3 pontos de entrada
  (pedido do booker, convite confirmado, artista aceitando pedido) +
  trigger no banco como garantia final. Básico continua 100% igual em
  tudo mais (Trabalhos, Agenda, Oportunidades, Dinheiro) — sem limite
  artificial.
- ✅ **Downgrade Pro→Básico**: cancelar não derruba na hora — continua
  Pro até o fim do ciclo pago (aproximado em 30 dias, sem cobrança real
  ainda). Na expiração, escolhe automaticamente o artista ativo por
  prioridade (booking em andamento > atividade recente > vínculo mais
  recente) e trava operações NOVAS pros demais (bookings já em
  andamento não são afetados — ver `DECISOES.md`). Primeira entrada
  pós-downgrade mostra quem ficou ativo, com opção de trocar uma única
  vez.
- ✅ **Reativação**: assinar o Pro de novo libera todos os artistas na
  hora, sem precisar recriar nada.

⏳ **Voucher pra Booker Básico** não existe — só o artista tem voucher
Founder (preço). Não fazia parte do pedido.

## Preços — Especificação final (artista): Oferta de Lançamento + voucher Founder

Documento novo substitui qualquer orientação anterior de preço do
artista. "Primeiros 50 artistas = R$19,90/mês pra sempre" descartado.

- ✅ **Migration `subscriptions` + `founder_vouchers`**: assinatura real
  por perfil (`status`, `price_rule`, `locked_price_cents`,
  `trial_ends_at`). Sem processador de pagamento integrado ainda (nem
  Stripe, nada) — "confirmar assinatura" é estado real gravado no
  banco, sem cobrar cartão de verdade, mesmo estágio do resto do
  produto hoje. `handle_new_user()` cria a assinatura automaticamente
  no cadastro: `standard_launch` por padrão, ou `founder_locked` se um
  código de voucher válido (e ainda não redimido) vier no formulário —
  validado e reivindicado na própria transação do cadastro.
  `founder_vouchers` são gerados manualmente por você, direto no
  Supabase (sem tela de admin por enquanto — combinado assim):
  ```sql
  insert into founder_vouchers (code, note) values ('FOUNDER-XXXX', 'pra quem/contexto');
  ```
- ✅ **Cadastro do artista**: tela final não fala mais em "Preço
  Fundador". Mostra "Oferta de lançamento", R$39,90/mês riscado,
  R$19,90 no 1º mês, 7 dias grátis, e a itemização completa (plano,
  período grátis, valor do 1º mês, valor recorrente, periodicidade,
  quando começa a cobrar, cancelamento) antes do botão. Campo opcional
  "Tenho um código de voucher Founder" — nunca em destaque, só um link
  discreto pra quem já tem o código.
- ✅ **Home + FAQ**: bola do artista virou "Oferta de lançamento" (sem
  "Preço Fundador", sem "Sem comissão"/"Sem exclusividade" embaixo —
  isso já está nas seções explicativas). Botão redundante da esquerda
  removido; CTA único "Começar grátis". Seção de planos no rodapé da
  Home e a pergunta de preço no FAQ também corrigidas pra R$19,90 no
  1º mês / R$39,90 a partir do 2º.
- ✅ CTAs de artista na Home agora usam `/cadastro?tipo=artista`
  (`tipo` aceito como alias de `role` em `/cadastro`, sem quebrar links
  existentes que ainda usam `role=`).

Próximo: infraestrutura de plano do Booker (Básico/Pro) — enum real,
`hasProAccess`, modal de upgrade honesto (sem vender recurso que não
existe), limite de 1 artista ativo no Básico com regra de downgrade.

---

## Prioridade 6 — Reorganizar nomenclatura do painel do artista

- ✅ Sidebar do artista: "Oportunidades" virou "Pedidos e trabalhos" —
  a página de destino (`/dashboard/oportunidades`) já estava dividida em
  "Pedidos recebidos" (via link de orçamento) e "O que você publicou"
  de um trabalho anterior; só o rótulo da sidebar ainda não batia.
  Booker mantém "Oportunidades" (faz sentido do lado dele — mural de
  trabalhos em aberto pra pegar).
- ✅ Botão "+ Preciso de ajuda" virou "+ Publicar um trabalho" — deixou
  de ser um menu genérico com 5 atalhos (redundantes com a sidebar) e
  virou uma ação direta pro fluxo de publicar trabalho, com a explicação
  "Encontre um booker pra negociar, cobrar, fechar contrato ou ajudar
  você neste trabalho" já na tela de destino.

Com isso a Prioridade 6 está fechada.

## Prioridade 7 — Agenda editável (artista e booker)

Antes só existia "marcar disponibilidade" (1 dia, sem tipo, só o
próprio artista). Virou um calendário operacional de verdade:

- ✅ **Migration `agenda_entries`**: substitui `artist_availability`
  (que fica no banco sem uso, não foi apagada). Cada marcação tem tipo
  (Disponível/Indisponível/Viagem/Outro), período (data início + fim,
  não só um dia), nota livre, e quem criou. RLS: o próprio artista ou
  um booker com `representations` ativa pro artista — nos dois casos dá
  pra criar, ver e remover.
- ✅ **Agenda do artista**: formulário completo (tipo, de/até, nota) no
  lugar do antigo "+ Marcar disponibilidade" de 1 campo. Qualquer
  marcação manual pode ser removida (não só disponibilidade). Bookings
  confirmados continuam entrando automaticamente, sem mudança.
- ✅ **Agenda do booker**: nova seção "Agenda dos seus artistas" — o
  booker escolhe um artista que representa (chips com os nomes) e marca
  disponibilidade/indisponibilidade/viagem/outro na agenda dele, com a
  mesma UI. Ver `DECISOES.md` (18/08/2026) pro porquê disso ser só as
  marcações manuais, não o calendário de bookings inteiro do artista.
- ✅ Todo evento confirmado (artista e booker) já era clicável e levava
  pro booking, que já tem remarcação embutida — conferido, não precisou
  de mudança.

Com isso a Prioridade 7 está fechada. Próxima: Prioridade 8 (Home
diferenciada Sou Artista/Sou Booker — já em boa parte coberta pelas
revisões de Home já feitas, falta fechar formalmente).

## 0.8. Preferências de matching: perfil deixa de ser formulário aberto

Pedido: os campos de matching (especialidades, nichos, área de atuação,
idiomas, disponibilidade, comissão etc.) continuam existindo e
alimentando busca/recomendação — só não podiam mais ficar sempre
abertos como parede de chips, pesando o perfil e expondo a estrutura
interna do matching.

- ✅ **Perfil (booker e artista)**: a seção de matching virou um resumo
  compacto ("Especialidades: Negociação · Comercial · +2", etc.,
  formato do documento) + botão "Editar preferências". Editar abre um
  modal com os mesmos campos de sempre, organizados em blocos
  (preferências comerciais isoladas num bloco próprio); fechar sem
  salvar não perde o rascunho porque os campos continuam montados (só
  escondidos), e salvar fecha o modal sozinho. Nenhum campo novo, nenhum
  dado duplicado — é só apresentação, mesmo formulário e mesma
  `updateBookerProfileAction`/`updateArtistProfileAction` de antes.
  Regra de campo vazio mantida: só aparece no resumo o que já foi
  respondido.
- ✅ **Área de atuação com localidades concretas**: "Minha cidade"/"Meu
  estado" abstratos saíram do REGION_OPTIONS. No lugar, a pergunta de
  área de atuação agora abre com a localidade real que a pessoa já
  informou (artista responde isso em "Em qual cidade e estado você está
  baseado?" antes da pergunta de regiões; booker ganhou a mesma
  pergunta, reaproveitando a coluna `cidades` que já existia no schema e
  não estava sendo perguntada em lugar nenhum). Sem migration — mesma
  coluna `regions`, só troca o que populamos como opção. Perfil usa o
  mesmo valor salvo (`local`/`cidades`) pra montar a mesma lista ao
  editar depois.
- ✅ **Cadastro: essencial vs. complementar**: perguntas complementares
  (as mesmas puladas do resumo — regiões além da cidade base, estágio de
  carreira, faixa de cachê, ajuda necessária pro artista; nichos de
  oportunidade, especialidades, área de atuação, idiomas, capacidade,
  faixa de cachê e comissão pro booker) agora podem ser puladas no
  cadastro ("Pular por agora", com aviso "Opcional — dá pra responder
  depois no seu perfil"), sem travar o fim do cadastro. Essencial
  continua obrigatório (nome, categoria, bio, localização, tipos de
  trabalho/nichos principais).
- ✅ **Card "Complete suas preferências"** no Dashboard (artista e
  booker): mostra "X de Y informações preenchidas" + barra de progresso,
  contando só os campos complementares acima; some sozinho quando tudo
  já foi preenchido. Botão "Completar" leva direto pro bloco de
  preferências em Perfil (`#preferencias-matching`).

Com isso o bloco 0.8 (preferências de matching) está fechado —
cadastro, perfil e painel usam a mesma fonte de dado, sem campo
duplicado.

## 0.7. Favoritar bookers/artistas (mútuo, separado de "já trabalhei com")

- 🔒 **Migration 0029 (`favorites`)**: escrita, falta você rodar no
  Supabase SQL Editor. Tabela própria (`user_id`, `favorited_user_id`,
  `created_at`), RLS só-dono, sem nenhuma relação com `representations`
  ou bookings — favoritar é só uma lista salva.
- ✅ **Coração nos cards**: em Meus bookers/artistas, Descubra e Meus
  favoritos (BookerRow/ArtistRow), clicável sem abrir o perfil (estado
  otimista, persistido via `toggleFavoriteAction`).
- ✅ **Coração no modal de perfil**: ao lado do nome, no topo do card de
  identidade — mesmo componente (`FavoriteButton`), estado inicial
  resolvido no servidor.
- ✅ **"Meus favoritos"**: seção própria em `/dashboard/bookers`
  (artista) e `/dashboard/artistas` (booker), com dados só de
  `favorites` — nunca misturado com quem você já trabalhou.

## 0.6. Home artista (badge de preço) + link de orçamento no Dashboard

- ✅ **Home, jornada do artista**: card do booker no topo trocado por um
  selo circular de preço (R$19,90/mês em destaque, "Preço Fundador", "7
  dias grátis", "sem comissão sobre o cachê", "sem exclusividade", CTA
  "Começar grátis"). Seção completa de planos no rodapé da Home
  permanece igual. Card "Traga seu booker para a doopla" (elemento
  diferente) mantido sem alteração.
- ✅ **Dashboard do artista: "Seu link de orçamento"**: novo card visível
  direto no painel principal (não mais só dentro de Perfil), logo depois
  de "Seus trabalhos" e antes do módulo Booker Oficial — segue a
  hierarquia pedida (atenção → trabalhos em andamento → link de
  orçamento → resto). Mostra o link, Copiar link (com feedback "Link
  copiado!"), Compartilhar (Web Share API com fallback pra copiar) e Ver
  como cliente. Mostra também pra quem as oportunidades estão sendo
  direcionadas (você / seu booker / os dois), com "Alterar" levando pro
  card de roteamento em Perfil (que já existe e continua sendo o único
  lugar de configuração — o card do Dashboard é só uso do dia a dia).
  Quando o link ainda não está ativo, mostra "Ativar meu link" em vez de
  inventar um link vazio. Nenhuma métrica de "N pedidos via link" foi
  inventada — não existe esse dado ainda.

## 0.5. Perfis como modal + avaliação como modal + comissão praticada

- ✅ **Faixa de comissão praticada (booker)**: migration 0028 adiciona
  `booker_profiles.commission_range` — campo indicativo, informado pelo
  próprio booker (nunca calculado a partir de bookings passados), nunca
  trava a comissão de nenhum booking específico. Coletado no cadastro
  (pergunta nova, logo depois da faixa de cachê) e editável no Perfil.
- ✅ **Perfil de artista e booker como modal**: `/dashboard/bookers/[id]`
  e `/dashboard/artistas/[id]` continuam existindo como páginas completas
  (fallback pra navegação direta/refresh — preserva o link
  compartilhável, que o próprio documento final deixou em aberto), mas
  agora, quando abertos a partir de uma lista dentro do painel (Descubra,
  Meus Bookers/Artistas, solicitações), abrem como janela por cima da
  lista — usando parallel/intercepting routes do Next.js
  (`dashboard/@modal/(.)bookers/[id]`, `.../(.)artistas/[id]`), sem
  precisar tocar em cada link individualmente (a interceptação funciona
  pra qualquer `<Link>` client-side existente). Conteúdo extraído em
  componentes compartilhados (`booker-profile-view.tsx`,
  `artist-profile-view.tsx`) reaproveitados pela página cheia e pelo
  modal — mesma fonte, dois contextos. Todo campo (bio, mercados, redes
  sociais, comissão) só aparece se estiver preenchido, como pedido.
- ✅ **Avaliação bilateral como modal a partir de Trabalhos concluídos**:
  nova rota `/dashboard/bookings/[id]/avaliar`, interceptada como modal
  quando aberta a partir de qualquer lista dentro do painel (inclusive
  `/dashboard/trabalhos`, que já tinha o filtro "Concluída" — não
  precisou virar uma tela nova). Cada trabalho concluído com avaliação
  pendente agora mostra um botão "Avaliar" direto na lista. Reaproveita
  100% da lógica de avaliação que já existia (`ReviewPanel`, rating,
  tags, comentário, janela de edição de 24h) — só mudou onde é acionada.
  O painel de avaliação embutido no detalhe do booking continua
  funcionando também, sem duplicar regra de negócio.
- ✅ **Tags de avaliação finais**: substituídas pelas 6 de cada lado do
  documento de perfis/avaliações, sem limite artificial de seleção.
- ⏳ **Selos "Identidade verificada" e "Booker Doopla Oficial"**:
  deliberadamente NÃO aparecem ainda nos modais de perfil — não existe
  nenhum critério real de verificação de identidade no banco, e os
  critérios de Booker Oficial têm itens permanentemente falsos hoje.
  Os componentes já têm o espaço reservado (comentário no código) pra
  quando existir um dado real — não precisa de mais trabalho de UI
  depois, só plugar o valor.

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

## 11. Home pública — pivot pra Doopla AI-first (`src/app/_home`)

- ✅ Home reconstruída em cima do HTML aprovado `doopla-home-ai-first`
  (hero cinematográfico com os dois olhos encolhendo até o wordmark,
  olhos seguindo o cursor, paleta e tipografia próprias do
  posicionamento novo). Depois reestruturada e reduzida de 15 pra 8
  seções por diretriz explícita (vender a ideia primeiro, não exigir
  que o usuário "estude" a Doopla antes de confiar): Hero → O que sua
  Doopla faz (com a demonstração de conversa incorporada, não mais
  seção própria) → Feita com quem entende de booking (substitui "Não é
  IA genérica" + dobra a menção de representante humano) → Como
  funciona (3 passos, controle/autonomia dobrado numa frase) → Planos →
  Segurança (checklist enxuto) → FAQ (6 objeções de conversão) → CTA
  final + rodapé. Removidas de vez (não é reorganização com nome novo):
  Dor, a interação "Você × Sua Doopla" (JS/CSS junto), Ciclo do
  booking, Para quem, os 3 blocos de autonomia, e os nomes internos
  (Doopla Core/Playbook/Minha Doopla).
- ✅ GSAP/ScrollTrigger (motor da timeline do hero) servidos de
  `public/vendor/gsap` em vez de CDN externo — o próprio sandbox de
  build bloqueou `cdnjs.cloudflare.com` por política de rede durante o
  teste, então não faz sentido depender de terceiro fora do controle
  da doopla em produção.
- 🔜 **Pendência obrigatória da próxima etapa**: `/login`, `/sobre`,
  `/cadastro`, `/seguranca` e demais páginas públicas ainda refletem o
  modelo antigo de marketplace (bookers, matching, comissão). Por isso
  os links da Home pra essas páginas (nav "Sobre"/"Entrar", footer
  "Termos"/"Privacidade"/"Segurança"/"Pagamentos e
  cancelamentos"/"Contato/Suporte", CTAs "Começar agora") continuam
  como `#` de propósito — não apontar pra telas que ainda contradizem o
  que a Home promete agora. Quando essas páginas forem revisadas pro
  posicionamento AI-first, trocar os `#` pelos destinos reais. A Home
  nova é a fonte de verdade de posicionamento pra essa revisão, não o
  conteúdo antigo dessas páginas.
- 🔜 Mesma pendência acima **também cobre** o rodapé: o da Home já usa
  a logo real (`.foot-logo` com os olhos, clonado via JS do hero), mas
  `legal-page.tsx` (usado por `/sobre`, `/termos`, `/privacidade`) só
  tem "doopla" em texto puro sem logo nem rodapé de verdade, e
  `dashboard-footer.tsx` também é só texto e ainda diz "Plataforma de
  representação para artistas independentes" (copy do modelo antigo).
  Corrigir junto quando essas páginas forem revisadas.

## 12. Home — duas correções de diretriz (humano/booker 1.0 + Home geral)

- ✅ **Humano/Booker não é feature comercial do 1.0.** Removido da Home
  tudo que tratava intervenção humana como unidade comercial fixa:
  "Atendimento humano avulso: R$49" (plano Doopla), "1 atendimento
  humano incluído/mês" (Doopla Pro), o card "Precisa de uma pessoa de
  verdade?" em "Feita com quem entende de booking", e a pergunta
  "Existe atendimento humano?" do FAQ. A Doopla 1.0 é IA-first: a
  hipótese a testar é se ela sozinha consegue conduzir o booking de
  ponta a ponta. Humano vira backup operacional/aprendizado de beta,
  não produto vendido — por isso não aparece mais na Home. Bookers
  continuam existindo no ecossistema (não foram removidos como
  conceito), só não são mais assumidos como destino automático de todo
  booking.
- ✅ **Home geral corrigida** (não é Home exclusiva de artista): hero
  trocado pra "Toda carreira merece sua Doopla." (headline em
  destaque/uppercase visual, `.hero-copy h1` novo) + subtexto "Um novo
  jeito de cuidar dos seus bookings, sem precisar cuidar de tudo
  sozinho. Do primeiro contato ao contrato fechado, tudo em um só
  lugar.". Seção "O que sua Doopla faz" reescrita como "Tem booking pra
  resolver? Manda pra Doopla." — abre com situações reais (precisa
  negociar? cliente pediu desconto? etc.), repete "Manda pra Doopla."
  como frase de marca, e troca os 6 cards por verbo por 7 cards por
  situação (Negociação, Respostas e propostas, Follow up, Organização,
  Contratos, Cobranças, Representação — este último reintroduz, de
  forma leve, a ideia de conectar pessoas pra representação, sem
  reconstruir o "quem é você"/matching do modelo antigo). Demonstração
  de conversa continua incorporada na mesma seção, inalterada. Não
  criada nenhuma comunicação que diminua agências — o texto não fala
  de agências ainda, mantém a diretriz como guardrail pra copy futura.

## 13. Referral "Indique e ganhe R$5" — chip global no header do painel

- ✅ Saiu do card grande no meio do dashboard (`referral-card.tsx`,
  removido) e virou um chip compacto no header, dentro do
  `DashboardLayout` (`src/app/dashboard/layout.tsx`) — aparece em
  qualquer rota de `/dashboard/*` de uma vez só, sem duplicar
  componente por tela. Mesmo critério de elegibilidade de antes: só
  artista com `referral_code` (bookers nunca tiveram esse programa).
  Clique abre modal (`ReferralModal` + `ReferralModalContext`, mesmo
  padrão arquitetural do `BookerProModal`/`ProModalContext` já
  existente) com link de indicação, copiar/compartilhar (Web Share API
  com fallback silencioso pra quem não suporta), quanto já foi ganho, e
  a regra de liberação **exatamente como fechada em DECISOES.md**: o
  bônus só libera quando a pessoa indicada vira cliente pagante, sem
  inventar prazo, saldo ou condição que ainda não existe no backend
  (`qualifiedTotalCents` continua sempre 0 até o sistema de assinatura
  real existir).
- ✅ Não foi pra Home pública, não criou banner/pop-up, não mudou
  nenhuma regra financeira do programa — só o posicionamento/UX.
- ⚠️ Não verificado visualmente num navegador: rota de `/dashboard` só
  renderiza com sessão Supabase real autenticada, que não existe neste
  ambiente sandbox. Validado por build de produção limpo, ESLint limpo
  e checagem manual de tipos/fluxo de dados linha a linha — mas vale
  uma conferência visual real antes de confiar 100%.

## 14. Home — bug crítico de tela em branco + segunda passada de limpeza

- ✅ **Bug real, reportado em produção**: depois de rolar a página, uma
  tela inteira aparecia em branco. Causa raiz: `#home-marketing` tinha
  `overflow-x:hidden` — e por regra do próprio CSS, declarar só
  overflow-x != visible faz o overflow-y computar pra `auto`
  implicitamente, o que transforma o elemento num novo container de
  scroll. Isso quebra a cadeia de `position:sticky` do `.stage-pin`
  (o pin do hero), que soltava bem antes da hora, revelando a seção
  seguinte com a animação de entrada travada pela metade. Corrigido
  movendo `overflow-x:hidden` pro `body` (global, sem risco) — body/
  html têm uma exceção no spec que propaga o overflow pro viewport em
  vez de criar esse container. Removido também `scroll-behavior:smooth`
  do html (documentadamente incompatível com o cálculo de posição do
  GSAP ScrollTrigger). Verificado com scroll gradual real via Playwright
  pixel a pixel: sem gap em nenhum lugar da página.
- ✅ **"O que sua Doopla faz" simplificado outra vez**: removida a
  grade de 7 cards (Negociação/Respostas e propostas/Follow up/
  Organização/Contratos/Cobranças/**Representação** — este último
  removido também por reintroduzir de leve o resquício do modelo
  antigo). A demonstração de conversa vira o elemento visual principal
  da seção (não mais um apêndice depois dos cards), com copy nova que
  mostra a Doopla coletando informação faltante antes de negociar
  (capacidade que a demo antiga não mostrava).
- ✅ **FAQ**: estava com `max-width` e `margin:auto` na própria
  `<section>` (sem wrapper), criando um retângulo branco estreito
  centralizado com margens bege dos dois lados — quebrava o grid do
  resto do site. Corrigido: a seção agora é full-width (como todas as
  outras), com o conteúdo dentro de um `<div class="narrow">`.
- ✅ **CTA final**: reduzido de `padding:100px` + h2 `clamp(32px,6vw,
  64px)` (quase uma segunda hero section) pra `padding:56px` + h2 do
  mesmo tamanho-padrão usado pelos outros headlines de seção.
- ✅ **Footer**: 5 links (Termos/Privacidade/Segurança/Pagamentos e
  cancelamentos/Contato-Suporte) reduzidos pra 4, com nomenclatura mais
  direta (Segurança/Termos/Privacidade/Contato), tratamento mono/
  uppercase igual ao resto do design system, logo um pouco maior — pra
  não parecer uma barra utilitária esquecida. Destinos continuam `#`
  de propósito (mesma pendência de sempre: páginas internas ainda não
  revisadas pro posicionamento novo).
- ✅ Varredura completa por resquício do modelo antigo (booker como
  necessidade, comissão, split, repasse, intervenção humana, níveis de
  autonomia antigos, marketplace, pagamento processado pela doopla):
  único hit foi o texto já aprovado da Segurança, que nega
  explicitamente essas coisas ("sem split, sem comissão de booker...").
  Nada mais encontrado.

## 15. Home — correção consolidada final (remove conversa fictícia + blinda fallback do GSAP)

- ✅ **"Sua Doopla em ação" removida por completo.** Instrução anterior
  pedia pra manter uma demonstração de conversa; documento consolidado
  reverteu isso explicitamente ("DESCONSIDERAR ESSA INSTRUÇÃO... NÃO
  TER CONVERSA FICTÍCIA NA HOME"). Removido título, as 6 bolhas
  (cliente/doopla/você), wrapper e o CSS associado (`.chat`,
  `.chat-row`, `.chat-who`, `.bubble`, `.chat-eyebrow`) — nenhum
  espaço residual, a seção "O que sua Doopla faz" agora termina em
  "Manda pra Doopla." direto.
- ✅ **Segurança**: removida a menção literal a "split" e "comissão de
  booker" (mesmo em negação) — item novo do documento consolidado que
  pede eliminar esses termos mesmo quando usados pra negar. Reescrito
  preservando o mesmo fato ("a Doopla nunca processa nem retém esse
  valor") sem invocar o vocabulário do modelo antigo.
- ✅ Limpeza de CSS morta: `.cuida-grid` no media query (código órfão
  desde a remoção dos cards, ninguém tinha limpado essa referência).
- ✅ **Fallback de robustez pro GSAP** (achado durante a investigação,
  não pedido explicitamente, mas endereça um risco real): todo o
  conteúdo do hero (wordmark, nav, kicker, hero-copy/CTA) nasce com
  `opacity:0` no CSS e só fica visível através da timeline do GSAP. Se
  `/vendor/gsap/*.js` falhar em carregar por qualquer motivo (rede do
  usuário, bloqueio, etc.), esse conteúdo ficava invisível pra sempre.
  Agora `home.js` roda um watcher independente do `boot()`: se o GSAP
  não carregar em 4s, aplica a classe `gsap-fallback` em
  `#home-marketing`, que força esse conteúdo visível numa versão
  estática (sem a entrada cinematográfica, mas nunca em branco).
  Testado de propósito bloqueando as requisições do GSAP via
  Playwright: fallback ativa corretamente, conteúdo aparece.
- 🔜 **Pendente, aguardando decisão do usuário**: pedido separado pra
  restaurar a animação de pulo dos olhos ("Você × Sua Doopla", removida
  na passada de 15→8 seções) dentro de "O que sua Doopla faz", com
  hover-retrigger novo (não existia no mecanismo original). Não
  implementado ainda — o documento consolidado final (mesma mensagem,
  tratado como fonte de verdade) não lista esse elemento na estrutura
  de 9 seções e pede reduzir ao máximo essa seção especificamente,
  então esperando confirmação de encaixe antes de construir.

## 16. Interação "Você × Sua Doopla" — restaurada como seção própria compacta

- ✅ Usuário escolheu (pergunta feita via AskUserQuestion): seção
  própria e compacta entre "O que sua Doopla faz" e "Feita com quem
  entende de booking" — não dentro da primeira, não como uma segunda
  hero. Padding reduzido de 100px pra 64px, olhos de 150px pra 120px
  (90px no mobile), gap do `.eyes-stage` ajustado pra ficar mais perto
  da mesma proporção olho/distância dos olhos do logo grande do hero.
- ✅ Mecânica original restaurada (posição sempre absoluta, nunca
  incremento relativo — a mesma trava anti-deriva de sempre): entrada
  com pulos largos convergindo pro distanciamento fixo, depois loop
  contínuo de pulinhos no lugar com pausa de 0.7s entre repetições.
  Verificado programaticamente via Playwright: a posição X das duas
  colunas fica em exatamente 0 em 8 amostras ao longo de 4s de loop —
  zero deriva confirmada, não só por inspeção visual.
- ✅ **Novo**: hover no bloco dos olhos cancela qualquer timeline ativa
  e a pausa pendente, e dispara o pulo de entrada de novo na hora —
  funciona mesmo com o loop automático no meio da pausa. Testado
  disparando um hover programático e capturando o frame: confirma o
  pulo em andamento (squash-and-stretch visível nos dois olhos).

## 17. CTAs e nav apontando pro cadastro/login de verdade

- ✅ Os dois botões "Começar agora" (hero e CTA final) apontam pra
  `/cadastro` — antes eram `href="#"`.
- ✅ Adicionado "Criar conta" na nav, ao lado de "Entrar" (que já
  apontava pro `/login`), como botão preto sólido (`.btn.btn-primary`
  com modificador `.nav-cta` pra caber no tamanho da barra). Testado
  via Playwright nos dois estados da nav (sobre o hero vermelho e
  depois de rolar, com fundo claro) — botão aparece sólido e legível
  nos dois.
- ✅ Verificado com Playwright: `getAttribute('href')` dos três links
  confirma `/cadastro` (hero), `/cadastro` (CTA final) e presença do
  novo link "Criar conta" na nav.
- Não mexi em nenhuma página interna (`/login`, `/cadastro`, etc) além
  de apontar os links pra elas — só a Home foi alterada, como
  combinado.

## 18. Hero em preto (não branco) + unificação "Tem booking pra resolver?" + marquee + FAQ nova

- ✅ **Texto do hero de branco/creme pra preto**: kicker, wordmark (letras
  "d"/"pla"), h1, parágrafo, edge-labels, index-count, scroll-hint e o
  selo (seal SVG) — tudo passou de `var(--off)`/creme pra preto
  (`var(--black)`). Motivo apontado: vermelho + texto branco lembrava a
  paleta do iFood. A nav também passou a usar o estado "on-light" (texto
  preto) enquanto está sobre o hero (`data-navlight` de "0" pra "1" na
  `.stage`), pra não sobrar nenhum texto branco na primeira tela. Os
  círculos do logo (olho preto + pupila creme) não são "texto", são o
  ícone da marca — não mudaram, é o mesmo mark usado em todo o site.
- ✅ **Seção "Tem booking pra resolver?" unificada com a interação dos
  olhos**: as duas seções separadas (`.cuida` preta com a lista de
  perguntas, e `.eyes-section` vermelha com "Você e sua Doopla, em
  sintonia.") viraram uma seção só (`.manda`), vermelha, duas colunas:
  headline "Tem booking / pra / resolver?" + lista de 6 perguntas com
  ícone circular outline (mesmos ícones Lucide do mockup aprovado) à
  esquerda, olhos grandes + kicker "Representação, não automação" à
  direita. Removido o texto "Manda pra Doopla." (ficava implícito).
  Tudo em preto sobre vermelho, sem nenhuma cor nova inventada — reusa
  a paleta já existente.
- ✅ **Motion dos olhos reaproveitado, não recriado — duas vezes**: extraí
  a coreografia (pulo com squash-and-stretch, sombra, olhar, blink) pra
  uma função genérica (`makeEyesMotion`), com o alcance dos movimentos
  calculado a partir do tamanho real de cada par de olhos (não
  hardcoded) em vez de duplicar números fixos. Ela agora roda em **dois
  lugares com o mesmo código**: nos olhos grandes do hero (que antes só
  seguiam o cursor e ganhavam vida ao carregar a página, sem depender
  de scroll) e na seção "Tem booking pra resolver?" (dispara quando a
  seção entra na tela, como antes). Os olhos pequenos clonados
  (wordmark, nav, rodapé) continuam com o comportamento antigo de
  seguir o cursor — não foram tocados.
- ✅ **Barra corrida (marquee) fixa debaixo da nav**: fundo preto, texto
  creme mono, "Artistas independentes • Representação • Toda carreira
  merece sua Doopla" em loop infinito via CSS puro (não depende do
  GSAP carregar — funciona mesmo no fallback). Nav e marquee agora
  vivem dentro de um wrapper (`.nav-wrap`) fixo no topo; a marquee fica
  sempre visível desde o carregamento da página, a nav em si continua
  com a mesma entrada cinematográfica de antes.
- ✅ **FAQ**: adicionada a pergunta "A Doopla fala com o cliente por
  mim?" logo após a primeira, respondida ("Sim. Ela conduz a conversa,
  negocia, faz follow-up e organiza o booking. Quando houver uma
  decisão comercial importante, ela consulta você antes de seguir.").
- ✅ Footer: reconferido de novo (terceira vez) — `#footSlotL`/`#footSlotR`
  continuam recebendo o clone real do olho (`<div class="eye">` com
  `<div class="pupil">` dentro, com `transform` aplicado pelo
  rastreamento de cursor), não texto estático. Nenhuma mudança foi
  necessária aqui.
- ✅ `npm run build` e `npx eslint src/app/_home` limpos. Testado com
  Playwright local (build de produção): screenshot do hero mostrando
  os olhos já pulando ao carregar a página (sem depender de scroll),
  screenshot da seção unificada mostrando layout de duas colunas com
  os 6 ícones certos e os olhos em pleno pulo, cores confirmadas via
  `getComputedStyle` (preto em toda a primeira tela e na seção
  unificada), marquee confirmado no DOM, footer reconferido.

## 19. Correções de nav/marquee reportadas pelo usuário + logo dentro da frase da CTA final

- ✅ **Nav com fundo "rosa desbotado"**: bug real desta sessão — ao marcar
  o hero e a seção "Tem booking" como `data-navlight="1"` (pra deixar o
  texto deles preto), a nav passou a usar o estado "on-light" (fundo
  branco/creme só 78% opaco) por cima do vermelho, e a mistura virava um
  rosa lavado, não o vermelho sólido da marca. Troquei o sistema inteiro
  de "vidro translúcido" por fundo **sólido**: cada seção agora declara
  `data-nav="red|black|cream|redcream"` com a combinação exata de
  cor+texto que ela usa (vermelho+preto no hero/"Tem booking", preto+creme
  em Como funciona/Segurança, creme+preto em Feita/Planos/FAQ,
  vermelho+creme na CTA final), e a nav pega literalmente essa cor —
  nunca mistura opacidade com o que está atrás. Confirmado com Playwright
  rolando a página inteira e conferindo a classe/cor da nav em cada seção.
- ✅ **Barra corrida "flutuando" na primeira tela**: primeiro ajuste foi
  sincronizar a entrada da marquee com a da nav (mesmo timing do GSAP).
  Depois o usuário esclareceu o pedido real: a marquee é **exclusiva da
  tela do hero** — não pode ficar fixa acompanhando o scroll pelo resto
  da página (a nav continua fixa e trocando de cor normalmente, isso não
  mudou). Implementado com um ScrollTrigger próprio: `onLeave` do hero
  esconde a marquee (fade), `onEnterBack` (voltando pra cima) traz ela de
  volta. Testado: marquee visível durante o hero, some ao passar pra
  "Feita"/"Tem booking" em diante, nav permanece visível o tempo todo.
- ✅ **"Doopla" com o logo dentro da frase da CTA final**: na seção "Toda
  carreira merece sua Doopla." (a que fica logo acima do rodapé de
  links, não o rodapé em si), os dois "o" de Doopla agora são os olhos
  animados de verdade (mesmo componente clonado do nav/rodapé/wordmark —
  segue o cursor, vaga sozinho, pisca), mantendo a fonte Anton do resto
  da frase. Bug pego e corrigido no processo: a palavra quebrava no meio
  entre os dois olhos ao virar linha (um olho ficava numa linha, o outro
  na de baixo) — corrigido envolvendo "d + olhos + pla" num
  `white-space:nowrap` pra nunca quebrar ali.
- ✅ CTA da nav renomeado de "Criar conta" pra "Começar agora" (mesmo link
  pro `/cadastro`) — padronização de copy pedida pelo usuário: "Começar
  agora" é o CTA de aquisição em todo o site, "Criar conta" fica restrito
  ao fluxo de cadastro em si.
- ✅ `npm run build`/`npx eslint` limpos. Tudo verificado com Playwright
  local (build de produção): scroll completo da página conferindo classe
  da nav seção a seção, opacidade da marquee em cada trecho, screenshot
  da frase da CTA final com os olhos alinhados na mesma linha.
- ⏳ **Pendência grande, ainda não iniciada**: o pedido de reconstruir
  Header (overlay de MENU fullscreen) + páginas institucionais completas
  (`/sobre`, `/seguranca`, `/contato` nova, `/termos`, `/privacidade`) +
  padronizar CTA "Começar agora" nessas páginas também. Ficou de fora
  desta sessão por limite de orçamento/sessão — precisa de uma sessão
  nova dedicada a isso.

## 20. Páginas institucionais (Sobre, Segurança, Contato, Termos, Privacidade) + Header/Footer compartilhados + ajustes de copy na Home

- ✅ **Header + Footer + overlay de MENU compartilhados**, novos, escopados
  em `src/app/_home/` (`SiteHeader.tsx`, `SiteFooter.tsx`, `PageShell.tsx`,
  `EyeLogo.tsx`, `site-chrome.css`) — usados pelas 5 páginas institucionais
  abaixo. Mesma identidade visual da Home (vermelho/preto/creme, Anton/
  Familjen Grotesk/IBM Plex Mono), mas implementado em React puro (sem
  GSAP), separado do sistema vanilla-JS da Home por decisão de escopo:
  não mexi na Home's própria nav pra não arriscar quebrar a timeline
  cinematográfica já testada — só corrigi os placeholders de link dela.
  MENU abre um overlay fullscreen (não dropdown) com: Como funciona, O que
  sua Doopla faz, Planos, Segurança, FAQ, Sobre — sem "Entrar" (removido
  por correção do usuário) — mais CTA "Começar agora" e "Quero minha
  Doopla" como legenda de apoio (não label de botão). Fecha com Esc, trava
  scroll do body enquanto aberto.
- ✅ **`/sobre`**: reescrita do zero (era conteúdo do modelo antigo de
  marketplace) — Hero + composição única com os 3 conceitos
  (Representação / Com você no controle / Independência) + CTA final,
  sem virar uma página longa.
- ✅ **`/seguranca`**: reescrita do zero — Hero + 3 princípios (Você
  aprova / Você acompanha / Seus dados são protegidos, com link discreto
  pra Política de Privacidade) + seção final com "Falar com a Doopla"
  (→ `/contato`) e link pra Política de Privacidade.
- ✅ **`/contato`**: página nova — Hero + e-mail (`contato@doopla.pro`) e
  formulário (nome/e-mail/assunto/mensagem) lado a lado no desktop,
  empilhado no mobile. Sem backend de envio (não existe ainda) — o botão
  "Enviar mensagem" abre um `mailto:` pré-preenchido pro
  contato@doopla.pro, não finge enviar algo que não seria realmente
  entregue.
- ✅ **`/termos` e `/privacidade`**: reescritas com o texto legal completo
  fornecido, layout editorial (largura de leitura confeitável, hierarquia
  tipográfica), mesmos Header/Footer das outras. Bug pego e corrigido:
  as listas com marcador (`<ul>`) da Política de Privacidade não
  mostravam os bullets (herdavam `list-style:none` de algum reset
  global) — corrigido com `list-style:disc` explícito no escopo de
  `.legal-content`.
- ✅ Footer da Home: os 4 links (Segurança/Termos/Privacidade/Contato),
  antes `href="#"`, agora apontam pras páginas reais. Nav da Home:
  "Sobre" também corrigido de `#` pra `/sobre`.
- ✅ Ajustes de copy na Home pedidos nesta sessão: kicker do hero mudou
  pra "Mais que automação. Representação."; seção "O que sua Doopla faz"
  ganhou novo headline ("Você faz seu trabalho. Sua Doopla cuida do
  booking.") e nota abaixo das perguntas ("Sua Doopla resolve."); "Como
  funciona" mudou pra "Tem booking? Tem Doopla."; a seção final antes do
  footer voltou a ter texto preto (era branco, o usuário apontou o
  erro); "Toda carreira merece sua Doopla" perdeu o ponto final em todo
  lugar que aparece como título; CTA da nav voltou de "Começar agora"
  pra "Criar conta" (reversão explícita do usuário — só na nav da Home,
  as páginas institucionais continuam com "Começar agora" no header,
  que foi o padrão pedido antes dessa reversão pontual).
- ✅ **Planos reescritos** com a estrutura de negócio atualizada (o
  usuário reverteu a diretriz anterior de "zero intervenção humana no
  1.0"): plano Doopla (R$29,90, até 5 novos bookings/mês) e Doopla Pro
  (R$59,90, bookings ilimitados, "Especialista humano quando uma
  negociação precisar", "Em breve: acesso à rede de bookers humanos
  Doopla"). Isso substitui o que estava documentado no item 1 deste
  arquivo sobre não construir infraestrutura de humano — a diretriz
  vigente agora é a desta seção.
- ✅ `npm run build`, `npx eslint` e `npx tsc --noEmit` limpos em todo o
  projeto (não só nos arquivos tocados). Testado com Playwright local:
  todas as 5 páginas institucionais renderizando (screenshot completo de
  cada uma), overlay de menu abrindo/fechando (Esc funciona), links do
  overlay com os hrefs certos, todas as seções editadas da Home
  conferidas visualmente uma a uma.
- ⏳ Pendência técnica: o formulário de contato não tem envio real (usa
  `mailto:` como alternativa honesta, já que não existe serviço de
  e-mail configurado no projeto). Se quiser um envio de verdade
  (ex.: Resend, API route), isso é trabalho novo, não builicado aqui.

## 21. Correções pós-institucionais: marquee com buraco preto, menu piscando, copy de Planos/Sobre

- ✅ **Marquee com espaço preto vazio em telas largas**: o loop infinito
  usava só 2 cópias do conteúdo (6 spans); em monitores largos o trecho
  repetido não cobria 2x a largura da viewport, sobrando um vão preto
  depois do texto. Aumentado pra 6 cópias (18 spans) — testado num
  viewport de 2200px confirmando que a trilha renderizada sempre fica
  mais larga que 2x a viewport, sem vão.
- ✅ **Overlay do MENU abrindo/fechando sozinho nas páginas
  institucionais**: causa raiz provável identificada — `PageShell` lia
  `site-chrome.css` com `fs.readFileSync` e injetava num `<style>`
  inline a cada mount de página; como as páginas institucionais navegam
  entre si via `next/link` (navegação client-side), esse `<style>`
  inline desaparecia e reaparecia a cada troca de página, causando um
  flash sem estilo bem na hora em que o overlay poderia estar montando/
  desmontando. Trocado por `import './site-chrome.css'` direto (CSS
  real, buildado uma vez, sem re-injeção a cada navegação). Testado com
  Playwright: 4 ciclos de abrir o menu → navegar por um link do overlay
  → voltar, overlay abriu 100% das vezes e o fundo do header continuou
  sólido depois de cada navegação (sem flash detectado nas amostras).
- ✅ Planos (Pro): lista revisada — "Especialista humano quando uma
  negociação precisar" virou "Especialista humano se precisar"; removido
  o item "Radar de clientes e oportunidades".
- ✅ Kicker "Mais que automação. Representação." com ponto final.
- ✅ Sobre: hero reescrito duas vezes seguindo correção do usuário —
  versão final: h1 "Toda carreira merece sua Doopla." + novo parágrafo
  ("...a estrutura que existe por trás de uma carreira profissional...
  continuar no controle da sua carreira."). Meta description atualizada
  junto pra bater com o texto visível.
- ⏳ Ainda pendente (fora do escopo técnico resolvível aqui): envio real
  do formulário de contato (ver item 20) — segue precisando de um
  serviço de e-mail configurado (usuário confirmou que já tem o domínio/
  e-mail pago, então isso pode ser um próximo passo natural).
- ✅ `npm run build`/`npx eslint` limpos em cada rodada.

## 22. Marquee presa visível em link direto pra âncora depois do hero

- ✅ Bug real reportado com screenshot: chegando na Home direto numa
  âncora depois do hero (ex.: `/#o-que-sua-doopla-faz`, que é exatamente
  o link do item "O que sua Doopla faz" no overlay do menu), a marquee
  ficava presa visível, sobrepondo o título da seção "Tem booking pra
  resolver?". Causa: o `onLeave` do ScrollTrigger que esconde a marquee
  só dispara numa TRANSIÇÃO de scroll — se a página já carrega com o
  scroll direto além do hero, o ScrollTrigger nasce já no estado "depois
  do fim", sem nenhuma transição pra disparar o callback. Corrigido
  checando `st.isActive` logo após criar o ScrollTrigger e aplicando o
  estado escondido manualmente se necessário. Testado reproduzindo
  exatamente o cenário (`goto('/#o-que-sua-doopla-faz')` direto, sem
  scroll gradual antes): antes do fix a marquee ficava visível
  sobrepondo o título; depois do fix ela nasce corretamente escondida.

## 20. Marquee: fim do "descolamento" do ponto certo (Começar agora) + copy de Planos/Pro

- ✅ **Bug real, achado pelo usuário via vídeo**: a marquee continuava
  visível ~100vh (uma altura de viewport inteira) depois do botão
  "Começar agora" já ter aparecido, sobrepondo a seção seguinte
  enquanto ela já rolava por baixo. Causa: o ScrollTrigger que esconde
  a marquee usava `end:"bottom top"` enquanto o `stageTl` (que solta o
  pin do hero) usa `end:"bottom bottom"` — são pontos de scroll
  diferentes, um viewport inteiro de distância um do outro. Corrigido
  igualando os dois `end`, então a marquee agora some exatamente
  quando o pin do hero solta (que é também quando "Começar agora" já
  terminou de aparecer), não 100vh depois. Verificado programaticamente:
  botão CTA aparece em scrollY≈2000, marquee some em scrollY≈2300 (gap
  pequeno, não mais ~100vh), zero sobreposição detectada com o título
  da seção seguinte durante um scroll gradual completo.
- ✅ **Regressão pega e corrigida no mesmo processo**: a correção anterior
  pro bug do link direto (`st.isActive` medido logo após criar o
  ScrollTrigger) dava falso negativo mesmo em carregamento normal do
  topo da página — a medição acontecia cedo demais, antes do layout
  assentar, escondendo a marquee por engano mesmo em scrollY 0.
  Trocado por uma checagem direta de `window.scrollY > 20`, sem
  depender de medição do GSAP nesse instante específico. Testado os
  dois cenários (carregamento normal do topo E link direto pra âncora
  depois do hero) — os dois corretos agora.
- ✅ Marquee: aumentado de 2 pra 6 repetições do conteúdo, pra não deixar
  buraco preto vazio em telas muito largas (reportado com print).
- ✅ Copy: kicker da seção "Tem booking" agora é "Mais que automação.
  Representação." (era "Representação, não automação"); headline virou
  "Você faz seu trabalho. Sua Doopla cuida do booking." com "Sua Doopla
  resolve." embaixo da lista; "Como funciona" agora é "Tem booking? Tem
  Doopla."; Planos agora é "Mais estrutura. Sem comissão por booking.";
  lista do Doopla Pro atualizada (Especialista humano se precisar,
  Inteligência sobre cachês/clientes/negociações, Materiais
  profissionais, Benefícios com parceiros, rede de bookers "Em breve").
  CTA final "Toda carreira merece sua Doopla" (sem ponto final) agora
  em preto (era creme/branco); nav do header voltou a dizer "Criar
  conta" (revertendo a padronização "Começar agora" só pra esse botão
  específico, por pedido explícito do usuário).
- ✅ `npm run build`/`npx eslint` limpos em cada rodada. Tudo testado
  com Playwright local reproduzindo os cenários exatos reportados
  (scroll gradual completo, link direto pra âncora, carregamento
  normal do topo).

## 21. Footer legal (CNPJ) + copy de teste grátis na Home

- ✅ Rodapé (Home e páginas institucionais): adicionada a linha discreta
  "Doopla © 2026 · CNPJ: 68.636.132/0001-48" junto aos links de
  Segurança/Termos/Privacidade/Contato, mesma família/tamanho de fonte,
  só com opacidade reduzida pra ficar visivelmente secundária — mesmo
  padrão em desktop e mobile (`flex-wrap` já existente).
- ✅ Mensagem de teste grátis incorporada na Home, como argumento de
  conversão (não como mensagem principal da marca):
  - Hero: CTA "Começar grátis" + nota "7 dias grátis. Sem cartão."
    abaixo do botão.
  - Cards de Planos (Doopla e Doopla Pro): adicionada a linha "7 dias
    grátis" e um botão "Começar grátis" próprio em cada card (nenhum
    dos dois tinha CTA antes). Link do Pro usa `.btn-invert` (fundo
    claro) pra não ficar preto-sobre-preto no card escuro.
  - CTA final: virou "Pronto para ter sua d[olhos]pla?" + "Comece
    grátis por 7 dias." + botão "Começar grátis" — manteve o logo
    animado embutido na palavra "Doopla" (mesmo recurso já
    implementado antes).
  - FAQ: nova pergunta "Como funcionam os 7 dias grátis?" (a lista já
    tinha 6 perguntas de rodadas anteriores; virou 7 — a regra de
    "só 3 perguntas" foi explicitamente dispensada pelo usuário).
- ⚠️ **Pendência grande, propositalmente não implementada**: o fluxo
  novo de onboarding (`Criar conta → Preparar sua Doopla → Escolher
  plano → Iniciar teste grátis → Painel`) e a persistência da intenção
  de plano (sobreviver a refresh, voltar etapas, retomar depois de
  criar a conta) **não existem ainda**. Os CTAs de plano hoje apontam
  pra `/cadastro?plano=doopla` e `/cadastro?plano=pro` — o parâmetro
  `plano` é só um sinal simples pra um onboarding futuro ler; a página
  `/cadastro` atual (fluxo antigo Artista/Booker) não lê nem usa esse
  parâmetro hoje. Construir o onboarding novo de verdade (telas,
  estado, persistência em banco) é trabalho separado, maior, que não
  cabe nesta sessão.
- ✅ `npm run build`/`npx tsc --noEmit`/`npx eslint` limpos. Testado com
  Playwright: texto e `href` de cada CTA conferidos, FAQ com 7 itens
  confirmado, screenshot dos cards de planos e da CTA final.

## 22. Onboarding: sem cachê, sem lista fixa de profissão (finalmente mexendo no /cadastro real)

- ✅ Primeira vez nesta sessão que uma mudança de conteúdo toca o
  `/cadastro` de verdade (antes só os *links* pra ele eram alterados,
  nunca o conteúdo — instrução explícita e antiga do usuário). O pedido
  desta vez foi explícito e específico o suficiente pra justificar:
  duas correções concretas no wizard de onboarding do artista.
- ✅ **Removida a pergunta de cachê** ("Qual sua faixa de cachê ou
  ticket médio?", já opcional mas ainda perguntada). Passa a ser
  aprendida depois, no contexto de um booking real — continua editável
  em Minha Doopla (perfil), o campo já existe lá.
- ✅ **Removidas as listas fixas que deixavam o onboarding "cara de
  DJ"**: categoria (DJ/Músico/Modelo/Ator/Fotógrafo/...), tipos de
  trabalho (Shows/Casamentos/Festas corporativas/...) e nichos fixos
  (Marcas/Eventos sociais/Festivais/...). Substituídas por uma pergunta
  aberta só: "Fale sobre o seu trabalho. O que você faz?" — reaproveita
  o campo `bio` já existente (mesmo texto usado no perfil público),
  então nada quebra a jusante.
- ⚠️ **Fora do escopo desta sessão, documentado explicitamente**: a
  interpretação por IA da resposta livre (extrair profissão/segmento/
  tipo de cliente como contexto estruturado) e a opção de responder por
  áudio. Os dois exigem trabalho novo de verdade (chamada a um modelo,
  schema pra guardar o contexto estruturado, gravação/transcrição de
  áudio) — a resposta hoje só é salva como texto livre em `bio`, igual
  já funcionava antes.
- ✅ Conferido que `categoria`/`workTypes`/`mercados`/`feeRange` do
  artista não têm nenhuma dependência quebrada: `ONBOARDING_FIELDS`
  em `auth/actions.ts` só encaminha o que veio preenchido (nenhum é
  campo obrigatório no banco), e `totalSteps` no wizard é calculado
  dinamicamente a partir do tamanho do array de perguntas — não tem
  contagem fixa pra corrigir.
- ✅ `npm run build`/`npx tsc --noEmit`/`npx eslint` limpos. **Não
  consegui automatizar um clique-a-clique completo do wizard aqui no
  sandbox** (fricção do Playwright com o form multi-etapa client-side,
  não indício de bug real) — recomendo abrir `/cadastro`, escolher
  Artista e conferir manualmente que a pergunta de cachê e as listas
  antigas não aparecem mais, e que "Fale sobre o seu trabalho" aparece
  no lugar certo.
- ✅ Bônus pequeno resolvido no caminho: os dois botões "Começar
  grátis" dos cards de Planos estavam desalinhados (um mais alto que o
  outro, por causa dos cards terem tamanhos de conteúdo diferentes).
  Corrigido ancorando os dois no fim do card via `margin-top:auto`.
- ✅ Também removida a nota "7 dias grátis. Sem cartão." do hero (pedido
  explícito pra tirar só dali) — continua nos cards de planos e na CTA
  final.

## 23. Cadastro reconstruído: sem escolha Artista/Booker, plano real, trial exposto direito

- ✅ O usuário deixou claro (três vezes, cada vez mais explícito) que a
  remoção parcial de perguntas do onboarding antigo (item 22) não
  bastava — o problema estrutural era o `/cadastro` continuar abrindo
  com "Tipo de conta: Artista / Booker/Assistente" como primeira
  pergunta, resquício do produto de marketplace antigo. Corrigido de
  verdade: o funil público (Home → Começar grátis) nunca mais mostra
  esse seletor. `role` fica sempre `'artista'`. O seletor só existe
  pra quem chega por um link explícito de booker (`?tipo=booker`), o
  que preserva o cadastro de booker funcionando sem apagar essa parte
  do produto/banco (dashboard de booker continua 100% intacto).
- ✅ **Escolha de plano de verdade**: o `PlanStep` antigo (tier único
  desatualizado, "R$19,90 no 1º mês → R$39,90/mês") virou dois cards
  selecionáveis — Doopla R$29,90 e Doopla Pro R$59,90 — usando o preço
  de `src/lib/market.ts` (o arquivo central criado no item de
  internacionalização), não mais número solto no componente.
  "7 dias grátis, sem cartão" nos dois. Pré-seleção vem de `?plano=` (o
  mesmo parâmetro que os cards de planos da Home já mandam desde o
  item 21), com fallback em `localStorage` pra sobreviver a um refresh
  no meio do formulário, e fica gravada em `subscriptions.artist_plan`
  (coluna nova, migration 0036) assim que a conta é criada — não
  depende só do parâmetro da URL depois disso.
- ✅ **O trial de 7 dias sem cartão já existia de verdade** — descoberto
  ao investigar o schema antes de mexer: a trigger `handle_new_user`
  (migration 0031) já cria toda assinatura de artista em
  `status: 'trialing'` com `trial_ends_at = agora + 7 dias`, sem
  processador de pagamento nenhum envolvido. Não foi inventado agora,
  só exposto corretamente na tela nova (antes o `PlanStep` nem
  mencionava isso claramente).
- ✅ Adicionado um passo informativo (não é pergunta, não bloqueia
  continuar) explicando o modo Conservador — "Você continua no
  controle. Sua Doopla começa no modo Conservador e consulta você
  antes de decisões comerciais importantes. Depois, se quiser, você
  pode dar mais autonomia a ela em Minha Doopla." — na conclusão das
  perguntas de perfil, como pedido explicitamente (não dentro de uma
  etapa de cachê, que já não existe mais).
- ⚠️ **Pendências que continuam fora desta sessão, agora com o motivo
  técnico documentado**:
  - **Interpretação por IA da resposta "Fale sobre o seu trabalho"**:
    precisa de uma chamada real a um modelo de IA + um lugar pra
    guardar o contexto estruturado extraído (profissão/segmento/tipo
    de cliente) — hoje a resposta só é salva como texto livre em
    `bio`, igual antes.
  - **Resposta por áudio**: precisa de gravação/upload/transcrição —
    infraestrutura nova, não existe nada disso no produto hoje.
  - **"Criar conta" como primeira tela visual de verdade**: o
    e-mail/senha continua sendo tecnicamente o ÚLTIMO passo do wizard
    (a conta só é criada de fato nesse envio final, como sempre foi —
    os passos anteriores só acumulam estado local no navegador). Não
    reordenei isso porque mexe na wiring central de submissão do
    formulário — risco alto pra um ganho de UX que não foi o ponto
    central do pedido (o ponto central, resolvido, era não perguntar
    Artista/Booker).
  - **Persistência de onboarding entre sessões** (retomar depois que a
    conta já existe, fechar e voltar dias depois): não existe nada
    assim em nenhuma parte do produto hoje — exigiria um sistema de
    sessão de onboarding resumível no servidor, trabalho novo e maior.
- ✅ `npm run build`/`npx tsc --noEmit`/`npx eslint` limpos. Verificado
  com Playwright: `/cadastro` sem seletor de tipo de conta (confirmado
  programaticamente), `/cadastro?tipo=booker` com o seletor presente
  (confirmado), e o primeiro passo real do fluxo do artista avançando
  corretamente ("Pergunta 2 de 12: Qual é seu nome artístico?").
  **Não consegui automatizar o clique-a-clique completo até a tela de
  planos aqui no sandbox** (mesma fricção do Playwright com esse
  formulário multi-etapa já relatada no item 22, não indício de bug) —
  recomendo fortemente abrir `/cadastro?plano=pro` no navegador e
  conferir visualmente que o card "Doopla Pro" aparece pré-selecionado
  na etapa de planos.

## 21. Reconstrução real do cadastro — Criar conta é a primeira etapa, progresso salvo no banco

- ✅ **Isso estava pendente, não implementado** — no fim da rodada
  anterior eu tinha só analisado a arquitetura (schema, trigger
  `handle_new_user`, exigência de confirmação de e-mail do Supabase)
  sem chegar a escrever o código novo, e não deixei isso claro. O
  usuário testou em produção, viu que "Criar conta"/"Começar grátis"
  continuavam caindo no wizard antigo (pergunta "O que você está
  buscando?" primeiro) e cobrou corretamente. Está implementado agora,
  de verdade, testado localmente.
- ✅ **Novo funil público do artista** (`/cadastro`, sem `?tipo=booker`
  nem `?invite=`): passo 1 é só "Criar conta" (nome, e-mail, senha) —
  sem seletor Artista/Booker. `role` fica sempre `'artista'` no
  server action, nunca perguntado. Testado: os campos renderizados em
  `/cadastro` são só `fullName/email/password/confirmPassword`, sem
  fieldset de tipo de conta.
- ✅ **Conta já existe antes das próximas perguntas**: `createAccountAction`
  (novo, em `auth/actions.ts`) chama `supabase.auth.signUp()` já no
  passo 1 — a trigger `handle_new_user` cria profile + artist_profile +
  subscription (trial de 7 dias, `artist_plan`) na hora, mesmo antes da
  confirmação de e-mail. As etapas seguintes só fazem `UPDATE` nessas
  linhas já existentes (autenticado, via RLS `auth.uid() = profile_id`)
  — nunca ficam só em estado local do componente.
- ✅ **Dois passos novos, autenticados, com resume real**:
  `/cadastro/preparar` (nome artístico, "fale sobre seu trabalho", 
  cidade/estado — a resposta aberta continua sendo coletada
  normalmente, pronta pra quando a interpretação por IA for
  implementada) e `/cadastro/plano` (escolha Doopla/Doopla Pro,
  reaproveitando os preços de `src/lib/market.ts`). Cada página busca o
  estado atual no banco no carregamento e pré-preenche o formulário —
  se o usuário atualizar a página, fechar o navegador ou voltar depois
  (já com a conta existindo), o progresso está lá, não depende de
  localStorage. Se uma etapa já foi preenchida antes, a página pula
  direto pra próxima (`/cadastro/preparar` → `/cadastro/plano` se
  `stage_name`/`bio` já existem).
- ✅ **Intenção de plano sem localStorage depois que a conta existe**: o
  card clicado na Home (`?plano=doopla` ou `?plano=pro`) vira campo
  oculto no passo 1, vai como metadata no `signUp()`, e a trigger já
  grava em `subscriptions.artist_plan` — quando o usuário chega em
  "Escolher plano", o valor pré-selecionado vem de uma leitura real do
  banco, não de localStorage. Testado: `?plano=pro` → campo oculto
  `artistPlan=pro` confirmado no DOM do passo 1.
- ✅ **Booker e artista convidado por agência preservados**: `?tipo=booker`
  (ou `?role=booker`) e `?invite=...` continuam caindo no wizard antigo
  (`SignupForm`), sem nenhuma mudança de comportamento — só o funil
  público padrão (Home → Começar grátis) foi reconstruído. Testado:
  `/cadastro?tipo=booker` ainda mostra o fieldset "Tipo de conta".
  `PlanStep`/`PLAN_CARDS` do wizard antigo foram extraídos pra um
  componente compartilhado (`PlanPicker.tsx`) reaproveitado pelos dois
  fluxos, sem duplicar preço/feature em dois lugares.
- ✅ Nova coluna `subscriptions.artist_plan` (migration 0036) — usuário
  já rodou no Supabase, confirmado.
- ⏳ **Pendências explicitamente mantidas como próxima implementação, não
  refinamento futuro indefinido** (conforme o usuário pediu): interpretação
  por IA da resposta aberta sobre o trabalho (já coletada, ainda não
  processada), resposta por áudio nessa mesma etapa, e detecção
  automática de região/idioma + seletor PT/EN + integração real com
  Stripe (fundação central já existe em `src/lib/market.ts`, nada
  disso está ligado ainda).
- ✅ `npm run build`, `npx tsc --noEmit` e `npx eslint` limpos. Testado
  localmente: renderização dos dois fluxos (novo vs. booker), guarda de
  autenticação em `/cadastro/preparar` e `/cadastro/plano` (redirecionam
  pra `/login?next=...` sem sessão), e o hidden field de intenção de
  plano.
- ✅ **Confirmado ponta a ponta pelo usuário, em produção** (não dava pra
  testar `signUp()` → e-mail de confirmação → resume neste sandbox, sem
  caixa de e-mail real): criou conta de teste, recebeu o e-mail de
  confirmação, clicou no link, passou por `/cadastro/preparar` e
  `/cadastro/plano`, e chegou no painel normalmente. Fluxo novo
  validado como funcionando de verdade, não só em teoria.

## 22. Camada humana — escalonamento de exceções (Home)

- ✅ Bloco curto dentro de "Como funciona", depois dos 3 passos
  principais — não é seção nova, não alonga a Home. "Tem coisa que
  pede uma pessoa. A Doopla sabe disso." + duas frases curtas sobre
  escalonamento pro time humano quando os canais normais não resolvem.
  Visualmente discreto (texto menor, separador sutil), sem competir
  com os 3 passos.
- ✅ FAQ: pergunta "A Doopla fala com o cliente por mim?" adaptada pra
  "E se o cliente não quiser falar com uma IA?" (mesma posição na
  lista); nova pergunta "E se o cliente parar de responder ou atrasar
  um pagamento?" adicionada logo após "Como funciona o pagamento?".
  FAQ agora com 8 itens.
- ✅ Nenhuma promessa de resposta garantida do cliente, recebimento de
  cachê garantido, ou humano acompanhando cada artista/booking — só a
  copy exata fornecida. `npm run build`/`eslint` limpos, testado com
  Playwright (screenshot do bloco + lista de perguntas do FAQ
  conferida).

## 23. "Prepare sua Doopla" reconstruído — de 2 perguntas pra contexto de verdade

- ✅ **Problema real apontado pelo usuário**: depois de escolher o plano,
  o passo 2 só perguntava profissão (texto livre) e cidade — insuficiente
  pra Doopla ter contexto mínimo pra representar alguém quando um
  cliente aparecer. Reconstruído do zero, sem voltar ao cadastro longo
  do modelo antigo de matching.
- ✅ **5 perguntas curtas, uma tela por vez, com barra de progresso**
  (client-side, `/cadastro/preparar` continua sendo uma página só —
  submete tudo junto no fim, como o wizard antigo já fazia): nome
  artístico + profissão (chips: DJ, Banda, Cantor(a), Fotógrafo(a),
  Videomaker, Influenciador(a)/creator, Outro) → cidade + onde trabalha
  (chips múltiplos: minha região, outros estados, Brasil inteiro,
  internacional, remoto) → tipos de trabalho (chips múltiplos,
  **específicos da profissão escolhida** — DJ vê "Clubes e festas,
  Festivais, Restaurantes/hotéis...", fotógrafo vê "Ensaios, Moda e
  campanhas, Produtos...") → presença profissional (Instagram/site/
  portfólio/outro, pelo menos um) → contexto aberto ("que tipo de
  trabalho você mais faz ou gostaria de receber", a mesma resposta
  aberta de antes, pronta pra interpretação por IA quando for
  implementada).
- ✅ **Arquitetura extensível por categoria**: `src/lib/artist-categories.ts`
  — `WORK_TYPES_BY_CATEGORY` é um `Record<categoria, opções[]>` com
  fallback genérico pra categoria sem lista própria ainda. Adicionar
  uma profissão nova = uma entrada nesse arquivo, não mexe no
  formulário.
- ✅ Todos os campos gravam em colunas que já existiam em
  `artist_profiles` (`category`, `regions`, `work_types`,
  `instagram_url`, `portfolio_url`, `website_url`, `other_links`,
  `local`, `bio`, `stage_name`) — nenhuma migration nova precisou.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos. **Não deu
  pra testar visualmente no navegador** (a página exige sessão real,
  autenticação já validada pelo usuário na rodada anterior) — validado
  por revisão cuidadosa de código em vez de Playwright desta vez.
  Pedir pro usuário conferir criando uma conta de teste nova.
- ⏳ **Explicitamente fora desta rodada** (é a próxima peça, não este
  ajuste): a área no painel pra continuar configurando a representação
  progressivamente depois do onboarding (referência de cachê, nota
  fiscal, rider, forma de pagamento, "nunca aceitar sem me perguntar"
  etc.) — não existe ainda, precisa ser construída como funcionalidade
  própria do painel.

## 24. Onboarding 7 etapas — arquitetura de dados feita, UI aguardando mockup

- ⚠️ **Bloqueado esperando o mockup**: o usuário pediu pra reconstruir
  `/cadastro` completo em 7 etapas (Criar conta → Prepare sua Doopla →
  Cachê → Como você trabalha → Canal de atenção → Conclusão → Planos),
  citando "te enviei o mockup do layout e design do cadastro" — esse
  arquivo não chegou nesta sessão (nenhum anexo visível). Perguntei e
  fiquei esperando. Enquanto isso, adiantei só a parte que não depende
  de layout nenhum:
- ✅ **`profession_job_types` como dado real no banco, não mais arquivo
  TS** (era um requisito explícito de arquitetura, não front) —
  migration 0037 cria as tabelas `professions` e `profession_job_types`
  (profissão → lista de tipos de trabalho), com RLS de leitura pública,
  seedadas com as 7 profissões já usadas (DJ, Banda, Cantor(a),
  Fotógrafo(a), Videomaker, Influenciador(a)/creator, Outro) e os
  tipos de trabalho de cada uma. Adicionar profissão nova agora é um
  `insert`, nunca mexer no componente React. `/cadastro/preparar`
  busca essas tabelas no carregamento da página e passa como prop pro
  formulário — `src/lib/artist-categories.ts` foi limpo, só guarda
  `WORK_REGIONS` (lista pequena e estável, não precisa ser tabela).
- ✅ **WhatsApp na Etapa 1** (Criar conta): campo novo, obrigatório,
  grava em `profiles.phone` (coluna que já existia, só a trigger nunca
  preenchia — corrigido).
- ✅ **Colunas novas em `artist_profiles`** pras etapas Cachê / Como você
  trabalha / Canal de atenção, prontas pro backend quando as telas
  forem construídas: `fee_varies_by_job_type` (bool), `issues_invoice`
  (bool, emite nota fiscal), `typical_job_duration` (text),
  `negotiation_notes` (text — **campo separado de `bio`, de propósito**:
  `bio` é intenção/preferência comercial da Etapa 2 ("quero mais
  eventos de marca"), `negotiation_notes` é regra de representação da
  Etapa 4 ("nunca aceite exclusividade sem falar comigo") — nunca
  concatenados, exatamente como pedido), `attention_channel` (enum
  whatsapp/painel/ambos). `base_fee_cents` (já existia) reaproveitado
  como cachê de referência.
- ⏳ **Não construído ainda, esperando o mockup**: as telas de Cachê,
  Como você trabalha, Canal de atenção e Conclusão (Etapas 3-6) — as
  colunas existem, os server actions e a UI ainda não. "Prepare sua
  Doopla" (Etapa 2) continua com a versão da rodada anterior (5
  perguntas), ainda não reestruturada pra bater exatamente com a nova
  numeração de etapas do usuário — só o profession_job_types dela foi
  atualizado pra vir do banco.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.
- ⚠️ **Migration 0037 ainda não rodou no Supabase** — preciso mandar
  pro usuário rodar antes de `/cadastro/preparar` funcionar em
  produção (senão a query em `professions`/`profession_job_types`
  falha silenciosamente e a etapa 1 do formulário fica sem opções).

## 25. Onboarding 7 etapas — reconstrução completa no visual do mockup

- ✅ **`/cadastro` reconstruído de verdade, não ajustado** — as 7 etapas
  (Criar conta → Prepare sua Doopla → Cachê → Como você trabalha →
  Canal de atenção → Conclusão → Planos) agora existem com o visual do
  mockup enviado (vermelho/ink/cream, Anton/Familjen Grotesk/IBM Plex
  Mono, cards e chips, nunca `<select>` longo), barra de progresso
  segmentada sempre visível e o logo com olhos que seguem o cursor
  (`OnboardingShell.tsx`, `onboarding.css` escopado sob `#onboarding`
  pra não vazar pro resto do produto). Em nenhum ponto do funil público
  aparece "Sou Artista / Sou Booker" — isso continua isolado no wizard
  antigo, só acessível por `?tipo=booker`/`?role=booker` ou `?invite=`.
- ⚠️ **Correção de escopo a meio da implementação**: a primeira versão
  do item 24 tinha criado `professions`/`profession_job_types` como
  tabelas no banco pra alimentar chips de "tipos de trabalho" por
  profissão. O usuário reverteu essa decisão explicitamente: sem
  taxonomia de profissão → tipos de trabalho nenhuma, nem no banco nem
  na tela. "O que você faz?" voltou a ser texto livre (grava direto em
  `artist_profiles.category`), e o contexto que a taxonomia tentava
  capturar agora vem inteiro da resposta aberta "Conte um pouco sobre
  o seu trabalho" (`bio`). As tabelas `professions`/`profession_job_types`
  continuam existindo no Supabase (migration 0037 já tinha rodado) mas
  não são mais lidas por nada — podem ser removidas depois num cleanup,
  não é bloqueante.
- ✅ **Etapa 3 (Cachê)** — "tem cachê de referência" (sim/ainda não) +
  valor, e "cachê varia por trabalho" (sim/não, sem detalhar categoria
  aqui). Reaproveita `base_fee_cents`/`fee_varies_by_job_type`, que já
  existiam — sem nova migration pra essa etapa.
- ✅ **Etapa 4 (Como você trabalha)** — nota fiscal, duração típica do
  trabalho (pergunta genérica, não específica de DJ), e "tem algo que
  sua Doopla sempre deve saber antes de negociar por você"
  (`negotiation_notes`) — **campo separado de `bio`**, nunca
  concatenado, como já era o requisito.
- ✅ **Etapa 5 (Canal de atenção)** — WhatsApp/Painel/Ambos, sem
  qualquer menção a receber oportunidades.
- ✅ **Áudio honesto, não fingido**: os dois campos abertos (contexto na
  Etapa 2, regras na Etapa 4) têm o toggle "Escrever/Falar por áudio"
  do mockup, mas clicar em "Falar por áudio" não esconde o textarea
  nem mostra uma gravação falsa — só avisa que áudio ainda não está
  disponível e mantém o texto como única forma real de responder, pra
  nunca descartar silenciosamente o que a pessoa digitou.
- ✅ **`PlanPicker` ganhou `variant` (`onboarding` | `legacy`)** — mesmo
  componente, mesmos `PLAN_CARDS`, mas dois visuais: o novo
  vermelho/cream pra Etapa 7, e o antigo `--paper/--ink` continua
  servindo o wizard do booker sem duplicar preço/feature em dois
  lugares.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos. Etapa 1
  verificada visualmente com Playwright (bate com o mockup). Etapas
  2-7 exigem sessão autenticada — não dá pra testar ao vivo neste
  sandbox; revisão foi por leitura cuidadosa do código, validação real
  fica por conta do usuário em produção.
- ⏳ Indique e ganhe R$5 (dashboard) não foi tocado por essa mudança —
  vive inteiramente em `src/app/dashboard/`, fora do `/cadastro`.

## 26. Onboarding — fonte de verdade final: qualquer profissional independente, não só DJ/artista

- ✅ **Reescrita da Etapa 3 e simplificação geral**, alinhada ao
  documento final do usuário. Mudanças principais em relação ao item
  25:
  - Etapa 3 renomeada de "Cachê" pra **"Valores"**: "Você tem um valor
    de referência para seu trabalho?" com opções **R$ [valor]** ou
    **Depende do trabalho** (nunca mais "ainda não tenho um valor
    definido" — o enquadramento agora é sempre "referência pra Doopla
    entender como você trabalha comercialmente", nunca autorização de
    fechamento). Escolhendo "Depende do trabalho" abre uma pergunta
    aberta opcional ("Como você costuma definir seus valores?") em vez
    da antiga pergunta fechada "cachê varia por tipo de trabalho?".
  - **Removida a etapa "Onde você trabalha" inteira** (chips de
    cidade/estados/internacional/remoto) — cidade-base já basta como
    contexto inicial; alcance geográfico é aprendizado progressivo,
    não pergunta de onboarding.
  - **Removida "duração típica do trabalho"** (Etapa 4) — fazia sentido
    só pra um subconjunto de profissões.
  - **Toggle "Escrever/Falar por áudio" virou um único input
    conversacional com ícone de microfone embutido**
    (`ConversationalField`, usado em "conte sobre seu trabalho" e nas
    duas perguntas abertas de Valores/Como você trabalha) — nunca dois
    modos separados. Áudio de verdade continua não existindo: clicar
    no microfone mostra um aviso honesto (`.mic-note`) sem esconder o
    campo de texto.
  - **"Nome artístico" virou "Nome profissional"** e o placeholder de
    profissão trocou de "DJ" fixo pra "Ex.: DJ, fotógrafo, maquiador,
    creator..." — sem nenhum valor pré-preenchido, pra não sugerir que
    o produto é feito só pra DJ.
  - **Etapa 6 (Conclusão) reescrita**: sem lista "o que falta"
    (Riders/Materiais/Links/...), que soava como "cadastro incompleto".
    Texto novo comunica aprendizado progressivo: "Isso é só o começo...
    Sua Doopla também vai perguntar quando precisar aprender algo
    novo." + "Quanto mais vocês trabalham juntos, mais sua Doopla
    conhece você."
  - Coluna nova **`pricing_notes`** (migration 0038) pra "como você
    costuma definir seus valores" — semanticamente diferente de `bio`
    e de `negotiation_notes`, nunca concatenada com nenhuma das duas.
    `fee_varies_by_job_type`/`typical_job_duration` (migration 0037)
    saem do onboarding mas continuam existindo no banco, sem escrita —
    não é destrutivo remover uma pergunta.
  - `src/lib/artist-categories.ts` removido (WORK_REGIONS não é mais
    usado por nada, já que a etapa de regiões saiu do onboarding).
- ⏳ **Explicitamente fora deste bloco, por pedido direto**: a barra
  "Sua Doopla aprende com você" no painel (input único com
  texto/áudio/anexo interpretado por IA), perguntas proativas da
  Doopla quando falta uma informação, e a evolução do gerador de
  contrato pra aceitar contrato próprio do profissional como
  referência — tudo isso depende de integração real de IA (backend +
  OpenAI/Anthropic), que é um bloco técnico separado, ainda não
  iniciado. Comecei uma auditoria técnica da arquitetura atual (stack,
  schema, auth, segurança, gaps) como pré-requisito desse bloco, a
  pedido do usuário — pausada a meio de caminho pra terminar o
  onboarding primeiro; retomo quando ele pedir.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.

## 27. Doopla Intelligence OS v1 — primeira migration: camada de conversação

- ✅ **Migration 0039** aplicada (localmente, contra as 38 migrations
  reais + role `authenticated` simulado — não rodou ainda no Supabase
  de produção, precisa ser executada pelo usuário). Três rodadas de
  desenho aprovadas antes de qualquer SQL: auditoria da arquitetura
  atual → desenho v1 → revisão v2 (consistência mandato/tenant) →
  revisão v3 (`represented_professional_id` imutável — decisão que
  transforma a ética de representação da Doopla em garantia de banco,
  não instrução que se espera que a IA respeite).
- ✅ **Tabelas novas**: `conversations` (entidade central — mandato,
  origem, canal, estado, vínculo opcional com oportunidade/booking,
  linhagem de transferência), `external_participants` +
  `external_participant_channel_identities` (contato externo, escopado
  por profissional, nunca identidade global), `conversation_messages`
  (author_type/direction/channel separados, nunca um `role` de LLM;
  `body` vs `transcript` nunca misturados), `conversation_mandate_events`
  e `conversation_state_events` (append-only, a linha de nascimento da
  conversa já é o primeiro evento). `ai_usage_events` ganhou
  `conversation_id` (aditivo, nullable).
- ✅ **`represented_professional_id` é imutável de verdade**: sem
  `GRANT UPDATE` pra `authenticated` em nenhum caminho — mudar de
  representado é sempre uma `conversation` nova
  (`transferred_from_conversation_id`), nunca um `UPDATE` na
  existente. Isso é o que faz as FKs compostas de isolamento de tenant
  (participante/oportunidade/booking do mesmo profissional) funcionarem
  sem risco de o ponto de ancoragem se mover.
- ✅ **Três functions `security definer`**, únicas portas de escrita
  privilegiada: `create_conversation()` (cria a conversa + os dois
  eventos de nascimento atomicamente — nunca existe conversa "crua"),
  `set_conversation_mandate()` (só mandato, nunca identidade),
  `advance_conversation_state()` (só estado). As três validam o
  chamador via `auth.uid()` internamente — nenhuma confia em
  `professional_id` vindo de parâmetro como prova de identidade.
- ✅ **13 testes de RLS pedidos, rodados de verdade** contra Postgres
  16 local com role `authenticated` simulado (mesmo método do
  `AUDITORIA_BLOCO_4_5.md`) — os 13 passaram. Mais 8 verificações
  extras (FK de booking, tentativa de impersonar outro profissional em
  `create_conversation`, `professional_self` com participante externo
  rejeitado, eventos de nascimento existem, as duas functions de
  mandato/estado funcionam ponta a ponta). Detalhe encontrado durante
  a implementação: `psql` não interpola variáveis `:'var'` dentro de
  blocos `do $$ ... $$` — os 5 testes que dependiam disso precisaram
  ser reescritos como statements soltos (erro = bloqueado = PASS) em
  vez de blocos com `exception when others`.
- ✅ **Tipos atualizados** em `src/lib/supabase/types.ts` — `Insert`/
  `Update` marcados como `never` nas tabelas que o banco de fato não
  deixa `authenticated` escrever direto (`conversations`,
  `conversation_mandate_events`, `conversation_state_events`), pra o
  TypeScript reforçar a mesma regra que o banco já garante.
  Recomendação de migrar `types.ts` inteiro pra `supabase gen types`
  documentada, não aplicada (fora do escopo desta etapa).
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos. Nenhuma
  mudança em `/dashboard`, Home, ou qualquer funcionalidade existente.
- ⏳ **Nada de IA integrada** — sem SDK, sem Orchestrator, sem Context
  Builder, sem Tool Registry, sem Approval Engine, sem WhatsApp/e-mail,
  sem transcrição, sem a barra "Sua Doopla aprende com você". Só a
  fundação de dados. Parado aqui, aguardando auditoria do usuário
  antes de qualquer próximo passo.
- ✅ **Migration 0039 rodou em produção** (confirmado pelo usuário).

## 28. Doopla Intelligence OS v1 — trigger de `last_activity_at` (correção pequena, fecha a fase)

- ✅ **Migration 0040**: trigger `after insert on conversation_messages`
  atualiza `conversations.last_activity_at` da conversa correspondente
  pra bater com o `created_at` da mensagem — determinístico, no banco,
  não depende de nenhuma integração futura lembrar de fazer isso.
  Function `security definer` (mesmo padrão das outras três da 0039,
  necessário porque `last_activity_at` está fora do alcance de
  `UPDATE` direto de `authenticated`), só toca essa uma coluna, só na
  linha correspondente.
- ✅ Testado localmente contra os 40 migrations + role `authenticated`
  simulado: `last_activity_at` inicial bate com `created_at` da
  conversa; depois de inserir mensagem, bate com o `created_at` da
  mensagem; nenhum outro campo da conversa muda (comparação campo a
  campo via snapshot antes/depois); RLS de `conversations` continua
  intacta (dono lê, `anon` não lê); `authenticated` continua sem
  conseguir `UPDATE` direto em `last_activity_at` (só o trigger
  escreve).
- ⚠️ **Achado durante a re-verificação, corrigido**: o script de teste
  original (item 27) tinha uma falha de metodologia — ao trocar de
  role autenticado direto pra `anon` sem limpar `request.jwt.claims`,
  a GUC de sessão anterior "vazava" pro contexto seguinte (isso nunca
  acontece na Supabase real, onde cada request é uma conexão nova,
  mas acontecia no script porque reusava a mesma sessão `psql`). Nos
  testes 5/6 originais isso não gerou falso-positivo por coincidência
  (o UUID que vazou não batia com a linha testada), mas o teste do
  trigger expôs o problema de verdade. Corrigido limpando
  `request.jwt.claims` antes de cada troca pra `anon`, e **os 13
  testes originais + as 8 verificações extras foram re-rodados do
  zero** com a correção — todos continuam PASS, agora com garantia
  real, não coincidência.
- ✅ Nenhum caminho de escrita novo pra `current_intent`,
  `expected_next_step`, `channel`, `related_opportunity_id`,
  `related_booking_id` — mantidos fora do escopo, como pedido.
  `professions`/`profession_job_types` não tocadas.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.
- ⚠️ **Migration 0040 ainda não rodou no Supabase de produção.**
- **Fase encerrada aqui** — Doopla Intelligence OS v1 tem sua fundação
  de dados completa e testada. Próximo passo (Context
  Builder/Orchestrator/integração de IA) é um bloco novo, não
  iniciado, aguardando decisão do usuário.

## 29. Primeiro teste de infraestrutura — Doopla ↔ OpenAI (não é o Orchestrator)

- ✅ **`src/lib/intelligence/`** ganhou 3 arquivos: `config.ts` (nome do
  modelo/feature centralizados — `AI_MODEL = 'gpt-5-mini'`, nunca
  string solta pelo código), `openai-client.ts` (abstração mínima do
  provider — único lugar que lê `process.env.OPENAI_API_KEY`, nunca
  `NEXT_PUBLIC_...`), `test-call.ts` (`runIntelligenceTestCall`, a
  função de teste em si). SDK oficial `openai` (^7.5.0) instalado —
  nenhum outro pacote novo.
- ✅ **Responses API** (`client.responses.create`), confirmada via
  pesquisa como a recomendada pra integrações novas hoje (Chat
  Completions continua suportada, mas novos recursos como tools/MCP só
  chegam na Responses). `gpt-5-mini` escolhido pelo custo (bem mais
  barato que o gpt-5.5 "flagship") — adequado pra um teste de
  infraestrutura, não é o modelo definitivo do Orchestrator.
- ✅ **Migration 0041**: `ai_usage_events` ganha `model`/`status`
  (aditivo) + function `log_ai_usage_event()` — `authenticated` nunca
  teve INSERT direto nessa tabela (só service_role, desde o Bloco
  4.5), então a function segue o mesmo modelo de confiança das outras
  do Intelligence OS (security definer, profile_id sempre `auth.uid()`,
  nunca parâmetro; valida que a conversa, quando informada, pertence a
  quem chama).
- ⚠️ **Achado real durante o teste local, corrigido na mesma
  migration**: `revoke all on function ... from public` (usado nas
  quatro functions do Intelligence OS, inclusive as três já aplicadas
  na 0039) não removia o `EXECUTE` que a configuração padrão do
  Supabase concede direto pra `anon`/`authenticated` em toda function
  nova (via `alter default privileges`, não via o role `PUBLIC`). O
  comportamento de segurança nunca dependeu disso — cada function já
  valida `auth.uid()` como primeira linha, `anon` sempre foi barrado
  na prática — mas a trava de privilégio documentada como "só
  authenticated pode nem tentar chamar" não estava de fato em vigor.
  Migration 0041 fecha isso nas quatro functions (`revoke execute ...
  from anon`), retroativamente pras três da 0039 também.
- ✅ **Rota de teste** `/dev/intelligence-test` (fora de `/dashboard`
  de propósito, chrome próprio mínimo, com aviso "ferramenta
  interna") — mesma checagem de sessão (`getUser()` + redirect) que
  qualquer página autenticada do projeto já usa. Sem link em nenhuma
  navegação — só acessível por URL direta. Cria uma conversa
  `professional_self` de teste e roda `runIntelligenceTestCall`
  contra ela.
- ✅ **Minimização de contexto**: só nome/nome artístico, categoria,
  bio, `negotiation_notes` (quando existir) e até 10 mensagens
  recentes da conversa — nunca o `artist_profiles` inteiro, nunca dado
  de outro profissional.
- ✅ **Nenhum side effect comercial**: a resposta do modelo nunca é
  gravada em `conversation_messages`, nunca chama
  `set_conversation_mandate`/`advance_conversation_state`, nunca toca
  `opportunity`/`booking`, não existe tool call nenhum no código.
- ✅ Testado localmente (Postgres real + role `authenticated`/`anon`
  simulados, mesmo processo de sempre): posse de conversa validada
  (RLS + filtro explícito), `anon` bloqueado tanto por RLS quanto
  agora por privilégio de function, `profile_id` sempre `auth.uid()`
  mesmo tentando registrar evento em conversa de outro profissional
  (bloqueado), ausência de `OPENAI_API_KEY` gera erro controlado sem
  vazar nada (verificado isoladamente, sem rede). **Não verificado por
  mim**: uma chamada real à OpenAI de ponta a ponta — este sandbox não
  tem `OPENAI_API_KEY` (só existe no ambiente Preview da Vercel);
  fica para o usuário confirmar clicando "rodar teste" em produção.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.
- ⏳ **Nada além disso** — sem Orchestrator, sem Context Builder
  definitivo, sem Tool Registry, sem Approval Engine, sem streaming,
  sem memória vetorial. Parado aqui, como pedido.
- ✅ **Migrations 0039–0041 rodadas e confirmadas em produção** (Supabase)
  — usuário confirmou; a chamada real à OpenAI em Preview também foi
  validada com sucesso (item que ficara pendente de verificação acima).

## 30. Doopla Intelligence Core v1 — Bloco 1: fundações técnicas do Core

Primeiro bloco do Core de verdade (Orchestrator ainda não existe —
isto é só a base sobre a qual ele vai rodar). Arquitetura completa foi
aprovada antes, em 2 rodadas de revisão; este bloco implementa só os 8
itens do escopo combinado, parando aqui pra auditoria antes do Bloco 2.

- ✅ **`src/lib/intelligence/types.ts`** — todos os tipos compartilhados
  do Core: `ActorType`/`ActorTrigger`/`ActorContext` (representado ≠
  ator ≠ interlocutor externo, nunca colapsados num `professional_id`
  solto), `Capability`, `RiskLevel`, `ContextSource`,
  `ToolDefinition`/`ToolContext`/`ToolExecutionOutcome`,
  `PolicyGateContext`/`PolicyGateResult`, `RepresentationEthicsFlag`,
  tipos de observabilidade (`OrchestratorRunStart`/`Finish`).
- ✅ **`actor-context.ts`** — `resolveActorContext(supabase,
  conversationId, trigger)`: único jeito de obter um `ActorContext`.
  Nunca recebe identidade pronta de quem chama — `actor_profile_id`
  pra um trigger autenticado vem sempre de `supabase.auth.getUser()`
  internamente. v1: um usuário autenticado só é ator válido quando é
  ele mesmo o `represented_professional_id` da conversa (senão
  `actor_not_authorized_for_conversation`); trigger `system` é
  recusado neste bloco (`system_trigger_not_supported` — sem caminho
  real de disparo ainda, ver "pontos em aberto" abaixo);
  `authorized_collaborator` fica só no tipo, sem nenhum código que o
  produza (prepara o Booker Pro sem abrir spoofing de identidade
  agora).
- ✅ **`tool-registry.ts`** — contrato final aprovado
  (`name/description/inputSchema/outputSchema/sideEffects/idempotent/
  baseRiskLevel/resolveRisk/retryPolicy/timeoutMs/auditFields/execute`),
  validação tipada via `zod` (dependência nova). `executeTool(name,
  input, ctx, eligibleTools)` recusa tool não registrada
  (`tool_not_registered`) e tool não elegível
  (`tool_not_eligible` — elegibilidade sempre calculada pelo
  pre-model gate, nunca declarada por quem chama). Risco final nunca
  fica abaixo do `baseRiskLevel` mesmo se `resolveRisk()` tentasse
  devolver algo menor — o registry corrige pro piso.
- ✅ **3 READ tools** (`get_professional_profile`, `get_opportunity`,
  `get_booking`) — todas `sideEffects:false`, `idempotent:true`,
  `baseRiskLevel:'low'`. Nenhuma aceita um id de profissional vindo de
  fora: o filtro é sempre `ctx.representedProfessionalId`.
  `get_opportunity`/`get_booking` filtram por
  `artist_profile_id = ctx.representedProfessionalId` — oportunidade/
  booking de outro tenant sempre volta `found:false`, nunca a linha
  errada nem um erro que revele que ela existe em outro tenant.
- ✅ **`policy-gate.ts`** — `evaluatePreModelGate()`: primeira barreira
  determinística antes de qualquer chamada ao model. Valida
  representado=conversa (defensivo, redundante com
  `resolveActorContext` de propósito), `mandate==='active'`, calcula
  `allowedContextSources` (só inclui `opportunity`/`booking` quando a
  conversa de fato tem `related_opportunity_id`/`related_booking_id`)
  e `eligibleTools` (interseção tool registry × `actorContext.
  capabilities`). `evaluateRepresentationEthics()` existe como função
  real e nomeada (as 5 regras já aprovadas na arquitetura), hoje
  sempre `[]` porque v1 é mono-profissional — mantida pronta pro
  Discovery multi-profissional futuro, não "resolvida por omissão".
- ✅ **Migration 0042 (`orchestrator_runs`)** — depois de avaliar,
  optei por tabela nova dedicada em vez de inchar `ai_usage_events`
  (que precisa continuar focada em medir uso/custo de IA, não estado
  de execução do Core). Um run por execução: `run_id`, conversa,
  representado, ator, interlocutor externo, trigger, tools elegíveis
  x tools chamadas, status, erro técnico, latência — nunca chain of
  thought, nunca conteúdo de `conversation_messages` duplicado.
  `start_orchestrator_run()`/`finish_orchestrator_run()` (par de
  functions, não uma só, porque `ai_usage_events.run_id` — aditivo —
  precisa referenciar um run já existente no meio do fluxo). Mesmo
  padrão de confiança das migrations anteriores (security definer,
  `auth.uid()` validado internamente, nunca identidade de parâmetro) —
  desta vez já nasce com `revoke execute ... from anon` nas duas
  functions novas, sem repetir o achado da 0041.
  `log_ai_usage_event()` ganhou parâmetro opcional `p_run_id` (exigiu
  `drop function` da assinatura antiga antes de recriar — `create or
  replace` sozinho teria virado uma sobrecarga nova em vez de
  substituir, por causa do argumento extra).
- ✅ **`observability.ts`** — wrapper fino
  `startOrchestratorRun`/`finishOrchestratorRun` sobre as duas RPCs.
- ✅ **`test-call.ts` refatorado** pra usar o Core em vez de lógica
  própria duplicada: `resolveActorContext` → `evaluatePreModelGate` →
  `startOrchestratorRun` → `executeTool('get_professional_profile', …)`
  → chamada à OpenAI → `finishOrchestratorRun`. Mesmo comportamento
  externo de antes (resposta pro painel de teste), agora exercitando o
  Bloco 1 de ponta a ponta antes de qualquer token gasto com a OpenAI.
- ✅ **Ajuste feito durante a implementação, fora do escopo descrito
  originalmente**: as 3 READ tools passaram a receber o client
  Supabase por injeção (`ctx.supabase`) em vez de cada uma chamar
  `createClient()` internamente. Um único client por run (não um por
  tool), e é o que tornou possível testar as tools de verdade sem
  rede/cookies (client simulado em memória cumprindo a mesma
  interface).
- ✅ **15 testes obrigatórios** — 14 rodados como testes de lógica pura
  (`resolveActorContext`/`evaluatePreModelGate`/tools/tool-registry com
  um client Supabase simulado, sem rede — script descartável, não
  commitado) + 1 (run_id auditável) rodado contra Postgres local real
  junto com uma bateria extra de testes de segurança de banco
  (spoof de `actor_profile_id`, run de outro tenant, `anon` sem
  `EXECUTE`, `finish` só por quem abriu, `run_id` de outro dono em
  `log_ai_usage_event`) — todos passando, incluindo um rebuild completo
  do zero rodando TODA a suíte das migrations 0039–0042 juntas sem
  regressão. Detalhe completo na entrega desta rodada.
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.
- ⚠️ **Ponto em aberto, sinalizado na entrega**: o ramo `system` de
  `resolveActorContext` fica implementado e testado isoladamente, mas
  sem nenhum caminho real que o acione neste bloco (sem infraestrutura
  de followup agendado ainda) — e mesmo que existisse, RLS não dá pra
  `anon` acesso de leitura a `conversations`, então um disparo de
  sistema de verdade vai precisar de um client com privilégio elevado
  (service-role ou equivalente) quando esse bloco futuro for
  construído.
- ✅ **Migration 0042 rodada e confirmada em produção** (Supabase).
- ⏳ **Nada além do escopo dos 8 itens** — sem Context Builder
  completo, sem Intent Classifier, sem Competence Router, sem
  `CoreDecision`, sem Response Planner, sem post-model gate, sem
  Approval Engine, sem state machine nova, sem tool de escrita/ação,
  sem resposta automática a cliente, sem WhatsApp/e-mail, sem
  collaborator/booker.

### Auditoria adversarial do Bloco 1 — aprovada

Antes de aprovar o bloco, rodei uma autoauditoria adversarial (não só
happy path) contra os 12 pontos da especificação: isolamento de
tenant, spoof de `ActorContext`, tools fora de contexto, pre-model
gate bloqueando a OpenAI, `eligibleTools`/`resolveRisk` não
manipuláveis, `authorized_collaborator` só preparado, observability
sem dado sensível, RLS/RPCs da 0042 já em produção, ausência de
regressão nas migrations anteriores, ausência de acoplamento contra o
modelo futuro de colaborador/booker, e nada de blocos futuros
implementado cedo demais.

- ⚠️→✅ **2 achados reais, corrigidos no mesmo commit
  (`666134b`)**: `executeTool()` confiava cegamente no array
  `eligibleTools` recebido do chamador em vez de re-derivar a
  elegibilidade de `actorContext.capabilities` — um teste adversarial
  provou que um `eligibleTools` forjado conseguia rodar uma tool fora
  das capabilities reais do ator. Achado relacionado: `ToolContext`
  carregava `representedProfessionalId` solto E dentro de
  `actorContext`, sem checagem de consistência entre os dois. Nenhum
  dos dois tinha exploração real em produção (só um chamador confiável
  existe hoje), mas violavam o mesmo princípio já usado em toda RPC do
  banco: nunca confiar num parâmetro sozinho. Corrigidos, testados
  (testes adversariais A–E), sem regressão.
- ✅ Confirmado por teste real (RLS + filtro): a RLS de
  `opportunities`/`profiles` sozinha É permissiva o suficiente pra
  vazar dado entre tenants (mural público, perfil público) — é o
  filtro explícito de cada tool (`ctx.representedProfessionalId`) que
  fecha isso, não a RLS. Confirmado também que uma FK composta em
  `orchestrator_runs` bloqueia um INSERT direto com par
  conversa/representado inconsistente mesmo bypassando a function
  (defesa em profundidade real, não só de aplicação).
- 📌 **Dívida de hardening registrada pro futuro (fora do escopo de
  qualquer bloco atual)**: mensagens de erro externas (ex.: `err.message`
  de uma falha da API da OpenAI) hoje podem, em tese, ecoar parte do
  request numa mensagem de validação antes de cair em
  `orchestrator_runs.error`/`ai_usage_events`. Nunca foi chain of
  thought nem conteúdo de conversa, e não é um problema introduzido
  neste bloco — mas fica registrado como algo a sanitizar
  explicitamente (allowlist de códigos curtos em vez de repassar a
  mensagem crua do SDK) quando algum bloco futuro tocar observability
  de novo.
- ✅ **Bloco 1 aprovado pelo usuário e PR #3 mesclado** em
  `claude/doopla-backend-login-db-fj5j3y` (merge commit `d7e22d5`).

## 31. Doopla Intelligence Core v1 — Bloco 2: Context Builder v1

Fundação do Context Builder (não "completo" — outras fontes ficam
para etapas futuras: approvals, Professional Brain estruturado,
histórico relacional enriquecido, materiais/documentos, agenda,
preferências de ator, memória episódica, portfolio de
collaborator/booker). Escopo revisado em 2 rodadas antes do código
(estrutura do `ContextPackage`, provenance, budget/janela, tratamento
de texto/áudio/attachment, missing context, testes, confirmação de
"sem migration" — depois `external_participant` incorporado como
quarto papel fundamental antes de qualquer código).

- ✅ **4ª READ tool: `get_external_participant`** — mesma disciplina
  das outras 3 (read-only, `sideEffects:false`, LOW risk, nunca
  recebe um id arbitrário: resolve sempre
  `ctx.conversation.external_participant_id`, filtra sempre por
  `professional_id = ctx.representedProfessionalId`). Participant de
  outro representado → `found:false`, igual ao padrão de
  `get_opportunity`/`get_booking`.
- ✅ **`src/lib/intelligence/context-builder/`** — `types.ts`
  (`ContextPackage`, `ContextFact`, seções, `MessageContextItem`),
  `budget.ts` (limites centralizados + `truncateText`), `sections.ts`
  (profissional/oportunidade/booking/participante externo),
  `messages.ts` (janela de mensagens), `build.ts`
  (`buildContextPackage`, orquestrador), `render.ts`
  (`renderContextForPrompt`, `resolveProfessionalDisplayName`),
  `index.ts` (barrel).
- ✅ **Data / provenance / rendering separados de verdade**:
  `ContextPackage` é 100% estruturado (nunca uma string como fonte de
  verdade) — cada `ContextFact` já carrega a própria proveniência
  (`sourceType`, `sourceId`, `field`, `factType`, `loadedAt`).
  `renderContextForPrompt()` é uma função pura separada que só LÊ o
  pacote — nunca decide autorização/tenant/elegibilidade/risco.
  `test-call.ts` agora usa as duas etapas em sequência, uma única
  implementação de contexto (a lógica própria antiga foi removida).
- ✅ **4 estados por seção** (`loaded`/`not_allowed`/`no_link`/`not_found`)
  para profissional/oportunidade/booking/participante externo — nunca
  tratados como erro. **`not_found` é deliberadamente opaco**: nunca
  diferencia "não existe" de "é de outro representado" — testado
  explicitamente pra nunca virar canal lateral de descoberta
  cross-tenant.
- ✅ **`factType: 'structured' | 'derived'`** already no contrato;
  neste bloco **100% dos fatos são `structured`** — nenhum derivado
  criado (verificado por teste, não só por não ter escrito código
  derivado).
- ✅ **Janela de mensagens = quantidade + recência**, nunca só um
  limite numérico (`CONTEXT_MAX_MESSAGES=10` + `CONTEXT_MESSAGE_WINDOW_DAYS=30`,
  ambas as condições juntas) — testado que uma mensagem antiga de uma
  conversa reaberta não entra mesmo estando sob o limite de
  quantidade. `buildContextPackage` aceita um `now` injetável só pra
  testes determinísticos de janela, sem complicar a API pública.
- ✅ **Texto/áudio/attachment tratados com disciplina**: texto usa
  `body`; áudio só vira texto quando `transcription_status==='done'`
  (nunca `audio_url`); attachment nunca vira conteúdo nesta etapa
  (decisão explícita: nem metadado mínimo, até haver necessidade
  concreta). Tudo truncado por budget quando longo, sempre marcado
  `truncated:true`.
- ✅ **`ActorContext`/isolamento preservados por construção**: o
  Builder só consome `allowedContextSources`/`eligibleTools` já
  calculados pelo pre-model gate — nunca os recalcula, nunca os
  amplia, nunca resolve colaborador sozinho. Nenhum contrato assume
  `actor_profile_id === represented_professional_id` como regra
  estrutural (o Builder só enxerga representado + `ActorContext` +
  conversa + fontes permitidas).
- ✅ **`test-call.ts` refatorado** — não monta mais contexto por conta
  própria; consome só `buildContextPackage()` +
  `renderContextForPrompt()`. Mudança de comportamento registrada: o
  teste antigo abortava se `get_professional_profile` falhasse; agora
  segue em frente com o pacote parcial (`professional: not_found`),
  coerente com "ausência não é erro" — decisão deliberada, não
  descuido.
- ✅ **Testes**: os 17 do escopo + os 7 específicos de
  `external_participant` — todos rodados como lógica pura (client
  Supabase simulado, incluindo simulação de `.gte()`/`.order()`/`.limit()`
  pra reproduzir a query real de mensagens) **e** uma bateria real
  contra Postgres local (RLS de `external_participants` sozinha vs. o
  filtro explícito da tool — mesma prova adversarial do Bloco 1: RLS
  aqui já é estrita, mas o filtro é obrigatório de qualquer forma;
  tentativa de IDOR com id exato de B; opacidade de inexistente vs.
  cross-tenant; `anon` bloqueado; regressão de isolamento de
  `opportunities` num rebuild fresco). Regressão completa do Bloco 1
  (14 testes + 5 adversariais) re-executada sem falha real (1 asserção
  desatualizada no teste antigo, corrigida — não era uma regressão de
  comportamento).
- ✅ `npm run build`, `npx tsc --noEmit`, `npx eslint` limpos.
- ✅ **Nenhuma migration** — usa só as 4 READ tools e
  `conversation_messages`, como planejado.
- ⏳ Continua fora: Intent Classifier, Competence Router completo,
  `CoreDecision`, Response Planner, Post-model Policy Gate, Approval
  Engine, nova State Machine, tools de escrita/ação, resposta
  automática, WhatsApp/e-mail, collaborator/booker, portfolio context,
  Actor Preferences, painel, memória vetorial/embeddings,
  interpretação de documentos/PDFs, histórico relacional enriquecido.

### Auditoria adversarial do Bloco 2 — achado real corrigido

Antes de aprovar, auditoria focada especificamente em "ausência de
informação" vs. "falha ao consultar informação" — a distinção que
`not_found` (opaco de propósito, entre "não existe" e "é de outro
representado") não podia carregar mais um terceiro significado sem
virar perigoso.

- ⚠️→✅ **Achado real, não hipotético**: nenhuma das 4 READ tools
  checava o campo `error` da resposta do Supabase — todas tratavam
  `data === null` como "não encontrado", sem distinguir "consultei e
  não achei" de "a consulta falhou de verdade" (rede/timeout/banco).
  Um erro real de banco ao buscar um `booking` virava silenciosamente
  `not_found`, e a Doopla podia concluir "não existe booking" quando
  na real só não deu pra checar. Mesmo bug nas 4 tools e na query
  direta de mensagens do Builder.
- ✅ **Corrigido**: as 4 tools agora checam `error` explicitamente
  (`execution_failed` sanitizado, nunca a mensagem crua do
  Supabase/SDK) antes de tratar ausência como `found:false`.
  `get_professional_profile` ganhou o mesmo formato discriminado
  `{found:true, profile}|{found:false}` das outras 3 (antes era
  assimétrica — só ela não distinguia as duas coisas). Novo estado
  `'unavailable'` em `ContextSection`/`MessagesSection` — nunca
  colapsa com `not_found`/`loaded`. `renderContextForPrompt()` nunca
  silencia nem afirma "não existe" pra uma seção `unavailable`; avisa
  explicitamente "não foi possível consultar — não presuma" sem
  vazar detalhe técnico. `buildContextPackage()` agora também devolve
  `unavailableSources` (seção + `reasonCode` sanitizado, tipado a
  partir de `ToolExecutionError`) pra quem chama decidir o que fazer
  — `test-call.ts` já usa isso pra marcar `fallback_used`/anotar
  `orchestrator_runs.error` de forma sanitizada.
- ✅ **Outros achados corrigidos na mesma auditoria**: `truncateText()`
  podia cortar no meio de um par substituto UTF-16 (emoji), deixando
  texto malformado — corrigido pra nunca deixar um surrogate alto
  sozinho no fim. Query de mensagens sem tiebreaker determinístico
  (duas mensagens com o mesmo `created_at` podiam ordenar de forma
  não-determinística entre execuções) — corrigido com `order by id`
  como segunda chave.
- ✅ **Provenance resistiu à tentativa de quebra**: nenhum fato de uma
  seção aparece com `sourceType` de outra, mensagem de outra
  conversa nunca aparece na lista, truncamento preserva
  `sourceType`/`sourceId`/`field` intactos, nenhum campo duplicado
  dentro de uma seção, renderer comprovadamente somente-leitura
  (nunca muta o `ContextPackage`).
- ✅ **Casos de anomalia de dado tratados com segurança**: áudio
  `done` com transcript vazio → sem texto (nunca string vazia como
  conteúdo); `pending` com transcript preenchido por engano → ignorado
  (só confia no par status+transcript, nunca um sozinho); attachment
  com `body` preenchido por engano → ignorado (content_type sempre
  manda).
- ✅ **68 checks de lógica pura + 13 checks reais contra Postgres
  local** (incluindo re-teste de `external_participant` com o cenário
  extra "mesmo telefone em profissionais diferentes" — RLS/tool
  continuam escopando por `professional_id`, nunca por telefone) —
  todos PASS. Regressão completa (Bloco 1 + adversariais do Bloco 1 +
  Bloco 2 original) re-executada sem falha real — as 3 falhas que
  apareceram no meio do processo eram todas asserções de teste
  desatualizadas contra uma mudança de contrato desta própria rodada
  (`get_professional_profile` virou discriminado; `context_inconsistent`
  virou `unavailable` em vez de `not_found`), nunca uma regressão de
  comportamento. `npm run build`/`tsc`/`eslint` limpos.
- ✅ **Matriz de contexto parcial confirmada**: `no_link`/`not_found`/
  fonte opcional `not_allowed` seguem normalmente; falha operacional
  de fonte não-crítica vira `unavailable` e o Builder continua (nunca
  aborta o pacote inteiro por uma seção); tenant/identidade incertos
  continuam falhando fechado — mas essa decisão já acontece ANTES do
  Builder rodar (`resolveActorContext`/`evaluatePreModelGate`), o
  Builder em si nunca decide isso, só consome o resultado.
- ✅ **Bloco 2 aprovado pelo usuário e PR #4 mesclado** em
  `claude/doopla-backend-login-db-fj5j3y` (merge commit `e2689f4`).

## 32. Doopla Intelligence Core v1 — Bloco 3: Intent Classifier + Competence Router (implementado, aguardando auditoria)

Primeira vez que uma chamada ao model participa de uma decisão real do
Core (Blocos 1-2 são determinísticos, exceto o teste de infra
isolado). Escopo estritamente PERCEPÇÃO — "o que está acontecendo" +
"quais competências são relevantes" — nunca ação. Duas rodadas de
revisão de escopo antes do código (separação intent/competência,
`ClassificationContext` leve, `modelConfidence`/`effectiveConfidence`
separados, `contextCompleteness` calculado por dependência de intent,
`classificationStatus` com `invalid` só decidido em código).

- ✅ **`src/lib/intelligence/classification/`** — `intents.ts` (14
  intents + `outro`, taxonomia extensível sem check no banco),
  `competencies.ts` (as 7 competências + `routeCompetencies()`
  determinístico, união sempre na mesma ordem), `types.ts`
  (`ClassificationContext`, `IntentClassification` — sem nenhum campo
  de tool/action/approval/state/response/message, estrutural),
  `classification-context.ts` (projeção leve do `ContextPackage` —
  mensagem-gatilho + até 2 anteriores, identidade mínima dos dois
  lados, tipo/estado da conversa, flags de status por seção; nunca
  bio longa/booking inteiro), `completeness.ts` (tabela intent→fontes
  dependentes, `not_allowed` nunca conta como incompletude),
  `confidence.ts` (`effectiveConfidence` só pode descer, nunca subir
  acima de `modelConfidence`), `prompt.ts`, `config.ts`
  (`CLASSIFIER_MODEL='gpt-5-mini'`, mesma ressalva de "não é modelo
  definitivo" do teste de infra), `classify.ts` (orquestrador —
  Structured Outputs via `zodTextFormat`/`client.responses.parse`,
  client model call injetável pra testes, retry único, nunca lança).
- ✅ **Separação intent/competência real**: o schema que o model
  preenche não tem campo de competência nenhum — `relevantCompetencies`
  só é preenchido depois, em código, pelo `CompetenceRouter`. Testado
  adversarialmente: um model call simulado que tenta forjar um campo
  de competência extra na resposta tem esse campo simplesmente
  ignorado.
- ✅ **Migration 0043**: `orchestrator_runs` ganha 7 colunas aditivas
  de classificação. `primary_intent`/`secondary_intents`/
  `competencies` ficam como texto livre de propósito (taxonomia
  extensível, validada em código) — só `model_confidence`/
  `effective_confidence`/`context_completeness`/`classification_status`
  (vocabulário arquitetural estável) ganham check constraint.
  `finish_orchestrator_run()` estendido (drop+create, mesma disciplina
  da 0042) com os 7 parâmetros novos, todos opcionais. `anon` já
  nasce sem `EXECUTE`, confirmado por teste.
- ✅ **`test-call.ts`** passa a classificar a intenção logo após montar
  o `ContextPackage` — mas nunca decide nada a partir disso; o
  resultado só é retornado (pro painel de teste) e registrado em
  `orchestrator_runs`/`ai_usage_events`. `classifyIntent()` nunca
  lança: qualquer falha cai num fallback determinístico
  (`classificationStatus:'invalid'`, `primaryIntent:'outro'`,
  `effectiveConfidence:'low'`).
- ✅ **20 testes de lógica pura** (model call simulado, incluindo um
  client Supabase "armadilha" que lança exceção em qualquer
  `.from()`/`.rpc()` — prova que a classificação nunca toca o banco) +
  **13 testes reais contra Postgres local** pra migration 0043 (grava
  metadados corretamente, check constraint rejeita vocabulário
  inválido, `primary_intent` aceita texto livre, `anon` bloqueado) —
  todos PASS. Regressão completa dos Blocos 1 e 2 (14+5+29+34 checks)
  sem falha. `npm run build`/`tsc`/`eslint` limpos.
- ⏳ Continua fora: Response Planner, `CoreDecision` operacional,
  Post-model Policy Gate completo, execução de tool a partir do
  model, Approval Engine, nova State Machine, tools de escrita/ação,
  resposta automática, WhatsApp/e-mail, collaborator/booker, Actor
  Preferences, painel, memória vetorial/embeddings.

### Auditoria adversarial do Bloco 3 — achado real corrigido + 2 ajustes pós-aprovação

Auditoria partindo do princípio de que output/confidence do model e
texto do usuário são não confiáveis. Cobriu: 15 intents com exemplos
adversariais, prompt injection, Competence Router, multi-intent,
confidence (sweep exaustivo de 648 combinações), context completeness
(os 5 estados + precedência + multi-intent), vazamento de
`ClassificationContext`, provenance/imutabilidade, falhas da OpenAI,
migration 0043 contra Postgres real (incl. tentativa de spoof
cross-tenant via `finish_orchestrator_run`), concorrência, escala.

- ⚠️→✅ **Achado real**: `secondaryIntents` do model não era
  deduplicado nem tinha `primaryIntent` removido — um model repetindo
  valores inflava artificialmente a heurística de confiança "muitos
  secundários" e sujava `orchestrator_runs.secondary_intents` com
  ruído. Corrigido em `classify.ts`: dedupe + remoção do primary antes
  de qualquer cálculo posterior. Confirmado com array de 500
  elementos/2 valores únicos.
- ✅ **Lacuna real de taxonomia encontrada e documentada** (não
  corrigida na hora, por instrução explícita da auditoria): nenhum
  intent cobria "estado/acontecimento financeiro de um booking já
  existente" (ex.: "Recebi metade.").
- ✅ **Ajuste pós-aprovação 1 — taxonomia corrigida**: novo intent
  `financeiro_booking` (15º), roteando deterministicamente só pra
  `financeiro`. Fronteira explícita no prompt contra
  `orcamento`/`desconto`/`condicao_pagamento`/`cobranca`/
  `booking_update` (ex.: "fechei sábado por 3 mil" continua
  `booking_update` — o preço do acordo não é um evento financeiro
  separado; só vira `financeiro_booking` secundário quando a mensagem
  relata um evento de dinheiro à parte, como "...já recebi o sinal").
  **Nenhuma migration nova** — `primary_intent`/`secondary_intents`/
  `competencies` já são texto livre sem check constraint na 0043,
  exatamente pra isso; confirmado contra Postgres real com o valor
  literal `financeiro_booking`, migration 0043 intocada. Red Team
  dedicado da fronteira (21 checks) + regressão completa — sem falha.
- ✅ **Ajuste pós-aprovação 2 — golden suite semântica**: adicionado
  `src/lib/intelligence/classification/golden-suite.ts` (32 casos
  reais: inequívocos, ambíguos, multi-intent, coloquiais, erro de
  português, transcript de áudio imperfeito, inglês, mistura PT/EN,
  sem intenção operacional, mudança de assunto no meio, dependente de
  mensagem anterior, e os 6 casos financeiros novos) e uma rota dev
  isolada (`/dev/classification-golden-suite`) que roda cada caso
  contra o model REAL — `ContextPackage`/conversa sintéticos em
  memória, zero gravação em banco, mesma abstração já auditada
  (`getOpenAIClient()`, chave nunca sai do servidor). **Não executado
  por mim** — este sandbox não tem `OPENAI_API_KEY` (só existe no
  ambiente Preview); pronta pra o usuário rodar e reportar
  input/esperado/retornado/confidences/status/PASS-FAIL por caso.
- ✅ Regressão completa (Blocos 1–3 + todos os adversariais, ~130
  checks de lógica + 20 reais contra Postgres) sem falha real.
  `npm run build`/`tsc`/`eslint` limpos.
- ✅ **Golden suite real rodada em Preview pelo usuário: 28/32.**
  Causa raiz de cada FAIL/PASS suspeito investigada abaixo — sem
  ajustar `expected` só pra fazer passar, sem criar intent novo
  silenciosamente, sem tuning pra frases específicas.

### Rodada 2 do Bloco 3 — correções pós-golden-suite real (28/32)

**FAIL #9** ("Faz uma bio minha mais curta pro Instagram." → esperado
`material_profissional`, recebido `outro`) **e a metade
`rider`→`material_profissional` do FAIL #25**: causa raiz é a mesma —
`material_profissional` (como a maioria dos 15 intents além de
`booking_update`/`financeiro_booking`) não tinha NENHUMA definição
semântica no prompt além do próprio nome do enum; o model precisava
adivinhar o significado só pelo identificador. Corrigido com uma regra
geral no prompt: `material_profissional` cobre materiais de
apresentação/divulgação do próprio profissional (bio, press kit,
portfólio, fotos/vídeos promocionais), com exclusão explícita de
`rider` (documento técnico de produção, sempre `rider`, nunca vira
"material" por ser um texto). Não é uma regra sobre "faz uma bio" —é
sobre a categoria completa de autoapresentação profissional.

**FAIL #13** ("Não quero mais lembrete no dia que eu vou tocar." →
esperado `treinamento_profissional`, recebido `suporte`): mesma
categoria de causa (zero definição no prompt) + a própria palavra
"treinamento" soa mais como "ajuda/suporte" do que "o profissional
calibrando o comportamento do assistente". Não renomeado (fora de
escopo sem aprovação explícita — sinalizado como decisão futura
opcional). Corrigido com regra geral no prompt distinguindo
"profissional dando preferência/instrução sobre como a Doopla deve
tratá-lo dali em diante" (`treinamento_profissional`) de "profissional
relatando que algo não funciona na plataforma" (`suporte`).

**FAIL #25** (metade `logistica` vs. `booking_update`): antes de
corrigir, revisão conceitual da fronteira, decidida independente do
caso de teste específico — a DATA/HORÁRIO em que o trabalho acontece é
termo central do acordo, no mesmo grupo de "o trabalho existe"/"foi
cancelado": mudar isso é sempre `booking_update`, nunca `logistica`.
`logistica` fica reservada pra coordenação de EXECUÇÃO de um evento
cujos termos centrais já estão fixados (endereço, acesso,
estacionamento, horário de chegada pra montagem). Prompt atualizado
com essa regra geral; `golden-suite.ts` corrigido para
`['booking_update', 'rider']` (a regra foi decidida primeiro, o dado
do teste corrigido depois pra refletir a regra — não o contrário).

**FAIL #31** ("...vocês fazem eventos corporativos também?" →
recebido `outro`): concluído que a resposta do model foi
provavelmente correta e conservadora, e que o `expected` original do
teste é que estava errado — o segundo tópico da mensagem é uma
pergunta sobre ESCOPO/TIPO de serviço oferecido, e nenhum dos 15
intents cobre isso (não é orçamento de um trabalho específico, não é
disponibilidade, não é suporte técnico). **Lacuna real de taxonomia
documentada, não implementada**: candidato a intent futuro tipo
`consulta_servico`, decisão pendente do usuário. `golden-suite.ts`
corrigido pra aceitar `outro` como resposta válida neste caso
específico, com nota explicando a lacuna.

**PASS suspeito #8** ("E a nota?" → `cobranca`, confidence HIGH sem
contexto) **e #21** ("quanto?" → `orcamento`, o próprio teste descreve
como genuinamente ambíguo, mas media/high "por sorte" contava como
PASS): causa raiz estrutural — `confidence.ts` só tinha regra pra
texto totalmente VAZIO, nenhuma regra pra mensagem CURTA sem
contexto. Nova regra geral, em código (não no prompt — autoridade de
confidence é sempre do código, nunca do model):
`shortMessageWithoutContext` (gatilho ≤3 palavras E nenhuma mensagem
anterior no recorte) nunca permite `effectiveConfidence` acima de
`medium`, mesmo que `modelConfidence` tenha vindo `high`. Efeito
colateral aceito e verificado explicitamente: também limita mensagens
financeiras curtas e claras (“Entrou o restante.”, “Ainda faltam
R$800.”) a `medium` — comportamento conservador consistente com a
prioridade do projeto, não um bug a esconder.

Adicionalmente, o próprio critério de PASS da golden suite era
permissivo demais pra casos genuinamente ambíguos (bastava acertar UM
valor da lista, mesmo que a classificação não tivesse reconhecido a
própria incerteza). Novo campo `expectAmbiguous` em
`GoldenSuiteCase` + critério de PASS mais estrito em
`runGoldenSuiteAction()`: quando marcado, só passa se
`classificationStatus === 'ambiguous'` OU `effectiveConfidence !==
'high'`, além do intent bater. Aplicado aos 4 casos genuinamente
ambíguos ("quanto?", "pode ser", "fechou", "sim, pode ser"). Revisão
dos 32 casos completos não encontrou outros PASS-permissivos além
destes.

**Testes**: novo arquivo Red Team (rodado via `npx tsx`, nunca
commitado) com casos positivos E negativos pra cada regra nova —
`shortMessageWithoutContext` isolada em `confidence.ts`, o cálculo
real em `classify.ts` (gatilho curto+sem histórico vs. gatilho
curto+com histórico vs. gatilho longo vs. gatilho vazio), o critério
`expectAmbiguous` da golden suite (incluindo o cenário exato do bug do
PASS #21), e regressão estrutural do roteamento de competência pras
fronteiras tocadas no prompt (`rider`/`material_profissional`,
`treinamento_profissional`/`suporte`, `booking_update`/`logistica`) —
a prova semântica das mudanças de PROMPT em si só é possível pela
golden suite real (que já embute os casos negativos: o caso "rider"
nunca deveria virar `material_profissional`, o caso "logística" nunca
deveria virar `booking_update`, etc.). Regressão completa de todos os
Blocos 1–3 (8 suítes, ~150 checks) sem falha. `npm run build`/`tsc`/
`eslint` limpos. **Nenhuma migration alterada/criada** — mudanças são
só texto de prompt + lógica de confidence em código + dados de teste;
confirmado que 0043 continua a última migration.

- ✅ **Segunda golden suite real rodada em Preview pelo usuário:
  31/32.** Único FAIL analisado e corrigido abaixo.

### Rodada 3 do Bloco 3 — hardening de ambiguidade pra respostas dependentes de contexto (31/32)

**FAIL único**: "sim, pode ser" isolado (sem histórico) devolveu
`disponibilidade` + `booking_update` + `orcamento`, com
`classificationStatus`/`effectiveConfidence` corretamente
conservadores (`ambiguous`/`low`) — o status/confidence já estavam
certos; o problema era o CONTEÚDO fabricado: o model inventou 3
leituras operacionais específicas pra uma frase que, isolada, não tem
nenhum conteúdo temático próprio, só confirma algo fora dela mesma.

**Causa raiz**: nenhuma regra no prompt distinguia "mensagem
genuinamente ambígua com conteúdo próprio" (ex.: "quanto?" — é sobre
preço, só não se sabe de qual dos 3 sentidos) de "confirmação solta
sem conteúdo temático próprio, dependente inteiramente de uma
mensagem anterior que não está disponível" (ex.: "sim, pode ser",
"fechado", "beleza") — o model tratava as duas categorias do mesmo
jeito, "chutando" leituras plausíveis pra ambas.

**Correção — regra geral no prompt, sem hardcode/regex**: como pedido
explicitamente, a correção NÃO é uma lista de palavras em código nem
um filtro determinístico por contagem — é uma instrução de julgamento
semântico geral, com exemplos só ilustrativos (mesmo padrão das
outras regras do prompt):
1. Resposta que só faz sentido em função de mensagem anterior, sem
   conteúdo temático próprio, e sem essa mensagem anterior disponível
   no contexto → `primaryIntent="outro"`, `classificationStatus=
   "ambiguous"`, `modelConfidence="low"` — nunca fabricar uma leitura
   operacional específica só porque seria plausível em abstrato.
2. Mais geral ainda: mensagem curta sem contexto anterior cujo texto,
   sozinho, não tem NENHUM elemento temático que distinga entre
   leituras (ex.: "quanto?") → `classificationStatus="ambiguous"`,
   não uma escolha única "confiante". Diferente de mensagem curta que
   JÁ tem âncora temática própria (ex.: "E a nota?" tem "nota", que
   aponta pra cobrança mesmo sem contexto) — essa continua com leitura
   única, só com confiança reduzida (regra do round 2, inalterada).

**Sobre "quanto?" especificamente**: avaliado e decidido NÃO forçar
`ambiguous` deterministicamente em código por contagem de palavras —
isso destruiria exatamente a distinção acima (uma regra de código não
sabe diferenciar "quanto?" de "E a nota?"; ambas são curtas e sem
contexto, mas só a primeira é genuinamente multi-referente). A
correção é inteiramente de prompt/julgamento do model; validação real
depende da golden suite ao vivo.

**Golden suite**: 6 novos casos isolados ("sim", "fechado", "beleza",
"isso", "pode", "acho que sim"), todos `expectAmbiguous`, mais um
CONTROLE NEGATIVO — a mesma palavra ("fechado") mas agora com uma
mensagem anterior suficiente no contexto (`previousMessages`, campo
novo no tipo `GoldenSuiteCase`, suportado agora por
`buildSyntheticContext` em `actions.ts`), esperando uma leitura
específica (`booking_update`), não `outro` — prova que a regra não
deveria disparar quando há contexto real. Casos #19/#24/#25/#31 (na
numeração da rodada anterior) intencionalmente não tocados.

**Testes**: novo Red Team estrutural (sem rede) provando que (a) o
código NUNCA sobrescreve o conteúdo que o model devolve — a decisão
semântica é sempre do model/prompt, nunca fabricada em código; (b) o
contexto anterior fornecido pela golden suite chega corretamente até
`ClassificationContext` (`buildClassificationContext`); (c) com
contexto suficiente presente, a regra de confidence "mensagem curta
sem contexto" (round 2) não dispara; (d) sem contexto, ela continua
ativa; (e) sanidade dos novos casos da golden suite e confirmação de
que os casos protegidos não foram alterados. Regressão completa de
todos os Blocos 1–3 (9 suítes) sem falha. `tsc`/`eslint`/`build`
limpos. **Nenhuma migration alterada/criada** — 0043 continua a
última.

- ✅ **Terceira golden suite real rodada em Preview pelo usuário:
  39/39.** Bloco 3 aprovado e **mesclado** (PR #5, commit `bcbcc11`,
  em `claude/doopla-backend-login-db-fj5j3y`).

## 33. Doopla Intelligence Core v1 — Bloco 4: Structured Decision + Response Planner v1 (dry-run) (implementado, aguardando auditoria adversarial)

Camada de PLANEJAMENTO do Core — depois da percepção (Bloco 3), antes
de qualquer ação real (que ainda não existe). PERCEBER → PLANEJAR,
nunca PLANEJAR → AGIR: nenhuma saída do Planner produz efeito
colateral, nada é enviado, nenhuma tool de escrita executa, nenhuma
approval é criada, nenhum state/booking/opportunity muda.
`requiresProfessionalReviewBeforeSend` é literal `true`, reforçado em
três camadas independentes (tipo TS, fora do schema do model, CHECK no
banco).

Três invariantes estruturais desenhadas com o usuário antes do código:
**CONHECER ≠ APROVAR ≠ COMPROMETER**, **INTENÇÃO ≠ DECISÃO**,
**CONHECER ≠ COMPARTILHAR** (disclosure é responsabilidade do
Post-model Policy Gate futuro, não deste bloco).

- `src/lib/intelligence/planner/`: `response-plan.ts` (8 valores de
  `ResponsePlan`; só 6 disponíveis pro model — `wait_for_external_
  participant`/`wait_for_professional` ficam no contrato mas são
  estruturalmente impossíveis de o model v1 produzir, faltando Pending
  Work real), `decision-categories.ts` (13 `ProfessionalDecisionCategory`
  + `INTENT_MANDATORY_DECISION_CATEGORIES` — só pisos *realmente*
  universais por intent; o resto o model propõe e o código só valida/
  une, nunca remove), `types.ts` (`PlannerDecision`, `CommitmentNature`
  — `report_existing_fact`/`new_or_changed_commitment`/`not_applicable`
  — e `ProfessionalDecisionSignal`, sinal NÃO-autoritativo —
  `candidate_contextual` nunca significa aprovação), `planner-context.ts`
  (projeção do `ContextPackage` diferente da do Classifier: aqui
  precisa dos FATOS de verdade, não só flags, pra poder citar
  `EvidenceUsed` com provenance real), `invariants.ts` (autoridade
  final do contrato — o model propõe, código só torna mais
  conservador), `plan.ts` (`planResponse()`, mesmo padrão de DI de
  `classifyIntent()`), `golden-suite.ts`, `prompt.ts`, `config.ts`.
- `EvidenceUsed` (não só `ContextFact`): aponta pra fatos estruturados
  OU pra uma `conversation_message` inteira (nunca fatiada por frase),
  mesmo `sourceType` que o Context Builder já usa pra provenance de
  mensagem.
- `answer_with_known_information` só é permitido quando
  `requiresProfessionalDecision === false` — que por sua vez só é
  `true` quando `commitmentNature === 'new_or_changed_commitment'`
  *e* isso ativou pelo menos uma categoria (mandatória ou proposta
  pelo model e validada). "Qual foi mesmo o valor combinado?" com
  booking existente → `report_existing_fact`, sem decisão nova. "Pode
  fazer por R$2.500?" → `new_or_changed_commitment`, sempre consulta.
- `commitmentNature='report_existing_fact'` só sobrevive com
  `EvidenceUsed` grounded de verdade contra o `ContextPackage` — sem
  lastro, código rebaixa pra `new_or_changed_commitment` (nunca o
  contrário).
- `professionalDecisionSignal`: força `'none'` pra qualquer autor que
  não seja o profissional; `'candidate_contextual'` só sobrevive com
  evidência grounded, senão vira `'candidate_ambiguous'` (→
  `clarify_ambiguity`). "Fechado" do profissional com proposta
  completa no contexto → `candidate_contextual`, nunca aprovação real;
  sem contexto → `clarify_ambiguity` dirigido a ele.
- `no_response_needed` reservado pra gatilho sem texto utilizável —
  qualquer mensagem humana real (mesmo "Bom dia! Tudo bem?") vira no
  mínimo `acknowledge`, nunca silêncio.
- `wait_for_*` desabilitado estruturalmente no v1 (fora do schema do
  model) — fica no enum só pro contrato futuro, quando Pending Work
  existir.
- Observability: migration `0044`, aditiva em `orchestrator_runs`
  (mesmo padrão da 0043) — `response_plan`/`professional_decision_signal`
  ganham CHECK (vocabulário estável), `professional_decision_category`
  fica sem CHECK (array de vocabulário extensível, mesmo raciocínio de
  `competencies`). Nunca persiste `proposedResponse`/
  `missingInformation`/`evidenceUsed` em detalhe — só contagens.
  `requires_professional_review_before_send` tem CHECK `= true` —
  confirmado contra Postgres real que um `UPDATE` direto tentando
  `false` é fisicamente rejeitado pelo banco, não só impedido em
  TypeScript.
- `test-call.ts` passa a chamar `planResponse()` depois de
  `classifyIntent()` — resultado só registrado/retornado, nunca
  consome a decisão do Planner pra decidir a resposta de teste em si.
- Golden suite (`/dev/planner-golden-suite`, mesmo padrão seguro do
  Bloco 3) com os casos exigidos: relato de fato existente (valor/
  endereço) vs. novo compromisso (desconto/mudança de endereço que
  compromete), social sempre com `acknowledge`, profissional
  reportando fato vira `acknowledge`, "Fechado" com/sem contexto,
  controle de que `requiresProfessionalReviewBeforeSend` nunca sai de
  `true`. **Não executada por mim** — ambiente sem `OPENAI_API_KEY`,
  mesma limitação honesta do Bloco 3.
- Testes determinísticos/adversariais (40 checks): grounding de
  `EvidenceUsed` contra `ContextPackage` real (positivo/negativo/
  inventado), `resolveCommitmentNature` nunca promove sem lastro,
  `computeDecisionCategories` prova INTENT≠DECISION e união-nunca-
  subtração, `resolveProfessionalDecisionSignal`, todos os pisos de
  `resolveResponsePlan`, fim-a-fim com `planResponse()` (incl. fato
  inventado pelo model sendo pego, model "mentindo" sendo rebaixado,
  falha total do model caindo em fallback conservador, draft
  descartado quando o plano final diverge do proposto), concorrência.
  "Trap" supabase prova estruturalmente que `planResponse()` nunca
  toca `supabase.from()`/`.rpc()`. Regressão completa (10 suítes, ~190
  checks) sem falha. `npm run build`/`tsc`/`eslint` limpos. Migration
  0044 validada contra Postgres real, incluindo os dois `CHECK`
  físicos (`requires_professional_review_before_send`/`response_plan`)
  rejeitando update direto fora do contrato.
- ✅ **Bloco 4 aprovado para freeze** — commit auditado `10c7154`.
  Congelado: nenhuma alteração no código do Planner sem razão
  arquitetural demonstrável. As 3 limitações documentadas na
  auditoria viraram requisitos obrigatórios do Post-model Policy Gate
  (seção abaixo). PR ainda não criado — merge aguardando confirmação
  explícita.

### Auditoria adversarial do Bloco 4 (commit `ede4a8b`) — PASS COM RESSALVAS, 5 achados reais corrigidos

Objetivo explícito: provar que a arquitetura está errada, não confirmar
que os testes passam. Cobriu os 18 pontos pedidos: INTENT≠DECISION
(minimal pairs), KNOW≠SHARE (grep estrutural), KNOW≠APPROVE≠COMMIT
(precedente histórico), coreferência de `professionalDecisionSignal`,
quebra de `EvidenceUsed`, categorias propostas pelo model, draft
adversarial, disponibilidade/corporativo-privado, `acknowledge` vs.
silêncio, `wait_for_*`, falhas/indisponibilidade, tenant isolation
(Postgres real, rebuild 0001–0044 do zero), observability/privacy,
concorrência/determinismo, golden suite, regressão completa.

**5 achados reais, todos corrigidos com teste de regressão**:
1. `answer_with_known_information` (severidade alta) não exigia
   NENHUMA evidência grounded — um model podia declarar essa resposta
   com `evidenceUsed` vazio (nada citado, ou tudo descartado na
   validação) e nada bloqueava um draft fabricado. Corrigido: piso
   novo em `resolveResponsePlan` — sem evidência validada, rebaixa
   pra `consult_professional`, mesmo com `requiresProfessionalDecision
   =false`. Achado via cenário "booking `unavailable` + model
   alucinando um fato".
2. `orcamento`/`desconto` podiam virar `report_existing_fact` citando
   evidência REAL mas do valor ANTIGO/errado (ex.: "Pode fazer por
   R$2.500?" citando o cachê antigo de R$3.000 como se "confirmasse"
   um relato). Corrigido: piso determinístico — esses dois intents,
   por definição do Bloco 3, são sempre negociação prospectiva, nunca
   relato, então nunca podem ser `report_existing_fact`, com ou sem
   evidência.
3. `professionalDecisionSignal="candidate_contextual"` só exigia
   "alguma evidência", nunca uma evidência ANCORADA EM CONVERSA —
   fatos estruturados de fundo sozinhos (sem nenhuma mensagem real)
   não provam que uma proposta foi de fato comunicada. Corrigido:
   exige pelo menos uma evidência `conversation_message` entre as
   grounded.
4. `wait_for_external_participant`/`wait_for_professional` eram
   impossíveis só por estarem fora do schema do model — sem piso de
   código redundante caso um bug futuro afrouxasse o schema.
   Adicionada defesa em profundidade em `resolveResponsePlan`.
5. Arrays controlados pelo model (`evidenceUsed`/`missingInformation`)
   não tinham limite — um model quebrado podia devolver milhares de
   itens (custo de token, ruído em observability). Adicionado
   `MAX_EVIDENCE_USED`/`MAX_MISSING_INFORMATION` (corte determinístico,
   preserva ordem).

Prompt reforçado com 2 regras gerais (não caso-específicas): precedente
histórico de outro trabalho/data nunca sustenta `report_existing_fact`
("da última vez foi X" é sempre `new_or_changed_commitment`); o draft
nunca pode afirmar mais do que os campos estruturados sustentam (nunca
"podemos confirmar"/"está confirmado" quando não há decisão tomada).

**Limitações documentadas, não fecháveis em código no Bloco 4** (ver
relatório completo entregue ao usuário): (a) coreferência completa de
`professionalDecisionSignal` — evidência ancorada prova que uma
mensagem real existe, nunca que é A proposta vigente entre duas
concorrentes; (b) draft adversarial — nenhum mecanismo determinístico
pode validar que o TEXTO do draft não implica compromisso além do que
os campos estruturados garantem; (c) `booking_update`/`condicao_pagamento`
continuam dependendo do julgamento semântico do model pra distinguir
relato de mudança (só `orcamento`/`desconto` têm piso determinístico
por serem sempre prospectivos). Os três são riscos explícitos que o
Post-model Policy Gate (ou uma verificação de conteúdo dedicada)
precisa endereçar antes de qualquer capacidade de envio existir.

Golden suite ampliada com 15 novos casos (minimal pairs READ vs.
CHANGE, precedente histórico, corporativo vs. privado, fonte ausente,
sinal em tópico errado). 80 checks determinísticos/adversariais novos
(rebuild de Postgres do zero incl. isolamento de tenant específico do
Planner, `anon` sem EXECUTE, runs antigos continuam válidos) +
regressão completa (10 suítes, ~230 checks) sem falha. `build`/`tsc`/
`eslint` limpos. **Nenhuma migration nova** — todas as correções são
prompt/lógica de código/dados de teste; `0044` continua a última.

### Post-model Policy Gate — requisitos obrigatórios de segurança (fixados na aprovação de freeze do Bloco 4)

As 3 limitações documentadas na auditoria adversarial do Bloco 4 não
são mais "riscos conhecidos" — são requisitos de entrada obrigatórios
pro Post-model Policy Gate, definidos pelo usuário no momento da
aprovação de freeze. Nenhuma capacidade real de envio/escrita pode ser
habilitada antes destes três controles existirem:

1. **Coreferência e proposta vigente**: uma `EvidenceUsed` do tipo
   `conversation_message` grounded não é suficiente pra tratar uma
   confirmação como válida. Antes de qualquer mensagem que produza
   compromisso, o Gate precisa verificar semanticamente que o aceite
   se refere inequivocamente à proposta/condição ATUALMENTE em
   questão. Duas ou mais propostas, alterações sucessivas, referente
   ambíguo ou escopo incerto → bloquear compromisso, consultar o
   profissional.
2. **Semantic Draft vs. Authorized Scope**: o Gate precisa verificar o
   CONTEÚDO efetivamente redigido em `proposedResponse`, não só
   `responsePlan`/`commitmentNature`/`professionalDecisionCategory`/
   `evidenceUsed`. O draft não pode afirmar, aceitar, prometer ou
   implicar nenhuma decisão comercial/operacional além do escopo
   explicitamente autorizado e grounded. Exemplo crítico fixado pelo
   usuário: "O cachê é R$3.000 e podemos confirmar" — mesmo com
   R$3.000 grounded, "podemos confirmar" é compromisso adicional sem
   aprovação correspondente e precisa ser bloqueado.
3. **Relato vs. mudança**: pra `booking_update`/`condicao_pagamento`/
   demais categorias mutáveis, o Gate NÃO pode confiar só na
   classificação semântica do Planner (`commitmentNature`) pra
   distinguir `report_existing_fact` de proposta/mudança — precisa
   verificação própria de se o draft só relata estado já aprovado ou
   introduz/altera condição.

**Fail closed** é o princípio geral: em dúvida semântica, ambiguidade,
conflito de evidência ou impossibilidade de provar autorização
suficiente, nunca enviar como compromisso — sempre escalar pra
consulta/aprovação.

**Não alterar o Bloco 4 (congelado) pra absorver estas
responsabilidades sem uma razão arquitetural demonstrável** — são
responsabilidades do Gate, não do Planner.

## 34. Doopla Intelligence Core v1 — Bloco 5: Approval Engine (implementado, aguardando auditoria adversarial da implementação)

Camada que representa formalmente o que o profissional efetivamente
APROVOU — não o que ele comunicou, não o que a contraparte aceitou.
KNOW ≠ COMMUNICATED ≠ APPROVED ≠ COMMITTED. Fonte de verdade: SPEC
CONSOLIDADA V3.10 (10 rodadas de revisão adversarial só de desenho,
V1→V3.10, sem uma linha de código até a aprovação final do usuário).
Não implementa Post-model Policy Gate, não habilita envio, não cria
tool de escrita, não altera o Bloco 4 (congelado).

- ✅ **Migration `0045_approval_engine.sql`**: `bookings.originated_from_opportunity_id`
  (única coluna nova em tabela pré-existente — fecha a lacuna que a
  0007 já descrevia em comentário e nunca implementou); 6 tabelas novas
  (`approval_records` append-only versionado; `communicated_proposal_candidates`
  com estados `open`/`possibly_superseded`/`structurally_closed` —
  inferência nunca apaga, só rebaixa; `communicated_proposal_classifications`
  e `approval_resolutions` pin-once; `approval_resolution_claims`
  efêmero e `approval_resolution_backoff` persistente, fisicamente
  separados); `resolve_commercial_root_id()` como função canônica
  única de identidade comercial; 2 triggers determinísticos de
  fechamento de candidato (status terminal negativo de booking/
  opportunity; aprovação real commitada na mesma chain — nunca por
  inferência); RPCs security definer (`try_acquire_approval_resolution_claim`,
  `reserve_approval_dispatch_token`, `release_approval_resolution_claim`,
  `commit_approval_resolution`, `try_classify_communicated_proposal`,
  `get_active_approvals`, `get_communicated_proposal_candidates`); RLS
  tenant-safe (posse via `professional_id = auth.uid()` direto, sem
  join composto — lição da 0039) com deny-all pra `authenticated` nas
  duas tabelas de estado interno do motor (claims/backoff).
- ✅ **`src/lib/intelligence/approval/`**: `canonicalize.ts`
  (canonicalização determinística única — mesma função em F1 e F2,
  SHA-256 de 32 bytes, fisicamente separada do hash de 64 bits do
  advisory lock); `resolution-context.ts` (bounded lineage real:
  declaração do profissional + últimas 20 mensagens brutas + toda
  mensagem-fonte de candidato aberto — nunca o histórico inteiro
  desde a última resolução); `resolver.ts` (Approval Resolver,
  closed-candidate-selection, model call injetável mesmo padrão de
  `PlannerModelCall`); `orchestrator.ts` (encadeia claim → build
  contexto F1 → reserve token → chamada externa → rebuild F2 → commit,
  nunca segura transação Postgres aberta durante I/O externo);
  `value-schemas.ts` (os 13 shapes de `approved_value`, reaproveitando
  o enum do Bloco 4); `rate-limiter.ts` (espelho puro da matemática do
  token bucket, pra teste sem depender de Postgres); `golden-suite.ts`
  (6 casos semânticos).
- ✅ **Validação real contra Postgres** (não simulada): apliquei a
  migration `0045` no banco de teste `doopla_rls_test` (já com
  `0001`–`0044`, incluindo `auth.uid()`/RLS reais) e rodei 4 baterias
  de teste via `psql` — **36 asserções, todas PASS**: CHECK simétrico
  de provenance (`cardinality()`, nunca `array_length()`); terminalidade
  física (só `resolved` é único-terminal); ciclo completo
  acquire→reserve→resolver→commit; retry pós-commit nunca reinfere;
  stale context (F1≠F2) descarta sem escrever nada; token bucket (5
  consumos imediatos + 6º bloqueado por `rate_limited`); backoff
  exponencial sensível a `context_identity` (mesmo contexto respeita,
  contexto novo ignora); proteção ABA de lease (`lease_token` errado
  nunca commita, correto continua funcionando depois); candidato
  comunicado nunca apagado por supersessão (só rebaixado, valor
  original íntegro); os dois fechamentos determinísticos (booking
  cancelado; aprovação real commitada); isolamento de tenant completo
  (RLS + `not_authorized` nas functions). **Concorrência real** (dois
  processos `psql` simultâneos, não simulação sequencial): duas
  chamadas verdadeiramente concorrentes a `commit_approval_resolution`
  na MESMA chain produziram versões `1` e `2` — nunca duplicata,
  provando a serialização do advisory lock sob carga real, repetido
  com sucesso; corrida de claim pela mesma mensagem rodada 10x, mutex
  respeitado em toda tentativa com overlap real (as demais foram
  `rate_limited`, achado tratado abaixo).
- ✅ **2 bugs reais encontrados e corrigidos durante o próprio teste de
  concorrência** (não achados de auditoria externa — acharam-se
  testando):
  1. `try_acquire_approval_resolution_claim` debitava o token do rate
     limiter ANTES de saber se o claim seria concedido — perder a
     corrida por outro worker (`claim_held_by_another_worker`) ainda
     assim queimava orçamento, violando o V3.7 ponto 1 ("não pode
     consumir cota sem representar chamada efetiva"). Corrigido:
     débito movido pra uma function nova e separada,
     `reserve_approval_dispatch_token` (a transação B de verdade),
     chamada só depois de já ter vencido a corrida pelo claim.
  2. Consequência do fix acima: quando `reserve_approval_dispatch_token`
     nega por `rate_limited`, o claim ficava preso até `lease_expires_at`
     mesmo sendo um bloqueio de custo, não de posse — bloqueando
     retries por até 120s à toa. Corrigido com
     `release_approval_resolution_claim`, liberação explícita e
     idempotente chamada pelo worker sempre que desiste antes de
     commitar.
  Ambos corrigidos na migration, reaplicados do zero no banco de teste
  e revalidados — as 36 asserções + as 2 corridas de concorrência
  passam limpas na versão final.
- ✅ **Testes determinísticos TS** (`npx tsx`, scratchpad
  `bloco5-approval-tests.ts`, sem I/O/rede): **38 asserções, todas
  PASS** — ordenação de chaves recursiva produz bytes idênticos
  independente de ordem de inserção; `installments` (array
  semanticamente ordenado) reordenado MUDA o digest; número
  não-inteiro falha a canonicalização (fail-closed); `null` e campo
  ausente equivalentes; qualquer campo semanticamente relevante muda o
  digest; `contentDigest` muda quando transcrição passa de
  `pending`→`done` mantendo o mesmo `messageId`; bound formal do token
  bucket `N(T) ≤ C + r·T` e latência máxima `período/capacidade`
  batendo com a fórmula; backoff exponencial com teto; os 13
  `value-schemas` (inclusive rejeição de campo extra/float onde exige
  inteiro).
- ✅ `npx tsc --noEmit` e `npx eslint` limpos no projeto inteiro
  (módulo novo + rota nova). `npx next build` completo sem erro, com
  `/dev/approval-golden-suite` listada na build — rota deixada
  pronta, não executada de verdade aqui (depende de `OPENAI_API_KEY`
  real, só disponível em Preview).
- ⚠️ **Divergência conhecida, não resolvida** (reportada, não decidida
  sozinho): quando `buildResolutionContext` retorna `budgetExceeded`
  (contexto grande demais pra construir), a spec V3.10 pede que o
  outcome (`context_budget_exceeded`/`chain_candidate_overflow`) seja
  PINADO em `approval_resolutions` — mas essa tabela exige
  `context_identity` de 32 bytes, e por definição não é possível
  calcular um `context_identity` real quando o `ResolutionContext`
  nem chega a ser construído. A V3.10 nunca especificou qual
  identidade usar nesse caso específico. `orchestrator.ts` deixa isso
  explícito no código (comentário + early return) em vez de inventar
  uma identidade sozinho — retorna `budget_exceeded` sem persistir
  nada. Precisa de uma decisão sua antes de fechar esse caminho
  (candidatos: hash de um marcador reduzido específico pra overflow;
  ou tratar overflow como um `inconclusive_reason` que não exige
  `context_identity` real, com ajuste de CHECK na migration).
- ⚠️ **Riscos residuais** (declarados, não escondidos): taxonomia de
  `subject_key` de `scope_change` continua a menos fundamentada das
  quatro (herdada da V2, nunca revisada); rate limiting/quota global
  de uso de IA por profissional/tenant não existe em bloco nenhum
  (V3.8, registrado como requisito futuro, fora do escopo do Bloco 5);
  `resolver.ts`/`orchestrator.ts` não foram exercitados contra OpenAI
  de verdade nem contra um Supabase real vivo nesta sessão (só a
  camada SQL, chamada diretamente via `psql`, e a camada TS pura,
  sem I/O) — a golden suite fica pronta pra fechar essa lacuna no
  Preview; `get_active_approvals`/`get_communicated_proposal_candidates`
  não têm tipos gerados (`src/lib/supabase/types.ts` não foi
  regenerado — precisa rodar `supabase gen types` contra o projeto
  real depois que a migration for aplicada lá).
- ✅ **Commit inicial**: `ac86f26`.

### Red Team adversarial da implementação (não do desenho) — PASS COM RESSALVAS, 4 achados reais corrigidos

Auditoria contra o commit `ac86f26`, com ataques reais executados
(nunca só teóricos) — SQL direto contra Postgres real e injeção de
model call hostil em TS, cobrindo as 10 áreas obrigatórias pedidas
(autorização acidental, provenance/grounding cross-tenant,
idempotência/concorrência avançada, revalidação F1/F2 em lote,
bounded lineage, rate limiter/backoff, tenant isolation nas 6 tabelas
e 8 RPCs, outputs hostis do model, divergência de budget_exceeded,
golden suite).

**4 achados reais, corrigidos** (commit `0c2f7b8`, todos bugs
inequívocos contra invariante já explícita na spec, nenhum exigiu
decisão arquitetural):
1. `resolver.ts` nunca verificava que `communicatedProposalMessageIds`
   do model realmente pertencia ao `ResolutionContext` fornecido — um
   model hostil/alucinado passava sem erro. Violava o
   closed-candidate-selection principle (V2). Provado com um
   `modelCall` injetado retornando um ID fora de contexto.
2. Os 13 `value-schemas.ts` nunca eram consultados no pipeline real —
   `approvedValue` malformado (campo ausente, tipo errado, extra)
   passava sem validação. Provado com `amountCents: "trezentos reais"`
   aceito sem erro.
3. **Mais grave**: nada verificava `author_type='professional'` da
   mensagem usada como `professional_statement_message_id` — a
   mensagem do CLIENTE ("Pedem R$3.000?") virou, sem checagem nenhuma,
   uma `approval_records` real atribuída ao profissional. Violação
   direta de KNOW≠APPROVE. Provado com escrita real no banco,
   corrigido nos dois pontos (`try_acquire_approval_resolution_claim` e
   `commit_approval_resolution`, defesa em profundidade).
4. `reserve_approval_dispatch_token`/`release_approval_resolution_claim`
   nunca verificavam posse (`auth.uid()` contra o dono da mensagem) —
   mitigado na prática pela entropia do `lease_token`, mas
   inconsistente com toda outra function da migration.

**1 achado real reportado, deliberadamente não corrigido** (exige
decisão arquitetural, não decidida sozinho): `commit_approval_resolution`
aceita `commercialRootId`/`communicatedProposalMessageIds` do caller
sem revalidação cruzada contra a raiz comercial real da conversa — só
protegido hoje pela confiabilidade do `orchestrator.ts`, não pela RPC
em si contra uma chamada direta forjada (as RPCs `security definer`
são chamáveis diretamente por qualquer `authenticated`, não só pelo
orchestrator TS). Provado com escrita real de um `approval_records`
apontando pro booking de outro profissional. Ver relatório completo
entregue na conversa (seção E/decisão pendente).

**Regressão completa revalidada após cada fix**: 43 asserções SQL
contra Postgres real (regressão original + os novos ataques,
incluindo mensagem composta com 2 decisões na mesma chain, takeover
real de worker com lease expirado, descarte de lote inteiro em
F1≠F2, varredura sistemática cross-tenant nos 8 RPCs) + 38 TS
determinísticas + `tsc`/`eslint`/`next build` limpos.

- ✅ **Commit de correção**: `0c2f7b8`.
- 🔒 **Nenhum merge, nenhum PR, Post-model Policy Gate não iniciado.**
  Aguardando decisão sobre o achado não corrigido antes de considerar
  o Bloco 5 fechado.

## 35. Adendo WhatsApp/concierge — dados de recebimento + auditoria de plano (Bloco 5 intocado)

Documento de produto grande (WhatsApp-first, e-mail de booking Pro,
dados de recebimento). Antes de implementar, revisei a arquitetura
real e reportei achados/conflitos (não repetidos aqui, ver histórico
da conversa) — usuário decidiu os dois conflitos e autorizou só um
subconjunto pra implementar agora.

- ✅ **Mapeamento (sem alterar nada)**: `/orcamento/[slug]` e
  `submit_orcamento_request()` (migration 0023) são a única porta
  pública de cliente hoje, e criam `opportunities` diretamente — nunca
  passam pela Intelligence Core (`create_conversation()` só é chamada
  em `/dev/intelligence-test`, nunca em produção). URL construída em
  exatamente 2 lugares (`dashboard/page.tsx`, `dashboard/perfil/page.tsx`),
  exibida via `orcamento-link-card.tsx`/`link-routing-card.tsx`.
  Decisão do usuário: isso vira, no futuro, um redirecionamento pro
  WhatsApp — não implementado agora, de propósito.
- ✅ **Achado que evitou uma migration desnecessária**: o plano público
  "Doopla / Doopla Pro" (R$29,90/R$59,90) **já existe** —
  `subscriptions.artist_plan` (migration 0036), preexistente a esta
  sessão. `booker_plan` continua intocado, tratado como legado
  conforme instruído. Adicionado `hasDooplaPro()` em
  `src/lib/subscription.ts` — gate canônico, role-consciente, nunca
  deriva de `booker_plan`. Booker ainda não tem equivalente — não
  inventei um, fica como pergunta em aberto.
- ✅ **Migration `0046_payment_details.sql`**: `payment_details`
  (Pix, `method` extensível) append-only versionado — mesmo padrão de
  `approval_records` do Bloco 5 (toda alteração insere linha nova,
  marca a anterior `superseded`, nunca `UPDATE` in-place — auditoria
  de quando/quem/vigente-em-T de graça). Escrita exclusiva via
  `set_payment_details()` (security definer); RLS select-own,
  deny-all pra escrita direta. `is_operationally_ready(profile_id)`
  representa "Doopla pronta pra operar" (existe recebimento ativo),
  sempre derivado da tabela real — nunca uma coluna denormalizada.
  Testado com 9 asserções reais contra Postgres (prontidão
  falsa→verdadeira, supersessão nunca duplica ativo, validação de
  chave vazia/método não suportado, isolamento de tenant).
- ✅ **Painel**: seção "Dados de recebimento" em `/dashboard/dinheiro`
  — cadastro/edição de Pix, chave mascarada na exibição, cópia sem
  jargão técnico ("Seus dados de recebimento ficam protegidos na sua
  conta Doopla").
- ✅ `tsc`/`eslint`/`next build` limpos.
- ✅ **Commit**: `fb6ecd9`.
- 🔒 **Deliberadamente fora desta rodada** (por instrução explícita):
  integração real de WhatsApp, Resend, alias de e-mail
  `booking.nome@doopla.pro`, lead reverso via WhatsApp, substituição
  destrutiva de `/orcamento/[slug]`, qualquer wiring novo entre
  Intelligence Core e fluxos reais do produto. Bloco 5 (Approval
  Engine) não foi tocado nem referenciado por nenhuma linha desta
  rodada.

## 36. Bloco 5 — fechamento do Approval Resolver (migration 0047)

Fecha os 3 pontos que o Red Team sobre `ac86f26` (seção 34) deixou
explicitamente em aberto, seguindo as decisões dadas pelo usuário pra
cada um. Nenhuma arquitetura redesenhada — só o que as decisões
pediram, no boundary SQL (nunca só TS, por instrução explícita).

- ✅ **Achado 4 — `commercial_root_id`/provenance forjável**: nova
  function `commercial_root_belongs_to_professional()` (ownership real,
  booking OU opportunity) chamada em `commit_approval_resolution` logo
  após validar `author_type='professional'`. Revalidação COMPLETA do
  lote inteiro ANTES de qualquer lock/insert: todo `commercialRootId`
  de cada decisão precisa bater com o root já validado; simetria de
  provenance re-checada; todo `communicatedProposalMessageIds`
  precisa apontar pra um candidato REAL, da MESMA chain (profissional
  + root + categoria + subject), ainda `open`/`possibly_superseded` —
  nunca um UUID arbitrário, nunca candidato de outra chain, nunca de
  outro profissional. Qualquer falha descarta o LOTE INTEIRO
  (`invalid_provenance`, claim liberado, nada gravado) — nunca corrige
  por inferência. Limitação documentada no próprio comentário SQL:
  não valida vínculo estrito conversa↔root (`conversations.related_*`
  não é populado por nenhum caminho de escrita real hoje) — fecha o
  ataque real demonstrado (tenant/ownership), não essa lacuna mais
  ampla.
- ✅ **Achado 5 — `MAX_CANDIDATES_PER_CHAIN` só na leitura**: teto
  físico agora aplicado em `try_classify_communicated_proposal`, sob
  `pg_advisory_xact_lock` por chain (seed distinto do lock de
  versionamento do commit). Ao estourar: `RAISE WARNING` com
  diagnóstico completo, retorna `limit_exceeded=true`, **nada é
  inserido nem apagado, nenhuma escolha automática de candidato a
  manter, classificação nunca pinada** — uma tentativa futura, depois
  que a chain encolher, pode reclassificar normalmente.
- ✅ **Ponto 3 — `context_budget_exceeded`/`chain_candidate_overflow`
  sem `context_identity`**: `approval_resolutions` continua nunca
  aceitando um outcome sem `context_identity` real (invariante
  intocada). Overflow é tratado como condição OPERACIONAL do resolver,
  nunca decisão comercial — reaproveita `approval_resolution_backoff`
  (auditado antes: já era a camada de "attempts" certa, só faltavam
  colunas de diagnóstico) via nova RPC `record_resolution_overflow()`
  (aplica o mesmo backoff exponencial já usado pro resolver, tratando
  overflow como tentativa que não progrediu) e `get_resolution_backoff_status()`
  (leitura barata). `orchestrator.ts` foi religado: consulta o status
  de backoff ANTES de montar `ResolutionContext` (evita reconstrução
  cara numa mensagem cronicamente over-budget) e chama
  `record_resolution_overflow` nos dois pontos onde `budgetExceeded`
  já existia (F1 e F2) — o antigo comentário "DIVERGÊNCIA CONHECIDA,
  NÃO RESOLVIDA" foi removido, pois esta é exatamente a resolução.
- ✅ **Defesa em profundidade adicional**: `revoke execute ... from
  anon` explícito nas 5 functions pré-existentes da 0045 que ainda não
  tinham (lição já documentada na 0041 — Supabase real concede EXECUTE
  a `anon` direto via `alter default privileges`, não via `PUBLIC`;
  `revoke all from public` sozinho não bloqueia isso).
- ✅ **TypeScript religado**: `CommitResolutionResult.discardReason`
  ganhou `'invalid_provenance'`; novo tipo `ClassifyCommunicatedProposalResult`
  documentando o contrato retornado por `try_classify_communicated_proposal`
  (ainda sem caller real — só `resolveApproval()`, sem I/O, é chamado
  hoje pela rota dev); `BuildResolutionContextResult` (overflow) ganhou
  `commercialRootId`/`decisionCategory`/`subjectKey`/`magnitude` pra
  alimentar `record_resolution_overflow` com diagnóstico real.
- ✅ **Regressão completa revalidada**: as 33 asserções SQL antigas
  (núcleo, backoff/candidatos, concorrência real, tenant isolation,
  Red Team composto/takeover/tenant-RPCs/F1≠F2) + a sanidade de
  `payment_details` continuam passando sem alteração de regra de
  negócio — só 3 scripts de teste precisaram de fixtures atualizadas
  (candidato real em vez de `message_id` solto, já que é exatamente
  isso que a correção do achado 4 passou a exigir).
- ✅ **11 testes adversariais novos** (`41_redteam_provenance_and_overflow.sql`,
  script preservado no scratchpad da sessão): forja de
  `commercial_root_id` de outro profissional bloqueada; UUID
  inexistente rejeitado; candidato real de outra chain rejeitado;
  candidato real de outro profissional rejeitado; chamada direta da
  RPC (fora do `orchestrator.ts`) bloqueia igual — não existe atalho;
  51ª candidata na mesma chain bloqueada deterministicamente (50
  aceitas, 51ª nunca inserida, nunca pinada); **concorrência real**
  (2 processos `psql` simultâneos contra a chain já saturada — nenhum
  ultrapassa 50, advisory lock seguro sob concorrência de verdade);
  overflow nunca cria linha em `approval_resolutions`, só em
  `approval_resolution_backoff` (com backoff exponencial reaplicado
  corretamente numa segunda ocorrência); backoff/attempt-control de
  resolução normal (`inconclusive`) continua intacto após as colunas
  novas na mesma tabela; tenant isolation intacto; guarda de ownership
  de `0c2f7b8` (author_type/auth.uid()) continua em vigor. Todos PASS.
- ✅ `tsc`/`eslint`/`next build` limpos (escopo completo do projeto).

**Risco residual reportado, não corrigido sozinho** (decisão
arquitetural, não decidida por conta própria): o gate de backoff
dentro de `try_acquire_approval_resolution_claim` só nega retry
(`deny_reason='backoff'`) quando o `context_identity` da tentativa
repete o ÚLTIMO `context_identity` gravado na linha (`last_context_identity`)
— comportamento correto e intencional pra backoff de resolução NORMAL
(V3.6: contexto novo sempre merece tentativa nova). `record_resolution_overflow()`
nunca escreve `last_context_identity` (overflow não tem um
`context_identity` associável, por definição), então uma chamada
DIRETA a `try_acquire_approval_resolution_claim` com um
`context_identity` qualquer sempre passa pelo bypass de "contexto
novo" e ignora o `next_eligible_at` escrito por overflow — o boundary
SQL, sozinho, não impede isso. Na prática isso é fechado pelo
`orchestrator.ts` (`get_resolution_backoff_status` é consultado ANTES
de sequer tentar `try_acquire`, incondicional a qualquer
`context_identity`), que é o único caminho real de chamada hoje — mas
não é uma garantia no próprio boundary SQL, ao contrário do padrão
"TS nunca é suficiente pra este boundary" usado no resto desta rodada
(achado 4). Não alterei a semântica de `try_acquire_approval_resolution_claim`
(função não tocada por esta migration) porque isso mexeria no
comportamento já validado de backoff de resolução normal e não estava
no escopo das 3 decisões desta rodada — reporto em vez de decidir
sozinho.

**Também não resolvido, mesmo escopo do achado 4 original**: a
"restrição de acesso" (impedir chamada direta da RPC por qualquer
`authenticated`, só permitir via caminho de aplicação) não foi
implementada — o codebase inteiro não tem NENHUMA infraestrutura de
service-role/admin client hoje (sem `SUPABASE_SERVICE_ROLE_KEY`, sem
helper algum), e introduzir isso agora seria uma mudança de convenção
que atinge toda a base (não só o Bloco 5), não verificável de ponta a
ponta neste sandbox (Postgres de teste local não distingue
`service_role` real de superuser bypass) e exigiria um secret novo do
usuário provisionar. A revalidação de conteúdo (achado 4, acima) fecha
o ataque demonstrado; a restrição de quem pode ligar continua em
aberto, como já reportado na rodada anterior.

- ✅ **Migration**: `0047_approval_engine_provenance_and_overflow.sql`.
- 🔒 **Nenhum merge, nenhum PR, Post-model Policy Gate não iniciado.**
  `payment_details`, WhatsApp, Resend, `/orcamento/[slug]` e legado de
  booker não foram tocados nesta rodada, conforme instruído.

## 37. Bloco 5 — decisão final sobre os 2 riscos residuais (migration 0048)

Fecha o risco residual #1 reportado no fechamento da migration 0047.
Risco residual #2 permanece registrado como dívida técnica explícita
(decisão do usuário: não introduzir infraestrutura de service-role
nesta rodada).

- ✅ **Backoff de overflow agora incondicional no boundary SQL**: nova
  coluna `approval_resolution_backoff.next_eligible_reason`
  (`'resolution_attempt' | 'overflow'`) marca qual mecanismo escreveu
  por último `next_eligible_at`. `record_resolution_overflow()` marca
  `'overflow'` (nunca toca `last_context_identity` — overflow não tem
  identidade semântica real, por decisão explícita: "não fabricar
  context_identity para overflow"). `commit_approval_resolution`
  (branch `inconclusive`) marca `'resolution_attempt'` — comportamento
  de bypass em contexto novo (V3.6) inalterado. `try_acquire_approval_resolution_claim`
  ganhou um gate NOVO, checado ANTES do gate de backoff normal: quando
  `next_eligible_reason='overflow'` e `now() < next_eligible_at`, nega
  incondicionalmente (`deny_reason='backoff'`) — **nenhum
  `context_identity`, por mais novo que seja, faz bypass**. Uma
  chamada SQL direta ao RPC de claim, fora do `orchestrator.ts`, agora
  respeita exatamente o mesmo backoff que o orchestrator já respeitava
  por fora.
- ✅ **Teste adversarial dedicado** (`42_redteam_overflow_backoff_sql_boundary.sql`,
  script preservado no scratchpad): registra overflow com backoff
  curto → confirma `next_eligible_at` futuro e `next_eligible_reason=overflow`
  via `get_resolution_backoff_status` → chama o RPC de claim
  DIRETAMENTE (sem orchestrator.ts) com um `context_identity` novo →
  confirma recusa (`backoff`) → repete com um SEGUNDO `context_identity`
  diferente do primeiro → confirma que continua recusado (bloqueio é
  incondicional, não é coincidência de ter batido o mesmo contexto) →
  confirma que nenhum claim foi gravado enquanto o backoff estava ativo
  → aguarda a elegibilidade real (`pg_sleep`) → confirma claim concedido
  normalmente depois → confirma que `commit_approval_resolution` e o
  guard `already_resolved` continuam funcionando (idempotência/
  context-identity preservados, nada quebrado pela mudança). Todos
  PASS.
- ✅ **Regressão completa revalidada**: as 33 asserções SQL antigas +
  os 11 testes adversariais da rodada anterior (seção 36, incluindo os
  2 workers de concorrência real) + este novo teste — todos PASS sem
  alteração de regra de negócio. `tsc`/`eslint`/`next build` limpos.
- 📋 **Dívida técnica / Beta Gate registrada explicitamente** (risco
  residual #2, decisão deliberada de NÃO resolver agora): as RPCs
  sensíveis do Intelligence OS continuam acessíveis a qualquer
  `authenticated` (sem boundary de backend privilegiado) — aceitável
  nesta fase porque (a) validação SQL fail-closed está completa
  (provenance real, ownership real, cap de candidatos, backoff
  incondicional — nenhum parâmetro do caller é tratado como autoridade
  sem revalidação), (b) isolamento de tenant está intacto (RLS
  deny-all nas tabelas sensíveis, ownership via `auth.uid()` em toda
  function), (c) `anon` continua sem `execute` onde aplicável. **Antes
  de produção aberta**: as RPCs sensíveis do Intelligence OS devem
  deixar de depender de acesso genérico `authenticated` e passar por
  um boundary de backend autorizado apropriado — decisão de arquitetura
  a ser tomada de forma centralizada quando chegar a etapa de
  integração real WhatsApp/backend do Intelligence OS. Explicitamente
  não criar service-role client no frontend nem expor a service-role
  key ao browser.
- ✅ **Migration**: `0048_approval_engine_overflow_backoff_sql_boundary.sql`.
- 🔒 **Confirmação**: nenhuma etapa do Post-model Policy Gate foi
  iniciada. Nenhum merge, nenhum PR.
- ⏳ **Golden Suite continua pendente** (sem acesso a OpenAI/Preview
  neste sandbox) — permanece como gate explícito antes de considerar o
  Approval Resolver validado com modelo real.

## 38. Post-model Policy Gate — bloco novo (pós Bloco 5)

Antes de implementar, fiz auditoria da arquitetura real (Blocos 1–5) e
entreguei um desenho de 12 pontos na conversa — achado principal: o
Response Planner (Bloco 4) já produz `proposedResponse` (o draft real),
`commitmentNature`, `requiresProfessionalDecision` e
`professionalDecisionCategory` (mesmo enum do Bloco 5), mas nunca teve
acesso a `activeApprovalCandidates` — foi construído antes do Bloco 5
existir. O Post-model Policy Gate é o bloco que fecha essa lacuna.
Usuário aprovou o desenho com 2 decisões: implementar o extrator de
valor estruturado, e analisar (sem implementar ainda) o gap de
`subject_key` antes de decidir — análise concluiu que cabe inteira
dentro do próprio extrator do Gate, sem tocar o Bloco 4 (frozen).
Usuário autorizou a implementação completa em seguida.

- ✅ **Módulo `src/lib/intelligence/policy-gate-post/`**: `extractor.ts`
  (model call injetável, mesmo padrão de resolver.ts/plan.ts — extrai
  compromissos estruturados de `proposedResponse`, no shape fechado de
  `APPROVED_VALUE_SCHEMAS`/`SUBJECT_KEY_TAXONOMY` já existentes no
  Bloco 5, reusados sem duplicar; nunca decide allow/block); `matcher.ts`
  (100% código, puro — `resolveSubjectKey()`/`matchCommitment()`/
  `evaluateCommitments()`, multidecisão sempre AND); `gate.ts`
  (`evaluatePostModelGate`, orquestra leitura de `get_active_approvals`
  + status terminal + extração); `tool-gate.ts` (`evaluateToolCallGate`,
  mesmo matcher, deliberadamente desacoplado de `tool-registry.ts` —
  Bloco 1 é frozen e nenhuma tool de escrita existe ainda, então não há
  nada real pra encadear; quando uma existir, chama esta function
  direto); `apply-outcome.ts` (`applyGateOutcome` — anti policy
  laundering: bloqueio nunca retorna ao mesmo model call, só
  transformação determinística pra `responsePlan='consult_professional'`
  + `proposedResponse=null`, mesmo padrão de `draftStillValid` do
  Bloco 4); `value-equality.ts` (igualdade estrutural self-contained,
  não acopla aos internals não-exportados de `approval/canonicalize.ts`);
  `log.ts`/`golden-suite.ts`/`config.ts`/`types.ts`/`index.ts`.
- ✅ **Subject_key multi-instância resolvido sem tocar o Bloco 4**: pra
  `scope_change`/`logistics_commitment`/`contractual_exception` (taxonomia
  fechada já existente) o extrator propõe um `subjectKey`; se
  inválido/ausente, fallback de cardinalidade — se existir EXATAMENTE
  UMA approval ativa daquela categoria no commercial root, usa o
  `subjectKey` dela (caso inambíguo); com 0 ou 2+, bloqueia
  (`subject_key_unresolved`), nunca escolhe uma candidata arbitrária.
  `other_commitment_change` (sem taxonomia fechada, V2 herdado) usa o
  mesmo fallback.
- ✅ **Migration `0049_post_model_policy_gate.sql`**: `is_commercial_root_terminal()`
  (reusa `commercial_root_belongs_to_professional`, migration 0047, e a
  MESMA lista de status terminal do trigger `close_candidates_on_structural_invalidation`
  da migration 0045 — fecha o gap de `approval_records` nunca ser
  invalidado automaticamente quando um booking/opportunity é cancelado,
  sem alterar o Bloco 5); tabela `policy_gate_decisions` (append-only,
  RLS select-own/deny-all-write, CHECK simétrico outcome↔primary_block_reason,
  nunca duplica `proposedResponse` inteiro nem valores aprovados —
  `matchedApprovalRecordId` referencia `approval_records`, `extractedValueForDebug`
  só gravado quando `blocked`); RPC `record_policy_gate_decision()`
  (único caminho de escrita, reusa `commercial_root_belongs_to_professional`
  pra ownership).
- ✅ **Testes SQL** (`43_policy_gate_sql.sql`, scratchpad): terminal
  status muda corretamente e reverte; ownership cross-tenant bloqueada
  (`not_authorized`/`invalid_provenance`); CHECK simétrico nos dois
  sentidos (`blocked` sem motivo falha, `allowed` com motivo falha,
  motivo fora do enum falha); tenant isolation (RLS select-own);
  append-only (UPDATE direto não afeta nenhuma linha, sem policy).
  Todos PASS. Regressão completa (33+11+1 asserções anteriores)
  revalidada sem alteração de regra de negócio.
- ✅ **30 testes determinísticos TS** (matcher/extractor com model call
  injetado, script no scratchpad): os 20 cenários originais + os 8
  específicos desta rodada (R$3000→R$2900 bloqueado; R$3000→R$3000+
  transporte bloqueado por shape extra; multidecisão parcial; root/
  instância errados; extrator `null`/fora-do-schema) + os de
  `subject_key` da análise aprovada + `applyGateOutcome`
  (anti-laundering). Todos PASS.
- ✅ **Golden suite dev-only** (`/dev/policy-gate-golden-suite`, mesmo
  padrão de `/dev/approval-golden-suite`): 10 casos, incluindo
  confirmação implícita sem palavra-chave ("nos vemos sábado às 22h",
  item 10 da spec) — só roda com `OPENAI_API_KEY`/Preview, ainda não
  executada neste sandbox.
- ✅ `tsc`/`eslint`/`next build` limpos (projeto inteiro).

**Risco residual reportado, não corrigido** (limitação estrutural, não
uma decisão adiável): o extrator opera só sobre o texto de
`proposedResponse`, sem contexto de calendário/conversa — datas
relativas ("sábado que vem") não são resolvíveis por ele; documentado
diretamente no `golden-suite.ts`. Também documentado: dependência
entre categorias continua não modelada (preço aprovado "pra 2h" não é
invalidado automaticamente se a duração mudar) — mesma limitação já
reportada no desenho, não resolvida nesta implementação (fora do
escopo das decisões desta rodada).

- ✅ **Migration**: `0049_post_model_policy_gate.sql`.
- 🔒 **Nenhum wiring de produção real** — nenhuma integração com
  `test-call.ts`/Orchestrator ainda (não existe um Orchestrator real
  rodando 1→5 em produção hoje, confirmado na auditoria). Nenhuma
  integração WhatsApp/Resend/pagamento iniciada. Nenhum bloco
  posterior iniciado. Nenhum merge, nenhum PR.

## Como usar isso

Toda vez que eu terminar um item, atualizo o status aqui e commito
junto com o código. Se quiser saber "o que falta", é só pedir pra eu
reler este arquivo — não preciso da conversa inteira pra saber onde
paramos.
