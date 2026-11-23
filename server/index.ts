/**
 * Điểm vào Apps Script. Mỗi hàm `export function` ở đây sẽ trở thành hàm toàn cục
 * (xem scripts/build-server.mjs).
 */
import { API_METHODS, createApi, type ApiMethod } from '../shared/api';
import { ensureSheets, importLegacyStudents, sheetRepo } from './sheetRepo';

export function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('Sổ lớp học')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/** Chạy 1 lần trong trình soạn Apps Script: tạo tab + nhập học viên từ bảng cũ. */
export function setup() {
  ensureSheets();
  const msg = importLegacyStudents();
  console.log(msg);
  return msg;
}

/** Cổng RPC duy nhất cho client: google.script.run.rpc(method, JSON.stringify(args)) */
export function rpc(method: string, argsJson: string): string {
  if (!(API_METHODS as string[]).includes(method)) throw new Error('Phương thức không hợp lệ: ' + method);
  const api = createApi(sheetRepo());
  const fn = api[method as ApiMethod] as (...args: unknown[]) => unknown;
  const args = JSON.parse(argsJson || '[]') as unknown[];
  return JSON.stringify(fn(...args));
}
