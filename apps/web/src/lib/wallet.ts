export function bnWalletType(t: string): string {
  return t === 'cash' ? 'ক্যাশ' : t === 'bkash' ? 'বিকাশ' : t === 'nagad' ? 'নগদ' : t;
}

export function walletDisplay(w: { name?: string | null; label: string; type: string }): string {
  if (w.type === 'cash') return 'ক্যাশ';
  const last2 = (w.label ?? '').slice(-2);
  const name = w.name && w.name !== w.label ? w.name : '';
  return name ? `${name} (${bnWalletType(w.type)}) ··${last2}` : `${bnWalletType(w.type)} ··${last2}`;
}
