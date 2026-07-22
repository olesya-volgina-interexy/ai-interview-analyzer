import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Trash2, Download, Pencil, X, Save, Loader2 } from 'lucide-react';
import { interviewsApi, getErrorMessage } from '@/api/client';
import { AnalysisResult } from '../analysis/AnalysisResult';
import { getAvatarColor, getInitials } from '@/lib/avatar';
import { formatDate } from '@/lib/format';

function safeFilenamePart(value: string) {
  return value.trim().replace(/[^\w\d-]+/g, '-').replace(/^-+|-+$/g, '') || 'candidate';
}

interface CandidateModalProps {
  interviewId: string | null;
  open: boolean;
  onClose: () => void;
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

  const [editingNames, setEditingNames] = useState(false);
  const [candidateNameDraft, setCandidateNameDraft] = useState('');
  const [managerNameDraft, setManagerNameDraft] = useState('');

  const updateNamesMutation = useMutation({
    mutationFn: () =>
      interviewsApi
        .update(interviewId!, { candidateName: candidateNameDraft, managerName: managerNameDraft })
        .then(r => r.data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['interview', interviewId], updated);
      queryClient.invalidateQueries({ queryKey: ['interviews'] });
      queryClient.invalidateQueries({ queryKey: ['candidates'] });
      setEditingNames(false);
    },
  });

  const startEditingNames = () => {
    setCandidateNameDraft(data?.candidateName ?? '');
    setManagerNameDraft(data?.managerName ?? '');
    updateNamesMutation.reset();
    setEditingNames(true);
  };

  const [pdfDownloading, setPdfDownloading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const handleSavePDF = async () => {
    if (!interviewId || !data) return;
    setPdfError(null);
    setPdfDownloading(true);
    try {
      const { data: blob } = await interviewsApi.downloadPdf(interviewId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeFilenamePart(data.candidateName ?? 'candidate')}-${data.stage}-analysis.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setPdfError(getErrorMessage(err));
    } finally {
      setPdfDownloading(false);
    }
  };

  const tabs = data ? [
    { value: 'analysis', label: 'Analysis' },
    { value: 'transcript', label: 'Transcript' },
    ...(data.cvText ? [{ value: 'cv', label: 'CV' }] : []),
    ...(data.brokerRequest ? [{ value: 'broker', label: 'Broker Request' }] : []),
    ...(data.questions?.length ? [{ value: 'questions', label: 'Questions' }] : []),
  ] : [];

  const avatarStyle = data?.candidateName ? getAvatarColor(data.candidateName) : null;
  const initials = data?.candidateName ? getInitials(data.candidateName) : '?';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin p-0 [&>button]:hidden">

        {/* Header */}
        <div className="px-5 py-4 flex-shrink-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
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
            <div className="min-w-0 flex-1">
              {editingNames ? (
                <Input
                  value={candidateNameDraft}
                  onChange={e => setCandidateNameDraft(e.target.value)}
                  placeholder="Candidate name"
                  autoFocus
                  className="h-7 text-sm font-semibold"
                />
              ) : (
                <h2 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {isLoading ? '...' : (data?.candidateName ?? 'Candidate')}
                </h2>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {data && !editingNames && (
              <>
                <button
                  onClick={startEditingNames}
                  title="Edit names"
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                >
                  <Pencil size={14} />
                  <span className="hidden sm:inline">Edit</span>
                </button>
                <button
                  onClick={handleSavePDF}
                  disabled={pdfDownloading}
                  title="Save as PDF"
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-xs rounded-md text-white bg-[#5067F4] hover:bg-[#3d52d9] transition-colors"
                >
                  {pdfDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span className="hidden sm:inline">{pdfDownloading ? 'Generating...' : 'Save as PDF'}</span>
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-xs rounded-md border border-red-200 text-red-600 bg-white hover:bg-red-50 transition-colors"
                >
                  <Trash2 size={14} />
                  <span className="hidden sm:inline">{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</span>
                </button>
              </>
            )}
            {editingNames && (
              <>
                <button
                  onClick={() => setEditingNames(false)}
                  disabled={updateNamesMutation.isPending}
                  title="Cancel"
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-xs rounded-md border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 transition-colors"
                >
                  <X size={14} />
                  <span className="hidden sm:inline">Cancel</span>
                </button>
                <button
                  onClick={() => updateNamesMutation.mutate()}
                  disabled={updateNamesMutation.isPending}
                  title="Save"
                  className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 text-xs rounded-md text-white bg-[#5067F4] hover:bg-[#3d52d9] transition-colors"
                >
                  <Save size={14} />
                  <span className="hidden sm:inline">{updateNamesMutation.isPending ? 'Saving...' : 'Save'}</span>
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
          {editingNames ? (
            <div className="flex items-center gap-2">
              <span className="text-xs flex-shrink-0" style={{ color: 'var(--color-text-tertiary)' }}>Manager:</span>
              <Input
                value={managerNameDraft}
                onChange={e => setManagerNameDraft(e.target.value)}
                placeholder="Manager name"
                className="h-7 text-xs max-w-[220px]"
              />
            </div>
          ) : data && (
            <p className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
              {data.role} {data.level} · {data.clientName ?? '—'} · {formatDate(data.analysisDate ?? data.createdAt)} · Manager: {data.managerName ?? '—'}
            </p>
          )}
          {updateNamesMutation.isError && (
            <p className="text-xs text-red-500">{getErrorMessage(updateNamesMutation.error)}</p>
          )}
          {pdfError && (
            <p className="text-xs text-red-500">{pdfError}</p>
          )}
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
                  className="flex-1 py-2.5 px-1 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap text-center"
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
                <article
                  className="prose prose-sm max-w-none prose-a:text-[#5067F4] p-4 rounded-lg max-h-96 overflow-y-auto scrollbar-thin"
                  style={{ background: 'var(--color-background-secondary)', color: 'var(--color-text-secondary)' }}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                    {data.brokerRequest}
                  </ReactMarkdown>
                </article>
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