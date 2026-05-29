import { useParams, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { preparationApi } from '@/api/client';
import { PreparationDocPreview } from '@/components/preparation/PreparationDocPreview';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

export function PreparationDocPage() {
  const { id } = useParams({ from: '/preparation/$id' });
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['preparation-doc', id],
    queryFn: () => preparationApi.getDoc(id).then((r) => r.data),
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.status;
      return status && status !== 'completed' && status !== 'failed' ? 3000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-6 w-32" />
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-4 w-full mt-4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <button
          onClick={() => navigate({ to: '/clients' })}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="rounded-md border border-dashed p-12 text-center">
          <p className="text-sm text-slate-500">Document not found.</p>
        </div>
      </div>
    );
  }

  if (data.status !== 'completed') {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <button
          onClick={() => navigate({ to: '/clients' })}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            {data.status === 'failed' ? (
              <>
                <AlertTriangle className="mx-auto text-red-500" size={28} />
                <p className="text-sm text-slate-700">Document generation failed.</p>
                {data.error && (
                  <p className="text-xs text-slate-400">{data.error}</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500">Document is still being generated...</p>
                <p className="text-xs text-slate-400">This page will refresh automatically.</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <button
        onClick={() =>
          navigate({ to: '/clients/$name', params: { name: data.clientName } })
        }
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-600 mb-4"
      >
        <ArrowLeft size={16} /> Back to client
      </button>
      <Card>
        <CardContent className="py-6">
          <PreparationDocPreview
            markdown={data.markdown}
            candidateName={data.candidateName}
            clientName={data.clientName}
            generatedAt={data.createdAt}
            docId={data.id}
          />
        </CardContent>
      </Card>
    </div>
  );
}
