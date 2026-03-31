import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnalyzeRequestSchema, type AnalyzeRequest } from '@shared/schemas';
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
      meta: { stage: 'technical', role: 'Backend', level: 'Middle' },
    },
  });

  const stage = form.watch('meta.stage');

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'text/plain') {
      const reader = new FileReader();
      reader.onload = ev => form.setValue('transcript', ev.target?.result as string);
      reader.readAsText(file);
    }
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
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          placeholder="Paste the full interview transcript here..."
          className="min-h-[200px] font-mono text-sm resize-none scrollbar-thin bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
        />
        {form.formState.errors.transcript && (
          <p className="text-red-500 text-xs">{form.formState.errors.transcript.message}</p>
        )}
      </div>

      <Divider />

      {/* Interview Details */}
      <SectionTitle>Interview Details</SectionTitle>
      <div className="grid grid-cols-3 gap-4 mb-4 w-full gap-3">
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
          <Label className="text-sm font-medium text-slate-700">Role</Label>
          <Select
            defaultValue="Backend"
            onValueChange={v => form.setValue('meta.role', v as any)}
          >
            <SelectTrigger className="bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile'].map(r => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
              {['Junior', 'Middle', 'Senior'].map(l => (
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
      <div className="grid grid-cols-2 gap-4">
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

        <div className="space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Linear Issue ID</Label>
          <Input
            {...form.register('meta.linearIssueId')}
            placeholder="e.g. ENG-123"
            className="bg-slate-50 border-slate-200 focus-visible:bg-white transition-colors"
          />
        </div>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100">
        <Button
          type="submit"
          className="w-full h-11 text-sm font-semibold"
        >
          Start Analysis
        </Button>
      </div>
    </form>
  );
}
