# Doopla — status real do build

Este arquivo existe pra resolver um problema específico: você não deveria
precisar lembrar, de cabeça, tudo que já mandou e o que já foi construído.
Sempre que eu terminar (ou travar) alguma coisa, atualizo esse arquivo.
Se um dia você esquecer o que pediu, é aqui que a resposta está — não
precisa reconstruir o histórico na conversa.

Legenda: ✅ pronto e no ar · 🔧 em andamento agora · ⏳ na fila, sem trava ·
🔒 travado (motivo explicado) · ❌ ainda não começou

Última atualização: 2026-08-13.

---

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

## 2. Cadastro / onboarding

- ✅ Completo pros dois papéis (artista recorrente/pontual, booker
  universal/nichado, convites, plano Preço Fundador, bifurcações,
  seleção múltipla nas perguntas certas).

## 3. Painel do artista

- ✅ Trabalhos, Agenda (calendário + disponibilidade), Contratos
  (anexar link), Dinheiro (saldo + Sacar), Bookers (já trabalhou +
  descobrir), Perfil (foto com recorte, bio, link público `/[slug]`),
  Negociação, Publicar trabalho, checkpoints do booking (Cliente,
  Cachê, Data, Validado, Pagamento) + badge Doopla Verified na tela do
  booking.
- ❌ Card "Indique. Ganhe R$5." no painel (#49, item do Bloco G que
  você mencionou — ainda não comecei).

## 4. Painel do booker

- ✅ Agenda, Dinheiro/saldo/Sacar — mesmas telas do artista, já
  funcionam pros dois papéis.
- 🔧 **Módulo Booker Oficial** — a barra de progresso com os 5
  critérios (Booker Pro ativo, Perfil completo, Identidade verificada,
  Primeiros bookings validados, Histórico inicial). Terminando agora
  nesta sessão. Sem número em R$ e sem cálculo automático de bônus,
  como você pediu — isso é trava consciente, não esquecimento (bônus
  financeiro depende de validação jurídica que ainda não existe).
- ❌ Descoberta de artistas com paginação real + perfil padronizado do
  booker pro artista ver (#47). Estava travado esperando o documento
  de perfis/avaliações — **agora que chegou, entra na fila em seguida**
  (depende do item 5 abaixo, porque o card/perfil precisa mostrar nota
  real).

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
- ❌ Perfil completo do booker (hoje só o do artista existe, em
  `/[slug]`) e descoberta de artista padronizada pro booker — é o
  próximo passo, fecha o #47.
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

- ⏳ Módulos de escopo/partes/evento (dados do booking, sem tocar
  pagamento/cancelamento) — liberado pra construir, ainda não comecei.
- 🔒 Módulos de forma de pagamento e política de cancelamento dentro
  do contrato — dependem do item 6/7 fecharem de verdade primeiro
  (o próprio documento pede isso, pra não gerar cláusula que depois
  precise mudar de estrutura).
- ✅ Já existe hoje: os 3 caminhos básicos no booking (gerar/anexar/
  sem contrato) via `booking_contract_url`, mas só o caminho "anexar
  link manual" está funcional — "gerar com a Doopla" ainda não existe.

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
branch separado (`claude/doopla-bloco-4-5-opportunities-5f15n6`), que
tinha construído só a camada de banco desse bloco (schema, RLS, função
`select_booker_for_opportunity`). Trouxe esse schema pra este branch
(migration `0018`).

- ✅ Auditoria de risco feita antes de escrever qualquer Server Action
  em cima (ver `AUDITORIA_BLOCO_4_5.md`): matriz de RLS por tabela/
  papel/operação, confirmação de atomicidade da seleção de booker,
  contrato de nomes/semântica. Achados corrigidos na migration `0019`:
  usuário conseguia se auto-promover a admin, booker conseguia se
  auto-selecionar numa oportunidade pulando o artista, evento de
  oportunidade podia ser fabricado sem vínculo real, convite de
  oportunidade não respeitava o modo de distribuição, e duas policies
  de update (`representation_requests` e `reviews`, essa última um
  problema meu mesmo, achado ao aplicar o mesmo critério) deixavam
  reescrever coluna que devia ser só leitura pra quem estava
  respondendo.
- ⚠️ Efeito colateral esperado: a RLS nova só deixa o **artista**
  preencher `opportunities.selected_booker_id` (via função, nunca
  update direto). O botão "aceitar oportunidade" antigo do mural
  (`/dashboard/oportunidades`), que deixava o booker se auto-assumir
  direto, parou de funcionar — falha com uma mensagem clara em vez de
  criar um booking fantasma. Ele será substituído pelo fluxo novo
  (convite/interesse + escolha do artista) no próximo passo.
- ❌ Nenhuma Server Action ou tela desse bloco existe ainda (nem aqui,
  nem no branch de origem) — só a camada de banco, agora auditada e
  corrigida. Próximo passo: convidar booker pra oportunidade, registrar
  interesse, tela de oportunidades reconstruída com os novos status.
- A outra sessão pode ser encerrada — o schema dela já está absorvido
  aqui, com correções que ela ainda não tinha.

## Como usar isso

Toda vez que eu terminar um item, atualizo o status aqui e commito
junto com o código. Se quiser saber "o que falta", é só pedir pra eu
reler este arquivo — não preciso da conversa inteira pra saber onde
paramos.
