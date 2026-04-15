import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TimingData {
  avgManagerToTechnicalDays: number | null;
  avgTechnicalToFinalDays: number | null;
  avgTotalDays: number | null;
  trend: Array<{ month: string; count: number }>;
}

interface StatCardProps {
  label: string;
  value: number | null;
  accent?: boolean;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <div
      className="rounded-lg p-3"
      style={accent
        ? { background: '#E6F1FB' }
        : { background: 'var(--color-background-secondary)' }
      }
    >
      <p className="text-xs mb-1.5 leading-tight" style={{ color: accent ? '#185FA5' : 'var(--color-text-tertiary)' }}>
        {label}
      </p>
      <div className="flex items-baseline gap-1">
        <span
          className="text-2xl font-medium leading-none"
          style={{ color: accent ? '#0C447C' : 'var(--color-text-primary)' }}
        >
          {value !== null ? value : '—'}
        </span>
        {value !== null && (
          <span className="text-xs" style={{ color: accent ? '#185FA5' : 'var(--color-text-tertiary)' }}>
            days avg
          </span>
        )}
      </div>
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
        <div className="grid grid-cols-3 gap-2">
          <StatCard label="Manager Call → Technical" value={timing.avgManagerToTechnicalDays} />
          <StatCard label="Technical → Final Result" value={timing.avgTechnicalToFinalDays} />
          <StatCard label="Total to hire" value={timing.avgTotalDays} accent />
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