import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X } from 'lucide-react';

interface Filters {
  role?: string;
  level?: string;
  stage?: string;
  clientName?: string;
  decision?: string;
}

interface InterviewFiltersProps {
  value: Filters;
  onChange: (v: Filters) => void;
}

const STAGE_LABELS: Record<string, string> = {
  manager_call: 'Manager Call',
  technical: 'Technical',
};

const DECISION_LABELS: Record<string, string> = {
  hired: 'Hired',
  rejected: 'Rejected',
};

export function InterviewFilters({ value, onChange }: InterviewFiltersProps) {
  const set = (key: keyof Filters, val: string | null) =>
    onChange({ ...value, [key]: !val || val === 'all' ? undefined : val });

  const reset = () => onChange({});

  const hasActiveFilters = Object.values(value).some(Boolean);

  return (
    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">

      <Select value={value.role ?? 'all'} onValueChange={v => set('role', v)}>
        <SelectTrigger className="w-full sm:w-36 h-8 text-sm">
          <SelectValue>{value.role ?? 'All Roles'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Roles</SelectItem>
          {['Backend', 'Frontend', 'Fullstack', 'DevOps', 'QA', 'Mobile'].map(r => (
            <SelectItem key={r} value={r}>{r}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.level ?? 'all'} onValueChange={v => set('level', v)}>
        <SelectTrigger className="w-full sm:w-32 h-8 text-sm">
          <SelectValue>{value.level ?? 'All Levels'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Levels</SelectItem>
          {['Junior', 'Middle', 'Senior'].map(l => (
            <SelectItem key={l} value={l}>{l}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={value.stage ?? 'all'} onValueChange={v => set('stage', v)}>
        <SelectTrigger className="w-full sm:w-36 h-8 text-sm">
          <SelectValue>{value.stage ? STAGE_LABELS[value.stage] : 'All Stages'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Stages</SelectItem>
          <SelectItem value="manager_call">Manager Call</SelectItem>
          <SelectItem value="technical">Technical</SelectItem>
        </SelectContent>
      </Select>

      <Select value={value.decision ?? 'all'} onValueChange={v => set('decision', v)}>
        <SelectTrigger className="w-full sm:w-36 h-8 text-sm">
          <SelectValue>{value.decision ? DECISION_LABELS[value.decision] : 'All Decisions'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Decisions</SelectItem>
          <SelectItem value="hired">Hired</SelectItem>
          <SelectItem value="rejected">Rejected</SelectItem>
        </SelectContent>
      </Select>

      <Input
        value={value.clientName ?? ''}
        onChange={e => onChange({ ...value, clientName: e.target.value || undefined })}
        placeholder="Search by client..."
        className="w-full sm:w-44 h-8 text-sm"
      />

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="col-span-2 sm:col-span-1 h-8 gap-1.5 text-slate-500 hover:text-slate-700"
        >
          <X size={14} />
          Clear filters
        </Button>
      )}
    </div>
  );
}
