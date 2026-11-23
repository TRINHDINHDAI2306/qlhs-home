import { useEffect, useState } from 'react';
import { DOW_FULL, dayOfWeek, fmtDMY, mondayOf, todayISO } from '../shared/date';
import { getSync, loadAll, MODE, onReload, onSync, reloadAll, resetDemoData, type SyncState } from './lib/api';
import { AttendancePage } from './pages/AttendancePage';
import { ReportPage } from './pages/ReportPage';
import { StudentsPage } from './pages/StudentsPage';
import { FinesPage } from './pages/FinesPage';
import { LinksSheet } from './components/LinksSheet';
import LOGO from './assets/logo.svg?inline';

type Tab = 'attend' | 'report' | 'students' | 'fines';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'attend', icon: '📅', label: 'Điểm danh' },
  { id: 'report', icon: '💰', label: 'Học phí' },
  { id: 'students', icon: '👥', label: 'Học viên' },
  { id: 'fines', icon: '⚠️', label: 'Phạt' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng ☀️';
  if (h < 14) return 'Chào buổi trưa 🌤️';
  if (h < 18) return 'Chào buổi chiều 🌻';
  return 'Chào buổi tối 🌙';
}

export function App() {
  const [tab, setTab] = useState<Tab>('attend');
  const [week, setWeek] = useState(() => mondayOf(todayISO()));
  const [month, setMonth] = useState(() => todayISO().slice(0, 7));
  const [showLinks, setShowLinks] = useState(false);
  const [boot, setBoot] = useState<{ state: 'loading' | 'ok' | 'error'; error?: string }>({ state: 'loading' });
  const [version, setVersion] = useState(0); // tăng khi tải lại dữ liệu → các trang vẽ lại
  const [sync, setSyncState] = useState<SyncState>(getSync());

  const start = () => {
    setBoot({ state: 'loading' });
    loadAll().then(() => setBoot({ state: 'ok' }), e => setBoot({ state: 'error', error: e instanceof Error ? e.message : String(e) }));
  };
  useEffect(start, []);
  useEffect(() => onSync(setSyncState), []);
  useEffect(() => onReload(() => setVersion(v => v + 1)), []);

  // Quay lại app sau > 2 phút → tải lại (để thấy cả chỉnh sửa trực tiếp trong Google Sheet)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - getSync().loadedAt > 120_000) void reloadAll().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Còn thay đổi chưa gửi xong lên Google → cảnh báo khi đóng trang
  useEffect(() => {
    if (!sync.pending) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [sync.pending]);

  const switchTab = (next: Tab) => { if (next !== tab) setTab(next); };

  if (boot.state !== 'ok') {
    return (
      <div className="boot">
        <img src={LOGO} alt="" className="boot-logo" />
        <h1>Sổ lớp học</h1>
        {boot.state === 'loading' ? (
          <p className="boot-msg"><span className="spinner" aria-hidden /> Đang tải dữ liệu…</p>
        ) : (
          <>
            <p className="boot-msg err">⚠️ {boot.error}</p>
            <button className="btn big boot-retry" onClick={start}>↻ Thử lại</button>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <header className="app-header">
        <div className="bar">
          <div className="brand">
            <img className="logo" src={LOGO} alt="" aria-hidden />
            <div>
              <h1>Sổ lớp học</h1>
              <small>{greeting()} · {DOW_FULL[dayOfWeek(todayISO())]}, {fmtDMY(todayISO())}</small>
            </div>
            {sync.pending > 0 ? <span className="sync-chip">⏳ Đang lưu…</span>
              : sync.error ? <span className="sync-chip err" title={sync.error}>⚠️ Lỗi lưu – đã tải lại</span> : null}
            <button className="sheet-link-btn" onClick={() => setShowLinks(true)} aria-label="Link Google Sheet">📊 Sheet</button>
          </div>
          <nav role="tablist">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => switchTab(t.id)}>
                <span className="nav-icon" aria-hidden>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main key={version}>
        {MODE === 'demo' && (
          <div className="demo">
            ⚠️ <b>Bản xem thử</b> với <b>dữ liệu mẫu (tên giả)</b>. Thao tác ở đây <b>không lưu vào Google Sheet</b>.{' '}
            <button className="link" onClick={resetDemoData}>Đặt lại dữ liệu mẫu</button>
          </div>
        )}
        {tab === 'attend' && <AttendancePage week={week} onWeekChange={setWeek} />}
        {tab === 'report' && <ReportPage month={month} onMonthChange={setMonth} />}
        {tab === 'students' && <StudentsPage />}
        {tab === 'fines' && <FinesPage />}
      </main>
      {showLinks && <LinksSheet onClose={() => setShowLinks(false)} onReload={async () => { if (!(await reloadAll())) throw new Error('Đang lưu, thử lại sau giây lát'); }} />}
    </>
  );
}
