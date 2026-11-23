/**
 * Toàn bộ nghiệp vụ của app. Chạy được trên cả Apps Script (Repo = Google Sheet)
 * lẫn trình duyệt (Repo = localStorage, chế độ xem thử).
 *
 * Quy tắc tính (giống bảng tay cũ):
 *   Mỗi học viên mỗi ngày tối đa 1 buổi (đánh 1 dấu x)
 *   Thành tiền       = Số buổi × Học phí/buổi
 *   Học phí 1 ngày   = Σ thành tiền mọi học viên trong ngày
 *   Tiền phạt quản lý riêng (tab Phat), không tính vào học phí
 */
import { addDays, assertISODate, mondayOf } from './date';
import type {
  AttendanceInput, Fine, FineRow, FinesData, MonthOverview, MonthReport, PaymentInput, PaymentRow, Repo,
  SessionRow, Student, StudentInput, StudentMonthStat, DayStat, WeekData,
} from './types';

export const DEFAULT_FEE = 50000;

/**
 * Dòng "dữ liệu cũ": số buổi tổng nhập từ bảng tay, không rõ ngày (Ghi chú bắt đầu bằng chữ này).
 * Được tính vào học phí tháng, nhưng không hiện trên lịch điểm danh và không bị ghi đè khi lưu tuần.
 */
export const LEGACY_NOTE_PREFIX = 'Dữ liệu cũ';
export const isLegacy = (e: SessionRow): boolean => e.note.trim().startsWith(LEGACY_NOTE_PREFIX);

const byName = (a: string, b: string) => a.localeCompare(b, 'vi');

/** Học phí còn thiếu theo từng tháng trước `beforeMonth`: key "tên|yyyy-MM" → số tiền còn thiếu (> 0). */
function debtsBefore(beforeMonth: string, sessions: SessionRow[], payments: PaymentRow[]): Map<string, number> {
  const due = new Map<string, number>();
  for (const e of sessions) {
    const m = e.date.slice(0, 7);
    if (m >= beforeMonth) continue;
    const k = `${e.student}|${m}`;
    due.set(k, (due.get(k) ?? 0) + e.count * e.fee);
  }
  for (const p of payments) {
    if (p.month >= beforeMonth) continue;
    const k = `${p.student}|${p.month}`;
    due.set(k, (due.get(k) ?? 0) - p.amount);
  }
  for (const [k, v] of due) if (v <= 0) due.delete(k);
  return due;
}
const money = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));

