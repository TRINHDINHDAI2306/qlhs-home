import { useEffect, useState, type FormEvent } from 'react';
import { DEFAULT_FEE } from '../../shared/api';
import type { Student } from '../../shared/types';
import { Avatar } from '../components/Avatar';
import { Sheet } from '../components/Sheet';
import { call } from '../lib/api';
import { compact, money } from '../lib/format';
import { useUi } from '../ui';

const FEE_PRESETS = [0, 40000, 50000, 60000, 80000, 100000];

type Editor = { mode: 'add' } | { mode: 'edit'; student: Student };

export function StudentsPage() {
  const { run, toast } = useUi();
  const [list, setList] = useState<Student[] | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState({ name: '', fee: String(DEFAULT_FEE), note: '' });

  useEffect(() => { run(call('getStudents')).then(r => r && setList(r)); }, [run]);

  const openAdd = () => { setForm({ name: '', fee: String(DEFAULT_FEE), note: '' }); setEditor({ mode: 'add' }); };
  const openEdit = (s: Student) => { setForm({ name: s.name, fee: String(s.fee), note: s.note }); setEditor({ mode: 'edit', student: s }); };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editor) return;
    const editing = editor.mode === 'edit' ? editor.student : null;
    const res = await run(call('saveStudent', {
      name: form.name, fee: Number(form.fee), note: form.note,
      active: editing ? editing.active : true,
      originalName: editing ? editing.name : null,
    }));
    if (!res) return;
    setList(res);
    setEditor(null);
    toast(editing ? '✅ Đã lưu thay đổi' : `🎉 Đã thêm ${form.name.trim()}`);
  };

  const toggleActive = async (s: Student) => {
    const res = await run(call('saveStudent', { ...s, active: !s.active, originalName: s.name }));
    if (!res) return;
    setList(res);
    toast(s.active ? `${s.name} đã nghỉ – ẩn khỏi điểm danh` : `${s.name} đi học trở lại`);
  };

  const activeCount = list?.filter(s => s.active).length ?? 0;

  return (
    <section>
      <button className="btn primary big block add-btn" onClick={openAdd}>＋ Thêm học sinh</button>

      <div className="card">
        <h2>Danh sách học sinh</h2>
        <p className="sub">{list ? `${activeCount} đang học · chạm vào tên để sửa` : 'Đang tải…'}</p>
        <ul className="student-list">
          {list?.length === 0 && <li className="empty">Chưa có học sinh nào</li>}
          {list?.map(s => (
            <li key={s.name} className={s.active ? '' : 'inactive'}>
              <button className="row-btn" onClick={() => openEdit(s)}>
                <Avatar name={s.name} />
                <span className="who">
                  <b>{s.name}</b>
                  <small>{s.fee === 0 ? '🎁 Học miễn phí' : `${money(s.fee)}/buổi`}{s.note && ` · ${s.note}`}</small>
                </span>
              </button>
              <label className="switch-wrap">
                <span className="switch-label">{s.active ? 'Đang học' : 'Đã nghỉ'}</span>
                <span className="switch">
                  <input type="checkbox" checked={s.active} onChange={() => void toggleActive(s)} aria-label={`${s.name} đang học`} />
                  <span />
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>

      {editor && (
        <Sheet
          title={editor.mode === 'add' ? 'Thêm học sinh' : `Sửa · ${editor.student.name}`}
          subtitle="Học phí mới chỉ áp dụng cho các buổi điểm danh sau này"
          onClose={() => setEditor(null)}
          footer={<button className="btn primary big block" type="submit" form="student-form">{editor.mode === 'add' ? '＋ Thêm' : '💾 Lưu'}</button>}
        >
          <form id="student-form" className="sheet-form" onSubmit={submit} autoComplete="off">
            <label className="field">
              Tên học sinh
              <input type="text" required autoFocus={editor.mode === 'add'} placeholder="VD: Nguyễn Văn A"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              Học phí mỗi buổi (đồng)
              <input type="number" inputMode="numeric" min={0} step={1000} required
                value={form.fee} onChange={e => setForm({ ...form, fee: e.target.value })} />
            </label>
            <div className="chips">
              {FEE_PRESETS.map(v => (
                <button type="button" key={v} aria-pressed={Number(form.fee) === v} onClick={() => setForm({ ...form, fee: String(v) })}>{v === 0 ? '🎁 Miễn phí' : compact(v)}</button>
              ))}
            </div>
            <label className="field">
              Ghi chú
              <input type="text" placeholder="VD: SĐT phụ huynh" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </label>
          </form>
        </Sheet>
      )}
    </section>
  );
}
