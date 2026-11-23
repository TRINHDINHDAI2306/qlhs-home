/**
 * Lớp dữ liệu của app.
 *
 * - Khi mở app: tải TOÀN BỘ dữ liệu 1 lần (getAllData) vào bộ nhớ.
 * - Đọc (chuyển tab, đổi tuần/tháng): tính ngay trên máy bằng cùng nghiệp vụ shared/api.ts → tức thì.
 * - Ghi (điểm danh, đã đóng, phạt…): áp dụng ngay trên máy, rồi gửi lên Google theo hàng đợi (đúng thứ tự).
 *   Nếu Google báo lỗi → tải lại toàn bộ dữ liệu chuẩn từ Sheet.
 *
 * Kết nối: 'gas' (mở từ link Apps Script) · 'http' (Vercel/web) · 'demo' (VITE_DEMO=1, dữ liệu mẫu).
 */
import { createApi, type ApiMethod, type ServerApi } from '../../shared/api';
import type { AllData } from '../../shared/types';
import { API_URL } from '../config';
import { memoryRepo } from './memoryRepo';
import { localRepo } from './mockRepo';

interface GasRunner {
  withSuccessHandler(cb: (result: string) => void): GasRunner;
  withFailureHandler(cb: (error: Error) => void): GasRunner;
  rpc(method: string, argsJson: string, pin: string): void;
}
declare global {
  interface Window { google?: { script?: { run?: GasRunner } } }
}

// Mặc định luôn dùng dữ liệu thật (kể cả `npm run dev`). Muốn xem dữ liệu mẫu: VITE_DEMO=1 npm run dev
const httpUrl = import.meta.env.VITE_DEMO === '1' ? '' : (import.meta.env.VITE_API_URL as string | undefined) || API_URL;

export const MODE: 'gas' | 'http' | 'demo' =
  typeof window !== 'undefined' && window.google?.script?.run ? 'gas' : httpUrl ? 'http' : 'demo';

/** Khoá API gắn lúc build (VITE_APP_KEY trong .env.local / biến môi trường Vercel) */
const APP_KEY = (import.meta.env.VITE_APP_KEY as string | undefined) ?? '';

const READ_METHODS = new Set<ApiMethod>(['getAllData', 'getStudents', 'getWeek', 'getMonthReport', 'getMonthlyOverview', 'getFines']);

function cleanError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  if (msg.startsWith('PIN_SAI') || msg.startsWith('PIN_CHUA_DAT')) return new Error('Khoá API không khớp – kiểm tra VITE_APP_KEY và ô B1 tab CaiDat');
  return new Error(msg.replace(/^PIN_\w+:\s*/, ''));
}

/* ---------- Gọi Google (Apps Script) ---------- */
async function remote(method: ApiMethod, args: unknown[]): Promise<unknown> {
  if (MODE === 'gas') {
    const runner = window.google!.script!.run!;
    return new Promise((resolve, reject) => {
      runner.withSuccessHandler(r => resolve(JSON.parse(r))).withFailureHandler(reject).rpc(method, JSON.stringify(args), APP_KEY);
    });
  }
  // text/plain để không cần CORS preflight (Apps Script không hỗ trợ OPTIONS)
  const res = await fetch(httpUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ method, args, pin: APP_KEY }),
  });
  if (!res.ok) throw new Error(`Không kết nối được máy chủ (${res.status})`);
  const out = (await res.json()) as { ok: boolean; data?: unknown; error?: string };
  if (!out.ok) throw new Error(out.error || 'Lỗi không xác định');
  return out.data;
}

/* ---------- Trạng thái đồng bộ (cho chỉ báo "Đang lưu…") ---------- */
export interface SyncState { pending: number; error: string; loadedAt: number }
let sync: SyncState = { pending: 0, error: '', loadedAt: 0 };
const syncListeners = new Set<(s: SyncState) => void>();
const reloadListeners = new Set<() => void>();
const setSync = (patch: Partial<SyncState>) => { sync = { ...sync, ...patch }; syncListeners.forEach(l => l(sync)); };
export const getSync = () => sync;
export function onSync(l: (s: SyncState) => void) { syncListeners.add(l); return () => { syncListeners.delete(l); }; }
/** Gọi khi dữ liệu được tải lại từ Sheet (để các trang vẽ lại) */
export function onReload(l: () => void) { reloadListeners.add(l); return () => { reloadListeners.delete(l); }; }

/* ---------- Dữ liệu trong bộ nhớ ---------- */
let local: ServerApi | null = null;
let queue: Promise<void> = Promise.resolve();
let needResync = false;

/** Tải toàn bộ dữ liệu 1 lần (khi mở app / tải lại). */
export async function loadAll(): Promise<void> {
  if (MODE === 'demo') {
    local ??= createApi(localRepo());
  } else {
    try {
      const data = (await remote('getAllData', [])) as AllData;
      local = createApi(memoryRepo(data));
    } catch (e) {
      throw cleanError(e);
    }
  }
  setSync({ loadedAt: Date.now() });
}

/** Tải lại từ Sheet rồi báo các trang vẽ lại (bỏ qua nếu còn thay đổi chưa gửi xong). */
export async function reloadAll(): Promise<boolean> {
  if (sync.pending > 0) return false;
  await loadAll();
  setSync({ error: '' });
  reloadListeners.forEach(l => l());
  return true;
}

export async function call<K extends ApiMethod>(method: K, ...args: Parameters<ServerApi[K]>): Promise<ReturnType<ServerApi[K]>> {
  if (!local) await loadAll();
  const fn = local![method] as (...a: unknown[]) => ReturnType<ServerApi[K]>;
  let result: ReturnType<ServerApi[K]>;
  try {
    result = structuredClone(fn(...args)); // tính / áp dụng ngay trên máy
  } catch (e) {
    throw cleanError(e);
  }
  if (!READ_METHODS.has(method) && MODE !== 'demo') {
    setSync({ pending: sync.pending + 1 });
    queue = queue
      .then(() => remote(method, args))
      .then(
        () => setSync({ pending: sync.pending - 1 }),
        err => {
          needResync = true;
          setSync({ pending: sync.pending - 1, error: cleanError(err).message });
        },
      )
      .then(async () => {
        // Có lỗi và đã gửi hết hàng đợi → tải lại dữ liệu chuẩn từ Sheet
        if (needResync && sync.pending === 0) {
          needResync = false;
          try { await loadAll(); reloadListeners.forEach(l => l()); } catch { /* giữ thông báo lỗi */ }
        }
      });
  }
  return result;
}

export function resetDemoData() {
  localStorage.removeItem('solop-demo-v7');
  location.reload();
}
