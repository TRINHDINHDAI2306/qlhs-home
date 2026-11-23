const nf = new Intl.NumberFormat('vi-VN');

export const money = (n: number): string => `${nf.format(Math.round(n || 0))} đ`;

/** 1.500.000 → "1,5tr", 450000 → "450k" */
export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}tr`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}k`;
  return String(Math.round(n));
}

export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e);
