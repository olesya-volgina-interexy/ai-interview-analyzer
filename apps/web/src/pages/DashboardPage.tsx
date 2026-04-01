import { useState } from 'react';
import { BarChart2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { interviewsApi } from '@/api/client';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Charts } from '@/components/dashboard/Charts';
import { InterviewsTable } from '@/components/interviews/InterviewsTable';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLayout } from '@/context/LayoutContext';


export function DashboardPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openNewAnalysis } = useLayout();
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => interviewsApi.getStats().then(r => r.data),
  });
  const isEmpty = !statsLoading && stats?.total === 0;

  const { data: recent, isLoading } = useQuery({
    queryKey: ['interviews', 'recent'],
    queryFn: () => interviewsApi.getList({ page: 1 }).then(r => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <StatsCards stats={stats} />
      {isEmpty ? (
        <EmptyState
          icon={BarChart2}
          title="No interviews analyzed yet"
          description="Run your first analysis to see statistics and charts here."
          action={{ label: '+ New Analysis', onClick: openNewAnalysis }}
        />
      ) : (
        <>
          <Charts stats={stats} />

          <div>
            <h2 className="text-sm font-medium text-slate-600 mb-3">Recent Analyses</h2>
            <InterviewsTable
              data={recent?.slice(0, 5) ?? []}
              isLoading={isLoading}
              onRowClick={setSelectedId}
            />
          </div>
        </>
      )}

      <CandidateModal
        interviewId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}