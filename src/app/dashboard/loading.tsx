// Loading boundary do segmento /dashboard — cobre tanto o Shell novo
// (profissional) quanto o legado (Booker), já que o papel só é
// conhecido depois da sessão carregar. Neutro de propósito: não dá pra
// saber ainda se o tema final é o dark novo ou o bege legado.
export default function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--paper)]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
    </div>
  );
}
