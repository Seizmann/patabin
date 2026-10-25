function toBn(v: number | string): string {
  return String(v).replace(/[0-9]/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)] ?? d);
}

export function Num({ children, className = '' }: { children: number | string; className?: string }) {
  return <span className={`p-num ${className}`}>{toBn(children)}</span>;
}
