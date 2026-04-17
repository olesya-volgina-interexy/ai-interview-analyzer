import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface TimingData {
  avgTriageToManagerCallDays: number | null;
  avgManagerToTechnicalDays: number | null;
  avgTechnicalToFinalDays: number | null;
  avgTotalDays: number | null;
  avgDaysToHired: number | null;
  avgTimePerStage: Record<string, number | null>;
  trend: Array<{ month: string; count: number }>;
}

const STAGE_FLOW: Array<{ key: string; label: string; color: string }> = [
  { key: 'triage', label: 'Triage', color: '#94A3B8' },
  { key: 'in_progress', label: 'In Progress', color: '#60A5FA' },
  { key: 'client_review', label: 'Client Review', color: '#38BDF8' },
  { key: 'manager_call', label: "Broker's Call", color: '#2DD4BF' },
  { key: 'technical', label: 'Tech Call', color: '#A78BFA' },
];

function StageProgressBar({ perStage }: { perStage: Record<string, number | null> }) {
  const segments = STAGE_FLOW
    .map(s => ({ ...s, days: perStage[s.key] ?? 0 }))
    .filter(s => s.days > 0);

  const total = segments.reduce((sum, s) => sum + s.days, 0);

  if (total === 0) {
    return (
      <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
        No completed stage transitions yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex h-3 overflow-hidden rounded-full" style={{ background: 'var(--color-background-secondary)' }}>
        {segments.map(s => (
          <div
            key={s.key}
            title={`${s.label}: ${s.days} days`}
            style={{ width: `${(s.days / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3 lg:grid-cols-5">
        {STAGE_FLOW.map(s => {
          const days = perStage[s.key];
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
              <span className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>{s.label}</span>
              <span className="ml-auto text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {days !== null && days !== undefined ? `${days}d` : '—'}
              </span>
            </div>
          );
        })}
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
        <div className="rounded-lg p-3" style={{ background: '#E6F1FB' }}>
          <p className="text-xs mb-1.5 leading-tight" style={{ color: '#185FA5' }}>
            Avg time from Triage to Hired
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-medium leading-none" style={{ color: '#0C447C' }}>
              {timing.avgDaysToHired !== null ? timing.avgDaysToHired : '—'}
            </span>
            {timing.avgDaysToHired !== null && (
              <span className="text-xs" style={{ color: '#185FA5' }}>days avg</span>
            )}
          </div>
        </div>

        <StageProgressBar perStage={timing.avgTimePerStage} />

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