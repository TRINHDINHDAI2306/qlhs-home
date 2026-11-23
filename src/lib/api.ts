/**
 * Gọi server với kiểu dữ liệu chặt chẽ.
 * - Trên Apps Script: google.script.run.rpc(method, JSON args)
 * - Chạy local (npm run dev): dùng cùng nghiệp vụ với dữ liệu lưu ở localStorage
 */
import { createApi, type ApiMethod, type ServerApi } from '../../shared/api';
import { localRepo } from './mockRepo';

interface GasRunner {
  withSuccessHandler(cb: (result: string) => void): GasRunner;
  withFailureHandler(cb: (error: Error) => void): GasRunner;
  rpc(method: string, argsJson: string): void;
}
declare global {
  interface Window { google?: { script?: { run?: GasRunner } } }
}

export const IS_GAS = typeof window !== 'undefined' && !!window.google?.script?.run;

let mock: ServerApi | null = null;

export function call<K extends ApiMethod>(method: K, ...args: Parameters<ServerApi[K]>): Promise<ReturnType<ServerApi[K]>> {
  const runner = window.google?.script?.run;
  if (runner) {
    return new Promise((resolve, reject) => {
      runner
        .withSuccessHandler(r => resolve(JSON.parse(r)))
        .withFailureHandler(reject)
        .rpc(method, JSON.stringify(args));
    });
  }
  mock ??= createApi(localRepo());
  const fn = mock[method] as (...a: unknown[]) => ReturnType<ServerApi[K]>;
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try { resolve(structuredClone(fn(...args))); } catch (e) { reject(e); }
    }, 150);
  });
}

export function resetDemoData() {
  localStorage.removeItem('solop-demo-v7');
  location.reload();
}
