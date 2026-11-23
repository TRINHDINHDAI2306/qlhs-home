/**
 * Gọi server với kiểu dữ liệu chặt chẽ. 3 chế độ:
 * - 'gas'  : mở từ link Apps Script → google.script.run.rpc(method, args, pin)
 * - 'http' : mở từ Vercel / web      → POST tới Apps Script /exec {method, args, pin}
 * - 'demo' : chỉ khi đặt VITE_DEMO=1    → dữ liệu mẫu (tên giả) trong trình duyệt, không đụng Google Sheet
 */
import { createApi, type ApiMethod, type ServerApi } from '../../shared/api';
import { API_URL } from '../config';
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

/* ---------- Khoá API: gắn sẵn lúc build (VITE_APP_KEY trong .env.local / biến môi trường Vercel), không cần nhập ---------- */
const APP_KEY = (import.meta.env.VITE_APP_KEY as string | undefined) ?? '';
const getPin = (): string => APP_KEY;

function handleError(e: unknown): never {
  const msg = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  if (msg.startsWith('PIN_SAI') || msg.startsWith('PIN_CHUA_DAT')) {
    throw new Error('Khoá API không khớp – kiểm tra VITE_APP_KEY và ô B1 tab CaiDat');
  }
  throw new Error(msg.replace(/^PIN_\w+:\s*/, ''));
}

let mock: ServerApi | null = null;

export async function call<K extends ApiMethod>(method: K, ...args: Parameters<ServerApi[K]>): Promise<ReturnType<ServerApi[K]>> {
  try {
    if (MODE === 'gas') {
      const runner = window.google!.script!.run!;
      return await new Promise((resolve, reject) => {
        runner
          .withSuccessHandler(r => resolve(JSON.parse(r)))
          .withFailureHandler(reject)
          .rpc(method, JSON.stringify(args), getPin());
      });
    }
    if (MODE === 'http') {
      // text/plain để không cần CORS preflight (Apps Script không hỗ trợ OPTIONS)
      const res = await fetch(httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ method, args, pin: getPin() }),
      });
      if (!res.ok) throw new Error(`Không kết nối được máy chủ (${res.status})`);
      const out = (await res.json()) as { ok: boolean; data?: ReturnType<ServerApi[K]>; error?: string };
      if (!out.ok) throw new Error(out.error || 'Lỗi không xác định');
      return out.data as ReturnType<ServerApi[K]>;
    }
    mock ??= createApi(localRepo());
    const fn = mock[method] as (...a: unknown[]) => ReturnType<ServerApi[K]>;
    return await new Promise((resolve, reject) => {
      setTimeout(() => { try { resolve(structuredClone(fn(...args))); } catch (e) { reject(e); } }, 150);
    });
  } catch (e) {
    handleError(e);
  }
}

export function resetDemoData() {
  localStorage.removeItem('solop-demo-v7');
  location.reload();
}
