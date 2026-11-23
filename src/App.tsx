import { useState } from 'react';
import { DOW_FULL, dayOfWeek, fmtDMY, mondayOf, todayISO } from '../shared/date';
import { MODE, resetDemoData } from './lib/api';
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
  const [attendDirty, setAttendDirty] = useState(false);
  const [showLinks, setShowLinks] = useState(false);


  const switchTab = (next: Tab) => {
    if (next === tab) return;
    if (tab === 'attend' && attendDirty && !confirm('Điểm danh đang được lưu, đợi 1 giây rồi chuyển nhé. Vẫn chuyển ngay?')) return;
    setAttendDirty(false);
    setTab(next);
  };

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

      <main>
        {MODE === 'demo' && (
          <div className="demo">
            ⚠️ <b>Bản xem thử</b> với <b>dữ liệu mẫu (tên giả)</b>. Thao tác ở đây <b>không lưu vào Google Sheet</b>.{' '}
            <button className="link" onClick={resetDemoData}>Đặt lại dữ liệu mẫu</button>
          </div>
        )}
        {tab === 'attend' && <AttendancePage week={week} onWeekChange={setWeek} onDirtyChange={setAttendDirty} />}
        {tab === 'report' && <ReportPage month={month} onMonthChange={setMonth} />}
        {tab === 'students' && <StudentsPage />}
        {tab === 'fines' && <FinesPage />}
      </main>
      {showLinks && <LinksSheet onClose={() => setShowLinks(false)} />}
    </>
  );
}
