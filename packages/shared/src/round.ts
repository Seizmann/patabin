export function roundMoney(v: number): number {
  const s = v < 0 ? -1 : 1;
  return (s * Math.round(Math.abs(v) * 100 + Number.EPSILON * 100)) / 100;
}
