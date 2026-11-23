import { useEffect, useState } from 'react';
import { DOW_FULL, dayOfWeek, fmtDM, fmtDMY, fmtMonth, shiftMonth } from '../../shared/date';
import type { MonthOverview, MonthReport, StudentMonthStat } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { ColumnChart, type ColumnDatum } from '../components/ColumnChart';
import { TuitionDialog } from '../components/TuitionDialog';
import { PaySheet } from '../components/PaySheet';
import { call } from '../lib/api';
import { money } from '../lib/format';
import { dateList, feeBreakdown } from '../lib/tuitionMessage';
import { MonthCalendar } from '../components/MonthCalendar';
import { copyText } from '../lib/clipboard';
import { useUi } from '../ui';

interface Props {
  month: string;
  onMonthChange(month: string): void;
}

type Filter = 'all' | 'unpaid' | 'paid';
type PayState = 'free' | 'paid' | 'partial' | 'unpaid';

/** Tổng còn phải đóng = phần thiếu tháng này + nợ các tháng trước */
/** Còn phải đóng (gồm nợ cũ, đã trừ tiền dư và số đã đóng) */
const owed = (r: StudentMonthStat) => Math.max(0, r.balance);
const monthsShort = (ms: string[]) => ms.map(m => `T${Number(m.slice(5))}`).join(', ');

function payState(r: StudentMonthStat): PayState {
  if (r.free) return 'free';
  if (r.balance <= 0) return 'paid';
  if (r.paid > 0) return 'partial';
  return 'unpaid';
}

