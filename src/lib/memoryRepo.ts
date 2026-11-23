/** Repo trong bộ nhớ, khởi tạo từ dữ liệu tải 1 lần từ Google Sheet. */
import type { AllData, Repo } from '../../shared/types';

export function memoryRepo(data: AllData): Repo {
  const db: AllData = structuredClone(data);
  return {
    getStudents: () => structuredClone(db.students),
    setStudents: list => { db.students = structuredClone(list); },
    getSessions: () => structuredClone(db.sessions),
    setSessions: list => { db.sessions = structuredClone(list); },
    getFines: () => structuredClone(db.fines),
    setFines: list => { db.fines = structuredClone(list); },
    getPayments: () => structuredClone(db.payments),
    setPayments: list => { db.payments = structuredClone(list); },
    withLock: fn => fn(),
  };
}
