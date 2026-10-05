import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Maximize2, RotateCcw, Pause, Play } from 'lucide-react';
export const colors: Record<string, string> = {
  personal: '#54d9c3',
  business: '#61a8ff',
  work: '#b79aff',
  school: '#f5c266',
  relationships: '#f18fb5',
  health: '#8dcc81',
  finance: '#ec9b64',
  knowledge: '#72cfed',
  projects: '#e6c86e',
};
type Node = { id: string; title: string; area: string; links: string[] };
export default function Graph({
  records,
  onSelect,
  expanded = false,
}: {
  records: Node[];
  onSelect: (id: string) => void;
  expanded?: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    points = useRef<{ x: number; y: number; id: string; radius: number }[]>([]),
    rotation = useRef({ x: 0.25, y: 0.4 }),
    zoom = useRef(1),
    drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const [paused, setPaused] = useState(false),
    [filter, setFilter] = useState('all'),
    [hover, setHover] = useState('');
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let frame = 0;
    const motion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;
    const nodes = [
      ...Object.keys(colors).map((a, i) => ({
        id: 'area-' + a,
        title: a,
        area: a,
        links: [],
        group: true,
        i,
      })),
      ...records.map((r, i) => ({ ...r, group: false, i })),
    ];
    const draw = () => {
      const rect = el.getBoundingClientRect(),
        dpr = window.devicePixelRatio || 1;
      if (el.width !== rect.width * dpr || el.height !== rect.height * dpr) {
        el.width = rect.width * dpr;
        el.height = rect.height * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width,
        h = rect.height;
      ctx.clearRect(0, 0, w, h);
      if (!paused && !motion && !drag.current) rotation.current.y += 0.0016;
      const project = (x: number, y: number, z: number) => {
        const r = rotation.current;
        const xx = x * Math.cos(r.y) + z * Math.sin(r.y),
          zz = -x * Math.sin(r.y) + z * Math.cos(r.y),
          yy = y * Math.cos(r.x) - zz * Math.sin(r.x),
          z2 = y * Math.sin(r.x) + zz * Math.cos(r.x);
        const scale = (650 / (650 + z2)) * zoom.current;
        return {
          x: w * 0.54 + xx * scale,
          y: h * 0.48 + yy * scale,
          z: z2,
          scale,
        };
      };
      const radius = Math.min(w * 0.3, h * 0.33);
      const rendered = nodes.map((n) => {
        const ai = Object.keys(colors).indexOf(n.area),
          angle = (ai / 8) * Math.PI * 2;
        let x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius * 0.65,
          z = Math.sin(angle * 2) * radius * 0.5;
        if (!n.group) {
          const a = n.i * 2.399963,
            s = 28 + Math.sqrt(n.i + 1) * 11;
          x += Math.cos(a) * s;
          y += Math.sin(a) * s;
          z += Math.sin(a * 1.3) * s;
        }
        return { ...n, ...project(x, y, z) };
      });
      const map = new Map(rendered.map((n) => [n.id, n]));
      const center = project(0, 0, 0);
      for (const n of rendered) {
        if (filter !== 'all' && n.area !== filter) continue;
        const targets = n.group
          ? [{ ...center, id: 'center' }]
          : [map.get('area-' + n.area), ...n.links.map((id) => map.get(id))];
        for (const t of targets) {
          if (!t) continue;
          ctx.beginPath();
          ctx.moveTo(n.x, n.y);
          ctx.lineTo(t.x, t.y);
          ctx.strokeStyle = n.group ? '#243544' : colors[n.area] + '40';
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      const glow = ctx.createRadialGradient(
        center.x,
        center.y,
        0,
        center.x,
        center.y,
        50,
      );
      glow.addColorStop(0, '#57d9c329');
      glow.addColorStop(1, '#57d9c300');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(center.x, center.y, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#66e1cd';
      ctx.beginPath();
      ctx.arc(center.x, center.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c9e7e1';
      ctx.fillText('MY LIFE', center.x, center.y + 28);
      points.current = [];
      for (const n of rendered.sort((a, b) => b.z - a.z)) {
        const visible = filter === 'all' || n.area === filter;
        ctx.globalAlpha = visible ? 1 : 0.1;
        const r = (n.group ? 5 : 3.5) * n.scale + (hover === n.id ? 3 : 0);
        ctx.fillStyle = colors[n.area] || '#fff';
        ctx.shadowColor = colors[n.area];
        ctx.shadowBlur = n.group ? 15 : 7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        if (n.group || hover === n.id || records.length < 15) {
          ctx.font = (n.group ? '600 ' : '') + '12px system-ui';
          ctx.fillStyle = n.group ? colors[n.area] : '#bbc7d7';
          ctx.textAlign = 'left';
          ctx.fillText(
            n.title.length > 32 ? n.title.slice(0, 30) + '…' : n.title,
            n.x + r + 7,
            n.y + 4,
          );
        }
        if (visible)
          points.current.push({ x: n.x, y: n.y, id: n.id, radius: r + 12 });
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(frame);
  }, [records, paused, filter, hover]);
  return (
    <div className={'brain-graph ' + (expanded ? 'expanded' : '')}>
      <div className="graph-legend">
        <span className="eyebrow">LIFE AREAS</span>
        {Object.entries(colors).map(([area, color]) => (
          <button
            key={area}
            className={filter === area ? 'chosen' : ''}
            onClick={() => setFilter(filter === area ? 'all' : area)}
          >
            <i style={{ background: color }} />
            {area}
            <span>{records.filter((r) => r.area === area).length}</span>
          </button>
        ))}
      </div>
      <canvas
        ref={canvas}
        aria-label="Interactive three-dimensional knowledge graph. Drag to rotate, scroll to zoom. Use the knowledge list to access every record."
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          if (drag.current) {
            const dx = e.clientX - drag.current.x,
              dy = e.clientY - drag.current.y;
            if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true;
            rotation.current.y += dx * 0.008;
            rotation.current.x += dy * 0.008;
            drag.current.x = e.clientX;
            drag.current.y = e.clientY;
          } else {
            setHover(
              points.current.find(
                (p) =>
                  Math.hypot(
                    p.x - e.clientX + rect.left,
                    p.y - e.clientY + rect.top,
                  ) < p.radius,
              )?.id || '',
            );
          }
        }}
        onPointerUp={(e) => {
          if (!drag.current?.moved) {
            const rect = e.currentTarget.getBoundingClientRect(),
              p = points.current.find(
                (p) =>
                  Math.hypot(
                    p.x - e.clientX + rect.left,
                    p.y - e.clientY + rect.top,
                  ) < p.radius,
              );
            if (p) {
              if (p.id.startsWith('area-')) setFilter(p.id.slice(5));
              else onSelect(p.id);
            }
          }
          drag.current = null;
        }}
        onWheel={(e) => {
          zoom.current = Math.max(
            0.45,
            Math.min(2.8, zoom.current - e.deltaY * 0.001),
          );
        }}
      />
      <div className="graph-caption">
        {records.length} records ·{' '}
        {records.reduce((n, r) => n + r.links.length, 0)} explicit relationships
      </div>
      <div className="graph-tools">
        <Button
          variant="outline"
          size="icon"
          aria-label="Reset graph"
          onClick={() => {
            rotation.current = { x: 0.25, y: 0.4 };
            zoom.current = 1;
            setFilter('all');
          }}
        >
          <RotateCcw size={15} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label={paused ? 'Rotate graph' : 'Pause graph'}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Fit graph"
          onClick={() => {
            zoom.current = 1;
          }}
        >
          <Maximize2 size={15} />
        </Button>
      </div>
    </div>
  );
}
