import { useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clientsApi } from '@/api/client';
import { CreatePreparationDocModal } from '@/components/modals/CreatePreparationDocModal';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CandidateModal } from '@/components/modals/CandidateModal';
import { ClientInsightsBlock } from '@/components/clients/ClientInsightsBlock';
import { ArrowLeft, Building2, Users, Target, Inbox, FileSignature, MessageSquare, Sparkles, FileText, Unlink } from 'lucide-react';

function formatDate(iso: string | null) {
  if (!iso) return '—';
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

export function ClientDetailPage() {
  const { name } = useParams({ from: '/clients/$name' });
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [prepModalOpen, setPrepModalOpen] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['client', name],
    queryFn: () => clientsApi.getClient(decodeURIComponent(name)).then(r => r.data),
  });

  const unmergeMutation = useMutation({
    mutationFn: (aliases: string[]) => clientsApi.unmergeClients(aliases).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client', name] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  if (isLoading) return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-11 rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => (
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
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-0">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="px-3 py-3 border-b border-slate-100 grid grid-cols-5 gap-3 items-center">
              {[...Array(5)].map((_, j) => <Skeleton key={j} className="h-4 w-full" />)}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );

  if (isError || !data) return (
    <div className="p-4 md:p-6">
      <button
        onClick={() => navigate({ to: '/clients' })}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
      >
        <ArrowLeft size={16} /> Back to clients
      </button>
      <div className="rounded-md border border-dashed p-12 text-center">
        <p className="text-sm text-slate-500">Client not found.</p>
        <p className="text-xs text-slate-400 mt-1">The name may have changed or been deleted.</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-4">

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate({ to: '/clients' })}
          className="flex items-center justify-center w-11 h-11 rounded-lg bg-[#5067F4]/10 text-[#5067F4] hover:bg-[#5067F4]/20 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold text-slate-900 truncate">{data.name}</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Last interview: {formatDate(data.lastInterviewAt)}
          </p>
          {data.aliases.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <span className="text-xs text-slate-400">Merged from:</span>
              {data.aliases.map(a => (
                <Badge key={a} variant="outline" className="text-xs font-normal text-slate-500">
                  {a}
                </Badge>
              ))}
              <button
                onClick={() => unmergeMutation.mutate(data.aliases)}
                disabled={unmergeMutation.isPending}
                className="ml-1 flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 transition-colors disabled:opacity-50"
              >
                <Unlink size={11} /> Unmerge all
              </button>
            </div>
          )}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <Button variant="outline" size="sm" onClick={() => setPrepModalOpen(true)} className="gap-2">
            <FileSignature size={14} />
            Generate prep document
          </Button>
          <Button variant="outline" size="sm" disabled title="Coming soon" className="gap-2">
            <MessageSquare size={14} />
            Open AI chat
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Interviews', value: data.interviewCount, icon: <Users size={18} />, accent: 'bg-[#5067F4]/10 text-[#5067F4]' },
          { label: 'Hire Rate', value: data.interviewCount > 0 ? `${data.hireRate}%` : '—', icon: <Target size={18} />, accent: 'bg-emerald-50 text-emerald-600' },
          { label: 'Requests', value: data.requestCount, icon: <Inbox size={18} />, accent: 'bg-violet-50 text-violet-600' },
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

      {/* Managers */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Managers</CardTitle>
        </CardHeader>
        <CardContent>
          {data.managers.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No managers recorded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.managers.map(m => (
                <Badge key={m} className="bg-[#5067F4]/10 text-[#5067F4] hover:bg-[#5067F4]/20 text-xs font-medium">
                  {m}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Profile / Recent Interviews */}
      <Tabs defaultValue={0}>
        <TabsList variant="line" className="w-full justify-start">
          <TabsTrigger value={0}>
            <Sparkles size={14} />
            Interview Profile
          </TabsTrigger>
          <TabsTrigger value={1}>
            <FileText size={14} />
            Recent Interviews
          </TabsTrigger>
        </TabsList>

        <TabsContent value={0}>
          <div className="pt-2">
            <ClientInsightsBlock clientName={data.name} />
          </div>
        </TabsContent>

        <TabsContent value={1}>
          <Card className="mt-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Recent Interviews</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {data.recentInterviews.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Building2 size={22} className="mx-auto text-slate-300 mb-2" />
                  <p className="text-sm text-slate-500">No interviews yet for this client.</p>
                </div>
              ) : (
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-[#5067F4]/5 border-b border-[#5067F4]/10">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[28%]">Candidate</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[20%]">Stage</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[18%]">Decision</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[14%]">Score</th>
                      <th className="text-left px-3 py-2 text-xs font-medium text-[#5067F4]/70 uppercase tracking-wide w-[20%]">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recentInterviews.map(i => (
                      <tr
                        key={i.id}
                        onClick={() => setSelectedId(i.id)}
                        className="hover:bg-slate-50 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2 text-slate-700 truncate">{i.candidateName ?? '—'}</td>
                        <td className="px-3 py-2 text-slate-600">{STAGE_LABEL[i.stage] ?? i.stage}</td>
                        <td className="px-3 py-2">
                          {i.decision ? (
                            <Badge className={`${RESULT_STYLE[i.decision] ?? 'bg-slate-100 text-slate-600'} text-xs`}>
                              {i.decision.replace('_', ' ')}
                            </Badge>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{i.score !== null ? `${i.score}/100` : '—'}</td>
                        <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{formatDate(i.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreatePreparationDocModal
        open={prepModalOpen}
        onClose={() => setPrepModalOpen(false)}
        defaultClientName={data.name}
      />

      <CandidateModal
        interviewId={selectedId}
        open={!!selectedId}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
