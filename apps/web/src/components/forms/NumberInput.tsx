import { normalizeDigits, toBnDigits } from '@patabin/shared';

export default function NumberInput({ value, onChange, className = '', placeholder, readOnly = false, onBlur }: { value: string; onChange: (normalized: string) => void; className?: string; placeholder?: string; readOnly?: boolean; onBlur?: () => void }) {
  return (
    <input
      className={`field p-num ${className}`}
      type="text"
      inputMode="decimal"
      value={toBnDigits(value)}
      placeholder={placeholder}
      readOnly={readOnly}
      onBlur={onBlur}
      onChange={(e) => onChange(normalizeDigits(e.target.value).replace(/[^\d.]/g, ''))}
    />
  );
}
