import { useQuery } from '@tanstack/react-query';
import { interviewsApi } from '@/api/client';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Charts } from '@/components/dashboard/Charts';
import { InterviewsTable } from '@/components/interviews/InterviewsTable';

export function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ['stats'],
    queryFn: () => interviewsApi.getStats().then(r => r.data),
  });

  const { data: recent } = useQuery({
    queryKey: ['interviews', { page: 1, limit: 5 }],
    queryFn: () => interviewsApi.getList({ page: 1 }).then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <StatsCards stats={stats} />
      <Charts stats={stats} />
      <div>
        <h2 className="text-sm font-medium text-slate-600 mb-3">Recent Analyses</h2>
        <InterviewsTable data={recent ?? []} isLoading={!recent} onRowClick={() => {}} />
      </div>
    </div>
  );
}