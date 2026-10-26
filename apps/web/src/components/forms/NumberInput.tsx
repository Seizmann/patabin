import { normalizeDigits, toBnDigits } from '@patabin/shared';

export default function NumberInput({ value, onChange, className = '', placeholder, readOnly = false }: { value: string; onChange: (normalized: string) => void; className?: string; placeholder?: string; readOnly?: boolean }) {
  return (
    <input
      className={`field p-num ${className}`}
      type="text"
      inputMode="decimal"
      value={toBnDigits(value)}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(e) => onChange(normalizeDigits(e.target.value).replace(/[^\d.]/g, ''))}
    />
  );
}
