import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

interface Filters {
  role?: string;
  level?: string;
  stage?: string;
  clientName?: string;
  decision?: string;
  managerName?: string;
}

interface InterviewFiltersProps {
  value: Filters;
  onChange: (v: Filters) => void;
  managers?: string[];
  roles?: string[];
}

const ACTIVE_COLORS: Record<string, string> = {
  role:        '#534AB7',
  level:       '#185FA5',
  stage:       '#0F6E56',
  decision:    '#3B6D11',
  managerName: '#854F0B',
};

const ALL = '__all__';

function FilterSelect({
  filterKey,
  value,
  options,
  placeholder,
  onChange,
  triggerClass,
}: {
  filterKey: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  placeholder: string;
  onChange: (v: string | undefined) => void;
  triggerClass?: string;
}) {
  const isActive = !!value;
  const color = ACTIVE_COLORS[filterKey] ?? '#334155';
  const activeLabel = isActive
    ? options.find(o => o.value === value)?.label ?? value
    : placeholder;

  return (
    <Select
      value={value ?? ALL}
      onValueChange={(v: string | null) => onChange(!v || v === ALL ? undefined : v)}
    >
      <SelectTrigger
        className={cn(
          'h-8 w-auto rounded-full border px-3 text-sm transition-colors',
          isActive
            ? 'border-transparent text-white hover:opacity-90 [&_svg]:!text-white/70'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 [&_svg]:!text-slate-400',
          triggerClass
        )}
        style={isActive ? { background: color, color: 'white' } : undefined}
      >
        <SelectValue>{activeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent className="rounded-xl shadow-lg ring-slate-200/70 p-1 min-w-40">
        <SelectItem value={ALL} className="rounded-lg text-slate-500">
          {placeholder}
        </SelectItem>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="rounded-lg">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InterviewFilters({ value, onChange, managers = [], roles = [] }: InterviewFiltersProps) {
  const set = (key: keyof Filters, val: string | undefined) =>
    onChange({ ...value, [key]: val });

  const reset = () => onChange({});
  const hasActiveFilters = Object.values(value).some(Boolean);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FilterSelect
        filterKey="role"
        value={value.role}
        placeholder="All Roles"
        options={roles.length > 0
          ? roles.map(r => ({ value: r, label: r }))
          : ['Backend','Frontend','Fullstack','DevOps','QA','Mobile'].map(r => ({ value: r, label: r }))
        }
        onChange={v => set('role', v)}
        triggerClass="min-w-96"
      />

      <FilterSelect
        filterKey="level"
        value={value.level}
        placeholder="All Levels"
        options={['Junior','Middle','Senior','Architect'].map(l => ({ value: l, label: l }))}
        onChange={v => set('level', v)}
        triggerClass="min-w-40"
      />

      <FilterSelect
        filterKey="stage"
        value={value.stage}
        placeholder="All Stages"
        options={[
          { value: 'manager_call', label: 'Manager Call' },
          { value: 'technical', label: 'Technical' },
          { value: 'final_result', label: 'Final Result' },
        ]}
        onChange={v => set('stage', v)}
        triggerClass="min-w-40"
      />

      <FilterSelect
        filterKey="decision"
        value={value.decision}
        placeholder="All Decisions"
        options={[
          { value: 'hired', label: 'Hired' },
          { value: 'rejected', label: 'Rejected' },
        ]}
        onChange={v => set('decision', v)}
        triggerClass="min-w-40"
      />

      {managers.length > 0 && (
        <FilterSelect
          filterKey="managerName"
          value={value.managerName}
          placeholder="All Managers"
          options={managers.map(m => ({ value: m, label: m }))}
          onChange={v => set('managerName', v)}
          triggerClass="min-w-40"
        />
      )}

      <Input
        value={value.clientName ?? ''}
        onChange={e => set('clientName', e.target.value || undefined)}
        placeholder="Search by client..."
        className="h-8 text-sm rounded-full flex-1 min-w-44 transition-colors"
        style={value.clientName
          ? { background: '#185FA5', color: 'white', borderColor: 'transparent' }
          : {}
        }
      />

      {hasActiveFilters && (
        <button
          onClick={reset}
          className="h-8 px-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors rounded-full border border-dashed border-slate-200 hover:border-slate-300"
        >
          <X size={12} />
          Clear
        </button>
      )}
    </div>
  );
}
