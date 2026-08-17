import { eyebrowClass } from '../ui';

// Checkbox nativo + rótulo estilizado como chip — sem JS de estado
// nenhum, funciona com formData.getAll(name) puro no submit do form.
export function ChipCheckboxGroup({
  name,
  label,
  options,
  defaultValues,
}: {
  name: string;
  label: string;
  options: string[];
  defaultValues: string[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={eyebrowClass}>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="cursor-pointer">
            <input
              type="checkbox"
              name={name}
              value={option}
              defaultChecked={defaultValues.includes(option)}
              className="peer sr-only"
            />
            <span className="font-doopla-mono rounded-full border border-[var(--ink)]/20 px-3.5 py-2 text-[11.5px] uppercase tracking-[.04em] text-[var(--ink)]/65 transition-colors peer-checked:border-[var(--ink)] peer-checked:bg-[var(--ink)] peer-checked:text-[var(--paper)]">
              {option}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
