import { useState } from 'react';
import { BarChart2, BarChart3, Filter, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { interviewsApi, statsApi } from '@/api/client';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Charts } from '@/components/dashboard/Charts';
import { RequestsStatsCard } from '@/components/dashboard/RequestsStatsCard';
import { PipelineFunnelChart } from '@/components/dashboard/PipelineFunnelChart';
import { TimelineStatsCard } from '@/components/dashboard/TimelineStatsCard';
import { QualityStatsCard } from '@/components/dashboard/QualityStatsCard';
import { LevelScoresCard, RoleScoresCard } from '@/components/dashboard/CandidateInsightsCard';
import { InterviewsTable } from '@/components/interviews/InterviewsTable';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { EmptyState } from '@/components/ui/EmptyState';
import { useLayout } from '@/context/LayoutContext';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';


export function DashboardPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { openNewAnalysis, dateRange } = useLayout();

// Форматируем период для отображения
  const getPeriodLabel = () => {
    if (!dateRange?.from || !dateRange?.to) return 'All time';
    
    const f = new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' });
    const fromStr = f.format(dateRange.from);
    const toStr = f.format(dateRange.to);
    
    return fromStr === toStr ? fromStr : `${fromStr} - ${toStr}`;
  };

  const periodLabel = getPeriodLabel();

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
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
      </div>

      {/* KPI Cards - always visible */}
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
          {/* Tabbed Analytics Sections */}
          <Tabs defaultValue={0}>
            <TabsList variant="line" className="w-full justify-start">
              <TabsTrigger value={0}>
                <BarChart3 size={14} />
                Overview
              </TabsTrigger>
              <TabsTrigger value={1}>
                <Filter size={14} />
                Pipeline
              </TabsTrigger>
              <TabsTrigger value={2}>
                <Sparkles size={14} />
                Quality & Insights
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab — distribution charts */}
            <TabsContent value={0}>
              <Charts stats={stats} />
            </TabsContent>

            {/* Pipeline Tab — requests, funnel, timeline */}
            <TabsContent value={1}>
              {overview ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <RequestsStatsCard 
                      requests={overview.requests} 
                      period={periodLabel} 
                    />
                    <PipelineFunnelChart pipeline={overview.pipeline} />
                  </div>
                  <TimelineStatsCard timing={overview.timing} />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="h-64 bg-slate-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Quality & Insights Tab */}
            <TabsContent value={2}>
              {overview ? (
                <div className="grid grid-cols-1 lg:grid-cols-[7fr_7fr_2fr] gap-4">
                  <QualityStatsCard quality={overview.quality} />
                  <RoleScoresCard roles={overview.candidates.avgScoreByRole} />
                  <LevelScoresCard levels={overview.candidates.avgScoreByLevel} />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[7fr_7fr_2fr] gap-4">
                  <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />
                  <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />
                  <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />
                </div>
              )}
            </TabsContent>
          </Tabs>

          {/* Recent Analyses — always visible */}
          <div>
            <h2 className="text-sm font-semibold text-slate-700 mb-3">Recent Analyses</h2>
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
