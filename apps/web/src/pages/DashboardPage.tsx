import { useState } from 'react';
import { BarChart2, CalendarIcon } from 'lucide-react';
import { format } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import type { DateRange } from 'react-day-picker';
import { useQuery } from '@tanstack/react-query';
import { interviewsApi, statsApi } from '@/api/client';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Charts } from '@/components/dashboard/Charts';
import { RequestsStatsCard } from '@/components/dashboard/RequestsStatsCard';
import { PipelineFunnelChart } from '@/components/dashboard/PipelineFunnelChart';
import { TimelineStatsCard } from '@/components/dashboard/TimelineStatsCard';
import { QualityStatsCard } from '@/components/dashboard/QualityStatsCard';
import { CandidateInsightsCard } from '@/components/dashboard/CandidateInsightsCard';
import { InterviewsTable } from '@/components/interviews/InterviewsTable';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLayout } from '@/context/LayoutContext';


export function DashboardPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openNewAnalysis } = useLayout();
  const now = new Date();
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(now.getFullYear(), now.getMonth(), 1),
    to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
  });
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['stats'],
    queryFn: () => interviewsApi.getStats().then(r => r.data),
  });
  const { data: overview } = useQuery({
    queryKey: ['stats', 'overview', dateRange],
    queryFn: () => statsApi.getOverview({
      from: dateRange.from?.toISOString(),
      to: dateRange.to?.toISOString(),
    }).then(r => r.data),
    enabled: !!dateRange.from && !!dateRange.to,
  });

  const isEmpty = !statsLoading && stats?.total === 0;

  const { data: recent, isLoading } = useQuery({
    queryKey: ['interviews', 'recent'],
    queryFn: () => interviewsApi.getList({ page: 1 }).then(r => r.data),
  });

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

        <Popover>
          <PopoverTrigger className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
            <CalendarIcon size={14} />
            {dateRange.from && dateRange.to
              ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`
              : 'Select period'}
          </PopoverTrigger>
          <PopoverContent className="w-[calc(100vw-2rem)] max-w-[400px] p-0" align="end">
            <div className="flex gap-1 p-2 border-b justify-between">
              {[
                { label: 'This month', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }) },
                { label: 'Last month', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth() - 1, 1), to: new Date(now.getFullYear(), now.getMonth(), 0) }) },
                { label: 'Last 3 months', fn: () => ({ from: new Date(now.getFullYear(), now.getMonth() - 2, 1), to: new Date(now.getFullYear(), now.getMonth() + 1, 0) }) },
                { label: 'This year', fn: () => ({ from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) }) },
              ].map(({ label, fn }) => {
                const isActive = dateRange.from?.getMonth() === fn().from.getMonth() &&
                  dateRange.from?.getFullYear() === fn().from.getFullYear();
                return (
                  <button
                    key={label}
                    onClick={() => setDateRange(fn())}
                    className={`text-xs px-3 py-1.5 rounded-md border transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={(range: any) => { if (range?.from && range?.to) setDateRange(range); }}
              numberOfMonths={1}
              classNames={{ root: 'w-full', month: 'flex w-full flex-col gap-4' }}
            />
          </PopoverContent>
        </Popover>
      </div>

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

          {overview && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <RequestsStatsCard requests={overview.requests} />
                <PipelineFunnelChart pipeline={overview.pipeline} />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <TimelineStatsCard timing={overview.timing} />
                <QualityStatsCard quality={overview.quality} />
                <CandidateInsightsCard candidates={overview.candidates} />
              </div>
            </>
          )}

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