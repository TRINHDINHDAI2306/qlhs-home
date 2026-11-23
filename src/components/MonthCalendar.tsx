import { useEffect, useState } from 'react';
import { DOW_FULL, addDays, dayOfWeek, fmtDMY, parts, todayISO } from '../../shared/date';
import type { DayStat } from '../../shared/types';
import { money } from '../lib/format';
import { Avatar } from './Avatar';

interface Props {
  month: string;
  days: DayStat[];
}

const HEAD = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

/** Lịch tháng: ngày có lớp hiện số học sinh; chạm vào ngày để xem ai đi học. */
export function MonthCalendar({ month, days }: Props) {
  const byDate = new Map(days.map(d => [d.date, d]));
  const today = todayISO();
  const first = `${month}-01`;
  const [y, m] = parts(first);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (dayOfWeek(first) + 6) % 7; // số ô trống trước ngày 1 (tuần bắt đầu Thứ 2)
  const cells: (string | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => addDays(first, i)),
  ];
  while (cells.length % 7) cells.push(null);

  const latest = days.length ? days[days.length - 1].date : null;
  const [selected, setSelected] = useState<string | null>(latest);
  useEffect(() => setSelected(latest), [month, latest]);
  const sel = selected ? byDate.get(selected) : undefined;

  return (
    <div className="mcal">
      <div className="mcal-grid" role="grid" aria-label="Lịch học tháng">
        {HEAD.map(h => <div key={h} className="mcal-head">{h}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} className="mcal-cell empty" />;
          const stat = byDate.get(d);
          return (
            <button
              key={d}
              className={`mcal-cell ${stat ? 'has' : ''} ${d === today ? 'today' : ''} ${d === selected ? 'sel' : ''}`}
              onClick={() => setSelected(d)}
              aria-label={`${fmtDMY(d)}: ${stat ? `${stat.students} học sinh` : 'không có lớp'}`}
            >
              <span className="mcal-num">{parts(d)[2]}</span>
              {stat && <span className="mcal-badge">{stat.students}</span>}
            </button>
          );
        })}
      </div>

      <div className="mcal-detail">
        {!selected ? (
          <p className="hint">Chạm vào một ngày để xem ai đi học.</p>
        ) : !sel ? (
          <p className="hint"><b>{DOW_FULL[dayOfWeek(selected)]}, {fmtDMY(selected)}</b> · không có lớp</p>
        ) : (
          <>
            <div className="mcal-detail-head">
              <b>{DOW_FULL[dayOfWeek(selected)]}, {fmtDMY(selected)}</b>
              <span className="num">{sel.students} học sinh · {money(sel.amount)}</span>
            </div>
            <ul className="mcal-names">
              {sel.names.map(n => <li key={n}><Avatar name={n} /> {n}</li>)}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
