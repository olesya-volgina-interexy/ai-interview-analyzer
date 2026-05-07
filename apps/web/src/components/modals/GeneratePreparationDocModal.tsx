import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  GeneratePreparationDocRequestSchema,
  type GeneratePreparationDocRequest,
} from '@shared/schemas';
import { clientsApi } from '@/api/client';
import { usePreparationDoc } from '@/hooks/usePreparationDoc';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { PreparationProgress } from '../preparation/PreparationProgress';
import { PreparationDocPreview } from '../preparation/PreparationDocPreview';
import { ExternalLink } from 'lucide-react';

interface GeneratePreparationDocModalProps {
  open: boolean;
  onClose: () => void;
  defaultClientName?: string;
}

export function GeneratePreparationDocModal({
  open,
  onClose,
  defaultClientName,
}: GeneratePreparationDocModalProps) {
  const { state, progress, doc, docId, error, generate, reset } = usePreparationDoc();
  const navigate = useNavigate();

  const form = useForm<GeneratePreparationDocRequest>({
    resolver: zodResolver(GeneratePreparationDocRequestSchema),
    defaultValues: {
      clientName: defaultClientName ?? '',
      candidateName: '',
      cvText: '',
    },
  });

  useEffect(() => {
    if (open && defaultClientName) {
      form.setValue('clientName', defaultClientName);
    }
  }, [open, defaultClientName, form]);

  const { data: clientsData } = useQuery({
    queryKey: ['clients-for-prep'],
    queryFn: () => clientsApi.getClients(1, 100).then((r) => r.data),
    enabled: open,
    staleTime: 60_000,
  });

  const handleClose = () => {
    reset();
    form.reset();
    onClose();
  };

  const handleSubmit = (values: GeneratePreparationDocRequest) => {
    const cleaned: GeneratePreparationDocRequest = {
      candidateName: values.candidateName.trim(),
      clientName: values.clientName.trim(),
      cvText: values.cvText?.trim() ? values.cvText.trim() : undefined,
    };
    generate(cleaned);
  };

  const handleOpenFullPage = () => {
    if (!docId) return;
    handleClose();
    navigate({ to: '/preparation/$id', params: { id: docId } });
  };

  const clientNameValue = form.watch('clientName');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="w-[95vw] sm:w-[80%] max-w-4xl max-h-[90vh] overflow-y-auto scrollbar-thin bg-white">
        <DialogHeader>
          <DialogTitle>
            {state === 'idle' && 'Generate Preparation Document'}
            {(state === 'pending' || state === 'processing') && 'Generating document...'}
            {state === 'completed' && 'Document Ready'}
            {state === 'failed' && 'Generation Failed'}
          </DialogTitle>
        </DialogHeader>

        {state === 'idle' && (
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 px-1 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Client</Label>
              <Select
                value={clientNameValue}
                onValueChange={(v) => form.setValue('clientName', v ?? '', { shouldValidate: true })}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {clientsData?.items.map((c) => (
                    <SelectItem key={c.name} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.clientName && (
                <p className="text-red-500 text-xs">{form.formState.errors.clientName.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Candidate Name</Label>
              <Input
                {...form.register('candidateName')}
                placeholder="e.g. John Doe"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
              {form.formState.errors.candidateName && (
                <p className="text-red-500 text-xs">
                  {form.formState.errors.candidateName.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">
                CV Text{' '}
                <span className="text-slate-400 font-normal">— optional</span>
              </Label>
              <Textarea
                {...form.register('cvText')}
                placeholder="Paste CV text here, or leave empty to use the latest CV from the candidate's pipeline record..."
                className="min-h-[140px] resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
              <p className="text-xs text-slate-400">
                If empty, the latest CV submitted for this candidate at this client will be used.
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                Generate
              </Button>
            </div>
          </form>
        )}

        {(state === 'pending' || state === 'processing') && (
          <PreparationProgress progress={progress} />
        )}

        {state === 'completed' && doc && (
          <div className="space-y-4">
            <PreparationDocPreview
              markdown={doc.markdown}
              candidateName={doc.candidateName}
              clientName={doc.clientName}
              generatedAt={doc.createdAt}
            />
            <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={handleOpenFullPage} className="gap-2">
                <ExternalLink size={14} />
                Open in full page
              </Button>
            </div>
          </div>
        )}

        {state === 'failed' && (
          <div className="py-6">
            <ErrorMessage error={error} onRetry={reset} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
