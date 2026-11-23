import { useMemo, useState, useEffect } from 'react';
import { fmtMonth } from '../../shared/date';
import type { StudentMonthStat } from '../../shared/types';
import { money } from '../lib/format';
import { buildTuitionMessage, loadPrefs, SALUTATIONS, savePrefs, STYLES, type MessageOptions } from '../lib/tuitionMessage';
import { copyText } from '../lib/clipboard';
import { useUi } from '../ui';
import { Sheet } from './Sheet';

interface Props {
  stat: StudentMonthStat;
  month: string;
  onClose(): void;
}

/** Soạn tin nhắn báo học phí gửi phụ huynh (không kèm tiền phạt). */
export function TuitionDialog({ stat, month, onClose }: Props) {
  const { toast } = useUi();
  const [opt, setOpt] = useState<MessageOptions>(() => loadPrefs(stat.name));
  const generated = useMemo(() => buildTuitionMessage(stat, month, opt), [stat, month, opt]);
  const [text, setText] = useState(generated);
  useEffect(() => setText(generated), [generated]);
  const update = (patch: Partial<MessageOptions>) => setOpt(o => ({ ...o, ...patch }));

  const copy = async () => {
    savePrefs(stat.name, opt);
    if (await copyText(text)) {
      toast(`📋 Đã copy – mở Zalo và dán gửi ${opt.salutation === 'Học sinh' ? stat.name : 'phụ huynh ' + stat.name}`);
      onClose();
    } else {
      (document.getElementById('tuition-text') as HTMLTextAreaElement | null)?.select();
      toast('Không copy tự động được – hãy nhấn giữ và chọn Sao chép', true);
    }
  };

  return (
    <Sheet
      title={`Nhắn học phí · ${stat.name}`}
      subtitle={`${fmtMonth(month)} · ${stat.sessions} buổi · ${money(stat.amount)}`}
      onClose={onClose}
      footer={<button className="btn primary big block" onClick={() => void copy()}>📋 Copy tin nhắn</button>}
    >
      <div className="opt-row">
        <span className="opt-label">Gửi cho</span>
        <div className="chips">
          {SALUTATIONS.map(s => (
            <button key={s} aria-pressed={opt.salutation === s} onClick={() => update({ salutation: s })}>{s === 'Học sinh' ? '🎓 Học sinh' : s}</button>
          ))}
        </div>
      </div>
      <div className="opt-row">
        <span className="opt-label">Kiểu tin</span>
        <div className="chips">
          {STYLES.map(s => (
            <button key={s.id} aria-pressed={opt.style === s.id} onClick={() => update({ style: s.id })}>{s.label}</button>
          ))}
        </div>
      </div>
      <textarea id="tuition-text" value={text} onChange={e => setText(e.target.value)} rows={13} spellCheck={false} />
      {text !== generated && <button className="link small" onClick={() => setText(generated)}>↺ Khôi phục nội dung gốc</button>}
    </Sheet>
  );
}
