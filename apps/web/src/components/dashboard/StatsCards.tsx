import { Card, CardContent } from '@/components/ui/card';
import type { InterviewStats } from '@/api/client';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
        <p className="text-3xl font-semibold text-slate-900 mt-1">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function StatsCards({ stats }: { stats: InterviewStats | undefined }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="h-4 w-24 bg-slate-100 rounded animate-pulse mb-2" />
              <div className="h-8 w-16 bg-slate-100 rounded animate-pulse" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const managerCalls = stats.byStage?.manager_call ?? 0;
  const technical = stats.byStage?.technical ?? 0;

  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        label="Total Interviews"
        value={stats.total}
        sub={`${managerCalls} manager calls · ${technical} technical`}
      />
      <StatCard
        label="Hire Rate"
        value={`${stats.hireRate}%`}
        sub="Based on technical interviews"
      />
      <StatCard
        label="Avg Score"
        value={stats.avgScore > 0 ? `${stats.avgScore}/100` : '—'}
        sub="Technical interviews only"
      />
      <StatCard
        label="Top Role"
        value={
          Object.entries(stats.byRole ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
        }
        sub="Most analyzed role"
      />
    </div>
  );
}