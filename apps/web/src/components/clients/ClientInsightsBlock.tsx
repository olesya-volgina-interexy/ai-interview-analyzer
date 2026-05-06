import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertTriangle, RefreshCw, Sparkles, Database } from 'lucide-react';
import type { ClientInsights } from '@shared/schemas';

const HANDLED_STYLE: Record<string, { bg: string; color: string; label: string }> = {
  well:    { bg: '#EAF3DE', color: '#3B6D11', label: 'Well' },
  partial: { bg: '#FAEEDA', color: '#854F0B', label: 'Partial' },
  poor:    { bg: '#FCEBEB', color: '#A32D2D', label: 'Poor' },
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

interface ClientInsightsBlockProps {
  clientName: string;
}

export function ClientInsightsBlock({ clientName }: ClientInsightsBlockProps) {
  const queryClient = useQueryClient();
  const [showAllQuestions, setShowAllQuestions] = useState(false);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['client-profile', clientName],
    queryFn: () => clientsApi.getClientProfile(clientName).then(r => r.data),
  });

  const rebuildMutation = useMutation({
    mutationFn: () => clientsApi.rebuildClientProfile(clientName).then(r => r.data),
    onSuccess: (fresh: ClientInsights) => {
      queryClient.setQueryData(['client-profile', clientName], fresh);
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['client-profile', clientName] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent>
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-3 w-1/3" />
          </CardContent>
        </Card>
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-32" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {[...Array(6)].map((_, j) => (
                  <Skeleton key={j} className="h-6 rounded-md" style={{ width: `${60 + (j * 17) % 60}px` }} />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-slate-500">Failed to load profile.</p>
          <Button
            onClick={() => rebuildMutation.mutate()}
            variant="outline"
            size="sm"
            className="mt-3 gap-2"
          >
            <RefreshCw size={14} />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (data.basedOnInterviews === 0) {
    return (
      <EmptyState
        icon={Database}
        title="Not enough data yet"
        description="Client profile is generated automatically as interviews accumulate."
      />
    );
  }

  const visibleQuestions = showAllQuestions
    ? data.topQuestions
    : data.topQuestions.slice(0, 10);

  return (
    <div className="space-y-4">
      {/* Summary + Refresh */}
      <Card>
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 rounded-lg p-2 bg-[#5067F4]/10 text-[#5067F4]">
              <Sparkles size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{data.summary}</p>
              <p className="text-xs text-slate-400 mt-2">
                Based on {data.basedOnInterviews} interviews · Updated {formatDate(data.generatedAt)}
              </p>
            </div>
            <Button
              onClick={() => rebuildMutation.mutate()}
              disabled={rebuildMutation.isPending}
              variant="outline"
              size="sm"
              className="gap-2 flex-shrink-0"
            >
              <RefreshCw size={14} className={rebuildMutation.isPending ? 'animate-spin' : ''} />
              {rebuildMutation.isPending ? 'Refreshing…' : 'Refresh profile'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Top questions */}
      {data.topQuestions.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Top Questions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-[#5067F4]/5 border-b border-[#5067F4]/10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[48%]">Question</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[24%]">Topic</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[12%]">Frequency</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[16%]">Handled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleQuestions.map((q, idx) => {
                  const h = q.avgHandled ? HANDLED_STYLE[q.avgHandled] : null;
                  return (
                    <tr key={`${q.topic}-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 text-slate-700 truncate" title={q.question}>{q.question}</td>
                      <td className="px-3 py-2">
                        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs font-medium">
                          {q.topic}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{q.frequency}</td>
                      <td className="px-3 py-2">
                        {h ? (
                          <span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{ background: h.bg, color: h.color }}
                          >
                            {h.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {data.topQuestions.length > 10 && (
              <div className="border-t border-slate-100 p-3 text-center">
                <button
                  onClick={() => setShowAllQuestions(s => !s)}
                  className="text-sm text-[#5067F4] hover:underline"
                >
                  {showAllQuestions ? 'Show less' : `Show more (${data.topQuestions.length - 10})`}
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Patterns: success / failure */}
      {(data.successPatterns.length > 0 || data.failurePatterns.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.successPatterns.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Success Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.successPatterns.map((s, i) => (
                    <span
                      key={i}
                      className="text-xs font-medium px-2.5 py-1 rounded-md"
                      style={{ background: '#EAF3DE', color: '#27500A' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
          {data.failurePatterns.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Failure Patterns</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5">
                  {data.failurePatterns.map((s, i) => (
                    <span
                      key={i}
                      className="text-xs font-medium px-2.5 py-1 rounded-md"
                      style={{ background: '#FAEEDA', color: '#633806' }}
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Red flags */}
      {data.redFlags.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-700">
              <AlertTriangle size={14} />
              Red Flags
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {data.redFlags.map((r, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                  <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{r}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Manager styles */}
      {data.managerStyles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Managers</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-[#5067F4]/5 border-b border-[#5067F4]/10">
                <tr>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[60%]">Name</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[20%]">Interviews</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[20%]">Avg Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.managerStyles.map((m, i) => (
                  <tr key={`${m.managerName}-${i}`} className="hover:bg-slate-50 transition-colors">
                    <td className="px-3 py-2 text-slate-700">
                      {m.managerName || <span className="text-slate-400 italic">Unknown manager</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{m.interviewCount}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {m.avgScore !== null ? `${m.avgScore}/100` : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
