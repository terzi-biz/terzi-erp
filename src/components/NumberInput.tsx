import { useState } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number | null | undefined;
  onChange: (value: number) => void;
};

/**
 * Числове поле з коректною поведінкою ручного вводу:
 *  - при стиранні значення поле стає порожнім (а не "0", через який виходить "050");
 *  - при фокусі вміст виділяється, тож набір одразу замінює попереднє значення;
 *  - назовні завжди віддається число (порожнє поле = 0).
 */
export function NumberInput({ value, onChange, onFocus, onBlur, ...rest }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (value === null || value === undefined || !Number.isFinite(Number(value)) ? "" : String(value));

  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        if (raw === "" || raw === "-") { onChange(0); return; }
        const n = Number(raw);
        if (Number.isFinite(n)) onChange(n);
      }}
      onFocus={(e) => { e.currentTarget.select(); onFocus?.(e); }}
      onBlur={(e) => { setDraft(null); onBlur?.(e); }}
    />
  );
}
