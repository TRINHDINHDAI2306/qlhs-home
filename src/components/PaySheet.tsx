import { useState, type FormEvent, type ReactNode } from 'react';
import { todayISO } from '../../shared/date';
import { compact, money } from '../lib/format';
import { Sheet } from './Sheet';

interface Props {
  title: string;
  /** Số tiền cần đóng (≤ 0 = không nợ) */
  due: number;
  /** Giải thích số cần đóng, vd "Tháng 11: 300.000đ + nợ T10: 50.000đ" */
  dueDetail?: ReactNode;
  /** Chữ cho trường hợp đóng dư, vd "trừ vào tháng sau" */
  overLabel: string;
  onClose(): void;
  onSubmit(p: { amount: number; date: string; note: string }): Promise<boolean>;
}

const PRESETS = [50000, 100000, 200000, 300000, 500000];

/** Form đóng tiền: nhập số tiền bất kỳ, tính ngay đủ / còn thiếu / dư. */
export function PaySheet({ title, due, dueDetail, overLabel, onClose, onSubmit }: Props) {
  const need = Math.max(0, due);
  const [amount, setAmount] = useState(need ? String(need) : '');
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const value = Math.round(Number(amount) || 0);
  const diff = value - need;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (value <= 0) return;
    setBusy(true);
    const ok = await onSubmit({ amount: value, date, note });
    setBusy(false);
    if (ok) onClose();
  };

  const chips = [...new Set([need, ...PRESETS.filter(v => v !== need && (!need || v < need * 3))])].filter(v => v > 0).slice(0, 5);

  return (
    <Sheet title={title} onClose={onClose}
      footer={<button className="btn primary big block" type="submit" form="pay-form" disabled={busy || value <= 0}>{busy ? 'Đang lưu…' : `💾 Lưu – đã nhận ${money(value)}`}</button>}>
      <form id="pay-form" className="sheet-form" onSubmit={submit} autoComplete="off">
        <div className="due-box">
          <span>Cần đóng</span>
          <b className="num">{money(need)}</b>
          {dueDetail && <small>{dueDetail}</small>}
        </div>
        <label className="field">
          Số tiền nhận được (đồng)
          <input type="number" inputMode="numeric" min={1000} step={1000} required autoFocus
            value={amount} onChange={e => setAmount(e.target.value)} placeholder="VD: 300000" />
        </label>
        <div className="chips">
          {chips.map(v => (
            <button type="button" key={v} aria-pressed={value === v} onClick={() => setAmount(String(v))}>
              {v === need ? `Đủ ${compact(v)}` : compact(v)}
            </button>
          ))}
        </div>
        {value > 0 && (
          <div className={`pay-preview ${diff === 0 ? 'ok' : diff < 0 ? 'short' : 'over'}`}>
            {diff === 0 ? '✅ Đóng đủ – hết nợ'
              : diff < 0 ? <>⏳ Đóng thiếu – còn nợ <b>{money(-diff)}</b></>
              : <>💚 Đóng dư <b>{money(diff)}</b> – {overLabel}</>}
          </div>
        )}
        <label className="field">
          Ngày nhận
          <input type="date" required value={date} onChange={e => setDate(e.target.value)} />
        </label>
        <label className="field">
          Ghi chú
          <input type="text" placeholder="VD: chuyển khoản, tiền mặt…" value={note} onChange={e => setNote(e.target.value)} />
        </label>
      </form>
    </Sheet>
  );
}
