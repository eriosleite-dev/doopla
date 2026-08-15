# Doopla — decisões de arquitetura/produto

Registro datado das decisões que não são óbvias só de ler o código —
o "porquê" por trás de uma trava ou de um design escolhido. Complementa
o `PROGRESS.md` (que é sobre status) e o `AUDITORIA_BLOCO_4_5.md` (que
é sobre segurança). Aqui é sobre decisões que, se esquecidas, levariam
a desfazer ou recodificar algo que já foi decidido de propósito.

---

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
