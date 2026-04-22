import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Download } from 'lucide-react';
import { interviewsApi } from '@/api/client';
import { AnalysisResult } from '../analysis/AnalysisResult';

interface CandidateModalProps {
  interviewId: string | null;
  open: boolean;
  onClose: () => void;
}

const AVATAR_COLORS = [
  { bg: '#E6F1FB', color: '#185FA5' },
  { bg: '#EEEDFE', color: '#534AB7' },
  { bg: '#EAF3DE', color: '#3B6D11' },
  { bg: '#FAEEDA', color: '#854F0B' },
  { bg: '#E1F5EE', color: '#0F6E56' },
];

function getAvatarStyle(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function CandidateModal({ interviewId, open, onClose }: CandidateModalProps) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('analysis');

  const { data, isLoading } = useQuery({
    queryKey: ['interview', interviewId],
    queryFn: () => interviewsApi.getById(interviewId!).then(r => r.data),
    enabled: !!interviewId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => interviewsApi.delete(interviewId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      onClose();
    },
  });

  const handleDelete = () => {
    if (confirm('Delete this interview record? This cannot be undone.')) {
      deleteMutation.mutate();
    }
  };

  const handleSavePDF = () => {
    if (!data) return;
    const analysis = data.analysis as any;
    const content = `
INTERVIEW ANALYSIS REPORT
==========================
Candidate: ${data.candidateName ?? '—'}
Role: ${data.role} ${data.level}
Client: ${data.clientName ?? '—'}
Stage: ${data.stage}
Date: ${new Date(data.createdAt).toLocaleDateString()}

RECOMMENDATION: ${analysis?.recommendation ?? analysis?.stageResult ?? '—'}
SCORE: ${analysis?.score ?? '—'}

OVERALL ASSESSMENT:
${analysis?.overallAssessment ?? analysis?.overallImpression ?? '—'}

STRENGTHS:
${(analysis?.strengths ?? []).map((s: string) => `• ${s}`).join('\n')}

WEAKNESSES:
${(analysis?.weaknesses ?? []).map((w: string) => `• ${w}`).join('\n')}

REASONING:
${analysis?.reasoning ?? '—'}

${analysis?.decisionBreakers?.length > 0 ? `DECISION BREAKERS:\n${analysis.decisionBreakers.map((d: string) => `• ${d}`).join('\n')}` : ''}
    `.trim();

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Analysis — ${data.candidateName ?? 'Candidate'}</title>
          <style>body { font-family: monospace; white-space: pre-wrap; padding: 40px; font-size: 13px; line-height: 1.6; }</style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  const tabs = data ? [
    { value: 'analysis', label: 'Analysis' },
    { value: 'transcript', label: 'Transcript' },
    ...(data.cvText ? [{ value: 'cv', label: 'CV' }] : []),
    ...(data.brokerRequest ? [{ value: 'broker', label: 'Broker Request' }] : []),
    ...(data.questions?.length ? [{ value: 'questions', label: 'Questions' }] : []),
  ] : [];

  const avatarStyle = data?.candidateName ? getAvatarStyle(data.candidateName) : null;
  const initials = data?.candidateName
    ? data.candidateName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin p-0 [&>button]:hidden">

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
        >
          <div className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
            ) : avatarStyle ? (
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0"
                style={{ background: avatarStyle.bg, color: avatarStyle.color }}
              >
                {initials}
              </div>
            ) : null}
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                {isLoading ? '...' : (data?.candidateName ?? 'Candidate')}
              </h2>
              {data && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-tertiary)' }}>
                  {data.role} {data.level} · {data.clientName ?? '—'} · {new Date(data.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {data && (
              <>
                <button
                  onClick={handleSavePDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
                  style={{ border: '0.5px solid var(--color-border-tertiary)', color: 'var(--color-text-secondary)', background: 'var(--color-background-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-background-primary)')}
                >
                  <Download size={13} />
                  Save as PDF
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors"
                  style={{ border: '0.5px solid #FECACA', color: '#DC2626', background: 'var(--color-background-primary)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'var(--color-background-primary)')}
                >
                  <Trash2 size={13} />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors ml-1"
              style={{ color: 'var(--color-text-tertiary)', background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-background-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              ✕
            </button>
          </div>
        </div>

        {isLoading && <Skeleton className="h-64 w-full m-5" />}

        {data && (
          <div>
            {/* Tabs nav */}
            <div
              className="flex overflow-x-auto rounded-lg bg-muted mx-5"
            >
              {tabs.map(tab => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className="flex-1 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap text-center"
                  style={{
                    color: activeTab === tab.value ? 'hsl(var(--primary))' : 'var(--color-text-tertiary)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="p-5">

              {activeTab === 'analysis' && (
                <AnalysisResult analysis={data.analysis} />
              )}

              {activeTab === 'transcript' && (
                <pre
                  className="text-sm whitespace-pre-wrap p-4 rounded-lg max-h-96 overflow-y-auto scrollbar-thin"
                  style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
                >
                  {data.transcript}
                </pre>
              )}

              {activeTab === 'cv' && data.cvText && (
                <pre
                  className="text-sm whitespace-pre-wrap p-4 rounded-lg max-h-96 overflow-y-auto scrollbar-thin"
                  style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
                >
                  {data.cvText}
                </pre>
              )}

              {activeTab === 'broker' && data.brokerRequest && (
                <pre
                  className="text-sm whitespace-pre-wrap p-4 rounded-lg max-h-96 overflow-y-auto scrollbar-thin"
                  style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
                >
                  {data.brokerRequest}
                </pre>
              )}

              {activeTab === 'questions' && data.questions && data.questions.length > 0 && (() => {
                const grouped = data.questions.reduce((acc, q) => {
                  const key = q.topic ?? '';
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(q);
                  return acc;
                }, {} as Record<string, typeof data.questions>);

                const badgeStyle = (handled: string | undefined) =>
                  handled === 'well'    ? { bg: '#EAF3DE', color: '#27500A' } :
                  handled === 'partial' ? { bg: '#FAEEDA', color: '#633806' } :
                  handled === 'poor'    ? { bg: '#FCEBEB', color: '#791F1F' } :
                                          { bg: '#F1EFE8', color: '#5F5E5A' };

                return (
                  <div className="space-y-5">
                    {Object.entries(grouped).map(([topic, questions]) => (
                      <div key={topic}>
                        {topic && (
                          <p className="text-xs font-medium uppercase tracking-wide mb-2" style={{ color: 'hsl(var(--muted-foreground))', letterSpacing: '0.06em' }}>
                            {topic}
                          </p>
                        )}
                        <div className="space-y-2">
                          {questions.map((q, i) => {
                            const handled = q.candidateHandled;
                            const badge = badgeStyle(handled);
                            return (
                              <div key={i} className="flex items-start justify-between gap-3 text-sm px-3 py-2 rounded-md bg-muted" style={{ color: 'hsl(var(--foreground))' }}>
                                <span className="leading-relaxed">{q.question}</span>
                                {handled && (
                                  <span className="text-xs font-medium px-2 py-0.5 rounded-md flex-shrink-0 self-start mt-0.5" style={{ background: badge.bg, color: badge.color }}>
                                    {handled}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}