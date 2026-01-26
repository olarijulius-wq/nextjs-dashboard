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
    <div className="h-60 rounded-lg border border-slate-800 bg-slate-950/60 p-3 md:h-80 md:p-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
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
            formatter={(value) => formatEuroFromCents(Number(value))}
            contentStyle={{
              background: '#0f172a',
              border: '1px solid #1f2937',
              borderRadius: '8px',
              color: '#e2e8f0',
            }}
            labelStyle={{ color: '#cbd5f5' }}
          />
          <Line
            type="monotone"
            dataKey="revenueCents"
            stroke="#38bdf8"
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
