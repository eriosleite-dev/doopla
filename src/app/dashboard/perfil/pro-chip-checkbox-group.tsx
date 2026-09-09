import { proLabelClass } from '../pro-format';

// Pro re-skin (Bloco 7, P1) de ChipCheckboxGroup — mesmo checkbox
// nativo + rótulo em chip, sem JS de estado (formData.getAll(name)
// puro no submit), só o tema --pro-*. `form` é opcional: só é
// necessário quando este grupo é renderizado via portal fora da árvore
// DOM do <form> (caso de ProArtistProfileForm, cujo modal de
// preferências precisa escapar do containing block criado pelo
// ProCard ancestral — ver comentário em pro-artist-profile-form.tsx) —
// associação explícita por atributo `form` funciona independente de
// nesting DOM.
export function ProChipCheckboxGroup({
  name,
  label,
  options,
  defaultValues,
  form,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValues: string[];
  form?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={proLabelClass}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={defaultValues.includes(option)}
              form={form}
              className="peer sr-only"
            />
            <span className="font-doopla-mono rounded-full border border-[var(--pro-line)] px-3.5 py-2 text-[11.5px] uppercase tracking-[.04em] text-[var(--pro-tx-70)] transition-colors peer-checked:border-[var(--pro-red)] peer-checked:bg-[var(--pro-red)] peer-checked:text-[var(--pro-off)]">
              {option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
