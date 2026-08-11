'use client';

import { useId, useState } from 'react';

import { fieldInputClass, fieldLabelClass, filterChipClass } from './ui';

// Atalhos, nunca as únicas opções — o campo continua sempre editável
// livremente. 5/8/10 vêm da referência de produto; 15/20 do combinado
// anterior pra faixas mais altas.
const COMMISSION_SHORTCUTS = [5, 8, 10, 15, 20];

export function CommissionField({
  name,
  label = 'Comissão',
  defaultValue,
}: {
  name: string;
  label?: string;
  defaultValue?: number;
}) {
  const [value, setValue] = useState(
    defaultValue != null ? String(defaultValue) : ''
  );
  const inputId = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className={fieldLabelClass}>
        {label}
      </label>
      <div className="relative w-40">
        <input
          id={inputId}
          name={name}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.5}
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ex: 12"
          className={`${fieldInputClass} w-full pr-8`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--ink)]/40">
          %
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {COMMISSION_SHORTCUTS.map((pct) => (
          <button
            key={pct}
            type="button"
            onClick={() => setValue(String(pct))}
            className={filterChipClass(value === String(pct))}
          >
            {pct}%
          </button>
        ))}
      </div>
      <p className="text-[12.5px] text-[var(--ink)]/50">
        Digite o valor que quiser — os atalhos são só sugestão.
      </p>
    </div>
  );
}
