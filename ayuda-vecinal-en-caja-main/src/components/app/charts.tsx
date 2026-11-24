import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DailyPoint } from "@/lib/finance";
import { money } from "@/lib/format";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--color-border)",
  background: "var(--color-card)",
  fontSize: 12,
};

export function SalesBarChart({ data, height = 240 }: { data: DailyPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v) => `$${v}`} />
        <Tooltip
          cursor={{ fill: "var(--color-muted)" }}
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [money(v), name === "ventas" ? "Ventas" : "Ganancia bruta"]}
        />
        <Bar dataKey="ventas" fill="var(--color-success)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        <Bar dataKey="ganancia" fill="var(--color-chart-2)" radius={[6, 6, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ data, height = 260 }: { data: DailyPoint[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v) => `$${v}`} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v: number, name: string) => [money(v), name === "ventas" ? "Ventas" : name === "ganancia" ? "Ganancia bruta" : "Gastos"]}
        />
        <Legend formatter={(v) => (v === "ventas" ? "Ventas" : v === "ganancia" ? "Ganancia bruta" : "Gastos")} wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="ventas" stroke="var(--color-chart-1)" strokeWidth={3} dot={false} />
        <Line type="monotone" dataKey="ganancia" stroke="var(--color-chart-2)" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="gastos" stroke="var(--color-chart-5)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = ["var(--color-chart-1)", "var(--color-chart-2)", "var(--color-chart-3)", "var(--color-chart-4)", "var(--color-chart-5)"];

export function CategoryPie({ data, height = 220 }: { data: { category: string; total: number }[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="total" nameKey="category" innerRadius="55%" outerRadius="85%" paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
