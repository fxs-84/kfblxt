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

export function VasTrendChart({ data }: VasTrendChartProps) {
  if (data.length === 0) {
    return <div className="empty">暂无 VAS 记录</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        {/* 严重度分带背景:0-3 轻 / 4-6 中 / 7-10 重 */}
        <ReferenceArea y1={0} y2={3} fill="var(--color-normal)" fillOpacity={0.06} />
        <ReferenceArea y1={3} y2={6} fill="var(--color-caution)" fillOpacity={0.08} />
        <ReferenceArea y1={6} y2={10} fill="var(--color-abnormal)" fillOpacity={0.07} />
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
        />
        <Line
          type="monotone"
          dataKey="vas"
          stroke="var(--color-accent)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "var(--color-accent)" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
