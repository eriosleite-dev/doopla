// Decisão fechada (Especificação completa final, Parte 2, 6.1): não
// construir a ação real de saque antes do Bloco 2/Pagar.me — o botão
// fica visível, mas desabilitado, sem formulário nenhum por trás.
export function PayoutForm() {
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled
        className="font-doopla-mono w-fit cursor-not-allowed rounded-full bg-[var(--paper)]/20 px-5 py-2.5 text-[13px] font-semibold text-[var(--paper)]/50"
      >
        Solicitar saque
      </button>
      <p className="text-[11px] text-[var(--paper)]/45">
        Disponível em breve, assim que a liberação automática de pagamentos estiver ativa.
      </p>
    </div>
  );
}
