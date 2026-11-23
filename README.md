# Sổ lớp học (React + TypeScript + Google Sheet)

Webapp điểm danh, tính học phí và báo cáo tháng. Được thiết kế để dùng chủ yếu trên điện thoại.
App chạy trên **Google Apps Script** và đọc/ghi thẳng vào Google Sheet của bạn. Miễn phí, không cần máy chủ.

## Cấu trúc

```
shared/          Nghiệp vụ dùng chung (TypeScript) – chạy cả trên server lẫn trình duyệt
  types.ts       Kiểu dữ liệu
  date.ts        Xử lý ngày 'yyyy-MM-dd'
  api.ts         Toàn bộ logic: điểm danh, báo cáo tháng, phạt…
server/          Backend Apps Script
  index.ts       doGet / setup / rpc
  sheetRepo.ts   Đọc/ghi Google Sheet (SPREADSHEET_ID ở đầu file)
src/             Frontend React
  config.ts      ⚙️ Số tài khoản ngân hàng dùng trong tin nhắn báo học phí
  pages/         Điểm danh · Báo cáo · Học viên · Phạt
  components/    Biểu đồ cột, hộp soạn tin báo học phí
  lib/           Gọi API, định dạng tiền, mẫu tin nhắn
scripts/build-server.mjs   Đóng gói server thành dist/Code.js
```

`npm run build` tạo thư mục `dist/` gồm `index.html` (toàn bộ React gộp 1 file), `Code.js` và `appsscript.json`.

## Link app (đã triển khai)

https://script.google.com/macros/s/AKfycbwX3Zt1P1ShB9JZRR78znQ96i7ChGynb6MBzpaPSM0qhCsoQFmW5sgiywQO0I0leYSKnw/exec

Sau khi sửa code, chạy `npm run deploy` – build, đẩy code và cập nhật đúng link trên (link không đổi).

## Chạy thử trên máy

```bash
npm install
npm run dev          # mở http://localhost:5173 – chế độ xem thử với dữ liệu mẫu (lưu trong trình duyệt)
```

## Triển khai lên Google Apps Script

### Cách 1 – Dùng clasp (khuyên dùng, cập nhật chỉ bằng 1 lệnh)

1. Bật Apps Script API: https://script.google.com/home/usersettings
2. Mở Google Sheet → **Tiện ích mở rộng → Apps Script** → ⚙️ **Cài đặt dự án** → copy **Mã tập lệnh (Script ID)**.
3. Tạo file `.clasp.json` từ `.clasp.json.example` rồi dán Script ID vào.
4. Chạy:
   ```bash
   npx clasp login
   npm run push       # build + đẩy code lên Apps Script
   ```
5. Trong trình soạn Apps Script: chọn hàm **`setup`** → **Chạy** → cấp quyền.
   Hàm này tạo các tab `HocVien`, `DiemDanh`, `Phat` và nhập danh sách học viên từ tab cũ `Trang tính1`. Tab cũ được giữ nguyên.
6. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**
   - Thực thi với tư cách: **Tôi**
   - Người có quyền truy cập: **Chỉ mình tôi**
7. Mở link `/exec` trên điện thoại → **Thêm vào màn hình chính**.

Lần sau khi sửa code: chạy `npm run push`, rồi vào **Triển khai → Quản lý lượt triển khai → ✏️ → Phiên bản mới**.

### Cách 2 – Copy tay

1. Chạy `npm run build`.
2. Trong trình soạn Apps Script:
   - Dán nội dung `dist/Code.js` vào `Code.gs`.
   - Tạo file HTML tên **`index`** và dán nội dung `dist/index.html`.
   - Bật hiển thị `appsscript.json` trong Cài đặt dự án, rồi dán nội dung `dist/appsscript.json`.
3. Làm tiếp từ bước 5 của Cách 1.

## Dữ liệu trong Google Sheet

| Tab | Cột |
|---|---|
| `HocVien` | Tên · Học phí/buổi · Đang học · Ghi chú |
| `DiemDanh` | Ngày · Học viên · Số buổi · Học phí/buổi · Thành tiền (`=C×D`) · Ghi chú |
| `Phat` | Ngày · Học viên · Loại (`Phạt` / `Đóng phạt`) · Số tiền · Ghi chú |
| `DaDong` | Tháng (`yyyy-MM`) · Học viên · Số tiền · Ngày đóng · Ghi chú – đánh dấu đã đóng học phí theo tháng |

## Quy tắc tính

- Mỗi học viên **mỗi ngày tối đa 1 buổi** (1 dấu x).
- **Thành tiền** = Số buổi × Học phí/buổi.
- Học phí/buổi được lưu vào từng dòng điểm danh, nên đổi học phí không làm thay đổi các buổi đã lưu.
- **Học phí 1 ngày** = tổng thành tiền của mọi học viên trong ngày đó.
- **Tiền phạt quản lý riêng** ở tab Phạt: Còn nợ = Tổng phạt − Tổng đã đóng. Phạt không tính vào học phí và không gửi kèm tin nhắn cho phụ huynh.
- **Điểm danh tự lưu** khoảng 1 giây sau mỗi lần chạm.
- **Học viên miễn phí**: đặt học phí/buổi = 0 (nút 🎁 Miễn phí). Vẫn điểm danh bình thường, không tính tiền, không cần đánh dấu đã đóng.
- **Đã đóng học phí**: ở tab Học phí, bấm **✓ Đã đóng** cho từng học viên. Đầu trang hiện Đã thu / Còn phải thu.
- **Nợ cũ**: học phí tháng trước chưa đóng (hoặc đóng thiếu) tự cộng dồn sang tháng sau (📌 Nợ T11…) và được ghi vào tin nhắn phụ huynh. Bấm **✓ Đã đóng** sẽ **xoá sạch nợ** – cả tháng này lẫn các tháng trước.
- **Phạt**: bấm **✓ Đã đóng** ở tab Phạt là ghi đóng đủ số còn nợ → nợ phạt về 0.
- Dòng điểm danh có Ghi chú bắt đầu bằng **"Dữ liệu cũ"** là số buổi tổng nhập từ bảng tay (không rõ ngày): được tính vào học phí tháng nhưng không hiện trên lịch.

## Báo học phí cho từng học viên

Vào tab **Học phí** và bấm **💬 Nhắn** cạnh tên học viên. Trong hộp soạn tin, bạn chọn:
- **Gửi cho**: Anh/Chị (mặc định) / Anh / Chị / Cô / Chú / Phụ huynh / 🎓 Học sinh (nhắn thẳng cho học sinh, gọi tên, xưng "mình")
- **Kiểu tin**: Lịch sự / Thân mật / Ngắn gọn

Bạn có thể sửa nội dung trước khi bấm **Sao chép**. App ghi nhớ lựa chọn riêng cho từng học viên.
Số tài khoản được sửa trong `src/config.ts`.
