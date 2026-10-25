const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

export function toBnDigits(s: string | number): string {
  return String(s).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]!);
}

export function normalizeDigits(s: string): string {
  return s.replace(/[\u09e6-\u09ef]/g, (d) => String(d.charCodeAt(0) - 0x09e6));
}
