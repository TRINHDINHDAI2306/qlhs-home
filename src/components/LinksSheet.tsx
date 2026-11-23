import { SHEET_URL } from '../config';
import { copyText } from '../lib/clipboard';
import { useUi } from '../ui';
import { Sheet } from './Sheet';

/** Link Google Sheet: xem, copy, mở. */
export function LinksSheet({ onClose, onReload }: { onClose(): void; onReload(): Promise<void> }) {
  const { toast } = useUi();
  const copy = async () => {
    if (await copyText(SHEET_URL)) toast('📋 Đã copy link Google Sheet');
    else {
      (document.getElementById('sheet-link') as HTMLInputElement | null)?.select();
      toast('Không copy tự động được – hãy nhấn giữ vào link và chọn Sao chép', true);
    }
  };
  return (
    <Sheet title="📊 Google Sheet dữ liệu" subtitle="Nơi lưu toàn bộ học viên, điểm danh, học phí, phạt" onClose={onClose}
      footer={
        <>
          <button className="btn big" onClick={() => void copy()}>📋 Copy link</button>
          <a className="btn primary big" href={SHEET_URL} target="_blank" rel="noopener noreferrer">↗ Mở Google Sheet</a>
        </>
      }>
      <input id="sheet-link" className="link-box" type="text" readOnly value={SHEET_URL} onFocus={e => e.currentTarget.select()} />
      <p className="hint">Chỉ tài khoản Google của bạn mở được Sheet này.</p>
      <button className="btn block soft" onClick={async () => {
        try { await onReload(); toast('↻ Đã tải lại dữ liệu mới nhất từ Sheet'); onClose(); }
        catch (e) { toast(e instanceof Error ? e.message : 'Không tải lại được', true); }
      }}>↻ Tải lại dữ liệu từ Sheet (sau khi sửa tay trong Sheet)</button>
    </Sheet>
  );
}
