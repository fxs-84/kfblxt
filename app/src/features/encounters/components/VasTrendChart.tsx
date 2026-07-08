import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  CartesianGrid,
} from "recharts";
import type { VasPoint } from "../encounter.select";

interface VasTrendChartProps {
  data: VasPoint[];
}

/** VAS 值对应的语义色(绿→黄→橙→红),上色点用 */
function vasColor(v: number): string {
  if (v <= 3) return "#2d9d5a"; // 绿(轻)
  if (v <= 6) return "#e68a00"; // 橙(中)
  return "#c62828";             // 深红(重)
}

export function VasTrendChart({ data }: VasTrendChartProps) {
  if (data.length === 0) {
    return <div className="empty">暂无 VAS 记录</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        {/* 严重度分带背景:加大透明度 + 纯色 */}
        <ReferenceArea y1={0} y2={3} fill="#2d9d5a" fillOpacity={0.12} />
        <ReferenceArea y1={3} y2={6} fill="#e68a00" fillOpacity={0.15} />
        <ReferenceArea y1={6} y2={10} fill="#c62828" fillOpacity={0.12} />
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fontSize: 12, fill: "var(--color-text-muted)" }} />
        <Tooltip
          contentStyle={{
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 13,
          }}
          formatter={(v) => [`${v}`, "VAS"]}
          labelFormatter={(label) => `${label}`}
        />
        <Line
          type="monotone"
          dataKey="vas"
          stroke="#5a6b7c"
          strokeWidth={2}
          dot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: VasPoint }) => {
            if (cx === undefined || cy === undefined) return null;
            const color = vasColor(payload.vas);
            return (
              <circle
                key={`dot-${payload.date}`}
                cx={cx}
                cy={cy}
                r={5}
                fill={color}
                stroke="#fff"
                strokeWidth={1.5}
                style={{ filter: `drop-shadow(0 1px 2px ${color}66)` }}
              />
            );
          }}
          activeDot={({ cx, cy, payload }: { cx?: number; cy?: number; payload: VasPoint }) => {
            if (cx === undefined || cy === undefined) return null;
            const color = vasColor(payload.vas);
            return (
              <circle
                cx={cx}
                cy={cy}
                r={8}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                style={{ filter: `drop-shadow(0 0 6px ${color}99)` }}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
