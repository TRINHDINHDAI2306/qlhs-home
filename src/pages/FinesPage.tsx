import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { fmtDMY, todayISO } from '../../shared/date';
import type { Fine, FinesData, FineType } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { call } from '../lib/api';
import { compact, money } from '../lib/format';
import { useUi } from '../ui';

const AMOUNT_PRESETS = [5000, 10000, 20000, 50000];
const REASONS = ['Đi muộn', 'Quên bài', 'Nghỉ không báo'];
const HISTORY_PREVIEW = 5;

interface Balance { name: string; fine: number; paid: number; owe: number }

/** Tiền phạt – quản lý riêng, không gửi kèm tin nhắn học phí. */
export function FinesPage() {
  const { run, toast } = useUi();
  const [data, setData] = useState<FinesData | null>(null);
  const [sheet, setSheet] = useState<{ student: string; type: FineType } | null>(null);
  const [form, setForm] = useState({ date: todayISO(), amount: '', note: '' });
  const [showAll, setShowAll] = useState(false);

  useEffect(() => { run(call('getFines')).then(r => r && setData(r)); }, [run]);

  const balances = useMemo<Balance[]>(() => {
    if (!data) return [];
    const map = new Map<string, Balance>();
    const get = (name: string) => map.get(name) ?? map.set(name, { name, fine: 0, paid: 0, owe: 0 }).get(name)!;
    data.students.filter(s => s.active).forEach(s => get(s.name));
    for (const f of data.fines) {
      const b = get(f.student);
      if (f.type === 'Đóng phạt') b.paid += f.amount; else b.fine += f.amount;
    }
    map.forEach(b => { b.owe = b.fine - b.paid; });
    return [...map.values()].sort((a, b) => b.owe - a.owe || a.name.localeCompare(b.name, 'vi'));
  }, [data]);

  const history = useMemo(
    () => [...(data?.fines ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)),
    [data],
  );
  const totalOwe = balances.reduce((t, b) => t + Math.max(0, b.owe), 0);

  const open = (b: Balance, type: FineType) => {
    setForm({ date: todayISO(), amount: type === 'Đóng phạt' && b.owe > 0 ? String(b.owe) : '', note: '' });
    setSheet({ student: b.name, type });
  };

  /** 1 chạm: ghi "Đóng phạt" đúng số còn nợ → nợ phạt về 0 */
  const payAll = async (b: Balance) => {
    if (!confirm(`${b.name} đã đóng đủ ${money(b.owe)} tiền phạt?\nNợ phạt sẽ được xoá.`)) return;
    const res = await run(call('addFine', { date: todayISO(), student: b.name, type: 'Đóng phạt', amount: b.owe, note: 'Đóng đủ – xoá nợ' }));
    if (!res) return;
    setData(res);
    toast(`✅ Đã xoá nợ phạt của ${b.name}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!sheet) return;
    const res = await run(call('addFine', { ...form, student: sheet.student, type: sheet.type, amount: Number(form.amount) }));
    if (!res) return;
    setData(res);
    setSheet(null);
    toast(sheet.type === 'Phạt' ? `Đã ghi phạt ${sheet.student}` : `✅ ${sheet.student} đã đóng phạt`);
  };

  const remove = async (f: Fine) => {
    if (!confirm(`Xoá "${f.type} ${money(f.amount)}" của ${f.student}?`)) return;
    const { id, ...expected } = f;
    const res = await run(call('deleteFine', id, expected));
    if (res) { setData(res); toast('Đã xoá'); }
  };

  return (
    <section>
      <div className={`kpi ${totalOwe > 0 ? 'tint-red' : 'tint-green'} fine-total`}>
        <div className="k">⚠️ Tổng tiền phạt chưa đóng</div>
        <div className="v">{data ? money(totalOwe) : '…'}</div>
        <div className="h">Quản lý riêng – không gửi kèm tin nhắn học phí</div>
      </div>

      <div className="card">
        <h2>Học viên</h2>
        <p className="sub">Bấm <b>＋ Phạt</b> để ghi phạt · <b>✓ Đã đóng</b> khi nộp đủ tiền (xoá nợ)</p>
        <ul className="student-list">
          {!data && <li className="empty">Đang tải…</li>}
          {balances.map(b => (
            <li key={b.name}>
              <Avatar name={b.name} />
              <span className="who">
                <b>{b.name}</b>
                <small>{b.owe > 0 ? <span className="owe">Còn nợ {money(b.owe)}</span> : b.owe < 0 ? <span className="paid-extra">Đã đóng đủ ✓ · dư {money(-b.owe)}</span> : b.fine > 0 ? 'Đã đóng đủ ✓' : 'Không có phạt'}</small>
              </span>
              <span className="actions">
                <button className="btn small" onClick={() => open(b, 'Phạt')}>＋ Phạt</button>
                {b.owe > 0 && <button className="btn small green" onClick={() => void payAll(b)}>✓ Đã đóng</button>}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2>Lịch sử</h2>
        <p className="sub">Mới nhất ở trên</p>
        <ul className="history">
          {data && history.length === 0 && <li className="empty">Chưa có khoản phạt nào 🎉</li>}
          {(showAll ? history : history.slice(0, HISTORY_PREVIEW)).map(f => (
            <li key={f.id}>
              <span className={`dot ${f.type === 'Phạt' ? 'bad' : 'good'}`} aria-hidden />
              <span className="who">
                <b>{f.student} · {f.type === 'Phạt' ? 'phạt' : 'đã đóng'} {money(f.amount)}</b>
                <small>{fmtDMY(f.date)}{f.note && ` · ${f.note}`}</small>
              </span>
              <button className="btn ghost icon danger" onClick={() => void remove(f)} aria-label="Xoá">🗑</button>
            </li>
          ))}
        </ul>
        {history.length > HISTORY_PREVIEW && (
          <button className="btn block soft" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Thu gọn' : `Xem tất cả (${history.length})`}
          </button>
        )}
      </div>

      {sheet && (
        <Sheet
          title={sheet.type === 'Phạt' ? `Ghi phạt · ${sheet.student}` : `Đóng phạt · ${sheet.student}`}
          onClose={() => setSheet(null)}
          footer={<button className={`btn big block ${sheet.type === 'Phạt' ? 'primary' : 'green solid'}`} type="submit" form="fine-form">💾 Lưu</button>}
        >
          <form id="fine-form" className="sheet-form" onSubmit={submit} autoComplete="off">
            <label className="field">
              Số tiền (đồng)
              <input type="number" inputMode="numeric" min={1000} step={1000} required placeholder="VD: 10000"
                value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </label>
            <div className="chips">
              {AMOUNT_PRESETS.map(v => (
                <button type="button" key={v} aria-pressed={Number(form.amount) === v} onClick={() => setForm({ ...form, amount: String(v) })}>{compact(v)}</button>
              ))}
            </div>
            {sheet.type === 'Phạt' && (
              <>
                <label className="field">
                  Lý do
                  <input type="text" placeholder="Tuỳ chọn" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
                </label>
                <div className="chips">
                  {REASONS.map(r => (
                    <button type="button" key={r} aria-pressed={form.note === r} onClick={() => setForm({ ...form, note: r })}>{r}</button>
                  ))}
                </div>
              </>
            )}
            <label className="field">
              Ngày
              <input type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            </label>
          </form>
        </Sheet>
      )}
    </section>
  );
}