export function createApi(repo: Repo) {
  function getStudents(): Student[] {
    return repo.getStudents();
  }

  function saveStudent(input: StudentInput): Student[] {
    const name = String(input.name ?? '').trim();
    if (!name) throw new Error('Tên học viên không được để trống');
    const original = input.originalName ? String(input.originalName).trim() : null;

    return repo.withLock(() => {
      const list = repo.getStudents();
      const idx = original ? list.findIndex(s => s.name === original) : -1;
      if (original && idx === -1) throw new Error(`Không tìm thấy học viên "${original}"`);
      if (list.some((s, i) => s.name === name && i !== idx)) throw new Error(`Tên "${name}" đã được dùng`);

      const row: Student = { name, fee: money(input.fee), active: input.active !== false, note: String(input.note ?? '').trim() };
      if (idx === -1) list.push(row); else list[idx] = row;
      repo.setStudents(list);

      if (original && original !== name) {
        repo.setSessions(repo.getSessions().map(s => (s.student === original ? { ...s, student: name } : s)));
        repo.setFines(repo.getFines().map(f => (f.student === original ? { ...f, student: name } : f)));
        repo.setPayments(repo.getPayments().map(p => (p.student === original ? { ...p, student: name } : p)));
      }
      return list;
    });
  }

  function getWeek(weekStart: string): WeekData {
    const ws = mondayOf(assertISODate(weekStart));
    const we = addDays(ws, 6);
    return {
      weekStart: ws,
      students: repo.getStudents(),
      entries: repo.getSessions().filter(e => e.date >= ws && e.date <= we && !isLegacy(e)),
    };
  }

  /**
   * Ghi đè điểm danh của cả tuần. Học phí/buổi của các dòng đã có được giữ nguyên
   * để việc đổi học phí sau này không làm thay đổi lịch sử.
   */
  function saveWeek(weekStart: string, entries: AttendanceInput[]): WeekData {
    const ws = mondayOf(assertISODate(weekStart));
    const we = addDays(ws, 6);
    repo.withLock(() => {
      const feeOf = new Map(repo.getStudents().map(s => [s.name, s.fee] as const));
      const previous = new Map<string, SessionRow>();
      const kept: SessionRow[] = [];
      for (const e of repo.getSessions()) {
        if (e.date >= ws && e.date <= we && !isLegacy(e)) previous.set(`${e.date}|${e.student}`, e);
        else kept.push(e);
      }
      for (const n of entries ?? []) {
        const count = Number(n.count) > 0 ? 1 : 0; // mỗi ngày tối đa 1 buổi
        const date = assertISODate(n.date);
        const student = String(n.student ?? '').trim();
        if (!count || !student || date < ws || date > we) continue;
        const prev = previous.get(`${date}|${student}`);
        kept.push({
          date, student, count,
          fee: prev ? prev.fee : feeOf.get(student) ?? DEFAULT_FEE,
          note: prev ? prev.note : '',
        });
      }
      kept.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : byName(a.student, b.student)));
      repo.setSessions(kept);
    });
    return getWeek(ws);
  }

  function getMonthReport(month: string): MonthReport {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Tháng không hợp lệ: ' + month);
    const students = repo.getStudents();
    const activeNames = new Set(students.filter(s => s.active).map(s => s.name));
    const feeOf = new Map(students.map(s => [s.name, s.fee] as const));
    const stats = new Map<string, StudentMonthStat>();
    const stat = (name: string): StudentMonthStat => {
      let s = stats.get(name);
      if (!s) {
        s = { name, free: feeOf.get(name) === 0, paid: 0, paidDate: null, prevDebt: 0, prevDebtMonths: [], items: [], days: 0, sessions: 0, amount: 0 };
        stats.set(name, s);
      }
      return s;
    };
    activeNames.forEach(stat);

    const allSessions = repo.getSessions();
    const allPayments = repo.getPayments();
    const days = new Map<string, DayStat>();
    for (const e of allSessions) {
      if (e.date.slice(0, 7) !== month) continue;
      const amount = e.count * e.fee;
      const s = stat(e.student);
      const legacy = isLegacy(e);
      s.sessions += e.count; s.amount += amount;
      s.items.push({ date: e.date, count: e.count, fee: e.fee, legacy });
      if (legacy) continue; // không phải 1 ngày học cụ thể
      s.days += 1;
      const d = days.get(e.date) ?? { date: e.date, students: 0, names: [], sessions: 0, amount: 0 };
      d.students += 1; d.sessions += e.count; d.amount += amount;
      d.names.push(e.student);
      days.set(e.date, d);
    }

    for (const [k, v] of debtsBefore(month, allSessions, allPayments)) {
      const [name, m] = k.split('|');
      const s = stat(name);
      s.prevDebt += v;
      s.prevDebtMonths.push(m);
    }

    for (const p of allPayments) {
      if (p.month !== month) continue;
      const s = stat(p.student);
      s.paid += p.amount;
      if (!s.paidDate || p.date > s.paidDate) s.paidDate = p.date;
    }

    stats.forEach(s => {
      s.items.sort((a, b) => (a.date < b.date ? -1 : 1));
      s.prevDebtMonths.sort();
      if (s.amount > 0 || s.prevDebt > 0) s.free = false; // có tiền phải đóng thì không coi là miễn phí
    });
    const rows = [...stats.values()]
      .filter(s => activeNames.has(s.name) || s.sessions > 0 || s.paid > 0 || s.prevDebt > 0)
      .sort((a, b) => b.amount - a.amount || byName(a.name, b.name));
    const dayList = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

    return {
      month,
      students: rows,
      days: dayList,
      totals: {
        sessions: rows.reduce((t, r) => t + r.sessions, 0),
        amount: rows.reduce((t, r) => t + r.amount, 0),
        classDays: dayList.length,
        learners: rows.filter(r => r.sessions > 0).length,
        collected: rows.reduce((t, r) => t + r.paid, 0),
        outstanding: rows.reduce((t, r) => t + Math.max(0, r.amount - r.paid), 0),
        prevDebt: rows.reduce((t, r) => t + r.prevDebt, 0),
      },
    };
  }

  /** Đánh dấu / bỏ đánh dấu "đã đóng học phí" của 1 học viên trong 1 tháng. */
  function setPaid(input: PaymentInput): MonthReport {
    const month = String(input.month ?? '');
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Tháng không hợp lệ: ' + month);
    const student = String(input.student ?? '').trim();
    if (!student) throw new Error('Thiếu tên học viên');
    repo.withLock(() => {
      const list = repo.getPayments().filter(p => !(p.month === month && p.student === student));
      if (input.paid) {
        const date = assertISODate(input.date);
        // Xoá luôn nợ các tháng trước: ghi đã đóng đủ phần còn thiếu của từng tháng
        if (input.includePrevious !== false) {
          for (const [k, v] of debtsBefore(month, repo.getSessions(), list)) {
            const [name, m] = k.split('|');
            if (name === student) list.push({ month: m, student, amount: v, date, note: `Trả nợ cùng lúc đóng T${Number(month.slice(5))}` });
          }
        }
        list.push({ month, student, amount: money(input.amount), date, note: '' });
      }
      list.sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : byName(a.student, b.student)));
      repo.setPayments(list);
    });
    return getMonthReport(month);
  }

  function getMonthlyOverview(): MonthOverview[] {
    const map = new Map<string, MonthOverview>();
    for (const e of repo.getSessions()) {
      const m = e.date.slice(0, 7);
      const x = map.get(m) ?? { month: m, sessions: 0, amount: 0 };
      x.sessions += e.count; x.amount += e.count * e.fee;
      map.set(m, x);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  function getFines(): FinesData {
    return {
      fines: repo.getFines().map((f, id): Fine => ({ ...f, id })),
      students: repo.getStudents(),
    };
  }

  function addFine(input: FineRow): FinesData {
    const student = String(input.student ?? '').trim();
    const amount = money(input.amount);
    if (!student) throw new Error('Hãy chọn học viên');
    if (amount <= 0) throw new Error('Số tiền phải lớn hơn 0');
    repo.withLock(() => {
      repo.setFines([...repo.getFines(), {
        date: assertISODate(input.date), student, amount,
        type: input.type === 'Đóng phạt' ? 'Đóng phạt' : 'Phạt',
        note: String(input.note ?? '').trim(),
      }]);
    });
    return getFines();
  }

  /** Xoá theo vị trí, kèm kiểm tra nội dung để không xoá nhầm nếu sheet vừa bị sửa tay. */
  function deleteFine(id: number, expected: FineRow): FinesData {
    repo.withLock(() => {
      const list = repo.getFines();
      const f = list[id];
      if (!f || f.date !== expected.date || f.student !== expected.student || f.amount !== expected.amount || f.type !== expected.type) {
        throw new Error('Dữ liệu vừa thay đổi – hãy tải lại trang rồi thử lại');
      }
      list.splice(id, 1);
      repo.setFines(list);
    });
    return getFines();
  }

  return { getStudents, saveStudent, getWeek, saveWeek, getMonthReport, setPaid, getMonthlyOverview, getFines, addFine, deleteFine };
}

export type ServerApi = ReturnType<typeof createApi>;
export type ApiMethod = keyof ServerApi;
export const API_METHODS: ApiMethod[] = [
  'getStudents', 'saveStudent', 'getWeek', 'saveWeek', 'getMonthReport', 'setPaid',
  'getMonthlyOverview', 'getFines', 'addFine', 'deleteFine',
];
