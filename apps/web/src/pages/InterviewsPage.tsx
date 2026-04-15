import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { interviewsApi } from '@/api/client';
import { InterviewsTable } from '@/components/interviews/InterviewsTable';
import { InterviewFilters } from '@/components/interviews/InterviewFilters';
import { CandidateModal } from '@/components/modals/CandidateModal';

export function InterviewsPage() {
  const [filters, setFilters] = useState({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: interviews, isLoading } = useQuery({
    queryKey: ['interviews', filters],
    queryFn: () => interviewsApi.getList(filters).then(r => r.data),
  });

  const { data: managers } = useQuery({
    queryKey: ['interviews', 'managers'],
    queryFn: () => interviewsApi.getManagers().then(r => r.data),
  });

  const { data: roles } = useQuery({
    queryKey: ['interviews', 'roles'],
    queryFn: () => interviewsApi.getRoles().then(r => r.data),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Interview History</h1>
        <span className="text-sm text-slate-500">{interviews?.length ?? 0} records</span>
      </div>

      <InterviewFilters value={filters} onChange={setFilters} managers={managers ?? []} roles={roles ?? []} />

      <InterviewsTable
        data={interviews ?? []}
        isLoading={isLoading}
        onRowClick={id => setSelectedId(id)}
      />

      <CandidateModal
        interviewId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}