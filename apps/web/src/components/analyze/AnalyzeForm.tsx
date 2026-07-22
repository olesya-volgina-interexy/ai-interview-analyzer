import { useState, Fragment } from 'react';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnalyzeRequestSchema, type AnalyzeRequest } from '@shared/schemas';
import { uploadApi } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </p>
  );
}

const STEPS: { title: string; fields: Path<AnalyzeRequest>[] }[] = [
  { title: 'Transcript', fields: ['transcript', 'meta.transcriptUrl'] },
  {
    title: 'Details',
    fields: ['meta.stage', 'meta.role', 'meta.level', 'meta.analysisDate', 'meta.clientName', 'meta.candidateName', 'meta.managerName'],
  },
  { title: 'Resume & extras', fields: ['meta.cvUrl', 'cvText', 'brokerRequest', 'meta.interviewerComments'] },
];

export function AnalyzeForm({ onSubmit }: { onSubmit: (data: AnalyzeRequest) => void }) {
  const form = useForm<AnalyzeRequest>({
    resolver: zodResolver(AnalyzeRequestSchema),
    defaultValues: {
      meta: {
        stage: 'technical',
        role: '',
        level: 'Middle',
        analysisDate: new Date().toISOString().slice(0, 10),
      },
    },
  });

  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;

  const goNext = async () => {
    const ok = await form.trigger(STEPS[step].fields);
    if (ok) setStep(s => Math.min(s + 1, STEPS.length - 1));
  };
  const goBack = () => setStep(s => Math.max(s - 1, 0));

  const submit = form.handleSubmit(onSubmit);
  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!isLast) {
      e.preventDefault();
      void goNext();
      return;
    }
    void submit(e);
  };

  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);

  const handleTranscriptDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = ev => form.setValue('transcript', ev.target?.result as string);
      reader.readAsText(file);
    }
  };

  const handleCvFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCvUploading(true);
    setCvError(null);
    try {
      const { data } = await uploadApi.uploadFile(file);
      form.setValue('cvText', data.text, { shouldValidate: true });
      setCvFileName(data.filename || file.name);
    } catch (err: any) {
      setCvError(err?.message ?? 'Failed to upload file');
      setCvFileName(null);
      form.setValue('cvText', undefined as unknown as string);
    } finally {
      setCvUploading(false);
      e.target.value = '';
    }
  };

  const clearCvFile = () => {
    setCvFileName(null);
    setCvError(null);
    form.setValue('cvText', undefined as unknown as string);
  };

  return (
    <form onSubmit={handleFormSubmit} className="px-1 py-2">

      {/* Stepper */}
      <div className="mb-5">
        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <Fragment key={s.title}>
              <div
                className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                  i <= step ? 'bg-[#5067F4] text-white' : 'bg-slate-100 text-slate-400',
                )}
              >
                {i < step ? <Check size={14} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn('flex-1 h-0.5 mx-2 rounded transition-colors', i < step ? 'bg-[#5067F4]' : 'bg-slate-200')} />
              )}
            </Fragment>
          ))}
        </div>
        <p className="mt-2 text-sm font-semibold text-slate-700">
          {STEPS[step].title}
          <span className="ml-1.5 font-normal text-slate-300">· Step {step + 1} of {STEPS.length}</span>
        </p>
      </div>

      {/* Step 1 — Transcript */}
      {step === 0 && (
        <div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-slate-700">Interview Transcript</Label>
              <span className="text-xs text-slate-400">drag & drop .txt supported</span>
            </div>
            <Textarea
              {...form.register('transcript')}
              onDrop={handleTranscriptDrop}
              onDragOver={e => e.preventDefault()}
              placeholder="Paste the full interview transcript here..."
              className="min-h-[200px] font-mono text-sm resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
            />
            {form.formState.errors.transcript && (
              <p className="text-red-500 text-xs">{form.formState.errors.transcript.message}</p>
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">…or transcript URL</Label>
            <Input
              {...form.register('meta.transcriptUrl')}
              placeholder="https://..."
              className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
            />
            {form.formState.errors.meta?.transcriptUrl && (
              <p className="text-red-500 text-xs">{form.formState.errors.meta.transcriptUrl.message}</p>
            )}
            <p className="text-xs text-slate-400">PDF, TXT or web page — server will fetch and parse it.</p>
          </div>
        </div>
      )}

      {/* Step 2 — Details */}
      {step === 1 && (
        <div>
          <SectionTitle>Interview Details</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 w-full">
            <div className="w-full">
              <Label className="text-sm font-medium text-slate-700">Stage</Label>
              <Select
                value={form.watch('meta.stage')}
                onValueChange={v => form.setValue('meta.stage', v as any)}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager_call">Manager Call</SelectItem>
                  <SelectItem value="technical">Technical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="w-full">
              <Label className="text-sm font-medium text-slate-700">Vacancy / Role</Label>
              <Input
                {...form.register('meta.role')}
                placeholder="e.g. Backend, React Developer, Lead PM…"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
              {form.formState.errors.meta?.role && (
                <p className="text-red-500 text-xs mt-1">{form.formState.errors.meta.role.message}</p>
              )}
            </div>

            <div className="w-full">
              <Label className="text-sm font-medium text-slate-700">Level</Label>
              <Select
                value={form.watch('meta.level')}
                onValueChange={v => form.setValue('meta.level', v as any)}
              >
                <SelectTrigger className="bg-slate-50 border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Junior', 'Middle', 'Senior', 'Architect'].map(l => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5 mb-5">
            <Label className="text-sm font-medium text-slate-700">Analysis Date</Label>
            <Input
              type="date"
              {...form.register('meta.analysisDate')}
              className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors sm:w-56"
            />
            {form.formState.errors.meta?.analysisDate && (
              <p className="text-red-500 text-xs">{form.formState.errors.meta.analysisDate.message}</p>
            )}
          </div>

          <SectionTitle>Participants</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Client Name</Label>
              <Input
                {...form.register('meta.clientName')}
                placeholder="e.g. Acme Corp"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Candidate Name</Label>
              <Input
                {...form.register('meta.candidateName')}
                placeholder="e.g. John Doe"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Manager</Label>
              <Input
                {...form.register('meta.managerName')}
                placeholder="e.g. Anna Smith"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Step 3 — Resume & extras */}
      {step === 2 && (
        <div>
          <SectionTitle>Resume</SectionTitle>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">CV URL</Label>
              <Input
                {...form.register('meta.cvUrl')}
                placeholder="https://... (PDF, TXT or web page)"
                className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
              {form.formState.errors.meta?.cvUrl && (
                <p className="text-red-500 text-xs">{form.formState.errors.meta.cvUrl.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">…or upload file (PDF / TXT, max 10 MB)</Label>
              {cvFileName ? (
                <div className="flex items-center justify-between rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm">
                  <span className="text-emerald-700 truncate">✓ {cvFileName}</span>
                  <button
                    type="button"
                    onClick={clearCvFile}
                    className="text-xs text-slate-500 hover:text-slate-700 ml-2"
                  >
                    remove
                  </button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept=".pdf,.txt,application/pdf,text/plain"
                  onChange={handleCvFile}
                  disabled={cvUploading}
                  className="bg-slate-50 border-slate-200 file:mr-3 file:rounded file:border-0 file:bg-slate-200 file:px-3 file:py-1 file:text-xs file:font-medium file:text-slate-700"
                />
              )}
              {cvUploading && <p className="text-xs text-slate-500">Uploading…</p>}
              {cvError && <p className="text-red-500 text-xs">{cvError}</p>}
            </div>

            {form.formState.errors.cvText && (
              <p className="text-red-500 text-xs">{form.formState.errors.cvText.message}</p>
            )}
          </div>

          <hr className="border-slate-100 my-5" />

          <SectionTitle>Additional <span className="normal-case tracking-normal font-normal text-slate-300">— optional</span></SectionTitle>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Broker Request</Label>
              <Textarea
                {...form.register('brokerRequest')}
                placeholder="Paste broker requirements here..."
                className="min-h-[80px] resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-slate-700">Interviewer Comments</Label>
              <Textarea
                {...form.register('meta.interviewerComments')}
                placeholder="Any additional notes from the interviewer..."
                className="min-h-[60px] resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
              />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-slate-100">
        {isLast && form.formState.isSubmitted && Object.keys(form.formState.errors).length > 0 && (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 space-y-0.5">
            <p className="font-semibold">Please fix the following before starting:</p>
            {form.formState.errors.transcript && <p>• {form.formState.errors.transcript.message}</p>}
            {form.formState.errors.cvText && <p>• {form.formState.errors.cvText.message}</p>}
            {form.formState.errors.meta?.role && <p>• Role: {form.formState.errors.meta.role.message}</p>}
            {form.formState.errors.meta?.cvUrl && <p>• CV URL: {form.formState.errors.meta.cvUrl.message}</p>}
            {form.formState.errors.meta?.transcriptUrl && <p>• Transcript URL: {form.formState.errors.meta.transcriptUrl.message}</p>}
          </div>
        )}
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={goBack}
            disabled={step === 0}
            className="h-11 px-5 text-sm font-medium"
          >
            Back
          </Button>
          {isLast ? (
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || cvUploading}
              className="flex-1 h-11 text-sm font-semibold"
            >
              {form.formState.isSubmitting ? 'Starting...' : 'Start Analysis'}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              className="flex-1 h-11 text-sm font-semibold"
            >
              Next
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
