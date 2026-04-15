import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { candidatesApi } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { ArrowLeft } from 'lucide-react';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

const STAGE_LABEL: Record<string, string> = {
  manager_call: 'Manager Call',
  technical: 'Technical',
  final_result: 'Final Result',
};

const RESULT_STYLE: Record<string, string> = {
  hire: 'bg-green-100 text-green-800',
  hired: 'bg-green-100 text-green-800',
  passed: 'bg-[#5067F4]/10 text-[#5067F4]',
  no_hire: 'bg-red-100 text-red-800',
  rejected: 'bg-red-100 text-red-800',
  on_hold: 'bg-slate-100 text-slate-600',
  uncertain: 'bg-yellow-100 text-yellow-800',
};

function BarList({ items, color }: { items: Array<{ text: string; count: number }>; color: string }) {
  const max = Math.max(...items.map(i => i.count), 1);
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs text-slate-600 mb-0.5">
            <span className="truncate pr-2 capitalize">{item.text}</span>
            <span className="font-medium flex-shrink-0">{item.count}x</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function CandidateDetailPage() {
  const { name } = useParams({ from: '/candidates/$name' });
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['candidate', name],
    queryFn: () => candidatesApi.getByName(decodeURIComponent(name)).then(r => r.data),
  });

  if (isLoading) return (
    <div className="p-4 md:p-6 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (isError) return (
    <div className="p-4 md:p-6">
      <button
        onClick={() => navigate({ to: '/candidates' })}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
      >
        <ArrowLeft size={16} /> Back to candidates
      </button>
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-slate-500">Candidate not found.</p>
        <p className="text-xs text-slate-400 mt-1">The name may have changed or been deleted.</p>
      </div>
    </div>
  );

  if (!data) return null;

  const scoreColor = data.avgScore !== null
    ? data.avgScore >= 75 ? 'text-green-600' : data.avgScore >= 50 ? 'text-yellow-600' : 'text-red-500'
    : 'text-slate-400';

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: '/candidates' })}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.candidateName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.roles.join(', ')} · {data.totalInterviews} interviews
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Interviews', value: data.totalInterviews, color: 'text-slate-800' },
          { label: 'Hired', value: data.successful, color: 'text-green-600' },
          { label: 'Rejected', value: data.failed, color: 'text-red-500' },
          { label: 'Avg Score', value: data.avgScore !== null ? `${data.avgScore}/100` : '—', color: scoreColor },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-50 rounded-lg p-3">
            <p className="text-xs text-slate-400 mb-1">{label}</p>
            <p className={`text-xl font-semibold ${color}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Weaknesses & Decision Breakers */}
      {(data.topWeaknesses.length > 0 || data.topDecisionBreakers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.topWeaknesses.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Weaknesses</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={data.topWeaknesses} color="#f59e0b" />
              </CardContent>
            </Card>
          )}
          {data.topDecisionBreakers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Decision Breakers</CardTitle>
              </CardHeader>
              <CardContent>
                <BarList items={data.topDecisionBreakers} color="#ef4444" />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Interview History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Interview History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-[#5067F4]/5 border-b border-[#5067F4]/10">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[14%]">Date</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[16%]">Stage</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[14%]">Role</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[16%]">Client</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[16%]">Manager</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[14%]">Result</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[10%]">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.interviews.map(i => {
                const result = i.recommendation ?? i.stageResult ?? i.decision;
                return (
                  <tr
                    key={i.id}
                    onClick={() => setSelectedId(i.id)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(i.createdAt)}</td>
                    <td className="px-3 py-2 text-slate-600">{STAGE_LABEL[i.stage] ?? i.stage}</td>
                    <td className="px-3 py-2 text-slate-600">{i.role} <span className="text-slate-400">{i.level}</span></td>
                    <td className="px-3 py-2 text-slate-600 truncate">{i.clientName ?? '—'}</td>
                    <td className="px-3 py-2 text-slate-600 truncate">{i.managerName ?? '—'}</td>
                    <td className="px-3 py-2">
                      {result ? (
                        <Badge className={`${RESULT_STYLE[result] ?? 'bg-slate-100 text-slate-600'} text-xs`}>
                          {result.replace('_', ' ')}
                        </Badge>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{i.score !== null ? `${i.score}/100` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CandidateModal
        interviewId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}