import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Download } from 'lucide-react';
import { interviewsApi } from '@/api/client';
import { AnalysisResult } from '../analysis/AnalysisResult';

interface CandidateModalProps {
  interviewId: string | null;
  open: boolean;
  onClose: () => void;
}

export function CandidateModal({ interviewId, open, onClose }: CandidateModalProps) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['interview', interviewId],
    queryFn: () => interviewsApi.getById(interviewId!).then(r => r.data),
    enabled: !!interviewId,
  });

  const deleteMutation = useMutation({
    mutationFn: () => interviewsApi.delete(interviewId!),
    onSuccess: () => {
      // Обновить список интервью
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

    // Формируем текстовый контент для печати
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

${analysis?.decisionBreakers?.length > 0 ? `
DECISION BREAKERS:
${analysis.decisionBreakers.map((d: string) => `• ${d}`).join('\n')}
` : ''}
    `.trim();

    // Открыть диалог печати браузера
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Analysis — ${data.candidateName ?? 'Candidate'}</title>
          <style>
            body { font-family: monospace; white-space: pre-wrap; padding: 40px; font-size: 13px; line-height: 1.6; }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <div className="flex flex-col gap-2 pr-8 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <DialogTitle>
                {isLoading ? '...' : (data?.candidateName ?? 'Candidate')}
              </DialogTitle>
              {data && (
                <p className="text-sm text-slate-500 mt-0.5">
                  {data.role} {data.level} • {data.clientName ?? '—'} • {new Date(data.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Кнопки действий */}
            {data && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSavePDF}
                  className="gap-1.5"
                >
                  <Download size={14} />
                  Save as PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="gap-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                >
                  <Trash2 size={14} />
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {data && (
          <Tabs defaultValue="analysis">
            <TabsList className="w-full">
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              {data.cvText && <TabsTrigger value="cv">CV</TabsTrigger>}
              {data.brokerRequest && <TabsTrigger value="broker">Broker Request</TabsTrigger>}
            </TabsList>

            <TabsContent value="analysis" className="mt-4">
              <AnalysisResult analysis={data.analysis} />
            </TabsContent>

            <TabsContent value="transcript" className="mt-4">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md max-h-96 overflow-y-auto">
                {data.transcript}
              </pre>
            </TabsContent>

            {data.cvText && (
              <TabsContent value="cv" className="mt-4">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md max-h-96 overflow-y-auto">
                  {data.cvText}
                </pre>
              </TabsContent>
            )}

            {data.brokerRequest && (
              <TabsContent value="broker" className="mt-4">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md max-h-96 overflow-y-auto">
                  {data.brokerRequest}
                </pre>
              </TabsContent>
            )}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}