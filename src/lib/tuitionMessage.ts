/** Soạn tin nhắn báo học phí gửi phụ huynh / học viên. */
import { fmtDM } from '../../shared/date';
import type { StudentMonthStat } from '../../shared/types';
import { PAYMENT } from '../config';

/** "Anh/Chị" dùng khi chưa rõ phụ huynh là anh hay chị */
export const SALUTATIONS = ['Anh/Chị', 'Anh', 'Chị', 'Cô', 'Chú', 'Phụ huynh', 'Học sinh'] as const;
/** "Học sinh" = nhắn thẳng cho học sinh (gọi tên, xưng "mình") */
export const TO_STUDENT: Salutation = 'Học sinh';
export type Salutation = (typeof SALUTATIONS)[number];

export const STYLES = [
  { id: 'polite', label: 'Lịch sự' },
  { id: 'friendly', label: 'Thân mật' },
  { id: 'short', label: 'Ngắn gọn' },
] as const;
export type MessageStyle = (typeof STYLES)[number]['id'];

export interface MessageOptions {
  salutation: Salutation;
  style: MessageStyle;
}

const nf = new Intl.NumberFormat('vi-VN');
const vnd = (n: number) => `${nf.format(Math.round(n))}đ`;

export function removeAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** "5 buổi × 50.000đ" hoặc "3 buổi × 50.000đ + 2 buổi × 60.000đ" khi học phí thay đổi giữa tháng */
export function feeBreakdown(stat: StudentMonthStat): string {
  const byFee = new Map<number, number>();
  for (const it of stat.items) byFee.set(it.fee, (byFee.get(it.fee) ?? 0) + it.count);
  return [...byFee.entries()].map(([fee, n]) => `${n} buổi × ${vnd(fee)}`).join(' + ');
}

export function dateList(stat: StudentMonthStat): string {
  const dated = stat.items.filter(it => !it.legacy).map(it => (it.count > 1 ? `${fmtDM(it.date)} (${it.count} buổi)` : fmtDM(it.date)));
  const legacy = stat.items.filter(it => it.legacy).reduce((t, it) => t + it.count, 0);
  return [...(legacy ? [`${legacy} buổi đã ghi sổ`] : []), ...dated].join(', ');
}

/** "T10" hoặc "T9, T10" – các tháng còn nợ */
const monthsShort = (months: string[]) => months.map(m => `T${Number(m.slice(5))}`).join(', ');

export function buildTuitionMessage(stat: StudentMonthStat, month: string, opt: MessageOptions): string {
  const toStudent = opt.salutation === TO_STUDENT;
  const name = stat.name;
  // Gửi phụ huynh: "anh/chị … của bạn Đạt" · Gửi học sinh: gọi tên, xưng "mình"
  const X = toStudent ? name : opt.salutation;
  const x = toStudent ? name : opt.salutation === 'Phụ huynh' ? 'phụ huynh' : opt.salutation.toLowerCase();
  const of = toStudent ? `của ${name}` : `của bạn ${name}`;
  const me = toStudent ? 'mình' : 'em';
  const monthNum = Number(month.slice(5));
  const monthText = `tháng ${monthNum}/${month.slice(0, 4)}`;
  const debt = stat.prevDebt;
  const debtMonths = monthsShort(stat.prevDebtMonths);
  const total = Math.max(0, stat.amount - stat.paid) + debt;
  const hasSessions = stat.sessions > 0 && stat.amount > 0;
  const account = `${PAYMENT.accountNumber} – ${PAYMENT.bank}${PAYMENT.accountName ? ` (${PAYMENT.accountName})` : ''}`;
  const breakdown = `${feeBreakdown(stat)} = ${vnd(stat.amount)}`;

  if (opt.style === 'short') {
    return [
      hasSessions ? `[HỌC PHÍ ${monthText.toUpperCase()}] ${name}` : `[HỌC PHÍ CÒN THIẾU] ${name}`,
      ...(hasSessions ? [`• ${breakdown}`] : []),
      ...(debt ? [`• Còn thiếu ${debtMonths}: ${vnd(debt)}`, `• Tổng: ${vnd(total)}`] : []),
      ...(toStudent ? [`📣 Nhắc bố mẹ đóng tiền học giúp mình nhé!`] : []),
      `💳 STK ${account}`,
    ].join('\n');
  }

  if (opt.style === 'friendly') {
    return [
      ...(hasSessions
        ? [`${capitalize(monthText)} ${toStudent ? name : `bạn ${name}`} đã học ${stat.sessions} buổi rồi ${toStudent ? 'nha' : 'ạ'} 📚`,
           `Học phí tháng là ${vnd(stat.amount)} (${feeBreakdown(stat)}).`]
        : []),
      ...(debt ? [`${hasSessions ? 'Cộng thêm' : `${toStudent ? name : `Bạn ${name}`} còn`} ${vnd(debt)} học phí ${debtMonths} chưa đóng, tổng cộng là ${vnd(total)}${toStudent ? '' : ' ạ'}.`] : []),
      '',
      toStudent ? `📣 ${name} nhắc bố mẹ đóng tiền học giúp mình nha 🙏` : `${X} chuyển khoản giúp ${me} nhé:`,
      `💳 ${account}`,
    ].join('\n');
  }

  return [
    hasSessions
      ? (toStudent ? `Mình gửi học phí ${monthText} ${of}:` : `Em xin gửi ${x} học phí ${monthText} ${of}:`)
      : (toStudent ? `Mình nhắc học phí còn thiếu ${of}:` : `Em xin nhắc ${x} học phí còn thiếu ${of}:`),
    '',
    ...(hasSessions
      ? [`📅 Số buổi đã học: ${stat.sessions} buổi`, `     (${dateList(stat)})`, `💰 Học phí: ${breakdown}`]
      : []),
    ...(debt ? [`📌 Học phí còn thiếu ${debtMonths}: ${vnd(debt)}`] : []),
    `👉 Tổng cần thanh toán: ${vnd(total)}`,
    '',
    toStudent ? `📣 ${name} nhắc bố mẹ đóng tiền học giúp mình nhé!` : `${X} vui lòng chuyển khoản giúp ${me} qua:`,
    `💳 STK: ${account}`,
  ].join('\n');
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* Ghi nhớ lựa chọn xưng hô / kiểu tin cho từng học viên */
const PREF_KEY = 'solop-msg-prefs';
type Prefs = Record<string, Partial<MessageOptions>>;

export function loadPrefs(name: string): MessageOptions {
  let saved: Partial<MessageOptions> = {};
  try { saved = (JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Prefs)[name] ?? {}; } catch { /* bỏ qua */ }
  const salutation = saved.salutation && (SALUTATIONS as readonly string[]).includes(saved.salutation) ? saved.salutation : 'Anh/Chị';
  return { salutation, style: saved.style ?? 'polite' };
}

export function savePrefs(name: string, opt: MessageOptions) {
  try {
    const all = JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') as Prefs;
    all[name] = opt;
    localStorage.setItem(PREF_KEY, JSON.stringify(all));
  } catch { /* bỏ qua */ }
}
