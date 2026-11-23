import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, DOW_FULL, DOW_SHORT, dayOfWeek, fmtDM, fmtDMY, mondayOf, parts, todayISO } from '../../shared/date';
import type { AttendanceInput, Student, WeekData } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { call } from '../lib/api';
import { money } from '../lib/format';
import { useUi } from '../ui';

/** grid[tên][ngày] = true nếu có đi học (mỗi ngày tối đa 1 buổi) */
type Grid = Record<string, Record<string, boolean>>;
type SaveStatus = 'idle' | 'saving' | 'error';

interface Props {
  week: string;
  onWeekChange(week: string): void;
  onDirtyChange(dirty: boolean): void;
}

const AUTOSAVE_DELAY = 800;

function gridFrom(data: WeekData): Grid {
  const g: Grid = {};
  for (const e of data.entries) if (e.count > 0) (g[e.student] ??= {})[e.date] = true;
  return g;
}

const has = (g: Grid, s: string, d: string) => !!g[s]?.[d];

function toEntries(g: Grid): AttendanceInput[] {
  const out: AttendanceInput[] = [];
  for (const [student, byDay] of Object.entries(g))
    for (const [date, on] of Object.entries(byDay)) if (on) out.push({ student, date, count: 1 });
  return out;
}

export function AttendancePage({ week, onWeekChange, onDirtyChange }: Props) {
  const { run } = useUi();
  const today = todayISO();
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const [day, setDay] = useState(() => (mondayOf(today) === week ? today : week));
  const [data, setData] = useState<WeekData | null>(null);
  const [grid, setGrid] = useState<Grid>({});
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [showWeek, setShowWeek] = useState(false);
  const weekRef = useRef(week);
  weekRef.current = week;

  useEffect(() => {
    setDay(d => (days.includes(d) ? d : days.includes(today) ? today : days[0]));
    let alive = true;
    setData(null);
    setStatus('idle');
    run(call('getWeek', week)).then(res => {
      if (alive && res) { setData(res); setGrid(gridFrom(res)); }
    });
    return () => { alive = false; };
  }, [week, days, today, run]);

  const saved = useMemo(() => (data ? gridFrom(data) : {}), [data]);

  /** Học viên hiển thị: đang học + những người có điểm danh trong tuần */
  const rows = useMemo<Student[]>(() => {
    if (!data) return [];
    const inWeek = new Set(data.entries.map(e => e.student));
    const list = data.students.filter(s => s.active || inWeek.has(s.name));
    inWeek.forEach(name => { if (!list.some(s => s.name === name)) list.push({ name, fee: 0, active: false, note: '' }); });
    return list;
  }, [data]);

  const feeOf = useMemo(() => {
    const byDay = new Map(data?.entries.map(e => [`${e.date}|${e.student}`, e.fee]));
    const byStudent = new Map(data?.students.map(s => [s.name, s.fee]));
    return (s: string, d: string) => byDay.get(`${d}|${s}`) ?? byStudent.get(s) ?? 0;
  }, [data]);

  const dirty = useMemo(
    () => rows.some(s => days.some(d => has(grid, s.name, d) !== has(saved, s.name, d))),
    [rows, days, grid, saved],
  );
  useEffect(() => onDirtyChange(dirty || status === 'saving'), [dirty, status, onDirtyChange]);

  /* ---------- Tự động lưu ---------- */
  const save = useCallback(async (g: Grid): Promise<boolean> => {
    const forWeek = week;
    setStatus('saving');
    const res = await run(call('saveWeek', forWeek, toEntries(g)));
    if (weekRef.current !== forWeek) return !!res; // đã chuyển tuần – bỏ qua kết quả
    if (res) { setData(res); setStatus('idle'); return true; }
    setStatus('error');
    return false;
  }, [week, run]);

  useEffect(() => {
    if (!dirty || status !== 'idle') return;
    const t = window.setTimeout(() => void save(grid), AUTOSAVE_DELAY);
    return () => window.clearTimeout(t);
  }, [grid, dirty, status, save]);

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const toggle = (student: string, date: string) =>
    setGrid(g => ({ ...g, [student]: { ...g[student], [date]: !has(g, student, date) } }));

  const activeRows = rows.filter(s => s.active);
  const present = rows.filter(s => has(grid, s.name, day));
  const allPresent = activeRows.length > 0 && activeRows.every(s => has(grid, s.name, day));
  const toggleAll = () =>
    setGrid(g => {
      const next = { ...g };
      for (const s of activeRows) next[s.name] = { ...next[s.name], [day]: !allPresent };
      return next;
    });

  const goWeek = async (target: string) => {
    if (dirty && status !== 'saving') await save(grid); // lưu nốt trước khi chuyển tuần
    onWeekChange(mondayOf(target));
  };
  const goToday = () => { if (mondayOf(today) === week) setDay(today); else void goWeek(today); };

  const dayAmount = present.reduce((t, s) => t + feeOf(s.name, day), 0);
  const weekStat = rows.map(s => {
    const list = days.filter(d => has(grid, s.name, d));
    return { sessions: list.length, amount: list.reduce((t, d) => t + feeOf(s.name, d), 0) };
  });
  const weekSessions = weekStat.reduce((t, x) => t + x.sessions, 0);
  const weekAmount = weekStat.reduce((t, x) => t + x.amount, 0);

  const statusChip =
    !data ? null
      : status === 'saving' ? <span className="save-chip saving">⏳ Đang lưu…</span>
      : status === 'error' ? <button className="save-chip error" onClick={() => setStatus('idle')}>⚠️ Chưa lưu được · Thử lại</button>
      : dirty ? <span className="save-chip saving">✏️ Sắp lưu…</span>
      : <span className="save-chip ok">✓ Đã lưu</span>;

  return (
    <section>
      {/* ----- Chọn tuần + ngày ----- */}
      <div className="card week-card">
        <div className="week-nav">
          <button className="btn icon round" onClick={() => void goWeek(addDays(week, -7))} aria-label="Tuần trước">‹</button>
          <div className="week-title">
            <b>{fmtDM(days[0])} – {fmtDMY(days[6])}</b>
            <small>Tuần này: {weekSessions} buổi · {money(weekAmount)}</small>
          </div>
          <button className="btn icon round" onClick={() => void goWeek(addDays(week, 7))} aria-label="Tuần sau">›</button>
        </div>
        <div className="daystrip" role="tablist" aria-label="Chọn ngày">
          {days.map(d => {
            const count = rows.filter(s => has(grid, s.name, d)).length;
            return (
              <button key={d} role="tab" aria-selected={d === day}
                className={`daychip ${d === today ? 'is-today' : ''}`} onClick={() => setDay(d)}>
                <span>{DOW_SHORT[dayOfWeek(d)]}</span>
                <b>{parts(d)[2]}</b>
                <small className={count ? 'has' : ''}>{count || '·'}</small>
              </button>
            );
          })}
        </div>
        {day !== today && <button className="link small today-link" onClick={goToday}>↩ Về hôm nay</button>}
      </div>

      {/* ----- Điểm danh trong ngày ----- */}
      <div className="card">
        <div className="day-head">
          <div>
            <h2>{DOW_FULL[dayOfWeek(day)]}, {fmtDMY(day)}{day === today && <span className="pill today-pill">Hôm nay</span>}</h2>
            <p className="sub"><b className="present">{present.length}/{activeRows.length}</b> có mặt · {money(dayAmount)}</p>
          </div>
          {statusChip}
        </div>

        <div className="progress" aria-hidden>
          <span style={{ width: `${activeRows.length ? (present.length / activeRows.length) * 100 : 0}%` }} />
        </div>

        {!data ? (
          <div className="empty">Đang tải…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Chưa có học viên. Vào tab <b>Học viên</b> để thêm.</div>
        ) : (
          <>
            <p className="hint">👆 Chạm vào tên học viên có đi học. Tự động lưu.</p>
            <ul className="roster">
              {rows.map(s => {
                const on = has(grid, s.name, day);
                return (
                  <li key={s.name}>
                    <button className={`roster-item ${on ? 'on' : ''}`} role="checkbox" aria-checked={on} onClick={() => toggle(s.name, day)}>
                      <Avatar name={s.name} />
                      <span className="who">
                        <b>{s.name}{!s.active && <span className="inactive-tag"> (đã nghỉ)</span>}</b>
                        <small>{on ? 'Có đi học' : 'Vắng'}</small>
                      </span>
                      <span className="check" aria-hidden>{on ? '✓' : ''}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {activeRows.length > 1 && (
              <button className="btn block soft" onClick={toggleAll}>
                {allPresent ? '✕ Bỏ chọn cả lớp' : '✓ Cả lớp đều đi học'}
              </button>
            )}
          </>
        )}
      </div>

      {/* ----- Bảng cả tuần (ẩn mặc định) ----- */}
      {data && rows.length > 0 && (
        <div className="card">
          <button className="collapse-head" onClick={() => setShowWeek(v => !v)} aria-expanded={showWeek}>
            <span><b>📋 Bảng cả tuần</b><small>{weekSessions} buổi · {money(weekAmount)}</small></span>
            <span className="chev">{showWeek ? '▲' : '▼'}</span>
          </button>
          {showWeek && (
            <div className="table-wrap">
              <table className="week-table">
                <thead>
                  <tr>
                    <th className="sticky">Học viên</th>
                    {days.map(d => (
                      <th key={d} className={`ctr ${d === day ? 'sel' : ''}`} onClick={() => setDay(d)}>
                        {DOW_SHORT[dayOfWeek(d)]}<br /><small>{fmtDM(d)}</small>
                      </th>
                    ))}
                    <th className="r">Buổi</th>
                    <th className="r">Tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s, i) => (
                    <tr key={s.name}>
                      <td className="sticky name">{s.name}</td>
                      {days.map(d => (
                        <td key={d} className={`ctr ${d === day ? 'sel' : ''}`}>
                          <button className={`mini ${has(grid, s.name, d) ? 'on' : ''}`} onClick={() => toggle(s.name, d)}
                            aria-label={`${s.name} ${DOW_FULL[dayOfWeek(d)]} ${fmtDM(d)}`} aria-pressed={has(grid, s.name, d)}>
                            {has(grid, s.name, d) ? 'x' : ''}
                          </button>
                        </td>
                      ))}
                      <td className="r num">{weekStat[i].sessions}</td>
                      <td className="r num">{weekStat[i].amount ? money(weekStat[i].amount) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
