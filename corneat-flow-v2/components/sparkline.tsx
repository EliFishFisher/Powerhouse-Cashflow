import type { WeeklyRow } from "@/lib/types";

interface SparklineProps {
  data:   WeeklyRow[];
  color?: string;
}

export function Sparkline({ data, color = "#3b82f6" }: SparklineProps) {
  if (!data || data.length < 2) return null;
  const vals  = data.map(d => d.closing_bal);
  const min   = Math.min(...vals);
  const max   = Math.max(...vals);
  const range = max - min || 1;
  const W = 80, H = 24;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * W},${H - ((v - min) / range) * H * 0.8 - H * 0.1}`)
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: 80, height: 24 }} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      {vals.map((v, i) => {
        const x = (i / (vals.length - 1)) * W;
        const y = H - ((v - min) / range) * H * 0.8 - H * 0.1;
        return <circle key={i} cx={x} cy={y} r="1.5" fill={color} />;
      })}
    </svg>
  );
}
