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

/* ---------- Trạng thái đồng bộ (cho chỉ báo "Đang lưu…" / "Đang cập nhật…") ---------- */
export interface SyncState { pending: number; refreshing: boolean; error: string; loadedAt: number }
let sync: SyncState = { pending: 0, refreshing: false, error: '', loadedAt: 0 };
const syncListeners = new Set<(s: SyncState) => void>();
const reloadListeners = new Set<() => void>();
const setSync = (patch: Partial<SyncState>) => { sync = { ...sync, ...patch }; syncListeners.forEach(l => l(sync)); };
export const getSync = () => sync;
export function onSync(l: (s: SyncState) => void) { syncListeners.add(l); return () => { syncListeners.delete(l); }; }
/** Gọi khi dữ liệu trên máy được thay bằng dữ liệu mới từ Sheet (để các trang vẽ lại) */
export function onReload(l: () => void) { reloadListeners.add(l); return () => { reloadListeners.delete(l); }; }

/* ---------- Bộ nhớ đệm trên máy: mở app tức thì bằng dữ liệu lần trước ---------- */
const CACHE_KEY = 'solop-cache-v1';
function readCache(): AllData | null {
  try {
    const d = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as AllData | null;
    return d && Array.isArray(d.students) && Array.isArray(d.sessions) ? { ...d, fines: d.fines ?? [], payments: d.payments ?? [] } : null;
  } catch { return null; }
}
function writeCache(json: string) { try { localStorage.setItem(CACHE_KEY, json); } catch { /* đầy bộ nhớ – bỏ qua */ } }

/* ---------- Dữ liệu trong bộ nhớ ---------- */
let local: ServerApi | null = null;
let localJson = '';            // bản JSON của dữ liệu đã xác nhận từ Sheet gần nhất
let fresh: Promise<void> | null = null; // xong khi đã có dữ liệu MỚI NHẤT từ Sheet
let queue: Promise<void> = Promise.resolve();
let writeSeq = 0;
let needResync = false;
let reconcileTimer: number | undefined;

/**
 * Thay dữ liệu trên máy bằng dữ liệu từ Sheet (Sheet luôn là bản chuẩn).
 * So với dữ liệu ĐANG HIỆN trên máy (gồm cả thay đổi vừa áp dụng) → true nếu khác.
 */
function adopt(data: AllData): boolean {
  const json = JSON.stringify(data);
  const current = local ? JSON.stringify(local.getAllData()) : '';
  const changed = json !== current;
  if (changed) local = createApi(memoryRepo(data));
  if (json !== localJson) { localJson = json; writeCache(json); }
  setSync({ loadedAt: Date.now() });
  return changed;
}

async function fetchAll(): Promise<AllData> {
  try { return (await remote('getAllData', [])) as AllData; }
  catch (e) { throw cleanError(e); }
}

/**
 * Mở app. Có dữ liệu lần trước → hiện ngay, đồng thời tải bản mới nhất ở nền
 * (có khác thì tự cập nhật màn hình). Chưa có → chờ tải xong.
 */
export async function loadAll(): Promise<void> {
  if (MODE === 'demo') { local ??= createApi(localRepo()); setSync({ loadedAt: Date.now() }); return; }
  const cached = local ? null : readCache();
  const job = (async () => {
    setSync({ refreshing: true });
    try {
      const changed = adopt(await fetchAll());
      setSync({ error: '' });
      if (changed && cached) reloadListeners.forEach(l => l());
    } finally {
      setSync({ refreshing: false });
    }
  })();
  fresh = job;
  if (cached) {
    adopt(cached); // giống hệt bản mới thì không vẽ lại màn hình
    job.catch(e => setSync({ error: `Đang dùng dữ liệu lưu trên máy – ${e instanceof Error ? e.message : e}` }));
    return;
  }
  await job;
}

/** Đối chiếu với Sheet (sau khi lưu / khi quay lại app). Bỏ qua nếu đang có thay đổi chưa gửi xong. */
async function reconcile(force = false): Promise<boolean> {
  if (MODE === 'demo' || sync.pending > 0) return false;
  const seq = writeSeq;
  setSync({ refreshing: true });
  try {
    const data = await fetchAll();
    if (seq !== writeSeq || sync.pending > 0) return false; // có thao tác mới trong lúc tải → để lần sau
    const changed = adopt(data);
    if (changed || force) reloadListeners.forEach(l => l());
    setSync({ error: '' });
    return true;
  } finally {
    setSync({ refreshing: false });
  }
}

/** Tải lại thủ công / khi quay lại app. */
export async function reloadAll(): Promise<boolean> {
  return reconcile(false);
}

export async function call<K extends ApiMethod>(method: K, ...args: Parameters<ServerApi[K]>): Promise<ReturnType<ServerApi[K]>> {
  if (!local) await loadAll();
  const isWrite = !READ_METHODS.has(method) && MODE !== 'demo';
  if (isWrite) {
    // Chính xác: chỉ ghi khi đã có dữ liệu mới nhất từ Sheet
    try { await fresh; } catch { throw new Error('Chưa tải được dữ liệu mới nhất từ Google Sheet – kiểm tra mạng rồi thử lại'); }
    writeSeq++;
    window.clearTimeout(reconcileTimer);
  }
  const fn = local![method] as (...a: unknown[]) => ReturnType<ServerApi[K]>;
  let result: ReturnType<ServerApi[K]>;
  try {
    result = structuredClone(fn(...args)); // tính / áp dụng ngay trên máy
  } catch (e) {
    throw cleanError(e);
  }
  if (isWrite) {
    setSync({ pending: sync.pending + 1 });
    queue = queue
      .then(() => remote(method, args))
      .then(
        () => setSync({ pending: sync.pending - 1 }),
        err => {
          needResync = true;
          setSync({ pending: sync.pending - 1, error: `Lỗi lưu – đã tải lại dữ liệu từ Sheet (${cleanError(err).message})` });
        },
      )
      .then(() => {
        if (sync.pending > 0) return;
        if (needResync) {
          // Lỗi → lấy ngay dữ liệu chuẩn từ Sheet
          needResync = false;
          const msg = sync.error;
          return reconcile(true).then(() => setSync({ error: msg }), () => setSync({ error: msg }));
        }
        // Gửi xong cả loạt thành công → xoá thông báo lỗi cũ, đối chiếu lặng lẽ với Sheet sau 1,5 giây
        if (sync.error.startsWith('Lỗi lưu')) setSync({ error: '' });
        reconcileTimer = window.setTimeout(() => { void reconcile(false).catch(() => {}); }, 1500);
      });
  }
  return result;
}

export function resetDemoData() {
  localStorage.removeItem('solop-demo-v7');
  location.reload();
}
