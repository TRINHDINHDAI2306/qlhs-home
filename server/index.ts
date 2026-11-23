/**
 * Điểm vào Apps Script. Mỗi hàm `export function` ở đây sẽ trở thành hàm toàn cục
 * (xem scripts/build-server.mjs).
 *
 * 2 cách gọi, đều phải kèm khoá API (tab CaiDat, ô B1 – app tự gửi, không cần nhập):
 *  - google.script.run.rpc(method, argsJson, pin)   – khi mở app từ link Apps Script
 *  - POST /exec  body: {"method","args","pin"}       – khi mở app từ Vercel
 */
import { API_METHODS, createApi, type ApiMethod } from '../shared/api';
import { ensureSheets, importLegacyStudents, readPin, sheetRepo } from './sheetRepo';

const MAX_FAILS = 20;
const LOCK_SECONDS = 600;

export function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Sổ lớp học')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** API cho bản Vercel. Trả JSON {ok, data} hoặc {ok:false, error}. */
export function doPost(e: GoogleAppsScript.Events.DoPost) {
  let out: unknown;
  try {
    const body = JSON.parse(e?.postData?.contents || '{}') as { method?: string; args?: unknown[]; pin?: string };
    out = { ok: true, data: JSON.parse(rpc(String(body.method ?? ''), JSON.stringify(body.args ?? []), String(body.pin ?? ''))) };
  } catch (err) {
    out = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Chạy 1 lần trong trình soạn Apps Script: tạo tab + nhập học viên từ bảng cũ. */
export function setup() {
  ensureSheets();
  const msg = importLegacyStudents();
  console.log(msg);
  return msg;
}

/** Kiểm tra mã PIN; sai quá nhiều lần thì khoá tạm 10 phút (chống dò mã). */
function checkPin(pin: string) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('pin_fail') || 0);
  if (fails >= MAX_FAILS) throw new Error('PIN_KHOA: Nhập sai quá nhiều lần – thử lại sau 10 phút');
  const real = readPin();
  if (!real) throw new Error('PIN_CHUA_DAT: Chưa đặt khoá API (tab CaiDat, ô B1 trong Google Sheet)');
  if (String(pin ?? '').trim() !== real) {
    cache.put('pin_fail', String(fails + 1), LOCK_SECONDS);
    throw new Error('PIN_SAI: Khoá API không đúng');
  }
}

/** Cổng RPC duy nhất: google.script.run.rpc(method, JSON.stringify(args), pin) */
export function rpc(method: string, argsJson: string, pin: string): string {
  checkPin(pin);
  if (!(API_METHODS as string[]).includes(method)) throw new Error('Phương thức không hợp lệ: ' + method);
  const api = createApi(sheetRepo());
  const fn = api[method as ApiMethod] as (...args: unknown[]) => unknown;
  const args = JSON.parse(argsJson || '[]') as unknown[];
  return JSON.stringify(fn(...args));
}
