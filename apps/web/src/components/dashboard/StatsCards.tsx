import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, Target, Award, Briefcase } from 'lucide-react';
import type { InterviewStats, StatsOverview } from '@/api/client';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  accent: string;
  className?: string;
}

export function StatCard({ label, value, sub, icon, accent, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-1 pb-1">
        <div className="flex items-start gap-3">
          <div className={`flex-shrink-0 rounded-lg p-2 ${accent}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function StatsCards({
  stats,
  overview,
}: {
  stats: InterviewStats | undefined;
  overview?: StatsOverview;
}) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start gap-3">
                <div className="h-[34px] w-[34px] bg-slate-100 rounded-lg animate-pulse" />
                <div className="flex-1">
                  <div className="h-3 w-20 bg-slate-100 rounded animate-pulse mb-2" />
                  <div className="h-7 w-14 bg-slate-100 rounded animate-pulse" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const managerCalls = stats.byStage?.manager_call ?? 0;
  const technical = stats.byStage?.technical ?? 0;

  const totalRequests = overview?.requests.total ?? 0;
  const hiredRequests = overview?.requests.byStatus?.hired ?? 0;
  const linearHireRate = totalRequests > 0
    ? Math.round((hiredRequests / totalRequests) * 100)
    : 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <StatCard
        icon={<Briefcase size={18} />}
        accent="bg-sky-50 text-sky-600"
        label="Linear Hire Rate"
        value={overview ? `${linearHireRate}%` : '—'}
        sub={overview ? `${hiredRequests} of ${totalRequests} vacancies closed` : 'Loading…'}
      />
      <StatCard
        icon={<Users size={18} />}
        accent="bg-[#5067F4]/10 text-[#5067F4]"
        label="Total Interviews"
        value={stats.total}
        sub={`${managerCalls} manager calls · ${technical} technical`}
      />
      <StatCard
        icon={<TrendingUp size={18} />}
        accent="bg-emerald-50 text-emerald-600"
        label="Hire Rate"
        value={`${stats.hireRate}%`}
        sub="Based on technical interviews"
      />
      <StatCard
        icon={<Target size={18} />}
        accent="bg-violet-50 text-violet-600"
        label="Avg Score"
        value={stats.avgScore > 0 ? `${stats.avgScore}/100` : '—'}
        sub="Technical interviews only"
      />
      <StatCard
        className="col-span-2 lg:col-span-1"
        icon={<Award size={18} />}
        accent="bg-amber-50 text-amber-600"
        label="Top Role"
        value={
          Object.entries(stats.byRole ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'
        }
        sub="Most analyzed role"
      />
    </div>
  );
}
