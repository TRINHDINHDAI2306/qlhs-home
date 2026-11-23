import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { compact } from '../lib/format';

export interface ColumnDatum {
  key: string;
  label: string;
  value: number;
  tooltip: ReactNode;
  /** Cột đang được chọn (vd. tháng hiện tại) */
  active?: boolean;
}

interface Props {
  data: ColumnDatum[];
  ariaLabel: string;
  emptyText: string;
  height?: number;
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Biểu đồ cột 1 chuỗi bằng SVG: cột ≤ 24px, bo 4px ở đầu, lưới mảnh, tooltip khi rê/chạm. */
export function ColumnChart({ data, ariaLabel, emptyText, height = 240 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  // Đo ngay khi hiển thị (kể cả khi dữ liệu vừa tải xong), rồi theo dõi khi đổi kích thước
  useLayoutEffect(() => {
    if (ref.current) setWidth(Math.max(280, ref.current.clientWidth));
  }, [data.length]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (!data.length) return <div ref={ref} className="chart"><div className="empty">{emptyText}</div></div>;

  const H = height;
  const m = { t: 22, r: 8, b: 28, l: 44 };
  const iw = width - m.l - m.r;
  const ih = H - m.t - m.b;
  const max = Math.max(...data.map(d => d.value), 1);
  const step = niceStep(max / 4);
  const top = Math.ceil(max / step) * step;
  const y = (v: number) => m.t + ih - (v / top) * ih;
  const band = iw / data.length;
  const bw = Math.min(24, band * 0.6);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v);
  const maxIdx = data.reduce((bi, d, i) => (d.value > data[bi].value ? i : bi), 0);
  const labelEvery = Math.ceil(data.length / Math.max(1, Math.floor(iw / 46)));
  const focus = hover ?? data.findIndex(d => d.active);

  const barPath = (cx: number, v: number) => {
    if (v <= 0) return '';
    const x0 = cx - bw / 2, yt = y(v), yb = y(0);
    const r = Math.min(4, yb - yt, bw / 2);
    return `M${x0},${yb} V${yt + r} Q${x0},${yt} ${x0 + r},${yt} H${x0 + bw - r} Q${x0 + bw},${yt} ${x0 + bw},${yt + r} V${yb} Z`;
  };

  return (
    <div ref={ref} className="chart" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${width} ${H}`} width={width} height={H} role="img" aria-label={ariaLabel}>
        {ticks.map(v => (
          <g key={v}>
            <line className="gridline" x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
            <text className="axis" x={m.l - 8} y={y(v) + 4} textAnchor="end">{compact(v)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = m.l + band * i + band / 2;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <rect className={`band ${focus === i ? 'on' : ''}`} x={m.l + band * i} y={m.t} width={band} height={ih} rx={6} />
              <path className={`bar ${focus === i ? 'on' : ''}`} d={barPath(cx, d.value)} />
              <rect className="hit" x={m.l + band * i} y={m.t} width={band} height={ih + m.b} />
              {(i % labelEvery === 0 || d.active) && (
                <text className={`axis ${d.active ? 'strong' : ''}`} x={cx} y={H - 8} textAnchor="middle">{d.label}</text>
              )}
              {i === maxIdx && d.value > 0 && (
                <text className="cap" x={cx} y={y(d.value) - 6} textAnchor="middle">{compact(d.value)}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="tip"
          style={{
            left: Math.min(Math.max(m.l + band * hover + band / 2, 80), width - 80),
            top: Math.min(y(data[hover].value), m.t + ih - 10),
          }}
        >
          {data[hover].tooltip}
        </div>
      )}
    </div>
  );
}
