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
