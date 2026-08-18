import Link from 'next/link';

// Antes era um menu genérico ("Como podemos ajudar?") com 5 atalhos que
// já existem na sidebar (Trabalhos, Oportunidades, Bookers, Dinheiro) —
// redundante e vago demais pra ser o CTA principal do artista. Agora é
// uma ação direta: o artista tem um trabalho/demanda e quer publicar
// pra encontrar um booker que ajude.
export function HelpPicker() {
  return (
    <Link
      href="/dashboard/publicar-trabalho"
      className="font-doopla-mono block w-full rounded-full bg-[var(--accent)] px-4 py-3 text-center text-[13.5px] font-semibold text-[var(--ink)]"
    >
      + Publicar um trabalho
    </Link>
  );
}
