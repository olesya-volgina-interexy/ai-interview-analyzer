import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { candidatesApi, linearApi, preparationsApi, type PreparationItem } from '@/api/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getAvatarColor } from '@/lib/avatar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { CandidateCombobox } from './CandidateCombobox';

const ALL = '__all__';

export function PreparationModal({ open, onOpenChange, editItem }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editItem?: PreparationItem | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = !!editItem;

  const [candidate, setCandidate] = useState('');
  const [role, setRole] = useState('');
  const [date, setDate] = useState('');
  const [originalDate, setOriginalDate] = useState('');
  const [type, setType] = useState<'message' | 'call' | 'call_setup'>('call_setup');

  const dateChanged = isEdit && date !== originalDate;

  useEffect(() => {
    if (open && editItem) {
      const d = editItem.preparationDate.split('T')[0];
      setCandidate(editItem.candidateName);
      setRole(editItem.linearIssueId);
      setDate(d);
      setOriginalDate(d);
      setType(editItem.type);
    } else if (open && !editItem) {
      setCandidate('');
      setRole('');
      setDate('');
      setOriginalDate('');
      setType('call_setup');
    }
  }, [open, editItem]);

  const { data: linearIssues } = useQuery({
    queryKey: ['linear-issues'],
    queryFn: () => linearApi.getIssues({ first: 100 }).then(r => r.data),
    enabled: open,
  });

  const { data: candidatesList } = useQuery({
    queryKey: ['candidates-list'],
    queryFn: () => candidatesApi.getList({ limit: 100 }).then(r =>
      [...new Set(r.data.map(c => c.candidateName))].sort()
    ),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () => {
      const issue = linearIssues?.find(i => i.id === role);
      const payload = {
        candidateName: candidate,
        linearIssueId: role,
        linearIssueTitle: issue?.title ?? editItem?.linearIssueTitle ?? '',
        preparationDate: date,
        type,
      };
      if (isEdit && !dateChanged) return preparationsApi.update(editItem.id, { ...payload, isNewSession: false });
      if (isEdit && dateChanged) return preparationsApi.create(payload);
      return preparationsApi.create(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['preparations'] });
      queryClient.invalidateQueries({ queryKey: ['preparation-stats'] });
      onOpenChange(false);
    },
  });

  const canSave = !!candidate && !!role && !!date;

  const selectedAvatar = candidate ? getAvatarColor(candidate) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0" showCloseButton={true}>
        <div className="p-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">{isEdit ? 'Edit Preparation' : 'New Preparation'}</DialogTitle>
            <DialogDescription className="text-slate-400 text-sm">
              {isEdit ? 'Update the preparation details' : 'Log a prep session you ran with a candidate before an interview'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="p-6 space-y-5">
          {/* Candidate */}
          <CandidateCombobox
            value={candidate}
            onChange={setCandidate}
            candidates={candidatesList ?? []}
          />

          {/* Role / Vacancy */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Role / Vacancy <span className="text-red-500">*</span>
            </label>
            <Select value={role || ALL} onValueChange={(v: string | null) => setRole(!v || v === ALL ? '' : v)}>
              <SelectTrigger className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white">
                <SelectValue>{role ? (linearIssues?.find(i => i.id === role)?.title ?? role) : 'Select role...'}</SelectValue>
              </SelectTrigger>
              <SelectContent className="rounded-xl shadow-lg ring-slate-200/70 p-1 max-h-60 overflow-y-auto">
                <SelectItem value={ALL} className="rounded-lg text-slate-400">Select role...</SelectItem>
                {(linearIssues ?? []).map(issue => (
                  <SelectItem key={issue.id} value={issue.id} className="rounded-lg">
                    {issue.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preparation date */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Preparation date <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white outline-none focus:border-[#534AB7] transition-colors"
              />
            </div>
          </div>

          {/* Preparation type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Preparation type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {([
                { value: 'message' as const, label: 'Message', desc: 'Async written brief' },
                { value: 'call' as const, label: 'Call', desc: 'Voice prep session' },
                { value: 'call_setup' as const, label: 'Call + Setup', desc: 'Call + env / IDE setup' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={cn(
                    'flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-colors',
                    type === opt.value
                      ? 'border-[#534AB7] bg-[#F8F7FF]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className={cn(
                    'mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                    type === opt.value ? 'border-[#534AB7]' : 'border-slate-300'
                  )}>
                    {type === opt.value && (
                      <div className="w-2 h-2 rounded-full bg-[#534AB7]" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 rounded-b-xl border-t px-6 py-4" style={{ background: '#EEEDFE' }}>
          <DialogClose render={
            <Button variant="outline" className="rounded-lg h-10 px-5 bg-white border-slate-200" />
          }>
            Cancel
          </DialogClose>
          <Button
            className="rounded-lg h-10 px-5 text-white disabled:opacity-50"
            style={{ background: '#534AB7' }}
            disabled={!canSave || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving...' : isEdit && dateChanged ? 'Save as new session' : isEdit ? 'Update preparation' : 'Save preparation'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
