import type { CSSProperties } from 'react';

/** Bảng màu pastel tươi cho avatar – mỗi học viên 1 màu cố định theo tên */
const PALETTE: [string, string][] = [
  ['#dbeafe', '#1d4ed8'], // xanh dương
  ['#dcfce7', '#15803d'], // xanh lá
  ['#fef3c7', '#b45309'], // vàng
  ['#fce7f3', '#be185d'], // hồng
  ['#ede9fe', '#6d28d9'], // tím
  ['#ffedd5', '#c2410c'], // cam
  ['#ccfbf1', '#0f766e'], // ngọc
  ['#fee2e2', '#b91c1c'], // đỏ
];

export function avatarStyle(name: string): CSSProperties {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [background, color] = PALETTE[h % PALETTE.length];
  return { background, color };
}

/** Chữ cái đại diện: chữ đầu của tên (từ cuối) – "Nguyễn Văn An" → "A" */
export const initial = (name: string) => (name.trim().split(/\s+/).pop() ?? '?').charAt(0).toUpperCase();
