import { normalizeDigits, toBnDigits } from '@patabin/shared';

export default function NumberInput({ value, onChange, className = '' }: { value: string; onChange: (normalized: string) => void; className?: string }) {
  return (
    <input
      className={`field p-num ${className}`}
      type="text"
      inputMode="decimal"
      value={toBnDigits(value)}
      onChange={(e) => onChange(normalizeDigits(e.target.value).replace(/[^\d.]/g, ''))}
    />
  );
}
