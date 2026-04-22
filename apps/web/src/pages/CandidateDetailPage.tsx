import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { candidatesApi } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { ArrowLeft, Users, CheckCircle, XCircle, Target, FileText } from 'lucide-react';

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
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>

      {/* Stats cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent>
              <div className="flex items-start gap-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-7 w-12" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Insights skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {[...Array(5)].map((_, j) => (
                  <Skeleton key={j} className="h-6 rounded-md" style={{ width: `${55 + (j * 17) % 55}px` }} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* History table skeleton */}
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-slate-100 bg-[#5067F4]/5 grid grid-cols-7 gap-3">
            {[...Array(7)].map((_, i) => <Skeleton key={i} className="h-3 w-16" />)}
          </div>
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-3 py-3 border-b border-slate-100 grid grid-cols-7 gap-3 items-center">
              {[...Array(7)].map((_, j) => <Skeleton key={j} className="h-4 w-full" />)}
            </div>
          ))}
        </CardContent>
      </Card>
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

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: '/candidates' })}
          className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#5067F4]/10 text-[#5067F4] hover:bg-[#5067F4]/20 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={22} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{data.candidateName}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {data.roles.join(', ')} · {data.totalInterviews} interviews
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'CV Submitted', value: data.totalCvSent, icon: <FileText size={18} />, accent: 'bg-cyan-50 text-cyan-600' },
          { label: 'Total Interviews', value: data.totalInterviews, icon: <Users size={18} />, accent: 'bg-[#5067F4]/10 text-[#5067F4]' },
          { label: 'Hired', value: data.successful, icon: <CheckCircle size={18} />, accent: 'bg-emerald-50 text-emerald-600' },
          { label: 'Rejected', value: data.failed, icon: <XCircle size={18} />, accent: 'bg-red-50 text-red-500' },
          { label: 'Avg Score', value: data.avgScore !== null ? `${data.avgScore}/100` : '—', icon: <Target size={18} />, accent: 'bg-violet-50 text-violet-600' },
        ].map(({ label, value, icon, accent }) => (
          <Card key={label}>
            <CardContent>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 rounded-lg p-2 ${accent}`}>
                  {icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Strengths, Weaknesses & Decision Breakers */}
      {(data.topStrengths?.length > 0 || data.topWeaknesses.length > 0 || data.topDecisionBreakers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {data.topStrengths?.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Strengths</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.topStrengths.map((item, i) => (
                    <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-md capitalize" style={{ background: '#EAF3DE', color: '#27500A' }}>
                      {item.text} <span className="opacity-60">×{item.count}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {data.topWeaknesses.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Top Weaknesses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.topWeaknesses.map((item, i) => (
                    <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-md capitalize" style={{ background: '#FAEEDA', color: '#633806' }}>
                      {item.text} <span className="opacity-60">×{item.count}</span>
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {data.topDecisionBreakers.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Decision Breakers</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.topDecisionBreakers.map((item, i) => (
                    <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-md capitalize" style={{ background: '#FCEBEB', color: '#791F1F' }}>
                      {item.text} <span className="opacity-60">×{item.count}</span>
                    </span>
                  ))}
                </div>
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
                const result = i.stageResult ?? i.decision ?? i.recommendation;
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