'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

type ChartDatum = {
  month: string;
  revenueCents: number;
};

const formatEuroFromCents = (value: number) =>
  (value / 100).toLocaleString('en-GB', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  });

export function RevenueChartClient({ chartData }: { chartData: ChartDatum[] }) {
  return (
    <div
      className="h-60 rounded-xl border border-slate-800 bg-slate-950/60 p-3 [&_.recharts-surface:focus]:outline-none [&_.recharts-surface:focus-visible]:outline-none md:h-80 md:p-4"
      style={{ WebkitTapHighlightColor: 'transparent' }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          accessibilityLayer={false}
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis
            dataKey="month"
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="#94a3b8"
            tick={{ fontSize: 12 }}
            tickLine={false}
            domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1)]}
            tickFormatter={formatEuroFromCents}
          />
          <Tooltip
            formatter={(value) => [formatEuroFromCents(Number(value)), 'Revenue']}
            contentStyle={{
              background: '#0b1220',
              border: '1px solid #1e293b',
              borderRadius: '10px',
              color: '#e2e8f0',
            }}
            labelStyle={{ color: '#cbd5f5' }}
          />
          <Line
            type="monotone"
            dataKey="revenueCents"
            name="Revenue"
            stroke="#ffffff"
            strokeOpacity={0.95}
            strokeWidth={2}
            dot={{ r: 3, stroke: '#ffffff', fill: '#ffffff' }}
            activeDot={{ r: 5, stroke: '#ffffff', fill: '#ffffff' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
