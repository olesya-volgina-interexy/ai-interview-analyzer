import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { interviewsApi } from '@/api/client';
import { AnalysisResult } from '../analysis/AnalysisResult';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CandidateModalProps {
  interviewId: string | null;
  open: boolean;
  onClose: () => void;
}

export function CandidateModal({ interviewId, open, onClose }: CandidateModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['interview', interviewId],
    queryFn: () => interviewsApi.getById(interviewId!).then(r => r.data),
    enabled: !!interviewId,
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isLoading ? '...' : (data?.candidateName ?? 'Candidate')}
            {data && (
              <span className="ml-2 text-sm font-normal text-slate-500">
                {data.role} {data.level} • {data.clientName ?? '—'}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}

        {data && (
          <Tabs defaultValue="analysis">
            <TabsList>
              <TabsTrigger value="analysis">Analysis</TabsTrigger>
              <TabsTrigger value="transcript">Transcript</TabsTrigger>
              {data.cvText && <TabsTrigger value="cv">CV</TabsTrigger>}
              {data.brokerRequest && <TabsTrigger value="broker">Broker Request</TabsTrigger>}
            </TabsList>

            <TabsContent value="analysis">
              <AnalysisResult analysis={data.analysis} />
            </TabsContent>

            <TabsContent value="transcript">
              <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md">
                {data.transcript}
              </pre>
            </TabsContent>

            {data.cvText && (
              <TabsContent value="cv">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md">
                  {data.cvText}
                </pre>
              </TabsContent>
            )}

            {data.brokerRequest && (
              <TabsContent value="broker">
                <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 p-4 rounded-md">
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