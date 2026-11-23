/** Repo lưu trong localStorage – chỉ dùng khi chạy thử ngoài Apps Script. */
import type { FineRow, PaymentRow, Repo, SessionRow, Student } from '../../shared/types';

const KEY = 'solop-demo-v7';

interface Db { students: Student[]; sessions: SessionRow[]; fines: FineRow[]; payments: PaymentRow[] }

/**
 * Dữ liệu mẫu (TÊN GIẢ) để xem thử giao diện khi chạy `npm run dev` / bản build tĩnh.
 * Không chứa dữ liệu thật – dữ liệu thật chỉ nằm trong Google Sheet.
 * Thao tác ở đây KHÔNG ghi vào Google Sheet.
 */
function seed(): Db {
  const fee = 50000;
  const students: Student[] = [
    ...['An', 'Bình', 'Chi', 'Dũng', 'Hà'].map(name => ({ name, fee, active: true, note: '' })),
    { name: 'Minh', fee: 0, active: true, note: 'Học miễn phí' },
  ];
  const note = 'Dữ liệu cũ – không rõ ngày (từ bảng tay)';
  const sessions: SessionRow[] = ([['An', 5], ['Bình', 5], ['Chi', 6], ['Dũng', 6], ['Hà', 6]] as const)
    .map(([student, count]) => ({ date: '2026-11-01', student, count, fee, note }));
  return { students, sessions, fines: [], payments: [] };
}

export function localRepo(): Repo {
  let db: Db;
  try { db = JSON.parse(localStorage.getItem(KEY) ?? '') as Db; } catch { db = seed(); }
  if (!db?.students) db = seed();
  db.payments ??= [];
  const save = () => localStorage.setItem(KEY, JSON.stringify(db));
  save();
  return {
    getStudents: () => structuredClone(db.students),
    setStudents: list => { db.students = structuredClone(list); save(); },
    getSessions: () => structuredClone(db.sessions),
    setSessions: list => { db.sessions = structuredClone(list); save(); },
    getFines: () => structuredClone(db.fines),
    setFines: list => { db.fines = structuredClone(list); save(); },
    getPayments: () => structuredClone(db.payments),
    setPayments: list => { db.payments = structuredClone(list); save(); },
    withLock: fn => fn(),
  };
}
