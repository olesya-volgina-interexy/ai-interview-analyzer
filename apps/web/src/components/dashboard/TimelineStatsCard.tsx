import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TimingData {
  avgManagerToTechnicalDays: number | null;
  avgTechnicalToFinalDays: number | null;
  avgTotalDays: number | null;
  trend: Array<{ month: string; count: number }>;
}

function StatRow({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">
        {value !== null ? `${value} days` : '—'}
      </span>
    </div>
  );
}

export function TimelineStatsCard({ timing }: { timing: TimingData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Time on Stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <StatRow label="Manager Call → Technical" value={timing.avgManagerToTechnicalDays} />
          <StatRow label="Technical → Final Result" value={timing.avgTechnicalToFinalDays} />
          <StatRow label="Total (first interview → hire)" value={timing.avgTotalDays} />
        </div>

        {timing.trend.length > 1 && (
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">
              Interviews per month
            </p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={timing.trend}>
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11 }}
                  tickFormatter={v => v.slice(5)}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={20} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  labelFormatter={v => `Month: ${v}`}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  name="Interviews"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}