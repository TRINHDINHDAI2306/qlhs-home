/** Kiểu dữ liệu dùng chung cho server (Apps Script) và client (React). Ngày luôn ở dạng 'yyyy-MM-dd'. */

export type FineType = 'Phạt' | 'Đóng phạt';

export interface Student {
  name: string;
  /** Học phí mỗi buổi (đồng) */
  fee: number;
  active: boolean;
  note: string;
}

/** 1 dòng tab DiemDanh: 1 học sinh đi học trong 1 ngày */
export interface SessionRow {
  date: string;
  student: string;
  /** Số buổi trong ngày – app chỉ ghi 1 (mỗi ngày tối đa 1 buổi); dữ liệu sửa tay có thể khác */
  count: number;
  /** Học phí/buổi tại thời điểm điểm danh */
  fee: number;
  note: string;
}

/** 1 dòng tab Phat */
export interface FineRow {
  date: string;
  student: string;
  type: FineType;
  amount: number;
  note: string;
}

export interface Fine extends FineRow {
  /** Vị trí dòng trong sheet (0 = dòng dữ liệu đầu tiên) */
  id: number;
}

export interface WeekData {
  weekStart: string;
  students: Student[];
  entries: SessionRow[];
}

export interface AttendanceInput {
  date: string;
  student: string;
  count: number;
}

export interface StudentInput extends Student {
  /** Tên cũ khi sửa; null khi thêm mới */
  originalName: string | null;
}

export interface FinesData {
  fines: Fine[];
  students: Student[];
}

export interface SessionItem {
  date: string;
  count: number;
  fee: number;
  /** Số buổi tổng nhập từ bảng tay cũ, không rõ ngày */
  legacy?: boolean;
}

/** 1 dòng tab DaDong: học sinh đã đóng học phí của 1 tháng */
export interface PaymentRow {
  /** 'yyyy-MM' */
  month: string;
  student: string;
  amount: number;
  /** Ngày đóng 'yyyy-MM-dd' */
  date: string;
  note: string;
}

/** 1 lần đóng tiền trong tháng (có id = vị trí dòng trong tab DaDong, để hoàn tác) */
export interface PaymentEntry {
  id: number;
  amount: number;
  date: string;
  note: string;
}

export interface StudentMonthStat {
  name: string;
  /** Học sinh học miễn phí (học phí/buổi = 0) */
  free: boolean;
  /** Số tiền đã đóng trong tháng này (có thể thiếu hoặc dư) */
  paid: number;
  /** Các lần đóng trong tháng này */
  payments: PaymentEntry[];
  /** Ngày đóng gần nhất, null nếu chưa đóng */
  paidDate: string | null;
  /** Số dư đầu tháng: > 0 = nợ các tháng trước, < 0 = đóng dư từ trước (được trừ vào tháng này) */
  prevDebt: number;
  /** Các tháng còn nợ, 'yyyy-MM' */
  prevDebtMonths: string[];
  /** Còn phải đóng sau mọi khoản: > 0 = còn thiếu, < 0 = đang dư */
  balance: number;
  /** Chi tiết từng ngày đi học trong tháng (để soạn tin nhắn báo học phí) */
  items: SessionItem[];
  /** Số ngày đi học */
  days: number;
  sessions: number;
  amount: number;
}

export interface DayStat {
  date: string;
  students: number;
  /** Tên các học sinh đi học hôm đó */
  names: string[];
  sessions: number;
  amount: number;
}

export interface MonthReport {
  month: string;
  students: StudentMonthStat[];
  days: DayStat[];
  totals: {
    sessions: number;
    amount: number;
    classDays: number;
    learners: number;
    /** Đã thu trong tháng */
    collected: number;
    /** Còn phải thu (gồm cả nợ các tháng trước) */
    outstanding: number;
    /** Tổng nợ học phí các tháng trước (đầu tháng) */
    prevDebt: number;
  };
}

export interface MonthOverview {
  month: string;
  sessions: number;
  amount: number;
}

/** Toàn bộ dữ liệu thô – app tải 1 lần khi mở, sau đó tính toán ngay trên máy */
export interface AllData {
  students: Student[];
  sessions: SessionRow[];
  fines: FineRow[];
  payments: PaymentRow[];
}

/** Nơi lưu dữ liệu: Google Sheet (server) hoặc localStorage (chế độ xem thử). */
export interface Repo {
  getStudents(): Student[];
  setStudents(list: Student[]): void;
  getSessions(): SessionRow[];
  setSessions(list: SessionRow[]): void;
  getFines(): FineRow[];
  setFines(list: FineRow[]): void;
  getPayments(): PaymentRow[];
  setPayments(list: PaymentRow[]): void;
  withLock<T>(fn: () => T): T;
}
