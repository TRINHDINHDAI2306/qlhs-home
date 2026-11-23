/** Repo đọc/ghi Google Sheet. */
import { DEFAULT_FEE } from '../shared/api';
import { isISODate, pad } from '../shared/date';
import type { FineRow, PaymentRow, Repo, SessionRow, Student } from '../shared/types';

export const SPREADSHEET_ID = '1tyIEWpqDg5RFu0Lucwue9Li8zxWbYwjHlUKc-hzzWY0';
const LEGACY_SHEET = 'Trang tính1';

const SHEETS = {
  students: { name: 'HocVien', headers: ['Tên', 'Học phí/buổi', 'Đang học', 'Ghi chú'], formats: { 2: '#,##0' } },
  sessions: { name: 'DiemDanh', headers: ['Ngày', 'Học viên', 'Số buổi', 'Học phí/buổi', 'Thành tiền', 'Ghi chú'], formats: { 1: 'dd/MM/yyyy', 4: '#,##0', 5: '#,##0' } },
  fines: { name: 'Phat', headers: ['Ngày', 'Học viên', 'Loại', 'Số tiền', 'Ghi chú'], formats: { 1: 'dd/MM/yyyy', 4: '#,##0' } },
  // Cột Tháng để dạng chữ ('@') để "2026-11" không bị Sheets đổi thành ngày
  payments: { name: 'DaDong', headers: ['Tháng', 'Học viên', 'Số tiền', 'Ngày đóng', 'Ghi chú'], formats: { 1: '@', 3: '#,##0', 4: 'dd/MM/yyyy' } },
} as const;
type SheetKey = keyof typeof SHEETS;

const tz = () => Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh';

function toISO(v: unknown): string {
  if (v instanceof Date) return Utilities.formatDate(v, tz(), 'yyyy-MM-dd');
  const s = String(v ?? '').trim();
  if (isISODate(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/MM/yyyy gõ tay
  if (m) return `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
  return '';
}

/** Tháng: chấp nhận 'yyyy-MM', 'MM/yyyy' hoặc ô ngày */
function toMonth(v: unknown): string {
  if (v instanceof Date) return Utilities.formatDate(v, tz(), 'yyyy-MM');
  const s = String(v ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{1,2})$/);
  if (m) return `${m[1]}-${pad(+m[2])}`;
  m = s.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[2]}-${pad(+m[1])}`;
  return '';
}

/** 'yyyy-MM-dd' → Date lúc 12h trưa (tránh lệch ngày do múi giờ) */
function toDate(iso: string): GoogleAppsScript.Base.Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 12) as unknown as GoogleAppsScript.Base.Date;
}

/** Tạo các tab còn thiếu (chỉ định dạng khi mới tạo). */
export function ensureSheets(ss = SpreadsheetApp.openById(SPREADSHEET_ID)) {
  (Object.keys(SHEETS) as SheetKey[]).forEach(key => {
    const def = SHEETS[key];
    if (ss.getSheetByName(def.name)) return;
    const sh = ss.insertSheet(def.name);
    sh.getRange(1, 1, 1, def.headers.length).setValues([[...def.headers]]).setFontWeight('bold').setBackground('#e8f1fc');
    sh.setFrozenRows(1);
    Object.entries(def.formats).forEach(([col, fmt]) => sh.getRange(2, Number(col), sh.getMaxRows() - 1, 1).setNumberFormat(fmt));
  });
  return ss;
}

export function sheetRepo(): Repo {
  const ss = ensureSheets();
  const sheet = (key: SheetKey) => ss.getSheetByName(SHEETS[key].name)!;

  const read = (key: SheetKey): unknown[][] => {
    const sh = sheet(key);
    const n = sh.getLastRow() - 1;
    return n > 0 ? sh.getRange(2, 1, n, SHEETS[key].headers.length).getValues() : [];
  };

  const write = (key: SheetKey, rows: unknown[][]) => {
    const sh = sheet(key);
    const width = SHEETS[key].headers.length;
    const last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, width).clearContent();
    if (rows.length) sh.getRange(2, 1, rows.length, width).setValues(rows);
  };

  return {
    getStudents: () => read('students')
      .filter(r => String(r[0]).trim())
      .map((r): Student => ({
        name: String(r[0]).trim(),
        fee: Number(r[1]) || 0,
        active: !(r[2] === false || String(r[2]).toUpperCase() === 'FALSE'),
        note: String(r[3] ?? ''),
      })),
    setStudents: list => write('students', list.map(s => [s.name, s.fee, s.active, s.note])),

    getSessions: () => read('sessions')
      .map((r): SessionRow => ({
        date: toISO(r[0]),
        student: String(r[1]).trim(),
        count: Number(r[2]) || 0,
        fee: Number(r[3]) || 0,
        note: String(r[5] ?? ''),
      }))
      .filter(e => e.date && e.student && e.count > 0),
    // Cột "Thành tiền" là công thức =Số buổi × Học phí/buổi để sheet vẫn tự tính khi sửa tay
    setSessions: list => write('sessions', list.map((e, i) => [toDate(e.date), e.student, e.count, e.fee, `=C${i + 2}*D${i + 2}`, e.note])),

    getFines: () => read('fines')
      .map((r): FineRow => ({
        date: toISO(r[0]),
        student: String(r[1]).trim(),
        type: String(r[2]).trim() === 'Đóng phạt' ? 'Đóng phạt' : 'Phạt',
        amount: Number(r[3]) || 0,
        note: String(r[4] ?? ''),
      }))
      .filter(f => f.date && f.student),
    setFines: list => write('fines', list.map(f => [toDate(f.date), f.student, f.type, f.amount, f.note])),

    getPayments: () => read('payments')
      .map((r): PaymentRow => ({
        month: toMonth(r[0]),
        student: String(r[1]).trim(),
        amount: Number(r[2]) || 0,
        date: toISO(r[3]),
        note: String(r[4] ?? ''),
      }))
      .filter(p => p.month && p.student),
    setPayments: list => write('payments', list.map(p => [p.month, p.student, p.amount, p.date ? toDate(p.date) : '', p.note])),

    withLock<T>(fn: () => T): T {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return fn(); } finally { lock.releaseLock(); }
    },
  };
}

/** Mã PIN của app: tab CaiDat, ô B1 (bạn tự đổi trong Google Sheet). */
export function readPin(): string {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName('CaiDat');
  return sh ? String(sh.getRange('B1').getDisplayValue()).trim() : '';
}

/** Nhập danh sách học viên từ tab cũ (cột A = Tên, cột J = tiền 1 buổi theo nghìn đồng). */
export function importLegacyStudents(): string {
  const ss = ensureSheets();
  const repo = sheetRepo();
  if (repo.getStudents().length) return 'Tab HocVien đã có dữ liệu – bỏ qua bước nhập.';
  const old = ss.getSheetByName(LEGACY_SHEET);
  if (!old) return `Không thấy tab "${LEGACY_SHEET}" – hãy thêm học viên trong webapp.`;
  const students = old.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim())
    .map((r): Student => {
      const feeK = Number(r[9]);
      return { name: String(r[0]).trim(), fee: feeK > 0 ? feeK * 1000 : DEFAULT_FEE, active: true, note: '' };
    });
  repo.setStudents(students);
  return `Đã nhập ${students.length} học viên từ "${LEGACY_SHEET}".`;
}
