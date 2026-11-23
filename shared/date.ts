/** Tiện ích ngày tháng dạng chuỗi 'yyyy-MM-dd' – không phụ thuộc múi giờ. */

export const pad = (n: number): string => String(n).padStart(2, '0');

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(s: unknown): boolean {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  const [y, m, d] = parts(s);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function assertISODate(s: unknown): string {
  if (!isISODate(s)) throw new Error('Ngày không hợp lệ: ' + String(s));
  return s as string;
}

export function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split('-').map(Number);
  return [y, m, d];
}

export function fromParts(y: number, m: number, d: number): string {
  const t = new Date(Date.UTC(y, m - 1, d));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = parts(iso);
  return fromParts(y, m, d + n);
}

/** 0 = Chủ nhật, 1 = Thứ 2, … 6 = Thứ 7 */
export function dayOfWeek(iso: string): number {
  const [y, m, d] = parts(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function mondayOf(iso: string): string {
  return addDays(iso, -((dayOfWeek(iso) + 6) % 7));
}

export function todayISO(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
}

/** 'yyyy-MM' ± n tháng */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`;
}

export const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const DOW_FULL = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export const fmtDM = (iso: string): string => { const [, m, d] = parts(iso); return `${pad(d)}/${pad(m)}`; };
export const fmtDMY = (iso: string): string => { const [y, m, d] = parts(iso); return `${pad(d)}/${pad(m)}/${y}`; };
export const fmtMonth = (month: string): string => { const [y, m] = month.split('-'); return `Tháng ${Number(m)}/${y}`; };
