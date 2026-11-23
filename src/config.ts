/** Thông tin nhận học phí – sửa tại đây rồi build lại. */
/** Link Google Sheet chứa dữ liệu (hiện ở nút 📊 trên đầu app để mở / copy) */
/** Địa chỉ API Apps Script (bản Vercel gọi vào đây; dữ liệu được bảo vệ bằng mã PIN) */
export const API_URL = 'https://script.google.com/macros/s/AKfycbwX3Zt1P1ShB9JZRR78znQ96i7ChGynb6MBzpaPSM0qhCsoQFmW5sgiywQO0I0leYSKnw/exec';

export const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1tyIEWpqDg5RFu0Lucwue9Li8zxWbYwjHlUKc-hzzWY0/edit';

export const PAYMENT = {
  accountNumber: '45010005055120',
  bank: 'BIDV',
  /** Tên chủ tài khoản (để trống nếu không muốn hiện) */
  accountName: '',
};
