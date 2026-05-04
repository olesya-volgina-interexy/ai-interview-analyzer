import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnalyzeRequestSchema, type AnalyzeRequest } from '@shared/schemas';
import { uploadApi } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
      {children}
    </p>
  );
}

function Divider() {
  return <hr className="border-slate-100 my-5" />;
}

export function AnalyzeForm({ onSubmit }: { onSubmit: (data: AnalyzeRequest) => void }) {
  const form = useForm<AnalyzeRequest>({
    resolver: zodResolver(AnalyzeRequestSchema),
    defaultValues: {
      meta: { stage: 'technical', role: '', level: 'Middle' },
    },
  });

  const stage = form.watch('meta.stage');

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
    <form onSubmit={form.handleSubmit(onSubmit)} className="px-1 py-2">

      {/* Transcript */}
      <SectionTitle>Transcript</SectionTitle>
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

      <Divider />

      {/* Interview Details */}
      <SectionTitle>Interview Details</SectionTitle>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 w-full">
        <div className="w-full">
          <Label className="text-sm font-medium text-slate-700">Stage</Label>
          <Select
            defaultValue="technical"
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
            defaultValue="Middle"
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

      {stage === 'technical' && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Interviewer Decision</Label>
          <Select onValueChange={v => form.setValue('meta.decision', v as any)}>
            <SelectTrigger className="bg-slate-50 border-slate-200">
              <SelectValue placeholder="Select outcome..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hired">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                  Hired
                </span>
              </SelectItem>
              <SelectItem value="rejected">
                <span className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                  Rejected
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <Divider />

      {/* Participants */}
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

      <Divider />

      {/* Resume / CV */}
      <SectionTitle>Resume <span className="normal-case tracking-normal font-normal text-slate-300">— optional</span></SectionTitle>
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
      </div>

      <Divider />

      {/* Additional */}
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

      <div className="mt-6 pt-4 border-t border-slate-100">
        <Button
          type="submit"
          disabled={form.formState.isSubmitting || cvUploading}
          className="w-full h-11 text-sm font-semibold"
        >
          {form.formState.isSubmitting ? 'Starting...' : 'Start Analysis'}
        </Button>
      </div>
    </form>
  );
}
