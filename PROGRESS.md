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
por inteiro. **Começando agora.**

- ❌ Tabela de avaliações (`booking_id`, quem avaliou, quem recebeu,
  nota, atributos, comentário, moderação).
- ❌ Atributos com contador (ex: "⚡ 103 · Responde rápido").
- ❌ Avaliação automática pendente quando o booking conclui + botão
  "Pedir avaliação" com mensagem sempre padronizada pela Doopla.
- ❌ Moderação: janela de edição de 24h, contestação, remoção só do
  agregado público em caso de fraude confirmada.
- ❌ Card padronizado (artista e booker) com nota + avaliações +
  bookings concluídos, reusado em toda tela que mostra uma pessoa.
- ❌ Perfil completo do booker (hoje só o do artista existe, em
  `/[slug]`, e sem nota porque ainda não existe avaliação nenhuma).
- Separação declarado vs. calculado: já é o padrão que uso em todo o
  banco (`profiles`/`artist_profiles` = declarado, tudo de reputação
  vai ser sempre calculado, nunca campo editável pelo usuário).

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

## Como usar isso

Toda vez que eu terminar um item, atualizo o status aqui e commito
junto com o código. Se quiser saber "o que falta", é só pedir pra eu
reler este arquivo — não preciso da conversa inteira pra saber onde
paramos.
