import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, Target, Award } from 'lucide-react';
import type { InterviewStats } from '@/api/client';
import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  accent: string;
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <Card>
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

export function StatsCards({ stats }: { stats: InterviewStats | undefined }) {
  if (!stats) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