/** Học phí tháng: ai đã đóng / chưa đóng, nhắn phụ huynh, biểu đồ. (Tiền phạt ở tab Phạt.) */
export function ReportPage({ month, onMonthChange }: Props) {
  const { run, toast } = useUi();
  const [report, setReport] = useState<MonthReport | null>(null);
  const [overview, setOverview] = useState<MonthOverview[]>([]);
  const [mode, setMode] = useState<'day' | 'month'>('day');
  const [notify, setNotify] = useState<StudentMonthStat | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyName, setBusyName] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setReport(null);
    run(Promise.all([call('getMonthReport', month), call('getMonthlyOverview')])).then(res => {
      if (alive && res) { setReport(res[0]); setOverview(res[1]); }
    });
    return () => { alive = false; };
  }, [month, run]);

  const [paying, setPaying] = useState<StudentMonthStat | null>(null);

  const pay = async (r: StudentMonthStat, p: { amount: number; date: string; note: string }) => {
    const res = await run(call('addPayment', { month, student: r.name, amount: p.amount, date: p.date, note: p.note }));
    if (!res) return false;
    setReport(res);
    const after = res.students.find(s => s.name === r.name);
    const bal = after ? after.balance : 0;
    toast(bal > 0 ? `${r.name} đã đóng ${money(p.amount)} · còn thiếu ${money(bal)}` : bal < 0 ? `${r.name} đã đóng ${money(p.amount)} · dư ${money(-bal)}` : `✅ ${r.name} đã đóng đủ`);
    return true;
  };

  const undoLast = async (r: StudentMonthStat) => {
    const last = r.payments[r.payments.length - 1];
    if (!last || !confirm(`Hoàn tác lần đóng ${money(last.amount)} ngày ${fmtDM(last.date)} của ${r.name}?`)) return;
    setBusyName(r.name);
    const res = await run(call('deletePayment', last.id, { month, student: r.name, amount: last.amount, date: last.date, note: last.note }));
    setBusyName(null);
    if (res) { setReport(res); toast(`Đã hoàn tác lần đóng của ${r.name}`); }
  };

  const copyAll = async () => {
    if (!report) return;
    const lines = [`📚 HỌC PHÍ ${fmtMonth(report.month).toUpperCase()}`];
    for (const r of report.students) {
      if (!r.sessions && !r.prevDebt) continue;
      const st = payState(r);
      const tag = st === 'free' ? ' (miễn phí)' : st === 'paid' ? ' ✅ đã đóng' : st === 'partial' ? ` (đã đóng ${money(r.paid)})` : ' ⏳ chưa đóng';
      lines.push(`• ${r.name}: ${r.sessions} buổi${st === 'free' ? '' : ` = ${money(r.amount)}`}${r.prevDebt ? ` + nợ ${monthsShort(r.prevDebtMonths)} ${money(r.prevDebt)}` : ''}${tag}`);
    }
    lines.push('——', `Tổng: ${money(report.totals.amount)} · Đã thu ${money(report.totals.collected)} · Còn ${money(report.totals.outstanding)}`);
    const text = lines.join('\n');
    if (await copyText(text)) toast('📋 Đã copy bảng tổng kết');
    else prompt('Sao chép nội dung dưới đây:', text);
  };

  const t = report?.totals;
  const learners = report?.students.filter(r => r.sessions > 0 || r.paid > 0 || r.prevDebt > 0) ?? [];
  const absent = report?.students.filter(r => r.sessions === 0 && r.paid === 0 && r.prevDebt === 0) ?? [];
  const unpaidCount = learners.filter(r => ['unpaid', 'partial'].includes(payState(r))).length;
  const paidCount = learners.filter(r => payState(r) === 'paid').length;
  const shown = learners.filter(r => {
    const st = payState(r);
    return filter === 'all' || (filter === 'paid' ? st === 'paid' : st === 'unpaid' || st === 'partial');
  });
  const progress = t && t.amount ? Math.min(100, (t.collected / t.amount) * 100) : 0;

  const chartData: ColumnDatum[] = !report ? [] : mode === 'day'
    ? report.days.map(d => ({
        key: d.date, label: fmtDM(d.date), value: d.amount,
        tooltip: <><b>{DOW_FULL[dayOfWeek(d.date)]}, {fmtDMY(d.date)}</b><br />{money(d.amount)}<br />{d.students} học sinh</>,
      }))
    : overview.slice(-12).map(o => ({
        key: o.month, label: `T${Number(o.month.slice(5))}/${o.month.slice(2, 4)}`, value: o.amount, active: o.month === month,
        tooltip: <><b>{fmtMonth(o.month)}</b><br />{money(o.amount)}<br />{o.sessions} buổi</>,
      }));

  return (
    <section>
      <div className="card week-card">
        <div className="week-nav">
          <button className="btn icon round" onClick={() => onMonthChange(shiftMonth(month, -1))} aria-label="Tháng trước">‹</button>
          <div className="week-title">
            <b>{fmtMonth(month)}</b>
            <small>{t ? `${t.sessions} buổi · ${t.learners} học sinh` : 'Đang tải…'}</small>
          </div>
          <button className="btn icon round" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Tháng sau">›</button>
        </div>
      </div>

      <div className="kpi hero money-hero">
        <div className="k">💰 Tổng học phí {fmtMonth(month).toLowerCase()}</div>
        <div className="v">{t ? money(t.amount) : '…'}</div>
        <div className="paybar" aria-hidden><span style={{ width: `${progress}%` }} /></div>
        <div className="paysplit">
          <span>✅ Đã thu <b>{t ? money(t.collected) : '…'}</b></span>
          <span>⏳ Còn <b>{t ? money(t.outstanding) : '…'}</b></span>
        </div>
        {t && t.prevDebt > 0 && <div className="prevdebt-line">📌 Nợ học phí các tháng trước: <b>{money(t.prevDebt)}</b></div>}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>Học phí từng học sinh</h2>
            <p className="sub">Bấm <b>💵 Đóng tiền</b> để nhập số tiền nhận được · <b>💬</b> để nhắn phụ huynh</p>
          </div>
          <button className="btn small" onClick={() => void copyAll()} disabled={!report}>📋 Copy</button>
        </div>

        {learners.length > 0 && (
          <div className="seg filter-seg" role="group" aria-label="Lọc">
            <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả ({learners.length})</button>
            <button aria-pressed={filter === 'unpaid'} onClick={() => setFilter('unpaid')}>Chưa đóng ({unpaidCount})</button>
            <button aria-pressed={filter === 'paid'} onClick={() => setFilter('paid')}>Đã đóng ({paidCount})</button>
          </div>
        )}

        <ul className="pay-list">
          {!report && <li className="empty">Đang tải…</li>}
          {report && learners.length === 0 && <li className="empty">Tháng này chưa có buổi học nào</li>}
          {report && learners.length > 0 && shown.length === 0 && (
            <li className="empty">{filter === 'unpaid' ? '🎉 Tất cả đã đóng học phí!' : 'Chưa có ai đóng'}</li>
          )}
          {shown.map(r => {
            const st = payState(r);
            return (
              <li key={r.name} className={`pay-item ${st}`}>
                <div className="pay-top">
                  <Avatar name={r.name} />
                  <div className="stat-main">
                    <b>{r.name}</b>
                    <small>{st === 'free' ? `${r.sessions} buổi · học miễn phí` : r.sessions ? feeBreakdown(r) : 'Tháng này chưa học buổi nào'}</small>
                    {r.sessions > 0 && <small className="dates">📅 {dateList(r).replace(' buổi đã ghi sổ', ' buổi ghi sổ (trước đây)')}</small>}
                    {r.prevDebt > 0 && <small className="debt">📌 Nợ {monthsShort(r.prevDebtMonths)}: {money(r.prevDebt)}</small>}
                    {r.prevDebt < 0 && <small className="credit">💚 Dư từ trước: {money(-r.prevDebt)}</small>}
                  </div>
                  <div className="stat-amount num">{st === 'free' ? <span className="pill free">Miễn phí</span> : money(r.amount)}</div>
                </div>
                {st !== 'free' && (
                  <div className="pay-actions">
                    {r.payments.length > 0 && (
                      <span className="pay-history">
                        {r.payments.map(p => <span key={p.id} className="pill">✅ {money(p.amount)} · {fmtDM(p.date)}</span>)}
                        <button className="btn small ghost undo-btn" onClick={() => void undoLast(r)} disabled={busyName === r.name}>↺ Hoàn tác</button>
                      </span>
                    )}
                    {st === 'paid' ? (
                      <span className="paid-chip">{r.balance < 0 ? `💚 Đủ · dư ${money(-r.balance)}` : '✅ Đã đóng đủ'}</span>
                    ) : (
                      <>
                        {st === 'partial' && <span className="partial-note">Còn thiếu {money(owed(r))}</span>}
                        <button className="btn small msg-btn" onClick={() => setNotify(r)}>💬 Nhắn</button>
                        <button className="btn small green" onClick={() => setPaying(r)}>💵 Đóng tiền</button>
                      </>
                    )}
                    {st === 'paid' && <button className="btn small" onClick={() => setPaying(r)}>💵 Đóng thêm</button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        {absent.length > 0 && <p className="hint">Không đi buổi nào: {absent.map(a => a.name).join(', ')}</p>}
      </div>

      <div className="card">
        <h2>📅 Lịch học {fmtMonth(month).toLowerCase()}</h2>
        <p className="sub">
          {report && report.days.length
            ? `${report.days.length} ngày có lớp · chạm vào ngày để xem ai đi học`
            : 'Chưa có ngày học nào – các buổi điểm danh từ nay sẽ hiện ở đây'}
        </p>
        {report && <MonthCalendar month={month} days={report.days} />}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2>{mode === 'day' ? 'Học phí theo ngày' : 'Học phí theo tháng'}</h2>
            <p className="sub">{mode === 'day' ? 'Mỗi cột là 1 ngày có lớp' : '12 tháng gần nhất'}</p>
          </div>
          <div className="seg" role="group" aria-label="Kiểu biểu đồ">
            <button aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Ngày</button>
            <button aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Tháng</button>
          </div>
        </div>
        <ColumnChart data={chartData} ariaLabel={mode === 'day' ? 'Học phí theo ngày' : 'Học phí theo tháng'}
          emptyText={report ? 'Chưa có ngày học cụ thể nào' : 'Đang tải…'} />
      </div>

      {notify && report && <TuitionDialog stat={notify} month={report.month} onClose={() => setNotify(null)} />}
      {paying && (
        <PaySheet
          title={`Đóng học phí · ${paying.name}`}
          due={owed(paying)}
          dueDetail={<>
            {fmtMonth(month)}: {money(paying.amount)}
            {paying.prevDebt > 0 && <> + nợ {monthsShort(paying.prevDebtMonths)}: {money(paying.prevDebt)}</>}
            {paying.prevDebt < 0 && <> − dư từ trước: {money(-paying.prevDebt)}</>}
            {paying.paid > 0 && <> − đã đóng: {money(paying.paid)}</>}
          </>}
          overLabel="được trừ vào tháng sau"
          onClose={() => setPaying(null)}
          onSubmit={p => pay(paying, p)}
        />
      )}
    </section>
  );
}
